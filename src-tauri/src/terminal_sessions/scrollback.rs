//! On-disk persistence of terminal-session scrollback.
//!
//! The live xterm buffer lives in the frontend and dies with the app, so
//! re-opening an old terminal session used to show a blank pane. This module
//! mirrors the same UTF-8 `ScriptEvent::Stdout`/`Stderr` string stream the
//! live path emits to `{terminal_logs}/<session_id>.log`, so a restored
//! session replays its real output — the same way chat sessions rebuild from
//! the `session_messages` table.
//!
//! Every operation is **best-effort**: persistence must never break the live
//! PTY stream, so write/clear errors are logged and swallowed.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

/// Largest amount returned on read-back (≈ the in-memory cap the frontend
/// used). When a log exceeds this we surface only the tail.
const SOFT_CAP: u64 = 4 * 1024 * 1024;
/// Once a log grows past this, rewrite it down to the tail so disk use stays
/// bounded without trimming on every append.
const HARD_CAP: u64 = 8 * 1024 * 1024;

/// Restored scrollback for one terminal session.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scrollback {
    /// The persisted output (tail only when `truncated`).
    pub data: String,
    /// True when older output was dropped to honor the size cap.
    pub truncated: bool,
}

fn log_path(session_id: &str) -> Result<PathBuf> {
    Ok(crate::data_dir::terminal_logs_dir()?.join(format!("{session_id}.log")))
}

/// Append a chunk of terminal output. Best-effort — errors are logged, never
/// returned, so a failing disk can't stall the PTY stream.
pub fn append(session_id: &str, data: &str) {
    if data.is_empty() {
        return;
    }
    if let Err(error) = append_inner(session_id, data) {
        tracing::warn!(%error, session_id, "Failed to persist terminal scrollback");
    }
}

fn append_inner(session_id: &str, data: &str) -> Result<()> {
    let path = log_path(session_id)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .with_context(|| format!("open {}", path.display()))?;
    file.write_all(data.as_bytes())
        .with_context(|| format!("append {}", path.display()))?;
    // Cheap length check; the (rare) trim keeps disk bounded.
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    if len > HARD_CAP {
        drop(file);
        trim_to_tail(&path)?;
    }
    Ok(())
}

/// Rewrite `path` to keep only its last `SOFT_CAP` bytes (snapped to a UTF-8
/// boundary). Called when a log crosses `HARD_CAP`.
fn trim_to_tail(path: &Path) -> Result<()> {
    let mut file = OpenOptions::new().read(true).write(true).open(path)?;
    let len = file.metadata()?.len();
    if len <= SOFT_CAP {
        return Ok(());
    }
    file.seek(SeekFrom::Start(len - SOFT_CAP))?;
    let mut tail = Vec::with_capacity(SOFT_CAP as usize);
    file.read_to_end(&mut tail)?;
    let boundary = utf8_boundary(&tail);
    let tail = &tail[boundary..];
    file.set_len(0)?;
    file.seek(SeekFrom::Start(0))?;
    file.write_all(tail)?;
    Ok(())
}

/// Read back persisted scrollback. `None` when no log exists. When the file
/// exceeds `SOFT_CAP`, only the tail is returned with `truncated = true`.
pub fn read(session_id: &str) -> Result<Option<Scrollback>> {
    let path = log_path(session_id)?;
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e).with_context(|| format!("open {}", path.display())),
    };
    let len = file.metadata()?.len();
    let (truncated, bytes) = if len > SOFT_CAP {
        file.seek(SeekFrom::Start(len - SOFT_CAP))?;
        let mut buf = Vec::with_capacity(SOFT_CAP as usize);
        file.read_to_end(&mut buf)?;
        let boundary = utf8_boundary(&buf);
        (true, buf[boundary..].to_vec())
    } else {
        let mut buf = Vec::with_capacity(len as usize);
        file.read_to_end(&mut buf)?;
        (false, buf)
    };
    Ok(Some(Scrollback {
        data: String::from_utf8_lossy(&bytes).into_owned(),
        truncated,
    }))
}

/// Remove a session's log (best-effort). Call only when a session is
/// **permanently deleted** — never on hide, since History restore replays the
/// log of a hidden session.
pub fn clear(session_id: &str) {
    let Ok(path) = log_path(session_id) else {
        return;
    };
    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            tracing::warn!(%error, session_id, "Failed to clear terminal scrollback");
        }
    }
}

/// Index of the first byte in `buf` that starts a UTF-8 sequence, so trimming
/// the front never splits a multi-byte char (skips leading continuation
/// bytes, of which there are at most three).
fn utf8_boundary(buf: &[u8]) -> usize {
    let mut i = 0;
    while i < buf.len() && i < 3 && (buf[i] & 0b1100_0000) == 0b1000_0000 {
        i += 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::TestEnv;

    #[test]
    fn append_then_read_round_trips() {
        let _env = TestEnv::new("scrollback-roundtrip");
        let id = "sess-1";
        assert!(read(id).unwrap().is_none());
        append(id, "hello ");
        append(id, "world\n");
        let sb = read(id).unwrap().unwrap();
        assert_eq!(sb.data, "hello world\n");
        assert!(!sb.truncated);
    }

    #[test]
    fn read_returns_tail_when_over_soft_cap() {
        let _env = TestEnv::new("scrollback-tail");
        let id = "sess-2";
        let chunk = "x".repeat(1024);
        let writes = (SOFT_CAP / 1024) + 16; // push past SOFT_CAP, stay under HARD_CAP
        for _ in 0..writes {
            append(id, &chunk);
        }
        append(id, "TAIL_MARKER");
        let sb = read(id).unwrap().unwrap();
        assert!(sb.truncated);
        assert!(sb.data.ends_with("TAIL_MARKER"));
        assert!(sb.data.len() as u64 <= SOFT_CAP);
    }

    #[test]
    fn append_trims_disk_past_hard_cap() {
        let _env = TestEnv::new("scrollback-hardcap");
        let id = "sess-4";
        let chunk = "y".repeat(64 * 1024);
        let writes = (HARD_CAP / (64 * 1024)) + 40; // force at least one trim
        for _ in 0..writes {
            append(id, &chunk);
        }
        let len = fs::metadata(log_path(id).unwrap()).unwrap().len();
        assert!(len <= HARD_CAP, "log not trimmed: {len}");
        // Trim keeps the tail intact and still readable.
        assert!(read(id).unwrap().is_some());
    }

    #[test]
    fn clear_removes_the_log() {
        let _env = TestEnv::new("scrollback-clear");
        let id = "sess-3";
        append(id, "data");
        assert!(read(id).unwrap().is_some());
        clear(id);
        assert!(read(id).unwrap().is_none());
        // Clearing a missing log is a no-op, not an error.
        clear(id);
    }
}
