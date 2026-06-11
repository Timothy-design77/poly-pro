/**
 * Global gesture lock.
 *
 * Any control that owns a drag gesture (sliders, dials, canvases) registers
 * itself here while a drag is in progress. Page-level swipe navigation checks
 * this on EVERY touchmove — the moment a control drag starts, any in-progress
 * page drag is cancelled and the page cannot move until the control releases.
 *
 * This is the authoritative layer; DOM target checks are the first line of
 * defense, this flag is the guarantee.
 */

let depth = 0;

export function beginControlDrag(): void {
  depth++;
}

export function endControlDrag(): void {
  depth = Math.max(0, depth - 1);
}

export function isControlDragActive(): boolean {
  return depth > 0;
}

/** Selector for elements that own their own drag gestures. */
export const GESTURE_OWNED_SELECTOR =
  '[data-no-swipe], input, textarea, select, canvas';

export function ownsGesture(target: EventTarget | null): boolean {
  return (
    target instanceof Element && !!target.closest(GESTURE_OWNED_SELECTOR)
  );
}
