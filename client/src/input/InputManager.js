import * as THREE from 'three';
import { TouchControls } from './TouchControls.js';

/**
 * Handles keyboard + mouse + touch input.
 * - Desktop: WASD/arrows + pointer lock mouse + click to fire
 * - Mobile:  Left joystick + right drag/tap for aim & shoot
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

    // Mobile touch controls
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.touchControls = new TouchControls(
      canvas.parentElement || document.body,
      cameraController
    );

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

    // Click canvas to enter pointer lock (desktop only)
    if (!this.isMobile) {
      this.canvas.addEventListener('click', this.onCanvasClick);
    }
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

    if (this.touchControls) {
      this.touchControls.dispose();
    }
  }

  showTouchControls() {
    if (this.touchControls) this.touchControls.show();
  }

  hideTouchControls() {
    if (this.touchControls) this.touchControls.hide();
  }

  onCanvasClick() {
    if (!this.isPointerLocked && !this.isMobile) {
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
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;

      if (this.cameraController) {
        this.cameraController.handleMouseMove(dx, dy);
      }
    }

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

  updateMouseWorld() {
    if (!this.camera) return;
    this.raycaster.setFromCamera(this.mouseScreen, this.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.mouseWorld);
  }

  /**
   * Returns the current input state.
   * Merges keyboard/mouse + touch inputs.
   */
  update() {
    let moveX = 0;
    let moveZ = 0;
    let aimX = 0;
    let aimZ = -1;
    let isFiring = false;

    // ─── Desktop input ─────────────────────────────
    let rawX = 0;
    let rawZ = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) rawZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) rawZ += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) rawX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) rawX += 1;

    if (this.cameraController) {
      const forward = this.cameraController.getForward();
      const right = this.cameraController.getRight();

      if (rawX !== 0 || rawZ !== 0) {
        moveX = forward.x * (-rawZ) + right.x * rawX;
        moveZ = forward.z * (-rawZ) + right.z * rawX;
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) { moveX /= len; moveZ /= len; }
      }

      aimX = forward.x * 100;
      aimZ = forward.z * 100;
    }

    isFiring = this.mouseButtons.has(0) && this.isPointerLocked;

    // ─── Touch input (overrides if active) ──────────
    if (this.isMobile && this.touchControls) {
      const touch = this.touchControls.getMovement();

      if (Math.abs(touch.x) > 0.01 || Math.abs(touch.z) > 0.01) {
        // Transform joystick XY to camera-relative world XZ
        if (this.cameraController) {
          const forward = this.cameraController.getForward();
          const right = this.cameraController.getRight();

          // Joystick: x = left/right, z = up/down (screen space)
          // Screen up = camera forward, screen right = camera right
          moveX = forward.x * (-touch.z) + right.x * touch.x;
          moveZ = forward.z * (-touch.z) + right.z * touch.x;

          const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
          if (len > 0) { moveX /= len; moveZ /= len; }
        }
      }

      // Touch firing
      if (this.touchControls.isFiring()) {
        isFiring = true;
      }

      // Aim is always camera forward on mobile
      if (this.cameraController) {
        const forward = this.cameraController.getForward();
        aimX = forward.x * 100;
        aimZ = forward.z * 100;
      }
    }

    // Write to pre-allocated state
    const s = this._inputState;
    s.movement.x = moveX;
    s.movement.z = moveZ;
    s.aimPosition.x = aimX;
    s.aimPosition.z = aimZ;
    s.firing = isFiring;
    s.dash = this.dashPressedThisFrame;

    this.dashPressedThisFrame = false;

    return s;
  }
}
