const WHEEL_THRESHOLD_PX = 36;
const WHEEL_GESTURE_GAP_MS = 180;
const LINE_HEIGHT_PX = 16;

export interface PhotoWheelState {
  accumulated: number;
  lastEventAt: number;
  navigated: boolean;
}

export function createPhotoWheelState(): PhotoWheelState {
  return { accumulated: 0, lastEventAt: Number.NEGATIVE_INFINITY, navigated: false };
}

/**
 * Turn a mouse-wheel notch or trackpad gesture into at most one photo step.
 * Vertical scrolling is the common mouse input; horizontal scrolling is also
 * accepted for trackpads. Momentum events remain part of the same gesture until
 * the wheel has been quiet for a moment.
 */
export function photoStepFromWheel(
  state: PhotoWheelState,
  input: {
    deltaX: number;
    deltaY: number;
    deltaMode: number;
    timeStamp: number;
    pageHeight: number;
  }
): -1 | 0 | 1 {
  const { deltaX, deltaY, deltaMode, timeStamp, pageHeight } = input;
  const dominantDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (dominantDelta === 0) return 0;

  if (timeStamp - state.lastEventAt > WHEEL_GESTURE_GAP_MS) {
    state.accumulated = 0;
    state.navigated = false;
  }
  state.lastEventAt = timeStamp;

  if (state.navigated) return 0;

  const unit = deltaMode === 1 ? LINE_HEIGHT_PX : deltaMode === 2 ? pageHeight : 1;
  state.accumulated += dominantDelta * unit;
  if (Math.abs(state.accumulated) < WHEEL_THRESHOLD_PX) return 0;

  state.navigated = true;
  return state.accumulated > 0 ? 1 : -1;
}
