/**
 * Pure decision logic for transcript auto-scroll. The transcript pins to the
 * bottom only while the user is already there; scrolling up hands control
 * back to the user until they return (or click the "Latest" pill).
 */

/** Distance from the bottom (px) still counted as "at the bottom". */
export const STICK_THRESHOLD_PX = 40;

/**
 * True when the viewport bottom is within `threshold` px of the content end,
 * i.e. auto-scroll should keep (or resume) sticking. Content that does not
 * overflow always sticks.
 */
export function isNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold: number = STICK_THRESHOLD_PX,
): boolean {
  return scrollHeight - clientHeight - scrollTop <= threshold;
}
