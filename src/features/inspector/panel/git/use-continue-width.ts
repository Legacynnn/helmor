// Width measurement for the git header's "Continue" button: shrinks the
// button down to its icon when the header runs out of room for the
// change-request pill + commit button + full label.
import { useLayoutEffect, useRef, useState } from "react";

export const CONTINUE_LABEL = "Continue";
const CONTINUE_BUTTON_PADDING_X_PX = 8;
const CONTINUE_BUTTON_GAP_PX = 4;
const CONTINUE_ICON_SIZE_PX = 13;
const CONTINUE_LABEL_FALLBACK_WIDTH_PX = 45;
const getContinueFullWidth = (labelWidth: number) =>
	CONTINUE_BUTTON_PADDING_X_PX * 2 +
	CONTINUE_ICON_SIZE_PX +
	CONTINUE_BUTTON_GAP_PX +
	labelWidth;
const CONTINUE_ICON_WIDTH_PX =
	CONTINUE_BUTTON_PADDING_X_PX * 2 + CONTINUE_ICON_SIZE_PX;
const CONTINUE_COMPACT_THRESHOLD_PX =
	CONTINUE_ICON_WIDTH_PX + CONTINUE_BUTTON_GAP_PX + 12;

export function useContinueButtonWidth({
	showContinue,
	showButton,
}: {
	showContinue: boolean;
	showButton: boolean;
}) {
	const headerRef = useRef<HTMLDivElement | null>(null);
	const changeRequestRef = useRef<HTMLDivElement | null>(null);
	const commitButtonRef = useRef<HTMLDivElement | null>(null);
	const continueLabelRef = useRef<HTMLSpanElement | null>(null);
	const [continueLabelWidth, setContinueLabelWidth] = useState(
		CONTINUE_LABEL_FALLBACK_WIDTH_PX,
	);
	const continueFullWidth = getContinueFullWidth(continueLabelWidth);
	const [continueWidth, setContinueWidth] = useState(continueFullWidth);
	const iconMarginLeft =
		CONTINUE_BUTTON_PADDING_X_PX +
		((continueFullWidth - continueWidth) /
			(continueFullWidth - CONTINUE_ICON_WIDTH_PX)) *
			((CONTINUE_ICON_WIDTH_PX - CONTINUE_ICON_SIZE_PX) / 2 -
				CONTINUE_BUTTON_PADDING_X_PX);
	const labelMaxWidth = Math.max(
		0,
		continueWidth -
			iconMarginLeft -
			CONTINUE_ICON_SIZE_PX -
			CONTINUE_BUTTON_GAP_PX -
			CONTINUE_BUTTON_PADDING_X_PX,
	);

	useLayoutEffect(() => {
		if (!showContinue || !showButton || typeof ResizeObserver === "undefined") {
			setContinueWidth(continueFullWidth);
			return;
		}

		const measure = () => {
			const header = headerRef.current;
			const changeRequestButton = changeRequestRef.current;
			const commitButton = commitButtonRef.current;
			if (!header || !changeRequestButton || !commitButton) return;

			const labelWidth = continueLabelRef.current?.scrollWidth;
			if (
				typeof labelWidth === "number" &&
				Math.abs(labelWidth - continueLabelWidth) > 0.5
			) {
				setContinueLabelWidth(labelWidth);
			}

			const styles = window.getComputedStyle(header);
			const contentWidth =
				header.clientWidth -
				Number.parseFloat(styles.paddingLeft || "0") -
				Number.parseFloat(styles.paddingRight || "0");
			const headerGap = Number.parseFloat(styles.columnGap || "0");
			const actionGap = Number.parseFloat(
				window.getComputedStyle(commitButton.parentElement ?? header)
					.columnGap || "0",
			);
			const availableForContinue =
				contentWidth -
				changeRequestButton.offsetWidth -
				commitButton.offsetWidth -
				headerGap -
				actionGap;
			const compact = availableForContinue < CONTINUE_COMPACT_THRESHOLD_PX;

			setContinueWidth(
				compact
					? CONTINUE_ICON_WIDTH_PX
					: Math.min(
							continueFullWidth,
							Math.max(CONTINUE_COMPACT_THRESHOLD_PX, availableForContinue),
						),
			);
		};

		const observer = new ResizeObserver(measure);
		for (const element of [
			headerRef.current,
			changeRequestRef.current,
			commitButtonRef.current,
		]) {
			if (element) observer.observe(element);
		}
		measure();
		return () => observer.disconnect();
	}, [showContinue, showButton, continueFullWidth, continueLabelWidth]);

	return {
		headerRef,
		changeRequestRef,
		commitButtonRef,
		continueLabelRef,
		continueWidth,
		iconMarginLeft,
		labelMaxWidth,
	};
}
