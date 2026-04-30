import * as THREE from 'three';

/**
 * Handles keyboard + mouse input with pointer lock for camera control.
 * - WASD / Arrow keys: movement (relative to camera direction)
 * - Mouse movement: orbit camera (via pointer lock)
 * - Left click: fire
 * - Space / Shift / Right click: dash
 * - Scroll wheel: zoom
 */
export class InputManager {
  constructor(canvas, camera, cameraController) {
    this.canvas = canvas;
    this.camera = camera;
    this.cameraController = cameraController;

    this.keys = new Set();
    this.mouseButtons = new Set();
    this.mouseScreen = new THREE.Vector2();
    this.mouseWorld = new THREE.Vector3();
    this.isPointerLocked = false;

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.dashPressedThisFrame = false;

    // Pre-allocate reusable input state to avoid GC pressure
    this._inputState = {
      movement: { x: 0, z: 0 },
      aimPosition: { x: 0, z: 0 },
      firing: false,
      dash: false
    };

    // Bind handlers
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onPointerLockChange = this.onPointerLockChange.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onCanvasClick = this.onCanvasClick.bind(this);

    this.attach();
  }

  attach() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    // Click canvas to enter pointer lock
    this.canvas.addEventListener('click', this.onCanvasClick);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.removeEventListener('click', this.onCanvasClick);

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  onCanvasClick() {
    if (!this.isPointerLocked) {
      this.canvas.requestPointerLock();
    }
  }

  onPointerLockChange() {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
  }

  onKeyDown(e) {
    this.keys.add(e.code);
    if (e.code === 'Space' || e.code === 'ShiftLeft') {
      this.dashPressedThisFrame = true;
    }
    // Prevent scrolling with space/arrows
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
  }

  onMouseMove(e) {
    if (this.isPointerLocked) {
      // Pointer lock mode: use movementX/Y deltas for camera orbit
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;

      if (this.cameraController) {
        this.cameraController.handleMouseMove(dx, dy);
      }
    }

    // Always track screen position for aim raycast
    const rect = this.canvas.getBoundingClientRect();
    this.mouseScreen.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseScreen.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.updateMouseWorld();
  }

  onMouseDown(e) {
    this.mouseButtons.add(e.button);
    if (e.button === 2) {
      this.dashPressedThisFrame = true;
    }
  }

  onMouseUp(e) {
    this.mouseButtons.delete(e.button);
  }

  onContextMenu(e) {
    e.preventDefault();
  }

  onWheel(e) {
    if (this.cameraController) {
      this.cameraController.handleZoom(-Math.sign(e.deltaY));
    }
  }

  /**
   * Raycast mouse screen position to the ground plane (y=0).
   */
  updateMouseWorld() {
    if (!this.camera) return;
    this.raycaster.setFromCamera(this.mouseScreen, this.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.mouseWorld);
  }

  /**
   * Returns the current input state.
   * Movement is oriented relative to the camera's facing direction.
   */
   update() {
    // Raw WASD input
    let rawX = 0;
    let rawZ = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) rawZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) rawZ += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) rawX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) rawX += 1;

    // Transform movement to be relative to camera direction
    let moveX = 0;
    let moveZ = 0;
    let aimX = 0;
    let aimZ = -1; // Default forward

    if (this.cameraController) {
      const forward = this.cameraController.getForward();
      const right = this.cameraController.getRight();

      if (rawX !== 0 || rawZ !== 0) {
        // Forward is -Z in raw, Right is +X in raw
        moveX = forward.x * (-rawZ) + right.x * rawX;
        moveZ = forward.z * (-rawZ) + right.z * rawX;

        // Normalize
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) {
          moveX /= len;
          moveZ /= len;
        }
      }

      // Aim = camera forward direction
      aimX = forward.x * 100;
      aimZ = forward.z * 100;
    }

    // Mutate pre-allocated state (zero allocations)
    const s = this._inputState;
    s.movement.x = moveX;
    s.movement.z = moveZ;
    s.aimPosition.x = aimX;
    s.aimPosition.z = aimZ;
    s.firing = this.mouseButtons.has(0) && this.isPointerLocked;
    s.dash = this.dashPressedThisFrame;

    // Reset frame-specific triggers
    this.dashPressedThisFrame = false;

    return s;
  }
}
