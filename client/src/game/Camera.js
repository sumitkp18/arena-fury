import * as THREE from 'three';

/**
 * Orbit camera that follows the player with exponential smooth follow.
 *
 * KEY INSIGHT: The camera must NEVER rigidly lock to the player.
 * When camera rigidly follows, the player stays perfectly static on screen.
 * The eye locks onto the static player and hyper-focuses on background
 * movement, amplifying any micro-jitter into perceived "stutter".
 *
 * By using a smooth follow (lerp), the player drifts slightly from
 * screen center during movement. This breaks the optical illusion and
 * makes background panning feel natural.
 */
export class Camera {
  constructor(camera) {
    this.camera = camera;

    // Spherical orbit parameters
    this.azimuth = 0;
    this.elevation = Math.PI / 4;
    this.distance = 30;

    // Limits
    this.minElevation = 0.15;
    this.maxElevation = Math.PI / 2.2;
    this.minDistance = 15;
    this.maxDistance = 50;

    // Mouse sensitivity
    this.sensitivityX = 0.003;
    this.sensitivityY = 0.003;
    this.zoomSpeed = 2;

    // Smooth follow state
    // These track where the camera CURRENTLY is (smoothed)
    this.currentFollowX = 0;
    this.currentFollowZ = 0;

    // Pre-allocated vectors (avoid per-frame allocation)
    this._targetCamPos = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();

    // Initial position
    this.camera.position.set(0, this.distance * Math.cos(this.elevation), this.distance * Math.sin(this.elevation));
    this.camera.lookAt(0, 0, 0);
  }

  handleMouseMove(dx, dy) {
    this.azimuth -= dx * this.sensitivityX;
    this.elevation -= dy * this.sensitivityY;
    this.elevation = Math.max(this.minElevation, Math.min(this.maxElevation, this.elevation));
  }

  handleZoom(delta) {
    this.distance -= delta * this.zoomSpeed;
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
  }

  getForward() {
    return {
      x: -Math.sin(this.azimuth),
      z: -Math.cos(this.azimuth)
    };
  }

  getRight() {
    return {
      x: Math.cos(this.azimuth),
      z: -Math.sin(this.azimuth)
    };
  }

  /**
   * Update camera each frame with smooth follow.
   *
   * @param {number} dt - Delta time in ms
   * @param {object} playerPos - { x, z } - the player's rendered position
   */
  update(dt, playerPos) {
    if (!playerPos) return;

    // ─── Exponential smooth follow ──────────────────────
    // The camera smoothly chases the player position.
    // Speed of 8 means ~75% catch-up per frame at 60fps.
    // This creates a subtle ~2px drift during movement that
    // breaks the "static subject" illusion and eliminates
    // perceived background stutter.
    const t = 1.0 - Math.exp(-8 * dt / 1000);
    this.currentFollowX += (playerPos.x - this.currentFollowX) * t;
    this.currentFollowZ += (playerPos.z - this.currentFollowZ) * t;

    // Compute camera orbit position from smoothed follow point
    const px = this.currentFollowX;
    const pz = this.currentFollowZ;

    const camX = px + this.distance * Math.sin(this.elevation) * Math.sin(this.azimuth);
    const camY = this.distance * Math.cos(this.elevation);
    const camZ = pz + this.distance * Math.sin(this.elevation) * Math.cos(this.azimuth);

    // Set camera position and look-at
    this.camera.position.set(camX, camY, camZ);
    this._lookTarget.set(px, 0, pz);
    this.camera.lookAt(this._lookTarget);

    // Force camera matrix update so the render uses the correct transform
    this.camera.updateMatrixWorld(true);
  }
}
