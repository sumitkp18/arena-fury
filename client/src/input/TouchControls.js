import * as THREE from 'three';

/**
 * Mobile touch controls for landscape mode.
 * - Left side: Virtual joystick for movement
 * - Right side: Drag to orbit camera, tap/hold to shoot
 */
export class TouchControls {
  constructor(container, cameraController) {
    this.container = container;
    this.cameraController = cameraController;
    this.isMobile = this._detectMobile();

    // Movement joystick state
    this.moveX = 0;
    this.moveZ = 0;
    this.moveActive = false;
    this.moveTouchId = null;
    this.moveOriginX = 0;
    this.moveOriginY = 0;

    // Aim/shoot state
    this.aimActive = false;
    this.aimTouchId = null;
    this.aimLastX = 0;
    this.aimLastY = 0;
    this.firing = false;
    this._fireTimer = null;
    this._fireTapThreshold = 150; // ms — taps shorter than this trigger fire

    // Joystick config
    this.joystickRadius = 50;
    this.joystickDeadZone = 8;

    // DOM elements
    this._overlay = null;
    this._joystickBase = null;
    this._joystickKnob = null;
    this._aimArea = null;
    this._shootIndicator = null;
    this._orientationOverlay = null;

    if (this.isMobile) {
      this._createUI();
      this._createOrientationOverlay();
      this._bindEvents();
      this._checkOrientation();
    }
  }

  _detectMobile() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  // ─── UI Creation ─────────────────────────────────────

  _createUI() {
    // Main overlay (only visible in landscape during gameplay)
    this._overlay = document.createElement('div');
    this._overlay.id = 'touch-controls-overlay';
    this._overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 500;
      pointer-events: none; display: none;
      touch-action: none;
    `;

    // ─── LEFT: Movement joystick ───
    const leftArea = document.createElement('div');
    leftArea.style.cssText = `
      position: absolute; left: 0; top: 0;
      width: 45%; height: 100%;
      pointer-events: auto; touch-action: none;
    `;

    this._joystickBase = document.createElement('div');
    this._joystickBase.style.cssText = `
      position: absolute; left: 30px; bottom: 30px;
      width: 120px; height: 120px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(0,255,204,0.12) 0%, rgba(0,255,204,0.04) 70%, transparent 100%);
      border: 2px solid rgba(0,255,204,0.25);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 20px rgba(0,255,204,0.08), inset 0 0 20px rgba(0,255,204,0.05);
    `;

    this._joystickKnob = document.createElement('div');
    this._joystickKnob.style.cssText = `
      width: 44px; height: 44px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(0,255,204,0.6) 0%, rgba(0,255,204,0.25) 100%);
      border: 2px solid rgba(0,255,204,0.5);
      box-shadow: 0 0 12px rgba(0,255,204,0.4);
      transition: transform 0.06s ease-out;
    `;

    this._joystickBase.appendChild(this._joystickKnob);
    leftArea.appendChild(this._joystickBase);

    // ─── RIGHT: Aim + Shoot area ───
    const rightArea = document.createElement('div');
    rightArea.style.cssText = `
      position: absolute; right: 0; top: 0;
      width: 55%; height: 100%;
      pointer-events: auto; touch-action: none;
    `;

    // Shoot button
    this._shootBtn = document.createElement('div');
    this._shootBtn.style.cssText = `
      position: absolute; right: 30px; bottom: 30px;
      width: 70px; height: 70px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,0,102,0.15) 0%, rgba(255,0,102,0.05) 100%);
      border: 2px solid rgba(255,0,102,0.35);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 20px rgba(255,0,102,0.1);
      transition: all 0.1s ease;
    `;
    this._shootBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,0,102,0.7)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`;

    // Hint text
    const hint = document.createElement('div');
    hint.style.cssText = `
      position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
      color: rgba(255,255,255,0.25); font: 600 11px 'Rajdhani', sans-serif;
      text-transform: uppercase; letter-spacing: 2px;
      pointer-events: none; white-space: nowrap;
    `;
    hint.textContent = 'Drag to aim';

    rightArea.appendChild(hint);
    rightArea.appendChild(this._shootBtn);

    this._overlay.appendChild(leftArea);
    this._overlay.appendChild(rightArea);
    this.container.appendChild(this._overlay);

    // Store references for event binding
    this._leftArea = leftArea;
    this._rightArea = rightArea;
  }

  _createOrientationOverlay() {
    this._orientationOverlay = document.createElement('div');
    this._orientationOverlay.id = 'orientation-overlay';
    this._orientationOverlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      background: linear-gradient(135deg, #0a0a1a 0%, #0f1a2e 50%, #0a0a1a 100%);
      display: none;
      flex-direction: column; align-items: center; justify-content: center;
      gap: 24px;
    `;

    // Phone rotation icon
    const icon = document.createElement('div');
    icon.innerHTML = `
      <svg width="80" height="80" viewBox="0 0 100 100" fill="none">
        <rect x="25" y="10" width="50" height="80" rx="8" stroke="rgba(0,255,204,0.6)" stroke-width="3" fill="none">
          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="90 50 50" dur="1.5s" repeatCount="indefinite" />
        </rect>
        <circle cx="50" cy="82" r="3" fill="rgba(0,255,204,0.4)">
          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="90 50 50" dur="1.5s" repeatCount="indefinite" />
        </circle>
      </svg>
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      color: #00ffcc; font: 700 22px 'Orbitron', sans-serif;
      text-transform: uppercase; letter-spacing: 3px;
      text-shadow: 0 0 20px rgba(0,255,204,0.4);
    `;
    title.textContent = 'Rotate Your Device';

    const subtitle = document.createElement('div');
    subtitle.style.cssText = `
      color: rgba(255,255,255,0.4); font: 500 14px 'Rajdhani', sans-serif;
      text-align: center; max-width: 260px; line-height: 1.5;
    `;
    subtitle.textContent = 'Arena Fury plays best in landscape mode. Please rotate your phone to continue.';

    this._orientationOverlay.appendChild(icon);
    this._orientationOverlay.appendChild(title);
    this._orientationOverlay.appendChild(subtitle);
    document.body.appendChild(this._orientationOverlay);
  }

  // ─── Orientation Detection ───────────────────────────

  _checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth;
    if (this._orientationOverlay) {
      this._orientationOverlay.style.display = isPortrait ? 'flex' : 'none';
    }
  }

  // ─── Event Binding ────────────────────────────────────

  _bindEvents() {
    // Orientation
    window.addEventListener('resize', () => this._checkOrientation());
    if (screen.orientation) {
      screen.orientation.addEventListener('change', () => this._checkOrientation());
    }
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._checkOrientation(), 100);
    });

    // Left area — joystick
    this._leftArea.addEventListener('touchstart', (e) => this._onMoveStart(e), { passive: false });
    this._leftArea.addEventListener('touchmove', (e) => this._onMoveMove(e), { passive: false });
    this._leftArea.addEventListener('touchend', (e) => this._onMoveEnd(e), { passive: false });
    this._leftArea.addEventListener('touchcancel', (e) => this._onMoveEnd(e), { passive: false });

    // Right area — aim/camera drag
    this._rightArea.addEventListener('touchstart', (e) => this._onAimStart(e), { passive: false });
    this._rightArea.addEventListener('touchmove', (e) => this._onAimMove(e), { passive: false });
    this._rightArea.addEventListener('touchend', (e) => this._onAimEnd(e), { passive: false });
    this._rightArea.addEventListener('touchcancel', (e) => this._onAimEnd(e), { passive: false });
  }

  // ─── Movement Joystick ────────────────────────────────

  _onMoveStart(e) {
    e.preventDefault();
    if (this.moveTouchId !== null) return;
    const touch = e.changedTouches[0];
    this.moveTouchId = touch.identifier;
    this.moveActive = true;

    // Use the joystick base center as the origin
    const rect = this._joystickBase.getBoundingClientRect();
    this.moveOriginX = rect.left + rect.width / 2;
    this.moveOriginY = rect.top + rect.height / 2;

    this._updateJoystick(touch.clientX, touch.clientY);
  }

  _onMoveMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.moveTouchId) {
        this._updateJoystick(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  _onMoveEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.moveTouchId) {
        this.moveTouchId = null;
        this.moveActive = false;
        this.moveX = 0;
        this.moveZ = 0;
        this._joystickKnob.style.transform = 'translate(0px, 0px)';
        break;
      }
    }
  }

  _updateJoystick(touchX, touchY) {
    let dx = touchX - this.moveOriginX;
    let dy = touchY - this.moveOriginY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp to joystick radius
    if (dist > this.joystickRadius) {
      dx = (dx / dist) * this.joystickRadius;
      dy = (dy / dist) * this.joystickRadius;
    }

    // Update knob visual position
    this._joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

    // Normalize to -1..1, apply dead zone
    if (dist < this.joystickDeadZone) {
      this.moveX = 0;
      this.moveZ = 0;
    } else {
      this.moveX = dx / this.joystickRadius;
      this.moveZ = dy / this.joystickRadius; // +Y on screen = +Z in world (forward)
    }
  }

  // ─── Aim / Shoot (Right Side) ─────────────────────────

  _onAimStart(e) {
    e.preventDefault();
    if (this.aimTouchId !== null) return;
    const touch = e.changedTouches[0];
    this.aimTouchId = touch.identifier;
    this.aimActive = true;
    this.aimLastX = touch.clientX;
    this.aimLastY = touch.clientY;
    this._aimStartTime = performance.now();
    this._aimMoved = false;

    // Start firing immediately on touch
    this.firing = true;
    this._shootBtn.style.background = 'radial-gradient(circle, rgba(255,0,102,0.4) 0%, rgba(255,0,102,0.15) 100%)';
    this._shootBtn.style.borderColor = 'rgba(255,0,102,0.7)';
    this._shootBtn.style.boxShadow = '0 0 30px rgba(255,0,102,0.3)';
  }

  _onAimMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.aimTouchId) {
        const dx = touch.clientX - this.aimLastX;
        const dy = touch.clientY - this.aimLastY;
        this.aimLastX = touch.clientX;
        this.aimLastY = touch.clientY;

        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          this._aimMoved = true;
        }

        // Rotate camera
        if (this.cameraController) {
          this.cameraController.handleMouseMove(dx, dy);
        }
        break;
      }
    }
  }

  _onAimEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this.aimTouchId) {
        this.aimTouchId = null;
        this.aimActive = false;
        this.firing = false;

        // Reset shoot button style
        this._shootBtn.style.background = 'radial-gradient(circle, rgba(255,0,102,0.15) 0%, rgba(255,0,102,0.05) 100%)';
        this._shootBtn.style.borderColor = 'rgba(255,0,102,0.35)';
        this._shootBtn.style.boxShadow = '0 0 20px rgba(255,0,102,0.1)';
        break;
      }
    }
  }

  // ─── Public API ───────────────────────────────────────

  show() {
    if (this._overlay) this._overlay.style.display = 'block';
    this._checkOrientation();
  }

  hide() {
    if (this._overlay) this._overlay.style.display = 'none';
  }

  /**
   * Returns movement input in raw screen space.
   * The InputManager transforms this relative to camera direction.
   */
  getMovement() {
    return { x: this.moveX, z: this.moveZ };
  }

  isFiring() {
    return this.firing;
  }

  dispose() {
    if (this._overlay) this._overlay.remove();
    if (this._orientationOverlay) this._orientationOverlay.remove();
  }
}
