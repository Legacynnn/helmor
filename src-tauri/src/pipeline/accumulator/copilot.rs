//! Copilot event handling — `copilot/`-namespaced events from the sidecar.
//!
//! Wire contract (fixed, emitted by the sidecar's copilot manager):
//!   - `session_init` (carries top-level `session_id` + `model`) — NoOp
//!     here; both fields are lifted by the generic extractors at the top
//!     of `push_event` (same path as `cursor/agent_init`).
//!   - `assistant_delta` / `reasoning_delta` — delta-style text appends.
//!   - `assistant_message` / `reasoning_message` — final full text. If
//!     deltas were already accumulated this turn, the text is dropped
//!     (dedupe); otherwise it's appended whole (non-streaming path).
//!     `assistant_message` additionally finalizes the turn — it is the
//!     only turn-terminal event in the contract.
//!   - `tool_call_start` / `tool_call_end` — open/close a tool call.
//!     On `success: false` the `error` field becomes the result text and
//!     the tool_result is marked `is_error`.
//!   - Any other `copilot/*` type — NoOp (forward-compat), handled by the
//!     catch-all arm in `mod.rs`.
//!
//! Output: synthesized Claude-format messages (mirrors `cursor.rs`) so the
//! adapter + collapse stages and historical reload are fully shared.
//! Manager-level abort drains in-flight state via `flush_in_progress`.

use std::collections::HashMap;

use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use super::super::types::{CollectedTurn, IntermediateMessage, MessageRole};
use super::{now_ms, PushOutcome, StreamAccumulator};

#[derive(Debug, Default)]
pub(super) struct CopilotRunState {
    pub assistant_text: String,
    pub reasoning_text: String,
    /// Insertion-ordered tool calls. Each → one tool_use + tool_result.
    pub tools: Vec<CopilotToolCall>,
    /// O(1) lookup `tool_call_id` → index into `tools`.
    pub tool_index: HashMap<String, usize>,
    /// Set on the first event of a run; drives the synthesized
    /// `turn/completed` duration on finalize.
    pub started_at: Option<f64>,
}

#[derive(Debug, Default)]
pub(super) struct CopilotToolCall {
    pub call_id: String,
    pub name: String,
    pub args: Value,
    /// `Some` once `tool_call_end` arrived; pending tools render as
    /// tool_use without tool_result (matching cursor's abort semantics).
    pub result_text: Option<String>,
    pub is_error: bool,
}

pub(super) fn new_run_state() -> CopilotRunState {
    CopilotRunState::default()
}

fn ensure_run_started(acc: &mut StreamAccumulator) {
    if acc.copilot_state.started_at.is_none() {
        acc.copilot_state.started_at = Some(now_ms());
    }
}

pub(super) fn handle_assistant_delta(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    ensure_run_started(acc);
    if let Some(text) = value.get("text").and_then(Value::as_str) {
        if !text.is_empty() {
            acc.copilot_state.assistant_text.push_str(text);
            acc.fallback_text.push_str(text);
            acc.saw_text_delta = true;
        }
    }
    PushOutcome::StreamingDelta
}

pub(super) fn handle_reasoning_delta(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    ensure_run_started(acc);
    if let Some(text) = value.get("text").and_then(Value::as_str) {
        if !text.is_empty() {
            acc.copilot_state.reasoning_text.push_str(text);
            acc.fallback_thinking.push_str(text);
            acc.saw_thinking_delta = true;
        }
    }
    PushOutcome::StreamingDelta
}

/// Final full assistant text. Dedupe rule: if deltas already accumulated
/// assistant text this turn, the payload is redundant and is dropped;
/// otherwise (non-streaming path) the full text is appended. Either way
/// this event terminates the turn — finalize.
pub(super) fn handle_assistant_message(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    ensure_run_started(acc);
    if acc.copilot_state.assistant_text.is_empty() {
        if let Some(text) = value.get("text").and_then(Value::as_str) {
            acc.copilot_state.assistant_text.push_str(text);
        }
    }
    finalize(acc)
}

/// Final full reasoning text — same dedupe rule as `assistant_message`,
/// but reasoning is not turn-terminal so no finalize here.
pub(super) fn handle_reasoning_message(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    ensure_run_started(acc);
    if !acc.copilot_state.reasoning_text.is_empty() {
        // Deltas already carried this text — redundant final snapshot.
        return PushOutcome::NoOp;
    }
    let Some(text) = value.get("text").and_then(Value::as_str) else {
        return PushOutcome::NoOp;
    };
    if text.is_empty() {
        return PushOutcome::NoOp;
    }
    acc.copilot_state.reasoning_text.push_str(text);
    acc.fallback_thinking.push_str(text);
    PushOutcome::StreamingDelta
}

pub(super) fn handle_tool_call_start(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    ensure_run_started(acc);
    let call_id = value
        .get("tool_call_id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if call_id.is_empty() {
        return PushOutcome::NoOp;
    }
    let name = value
        .get("tool_name")
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let args = value.get("arguments").cloned().unwrap_or(json!({}));

    if let Some(&idx) = acc.copilot_state.tool_index.get(&call_id) {
        // Repeated start for the same id — arg refinement, replace in place.
        if let Some(entry) = acc.copilot_state.tools.get_mut(idx) {
            entry.name = name;
            entry.args = args;
        }
    } else {
        let idx = acc.copilot_state.tools.len();
        acc.copilot_state.tools.push(CopilotToolCall {
            call_id: call_id.clone(),
            name,
            args,
            result_text: None,
            is_error: false,
        });
        acc.copilot_state.tool_index.insert(call_id, idx);
    }
    PushOutcome::StreamingDelta
}

pub(super) fn handle_tool_call_end(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    ensure_run_started(acc);
    let call_id = match value.get("tool_call_id").and_then(Value::as_str) {
        Some(id) => id,
        None => return PushOutcome::NoOp,
    };
    // Absent `success` defaults to true — the sidecar only sets it false
    // on failure.
    let success = value
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let content = value
        .get("content")
        .and_then(Value::as_str)
        .map(str::to_string);
    let error = value
        .get("error")
        .and_then(Value::as_str)
        .map(str::to_string);
    // On failure prefer the error text; on success the content. Either
    // way the tool gets a (possibly empty) result so the spinner stops.
    let result_text = if success {
        content.unwrap_or_default()
    } else {
        error.or(content).unwrap_or_default()
    };

    if let Some(&idx) = acc.copilot_state.tool_index.get(call_id) {
        if let Some(entry) = acc.copilot_state.tools.get_mut(idx) {
            entry.result_text = Some(result_text);
            entry.is_error = !success;
        }
    } else {
        // No matching tool_call_start — ignore.
        return PushOutcome::NoOp;
    }
    PushOutcome::StreamingDelta
}

/// Drain in-flight copilot state on abort (no terminal `assistant_message`
/// will arrive). Same emission as the happy path — pending tools render as
/// tool_use without tool_result, matching reality.
pub(super) fn flush_in_progress(acc: &mut StreamAccumulator) {
    finalize(acc);
}

/// Push the accumulated assistant message + tool_result follow-ups. Runs
/// on `assistant_message` (happy path) or `flush_in_progress` (abort).
fn finalize(acc: &mut StreamAccumulator) -> PushOutcome {
    let state = std::mem::take(&mut acc.copilot_state);

    // Defensive: skip empty runs.
    let has_text = !state.assistant_text.is_empty();
    let has_reasoning = !state.reasoning_text.is_empty();
    let has_tools = !state.tools.is_empty();
    if !has_text && !has_reasoning && !has_tools {
        acc.fallback_text.clear();
        acc.fallback_thinking.clear();
        return PushOutcome::NoOp;
    }

    let assistant_id = acc
        .active_turn_id
        .take()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let session_id_value: Value = acc
        .session_id
        .as_deref()
        .map(|s| Value::String(s.to_string()))
        .unwrap_or(Value::Null);
    let resolved_model = acc.resolved_model.clone();
    let created_at = Utc::now().to_rfc3339();

    let mut content: Vec<Value> = Vec::with_capacity(2 + state.tools.len());
    if has_reasoning {
        content.push(json!({
            "type": "thinking",
            "thinking": state.reasoning_text,
            "signature": "",
        }));
    }
    for tool in &state.tools {
        // Copilot tool names/args pass through unchanged — the wire shape
        // is not the cursor SDK's, and the generic frontend renderer
        // handles unknown tools by name. (Cursor needed a translation
        // table because its arg keys collide with Claude's renderers.)
        content.push(json!({
            "type": "tool_use",
            "id": tool.call_id,
            "name": tool.name,
            "input": tool.args,
        }));
    }
    if has_text {
        content.push(json!({
            "type": "text",
            "text": state.assistant_text,
        }));
    }

    let assistant_msg = json!({
        "type": "assistant",
        "session_id": session_id_value,
        "message": {
            "id": assistant_id,
            "role": "assistant",
            "model": resolved_model,
            "content": content,
        },
    });
    let raw_json = assistant_msg.to_string();
    acc.collected.push(IntermediateMessage {
        id: assistant_id.clone(),
        role: MessageRole::Assistant,
        raw_json: raw_json.clone(),
        parsed: Some(assistant_msg),
        created_at: created_at.clone(),
        is_streaming: false,
    });
    acc.turns.push(CollectedTurn {
        id: assistant_id,
        role: MessageRole::Assistant,
        content_json: raw_json,
    });

    // One synthetic user/tool_result per tool that completed.
    for tool in &state.tools {
        let Some(result_text) = &tool.result_text else {
            continue;
        };
        let user_msg = json!({
            "type": "user",
            "session_id": session_id_value,
            "message": {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool.call_id,
                    "content": result_text,
                    "is_error": tool.is_error,
                }],
            },
        });
        let raw = user_msg.to_string();
        let id = format!("tool_result_{}", tool.call_id);
        acc.collected.push(IntermediateMessage {
            id: id.clone(),
            role: MessageRole::User,
            raw_json: raw.clone(),
            parsed: Some(user_msg),
            created_at: created_at.clone(),
            is_streaming: false,
        });
        acc.turns.push(CollectedTurn {
            id,
            role: MessageRole::User,
            content_json: raw,
        });
    }

    // Roll into persistence fields for parsed_output().
    if has_text {
        if !acc.assistant_text.is_empty() {
            acc.assistant_text.push('\n');
        }
        acc.assistant_text.push_str(&state.assistant_text);
    }
    if has_reasoning {
        if !acc.thinking_text.is_empty() {
            acc.thinking_text.push('\n');
        }
        acc.thinking_text.push_str(&state.reasoning_text);
    }

    acc.fallback_text.clear();
    acc.fallback_thinking.clear();

    // Synthesize a turn/completed row with duration so the adapter renders
    // the "Ns • about X ago" footer, matching Claude/Codex/Cursor behavior.
    if let Some(started) = state.started_at {
        let duration = now_ms() - started;
        if duration > 0.0 {
            let enriched = json!({ "type": "turn/completed", "duration_ms": duration });
            let enriched_str = serde_json::to_string(&enriched).unwrap_or_default();
            let id = Uuid::new_v4().to_string();
            acc.result_id = Some(id.clone());
            acc.result_json = Some(enriched_str.clone());
            acc.collect_message(&enriched_str, &enriched, MessageRole::Assistant, Some(&id));
        }
    }

    PushOutcome::Finalized
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc() -> StreamAccumulator {
        StreamAccumulator::new("copilot", "fallback-model")
    }

    fn assistant_content(acc: &StreamAccumulator) -> Vec<Value> {
        acc.collected
            .iter()
            .find(|m| {
                m.role == MessageRole::Assistant
                    && m.parsed
                        .as_ref()
                        .and_then(|p| p.get("type"))
                        .and_then(Value::as_str)
                        == Some("assistant")
            })
            .and_then(|m| m.parsed.as_ref())
            .and_then(|p| p.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(Value::as_array)
            .cloned()
            .expect("finalized assistant message with content")
    }

    #[test]
    fn session_init_captures_session_id_and_model() {
        let mut a = acc();
        let init = json!({
            "type": "copilot/session_init",
            "session_id": "copilot-sess-1",
            "model": "gpt-5",
        });
        let outcome = a.push_event(&init, &init.to_string());
        assert_eq!(outcome, PushOutcome::NoOp);
        assert_eq!(a.session_id(), Some("copilot-sess-1"));
        assert_eq!(a.resolved_model(), "gpt-5");
    }

    #[test]
    fn unknown_copilot_event_is_noop_and_not_dropped() {
        let mut a = acc();
        let ev = json!({ "type": "copilot/usage_update", "tokens": 5 });
        let outcome = a.push_event(&ev, &ev.to_string());
        assert_eq!(outcome, PushOutcome::NoOp);
        assert!(a.dropped_event_types().is_empty());
    }

    #[test]
    fn deltas_then_final_message_dedupes_text() {
        let mut a = acc();
        for chunk in ["Hel", "lo ", "world"] {
            let ev = json!({ "type": "copilot/assistant_delta", "text": chunk });
            assert_eq!(
                a.push_event(&ev, &ev.to_string()),
                PushOutcome::StreamingDelta
            );
        }
        let fin = json!({ "type": "copilot/assistant_message", "text": "Hello world" });
        assert_eq!(a.push_event(&fin, &fin.to_string()), PushOutcome::Finalized);

        let content = assistant_content(&a);
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["type"], "text");
        // Not "Hello worldHello world" — the final snapshot was deduped.
        assert_eq!(content[0]["text"], "Hello world");
        assert_eq!(a.assistant_text, "Hello world");
        // Fallback buffer is consumed by finalize — no lingering partial.
        assert!(!a.has_active_partial());
    }

    #[test]
    fn final_message_without_deltas_appends_full_text() {
        let mut a = acc();
        let fin = json!({ "type": "copilot/assistant_message", "text": "Non-streamed answer" });
        assert_eq!(a.push_event(&fin, &fin.to_string()), PushOutcome::Finalized);
        let content = assistant_content(&a);
        assert_eq!(content[0]["text"], "Non-streamed answer");
    }

    #[test]
    fn reasoning_deltas_then_message_dedupes() {
        let mut a = acc();
        for chunk in ["think", "ing..."] {
            let ev = json!({ "type": "copilot/reasoning_delta", "text": chunk });
            a.push_event(&ev, &ev.to_string());
        }
        let rmsg = json!({ "type": "copilot/reasoning_message", "text": "thinking..." });
        assert_eq!(a.push_event(&rmsg, &rmsg.to_string()), PushOutcome::NoOp);
        let fin = json!({ "type": "copilot/assistant_message", "text": "done" });
        a.push_event(&fin, &fin.to_string());

        let content = assistant_content(&a);
        assert_eq!(content[0]["type"], "thinking");
        assert_eq!(content[0]["thinking"], "thinking...");
        assert_eq!(content[1]["type"], "text");
        assert_eq!(content[1]["text"], "done");
    }

    #[test]
    fn reasoning_message_without_deltas_appends() {
        let mut a = acc();
        let rmsg = json!({ "type": "copilot/reasoning_message", "text": "full reasoning" });
        assert_eq!(
            a.push_event(&rmsg, &rmsg.to_string()),
            PushOutcome::StreamingDelta
        );
        let fin = json!({ "type": "copilot/assistant_message", "text": "answer" });
        a.push_event(&fin, &fin.to_string());
        let content = assistant_content(&a);
        assert_eq!(content[0]["thinking"], "full reasoning");
    }

    #[test]
    fn tool_call_success_emits_tool_use_and_tool_result() {
        let mut a = acc();
        let start = json!({
            "type": "copilot/tool_call_start",
            "tool_call_id": "call-1",
            "tool_name": "bash",
            "arguments": { "command": "ls" },
        });
        a.push_event(&start, &start.to_string());
        let end = json!({
            "type": "copilot/tool_call_end",
            "tool_call_id": "call-1",
            "success": true,
            "content": "file-a\nfile-b",
        });
        a.push_event(&end, &end.to_string());
        let fin = json!({ "type": "copilot/assistant_message", "text": "Listed files." });
        a.push_event(&fin, &fin.to_string());

        let content = assistant_content(&a);
        assert_eq!(content[0]["type"], "tool_use");
        assert_eq!(content[0]["id"], "call-1");
        assert_eq!(content[0]["name"], "bash");
        assert_eq!(content[0]["input"]["command"], "ls");

        let tool_result = a
            .collected
            .iter()
            .find(|m| m.role == MessageRole::User)
            .and_then(|m| m.parsed.as_ref())
            .and_then(|p| p.pointer("/message/content/0"))
            .cloned()
            .expect("tool_result follow-up");
        assert_eq!(tool_result["type"], "tool_result");
        assert_eq!(tool_result["tool_use_id"], "call-1");
        assert_eq!(tool_result["content"], "file-a\nfile-b");
        assert_eq!(tool_result["is_error"], false);
    }

    #[test]
    fn tool_call_failure_uses_error_text_and_marks_is_error() {
        let mut a = acc();
        let start = json!({
            "type": "copilot/tool_call_start",
            "tool_call_id": "call-9",
            "tool_name": "bash",
            "arguments": { "command": "false" },
        });
        a.push_event(&start, &start.to_string());
        let end = json!({
            "type": "copilot/tool_call_end",
            "tool_call_id": "call-9",
            "success": false,
            "error": "exit code 1",
        });
        a.push_event(&end, &end.to_string());
        let fin = json!({ "type": "copilot/assistant_message", "text": "It failed." });
        a.push_event(&fin, &fin.to_string());

        let tool_result = a
            .collected
            .iter()
            .find(|m| m.role == MessageRole::User)
            .and_then(|m| m.parsed.as_ref())
            .and_then(|p| p.pointer("/message/content/0"))
            .cloned()
            .expect("tool_result follow-up");
        assert_eq!(tool_result["content"], "exit code 1");
        assert_eq!(tool_result["is_error"], true);
    }

    #[test]
    fn tool_call_end_without_start_is_ignored() {
        let mut a = acc();
        let end = json!({
            "type": "copilot/tool_call_end",
            "tool_call_id": "ghost",
            "success": true,
            "content": "?",
        });
        assert_eq!(a.push_event(&end, &end.to_string()), PushOutcome::NoOp);
        assert!(a.collected.is_empty());
    }

    #[test]
    fn flush_in_progress_drains_partial_with_pending_tool() {
        let mut a = acc();
        let delta = json!({ "type": "copilot/assistant_delta", "text": "partial answer" });
        a.push_event(&delta, &delta.to_string());
        let start = json!({
            "type": "copilot/tool_call_start",
            "tool_call_id": "call-2",
            "tool_name": "read",
            "arguments": { "path": "/tmp/x" },
        });
        a.push_event(&start, &start.to_string());

        a.flush_copilot_in_progress();

        let content = assistant_content(&a);
        // Pending tool renders as tool_use without a tool_result follow-up.
        assert_eq!(content[0]["type"], "tool_use");
        assert_eq!(content[1]["text"], "partial answer");
        assert!(!a.collected.iter().any(|m| m.role == MessageRole::User));
        // Idempotent — second flush is a no-op.
        let collected_len = a.collected.len();
        a.flush_copilot_in_progress();
        assert_eq!(a.collected.len(), collected_len);
    }

    #[test]
    fn empty_run_finalizes_to_nothing() {
        let mut a = acc();
        let fin = json!({ "type": "copilot/assistant_message", "text": "" });
        assert_eq!(a.push_event(&fin, &fin.to_string()), PushOutcome::NoOp);
        assert!(a.collected.is_empty());
        assert_eq!(a.turns_len(), 0);
    }
}
