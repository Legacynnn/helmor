import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	type LinearAuthStatus,
	linearClearApiKey,
	linearGetAuthStatus,
	linearSetApiKey,
} from "@/lib/api";
import {
	SettingsGroup,
	SettingsNotice,
	SettingsRow,
} from "../components/settings-row";

export function LinearPanel() {
	const [status, setStatus] = useState<LinearAuthStatus | null>(null);
	const [keyDraft, setKeyDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		try {
			const next = await linearGetAuthStatus();
			setStatus(next);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const handleConnect = useCallback(async () => {
		if (!keyDraft.trim()) return;
		setBusy(true);
		setError(null);
		try {
			await linearSetApiKey(keyDraft.trim());
			setKeyDraft("");
			await reload();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, [keyDraft, reload]);

	const handleDisconnect = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			await linearClearApiKey();
			await reload();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, [reload]);

	const connected = status?.connected === true;

	return (
		<SettingsGroup>
			<SettingsRow
				align="start"
				title="Linear"
				description={
					connected ? (
						<>
							Connected as{" "}
							<span className="font-medium">{status?.viewer?.name}</span> (
							{status?.viewer?.email}).
							{error ? (
								<SettingsNotice tone="error">{error}</SettingsNotice>
							) : null}
						</>
					) : (
						<>
							Paste a Personal API Key from{" "}
							<code className="rounded bg-muted px-1 py-0.5 text-[11px]">
								linear.app/settings/account/security
							</code>
							. Stored locally on this device.
							{error ? (
								<SettingsNotice tone="error">{error}</SettingsNotice>
							) : null}
						</>
					)
				}
			>
				{connected ? (
					<Button
						variant="outline"
						size="sm"
						onClick={handleDisconnect}
						disabled={busy}
					>
						{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
						Disconnect
					</Button>
				) : (
					<div className="flex items-center gap-2">
						<Input
							type="password"
							placeholder="lin_api_..."
							value={keyDraft}
							onChange={(e) => setKeyDraft(e.target.value)}
							className="w-64"
						/>
						<Button
							size="sm"
							onClick={handleConnect}
							disabled={busy || !keyDraft.trim()}
						>
							{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
							Connect
						</Button>
					</div>
				)}
			</SettingsRow>
		</SettingsGroup>
	);
}
