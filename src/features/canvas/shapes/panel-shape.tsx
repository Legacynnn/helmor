import {
	BaseBoxShapeUtil,
	HTMLContainer,
	type RecordProps,
	resizeBox,
	T,
	type TLBaseShape,
	type TLResizeInfo,
} from "tldraw";
import type { CanvasPanelType } from "@/lib/api";
import { PanelHost } from "../panel-host";

/** Default footprint for a freshly created panel (canvas/page units). */
export const PANEL_DEFAULT_WIDTH = 480;
export const PANEL_DEFAULT_HEIGHT = 360;
export const PANEL_MIN_WIDTH = 240;
export const PANEL_MIN_HEIGHT = 160;

/** Custom tldraw shape hosting a live React surface. `config` is an opaque JSON
 * string owned by the panel body (e.g. the bound sessionId). The shape id IS
 * the persisted `canvas_panels.id`, so identity round-trips through the DB. */
export type PanelShapeProps = {
	w: number;
	h: number;
	panelType: CanvasPanelType;
	title: string;
	config: string;
	locked: boolean;
};

export type PanelShape = TLBaseShape<"panel", PanelShapeProps>;

// Register the custom shape into tldraw's global type map so `PanelShape`
// satisfies `TLShape` (v5 requirement) — this makes `editor.createShape<…>`,
// resize typing, and `record.type === "panel"` narrowing all type-check.
declare module "@tldraw/tlschema" {
	interface TLGlobalShapePropsMap {
		panel: PanelShapeProps;
	}
}

export class PanelShapeUtil extends BaseBoxShapeUtil<PanelShape> {
	static override type = "panel" as const;

	static override props: RecordProps<PanelShape> = {
		w: T.number,
		h: T.number,
		panelType: T.literalEnum(
			"placeholder",
			"conversation",
			"terminal",
			"notes",
			"drawing",
			"file-manager",
			"editor",
		),
		title: T.string,
		config: T.string,
		locked: T.boolean,
	};

	override getDefaultProps(): PanelShape["props"] {
		return {
			w: PANEL_DEFAULT_WIDTH,
			h: PANEL_DEFAULT_HEIGHT,
			panelType: "placeholder",
			title: "Panel",
			config: "{}",
			locked: false,
		};
	}

	// Panels can't rotate; resize is clamped to a sane minimum below.
	override canResize = () => true;
	override hideRotateHandle = () => true;
	override canEdit = () => false;
	// Connections are Phase 3 — no tldraw-native binding for now.
	override canBind = () => false;

	override onResize(shape: PanelShape, info: TLResizeInfo<PanelShape>) {
		const next = resizeBox(shape, info);
		return {
			...next,
			props: {
				...next.props,
				w: Math.max(PANEL_MIN_WIDTH, next.props.w),
				h: Math.max(PANEL_MIN_HEIGHT, next.props.h),
			},
		};
	}

	override component(shape: PanelShape) {
		return (
			<HTMLContainer
				id={shape.id}
				style={{
					width: shape.props.w,
					height: shape.props.h,
					pointerEvents: "all",
				}}
			>
				<PanelHost shape={shape} />
			</HTMLContainer>
		);
	}

	override getIndicatorPath(shape: PanelShape) {
		const path = new Path2D();
		path.roundRect(0, 0, shape.props.w, shape.props.h, 10);
		return path;
	}
}
