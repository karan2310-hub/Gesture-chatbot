/**
 * Pure utility helper functions for gesture detection math.
 * Coordinates are normalized in range [0, 1] as returned by MediaPipe HandLandmarker.
 */

/**
 * Calculates Euclidean distance between two 3D points.
 */
export function dist(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow(p1.z - p2.z, 2)
  );
}

/**
 * Calculates the hand scale reference distance.
 * We use the distance between Wrist (0) and Middle MCP (9)
 * as it is relatively constant regardless of finger curl.
 */
export function getHandScale(landmarks) {
  if (!landmarks || landmarks.length < 10) return 1.0;
  return dist(landmarks[0], landmarks[9]);
}

/**
 * Checks if a finger is curled by comparing tip distance to base vs middle to base.
 * In a curled finger, the tip folds back towards the MCP joint.
 */
/**
 * Checks if a finger is curled using a combination of rotation-invariant distance tests.
 * A finger is curled if the tip is folded closer to the wrist than the PIP joint,
 * or if the tip is very close to its base MCP knuckle relative to the hand scale.
 */
export function isFingerCurled(landmarks, tipIdx, pipIdx, mcpIdx) {
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx];
  const mcp = landmarks[mcpIdx];
  const wrist = landmarks[0];
  const handScale = getHandScale(landmarks);

  if (!tip || !pip || !mcp || !wrist) return false;

  const tipToMcp = dist(tip, mcp) / handScale;
  const tipToWrist = dist(tip, wrist);
  const pipToWrist = dist(pip, wrist);

  // A finger is curled if the tip is tucked closer to the wrist than the PIP joint,
  // or if the tip-to-knuckle distance is small (< 0.68 of hand scale)
  return tipToWrist < pipToWrist || tipToMcp < 0.75;
}

/**
 * Detects a closed fist (all four fingers curled).
 */
export function isFist(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const indexCurled = isFingerCurled(landmarks, 8, 6, 5);
  const middleCurled = isFingerCurled(landmarks, 12, 10, 9);
  const ringCurled = isFingerCurled(landmarks, 16, 14, 13);
  const pinkyCurled = isFingerCurled(landmarks, 20, 18, 17);

  // Thumb is tucked in if it is close to the index base (5) or middle base (9)
  const handScale = getHandScale(landmarks);
  const thumbTucked = (dist(landmarks[4], landmarks[5]) / handScale < 1.15) ||
    (dist(landmarks[4], landmarks[9]) / handScale < 1.15);

  return indexCurled && middleCurled && ringCurled && pinkyCurled && thumbTucked;
}

/**
 * Detects pinch zoom gesture (index and thumb tip are close).
 * To prevent false positives, we check that the middle finger is extended.
 */
export function isPinching(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const handScale = getHandScale(landmarks);
  const pinchDist = dist(landmarks[4], landmarks[8]) / handScale;

  // Middle finger must be extended so we don't confuse a pinch with a fist
  const middleCurled = isFingerCurled(landmarks, 12, 10, 9);

  return pinchDist < 0.6 && !middleCurled;
}

/**
 * Detects a three-finger hold (index, middle, and ring fingertips close together).
 * Useful for text selection mode.
 */
export function isThreeFingerHold(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const handScale = getHandScale(landmarks);

  // Index, Middle, Ring must be extended (not curled)
  const indexExtended = !isFingerCurled(landmarks, 8, 6, 5);
  const middleExtended = !isFingerCurled(landmarks, 12, 10, 9);
  const ringExtended = !isFingerCurled(landmarks, 16, 14, 13);

  // Remove pinky requirement for robustness

  // Tips (8, 12, 16) must be clustered close to each other
  const distIndexMiddle = dist(landmarks[8], landmarks[12]) / handScale;
  const distMiddleRing = dist(landmarks[12], landmarks[16]) / handScale;

  return (
    indexExtended &&
    middleExtended &&
    ringExtended &&
    distIndexMiddle < 0.55 &&
    distMiddleRing < 0.55
  );
}

/**
 * Analyzes movement history to detect a fast swipe.
 * landmarkHistory is an array of objects: { landmarks: [...], timestamp: Date.now() }
 * Returns 'next', 'prev', or null.
 */
export function getSwipeDirection(landmarkHistory) {
  if (!landmarkHistory || landmarkHistory.length < 5) return null;

  const firstFrame = landmarkHistory[0];
  const lastFrame = landmarkHistory[landmarkHistory.length - 1];

  const firstWrist = firstFrame.landmarks[0];
  const lastWrist = lastFrame.landmarks[0];

  const dx = lastWrist.x - firstWrist.x;
  const dy = lastWrist.y - firstWrist.y;
  const dt = lastFrame.timestamp - firstFrame.timestamp;

  // Swipe must occur within 400ms and move at least 15% of the normalized screen width
  if (Math.abs(dx) > 0.15 && dt < 400) {
    // Swipe must be mostly horizontal (vertical deviation should be small)
    if (Math.abs(dy) < 0.08) {
      // In mirrored space, moving hand to left (dx < 0) corresponds to "next page"
      // and moving hand to right (dx > 0) corresponds to "previous page"
      return dx < 0 ? 'next' : 'prev';
    }
  }

  return null;
}

/**
 * Detects if 4 fingers are curled (fist-like) and the thumb is extended
 * pointing left or right. Returns 'left', 'right', or null.
 */
export function getThumbSwipeDirection(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;

  // 4 fingers must be curled
  const indexCurled = isFingerCurled(landmarks, 8, 6, 5);
  const middleCurled = isFingerCurled(landmarks, 12, 10, 9);
  const ringCurled = isFingerCurled(landmarks, 16, 14, 13);
  const pinkyCurled = isFingerCurled(landmarks, 20, 18, 17);

  if (!indexCurled || !middleCurled || !ringCurled || !pinkyCurled) return null;

  const handScale = getHandScale(landmarks);

  // Measure thumb tip (4) horizontal position relative to thumb base MCP (2)
  // in mirrored coordinate space (user's right = higher x).
  // xMirrored = 1 - x
  const thumbX = 1 - landmarks[4].x;
  const mcpX = 1 - landmarks[2].x;
  const thumbDiff = (thumbX - mcpX) / handScale;
  //testing
  // If pointing right: thumbDiff is positive and large
  // If pointing left: thumbDiff is negative and large
  if (thumbDiff > 0.35) return 'right';
  if (thumbDiff < -0.35) return 'left';

  return null;
}
