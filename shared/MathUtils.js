/**
 * Math utilities shared between client and server.
 * Keeps physics calculations identical on both sides.
 */

/**
 * Linear interpolation between two values.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize a 2D vector { x, z } to unit length.
 * Returns { x: 0, z: 0 } for zero-length vectors.
 */
export function normalize2D(x, z) {
  const len = Math.sqrt(x * x + z * z);
  if (len === 0) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
}

/**
 * Distance between two 2D points.
 */
export function distance2D(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Squared distance (avoids sqrt for comparison).
 */
export function distanceSq2D(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return dx * dx + dz * dz;
}

/**
 * Angle from point 1 to point 2 in radians.
 */
export function angleTo(x1, z1, x2, z2) {
  return Math.atan2(z2 - z1, x2 - x1);
}

/**
 * Check if a point is within the arena bounds.
 */
export function isInBounds(x, z, halfWidth, halfDepth, padding = 0) {
  return (
    x >= -halfWidth + padding &&
    x <= halfWidth - padding &&
    z >= -halfDepth + padding &&
    z <= halfDepth - padding
  );
}

/**
 * Clamp a position to arena bounds.
 */
export function clampToBounds(x, z, halfWidth, halfDepth, padding = 0) {
  return {
    x: clamp(x, -halfWidth + padding, halfWidth - padding),
    z: clamp(z, -halfDepth + padding, halfDepth - padding),
  };
}

/**
 * Check circle vs circle collision.
 */
export function circlesCollide(x1, z1, r1, x2, z2, r2) {
  const combinedRadius = r1 + r2;
  return distanceSq2D(x1, z1, x2, z2) <= combinedRadius * combinedRadius;
}

/**
 * Generate a random position within arena bounds.
 */
export function randomArenaPosition(halfWidth, halfDepth, padding = 2) {
  return {
    x: (Math.random() * 2 - 1) * (halfWidth - padding),
    z: (Math.random() * 2 - 1) * (halfDepth - padding),
  };
}

/**
 * Smooth damp (spring-like interpolation for camera follow etc).
 */
export function smoothDamp(current, target, velocity, smoothTime, maxSpeed, dt) {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  const temp = (velocity + omega * change) * dt;
  const newVelocity = (velocity - omega * temp) * exp;
  let newValue = (current - change) + (change + temp) * exp;

  // Prevent overshooting
  if ((target - current > 0) === (newValue > target)) {
    newValue = target;
    return { value: newValue, velocity: (newValue - target) / dt };
  }
  return { value: newValue, velocity: newVelocity };
}
