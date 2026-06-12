// SessionManager over @github/copilot-sdk. One lazily-started shared
// CopilotClient (spawns the SDK's bundled CLI runtime); per-session events
// are mapped to the fixed `copilot/*` wire contract the Rust accumulator
// consumes. Turn lifecycle: `session.idle` = done, `session.error` = fail.

import {
	CopilotClient,
	type CopilotSession,
	type PermissionHandler,
	type PermissionRequestResult,
	RuntimeConnection,
	type SessionConfigBase,
	type SessionEvent,
} from "@github/copilot-sdk";
import {
	buildImageAttachments,
	describePermissionRequest,
	mapCopilotEvent,
	mapCopilotModels,
	parseReasoningEffort,
} from "./copilot-wire.js";
import type { SidecarEmitter } from "./emitter.js";
import { errorDetails, logger } from "./logger.js";
import { errorMessage } from "./request-parser.js";
import type {
	GenerateTitleOptions,
	ListSlashCommandsParams,
	ProviderModelInfo,
	SendMessageParams,
	SessionManager,
	SlashCommandInfo,
	UserInputResolution,
} from "./session-manager.js";
import {
	buildTitlePrompt,
	parseTitleAndBranchWithDiagnostics,
	TITLE_GENERATION_TIMEOUT_MS,
} from "./title.js";

/// Cheap default on the title-gen hot path; callers may override via options.
const TITLE_MODEL_ID = "gpt-4.1";

/** The SDK's default connection resolves `@github/copilot` out of
 *  node_modules and spawns it with `node` — fine in dev (`bun run
 *  src/index.ts`), absent inside the compiled sidecar binary. The Tauri
 *  host sets `HELMOR_COPILOT_BIN_PATH` (a staged `copilot` executable) in
 *  release builds; until that staging lands, release builds surface a
 *  clear startup error instead of a module-resolution crash. */
function resolveCopilotConnection(): {
	connection?: ReturnType<typeof RuntimeConnection.forStdio>;
} {
	const override = process.env.HELMOR_COPILOT_BIN_PATH;
	if (override) {
		return { connection: RuntimeConnection.forStdio({ path: override }) };
	}
	return {};
}

const COPILOT_PERMISSION_PREFIX = "copilot-";

interface TurnSettle {
	resolve: () => void;
	reject: (err: Error) => void;
}

interface SessionCtx {
	readonly helmorSessionId: string;
	readonly copilotSession: CopilotSession;
	readonly copilotSessionId: string;
	modelId: string | undefined;
	/** Current turn's permission mode — the session-scoped permission
	 *  handler consults this at request time, so a later turn that flips
	 *  to bypass takes effect without recreating the session. */
	permissionMode: string | undefined;
	activeRequestId: string | null;
	activeEmitter: SidecarEmitter | null;
	settle: TurnSettle | null;
	aborted: boolean;
}

export class CopilotSessionManager implements SessionManager {
	private client: CopilotClient | null = null;
	private starting: Promise<CopilotClient> | null = null;
	private readonly sessions = new Map<string, SessionCtx>();
	/** Stop pressed while sendMessage was still in startup (no ctx yet). */
	private readonly pendingAborts = new Set<string>();
	private readonly pendingPermissions = new Map<
		string,
		{
			helmorSessionId: string;
			resolve: (result: PermissionRequestResult) => void;
		}
	>();
	private permissionCounter = 0;

	resolveUserInput(
		_userInputId: string,
		_resolution: UserInputResolution,
	): boolean {
		// No AUQ support in the first cut — nothing parks in this manager.
		return false;
	}

	resolvePermission(permissionId: string, behavior: "allow" | "deny"): void {
		const pending = this.pendingPermissions.get(permissionId);
		if (!pending) return;
		this.pendingPermissions.delete(permissionId);
		pending.resolve(
			behavior === "allow" ? { kind: "approve-once" } : { kind: "reject" },
		);
	}

	/** Lazily start (or revive) the shared client. A ping probes liveness so
	 *  a dead runtime is detected and respawned on the next turn. */
	private async ensureClient(): Promise<CopilotClient> {
		if (this.starting) return this.starting;
		const task = this.startClient();
		this.starting = task;
		try {
			return await task;
		} finally {
			if (this.starting === task) this.starting = null;
		}
	}

	private async startClient(): Promise<CopilotClient> {
		if (this.client) {
			try {
				await this.client.ping();
				return this.client;
			} catch (error) {
				logger.debug(
					"copilot client unresponsive; respawning",
					errorDetails(error),
				);
				this.handleClientDeath();
			}
		}
		const client = new CopilotClient({
			logLevel: "error",
			...resolveCopilotConnection(),
		});
		try {
			await client.start();
		} catch (error) {
			await client.forceStop().catch(() => {});
			throw error;
		}
		this.client = client;
		return client;
	}

	/** The shared runtime died — every cached session is bound to a dead
	 *  connection, so settle in-flight turns and drop all local state. */
	private handleClientDeath(): void {
		const dead = this.client;
		this.client = null;
		for (const ctx of this.sessions.values()) {
			ctx.settle?.reject(new Error("copilot client exited unexpectedly"));
		}
		this.sessions.clear();
		for (const [id, pending] of this.pendingPermissions) {
			this.pendingPermissions.delete(id);
			pending.resolve({ kind: "reject" });
		}
		if (dead) void dead.forceStop().catch(() => {});
	}

	/** Session-scoped permission handler. Consults the ctx's CURRENT mode
	 *  (not the create-time one) so a turn that flips to bypass auto-approves
	 *  while interactive turns park a promise resolved by Rust's
	 *  `permissionResponse` round-trip. */
	private buildPermissionHandler(helmorSessionId: string): PermissionHandler {
		return (request) => {
			const ctx = this.sessions.get(helmorSessionId);
			if (!ctx) return { kind: "reject" };
			if (ctx.permissionMode === "bypassPermissions") {
				return { kind: "approve-once" };
			}
			if (!ctx.activeEmitter || !ctx.activeRequestId) {
				return { kind: "reject" };
			}
			const permissionId = `${COPILOT_PERMISSION_PREFIX}${++this.permissionCounter}`;
			const { toolName, description } = describePermissionRequest(request);
			const decision = new Promise<PermissionRequestResult>((resolve) => {
				this.pendingPermissions.set(permissionId, {
					helmorSessionId,
					resolve,
				});
			});
			ctx.activeEmitter.permissionRequest(
				ctx.activeRequestId,
				permissionId,
				toolName,
				request as unknown as Record<string, unknown>,
				undefined,
				description,
			);
			return decision;
		};
	}

	private rejectPendingPermissions(helmorSessionId: string): void {
		for (const [id, pending] of this.pendingPermissions) {
			if (pending.helmorSessionId !== helmorSessionId) continue;
			this.pendingPermissions.delete(id);
			pending.resolve({ kind: "reject" });
		}
	}

	private handleEvent(ctx: SessionCtx, event: SessionEvent): void {
		// Root-agent only: sub-agent deltas carry `agentId` and would
		// interleave into the main assistant message.
		if ("agentId" in event && event.agentId) return;

		const wire = mapCopilotEvent(event);
		if (wire && ctx.activeEmitter && ctx.activeRequestId) {
			ctx.activeEmitter.passthrough(ctx.activeRequestId, wire);
		}

		// Turn lifecycle: idle = done, error = fail. `settle` guards strays.
		if (event.type === "session.idle") {
			ctx.settle?.resolve();
		} else if (event.type === "session.error") {
			ctx.settle?.reject(new Error(event.data.message));
		}
	}

	async sendMessage(
		requestId: string,
		params: SendMessageParams,
		emitter: SidecarEmitter,
	): Promise<void> {
		let client: CopilotClient;
		try {
			client = await this.ensureClient();
		} catch (error) {
			emitter.error(requestId, `Copilot: ${errorMessage(error)}`);
			emitter.end(requestId);
			return;
		}

		// Stop pressed during client startup → bail before creating a session.
		if (this.pendingAborts.delete(params.sessionId)) {
			emitter.aborted(requestId, "user_requested");
			emitter.end(requestId);
			return;
		}

		const effort = parseReasoningEffort(params.effortLevel?.trim());

		// Reuse cached session, else resume an existing id, else create fresh.
		let ctx = this.sessions.get(params.sessionId);
		if (!ctx) {
			const config: SessionConfigBase = {
				streaming: true,
				...(params.model ? { model: params.model } : {}),
				...(effort ? { reasoningEffort: effort } : {}),
				...(params.cwd ? { workingDirectory: params.cwd } : {}),
				onPermissionRequest: this.buildPermissionHandler(params.sessionId),
			};
			let copilotSession: CopilotSession | null = null;
			try {
				const resumeId = params.resume?.trim();
				if (resumeId) {
					try {
						copilotSession = await client.resumeSession(resumeId, config);
					} catch (error) {
						// Stale/absent id → create fresh so old chats recover.
						logger.debug(
							`copilot resume ${resumeId} failed; creating a fresh session`,
							errorDetails(error),
						);
					}
				}
				if (!copilotSession) {
					copilotSession = await client.createSession(config);
				}
			} catch (error) {
				emitter.error(requestId, `Copilot: ${errorMessage(error)}`);
				emitter.end(requestId);
				return;
			}
			const created: SessionCtx = {
				helmorSessionId: params.sessionId,
				copilotSession,
				copilotSessionId: copilotSession.sessionId,
				modelId: params.model,
				permissionMode: params.permissionMode,
				activeRequestId: null,
				activeEmitter: null,
				settle: null,
				aborted: false,
			};
			this.sessions.set(params.sessionId, created);
			copilotSession.on((event) => this.handleEvent(created, event));
			ctx = created;
			// Synthetic init — Rust persists session_id as provider_session_id
			// and uses the top-level `model` for the resolved-model display.
			emitter.passthrough(requestId, {
				type: "copilot/session_init",
				session_id: copilotSession.sessionId,
				...(params.model ? { model: params.model } : {}),
			});
		} else if (params.model && params.model !== ctx.modelId) {
			// Composer switched models mid-conversation; history is preserved.
			try {
				await ctx.copilotSession.setModel(
					params.model,
					effort ? { reasoningEffort: effort } : undefined,
				);
				ctx.modelId = params.model;
			} catch (error) {
				emitter.error(requestId, `Copilot: ${errorMessage(error)}`);
				emitter.end(requestId);
				return;
			}
		}

		// Stop pressed during session create/resume → honor it now.
		if (this.pendingAborts.delete(params.sessionId)) {
			emitter.aborted(requestId, "user_requested");
			emitter.end(requestId);
			return;
		}

		ctx.permissionMode = params.permissionMode;
		ctx.activeRequestId = requestId;
		ctx.activeEmitter = emitter;
		ctx.aborted = false;

		const turnDone = new Promise<void>((resolve, reject) => {
			ctx.settle = { resolve, reject };
		});

		try {
			await ctx.copilotSession.send({
				prompt: params.prompt,
				...(params.images.length > 0
					? { attachments: buildImageAttachments(params.images) }
					: {}),
			});
		} catch (error) {
			ctx.settle = null;
			ctx.activeRequestId = null;
			ctx.activeEmitter = null;
			emitter.error(requestId, `Copilot: ${errorMessage(error)}`);
			emitter.end(requestId);
			return;
		}

		let turnError: Error | null = null;
		try {
			await turnDone;
		} catch (error) {
			turnError = error instanceof Error ? error : new Error(String(error));
		} finally {
			ctx.settle = null;
			ctx.activeRequestId = null;
			ctx.activeEmitter = null;
		}

		if (ctx.aborted) {
			emitter.aborted(requestId, "user_requested");
		} else if (turnError) {
			emitter.error(requestId, `Copilot: ${turnError.message}`);
		}
		emitter.end(requestId);
	}

	// Throwaway one-shot session via sendAndWait. Never throws — emits a
	// fallback title on failure (mirrors opencode's contract).
	async generateTitle(
		requestId: string,
		userMessage: string,
		branchRenamePrompt: string | null,
		emitter: SidecarEmitter,
		timeoutMs?: number,
		options?: GenerateTitleOptions,
	): Promise<void> {
		const generateBranch = options?.generateBranch ?? true;
		const prompt = buildTitlePrompt(
			userMessage,
			branchRenamePrompt,
			generateBranch,
		);
		const timeout = timeoutMs ?? TITLE_GENERATION_TIMEOUT_MS;
		const model = options?.model ?? TITLE_MODEL_ID;

		let text = "";
		let session: CopilotSession | null = null;
		try {
			const client = await this.ensureClient();
			session = await client.createSession({
				model,
				// Text-only prompt; deny any stray tool use outright.
				onPermissionRequest: () => ({ kind: "reject" }),
			});
			const response = await session.sendAndWait({ prompt }, timeout);
			text = response?.data.content ?? "";
		} catch (error) {
			logger.debug("copilot generateTitle failed", errorDetails(error));
		} finally {
			if (session) {
				const abandoned = session;
				void abandoned
					.abort()
					.catch(() => {})
					.then(() => abandoned.disconnect())
					.catch(() => {});
			}
		}

		const { title, branchName } = parseTitleAndBranchWithDiagnostics(
			requestId,
			text,
			{
				model,
				generateBranch,
				logError: (message, meta) => logger.error(message, meta),
			},
		);
		emitter.titleGenerated(requestId, title, branchName);
	}

	async listSlashCommands(
		_params: ListSlashCommandsParams,
	): Promise<readonly SlashCommandInfo[]> {
		// No slash-command surface in the first cut.
		return [];
	}

	async listModels(): Promise<readonly ProviderModelInfo[]> {
		// Dynamic-only provider — no static fallback in model-catalog.ts.
		try {
			const client = await this.ensureClient();
			const models = await client.listModels();
			return mapCopilotModels(models);
		} catch (error) {
			logger.debug("copilot listModels failed", errorDetails(error));
			return [];
		}
	}

	async stopSession(sessionId: string): Promise<void> {
		const ctx = this.sessions.get(sessionId);
		if (!ctx) {
			// Mid-startup: sendMessage hasn't registered a ctx yet. Record the
			// intent so it's honored once startup lands, not dropped.
			this.pendingAborts.add(sessionId);
			return;
		}
		this.pendingAborts.delete(sessionId);
		ctx.aborted = true;
		this.rejectPendingPermissions(sessionId);
		// Unblock the local turn FIRST — never gate it behind the remote
		// abort RPC, which can hang against a wedged runtime.
		ctx.settle?.resolve();
		void ctx.copilotSession
			.abort()
			.catch((error) =>
				logger.debug("copilot abort failed", errorDetails(error)),
			);
	}

	async steer(
		_sessionId: string,
		_prompt: string,
		_files: readonly string[],
		_images: readonly string[],
	): Promise<boolean> {
		// No mid-turn injection in the first cut; caller queues a new turn.
		return false;
	}

	async shutdown(): Promise<void> {
		for (const ctx of this.sessions.values()) {
			ctx.aborted = true;
			this.rejectPendingPermissions(ctx.helmorSessionId);
			ctx.settle?.resolve();
			void ctx.copilotSession.abort().catch(() => {});
		}
		this.sessions.clear();
		this.pendingAborts.clear();
		const client = this.client;
		this.client = null;
		if (client) {
			try {
				await client.stop();
			} catch (error) {
				logger.debug("copilot client.stop failed", errorDetails(error));
			}
		}
	}
}
