import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export const PALETTE_OPEN_FILES_EVENT = "helmor:palette-open-files";
export const PALETTE_OPEN_COMMANDS_EVENT = "helmor:palette-open-commands";

interface OpenOptions {
	initial?: string;
}

interface ControllerValue {
	isOpen: boolean;
	initial: string;
	open: (opts?: OpenOptions) => void;
	close: () => void;
	setInput: (next: string) => void;
}

const Ctx = createContext<ControllerValue | null>(null);

interface ProviderProps {
	children: ReactNode;
}

export function PaletteStateProvider({ children }: ProviderProps) {
	const [isOpen, setOpen] = useState(false);
	const [initial, setInitial] = useState("");

	const open = useCallback((opts?: OpenOptions) => {
		setInitial(opts?.initial ?? "");
		setOpen(true);
	}, []);

	const close = useCallback(() => {
		setOpen(false);
	}, []);

	const setInput = useCallback((next: string) => {
		setInitial(next);
	}, []);

	useEffect(() => {
		const onFiles = () => open({ initial: "" });
		const onCommands = () => open({ initial: "> " });
		window.addEventListener(PALETTE_OPEN_FILES_EVENT, onFiles);
		window.addEventListener(PALETTE_OPEN_COMMANDS_EVENT, onCommands);
		return () => {
			window.removeEventListener(PALETTE_OPEN_FILES_EVENT, onFiles);
			window.removeEventListener(PALETTE_OPEN_COMMANDS_EVENT, onCommands);
		};
	}, [open]);

	const value = useMemo<ControllerValue>(
		() => ({ isOpen, initial, open, close, setInput }),
		[isOpen, initial, open, close, setInput],
	);

	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePaletteController(): ControllerValue {
	const ctx = useContext(Ctx);
	if (!ctx) {
		throw new Error(
			"usePaletteController must be used inside <PaletteStateProvider>",
		);
	}
	return ctx;
}
