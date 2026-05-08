import { AllFilesPanel } from "@/features/file-browser";

interface OpenFileInput {
	absolutePath: string;
	relativePath: string;
	fileName: string;
}

interface Props {
	workspaceRootPath: string | null;
	workspaceId: string | null;
	activeAbsolutePath: string | null;
	onOpenFile: (input: OpenFileInput) => void;
}

export function AllFilesSection(props: Props) {
	return <AllFilesPanel {...props} />;
}
