import * as THREE from 'three';
import { Scene } from './Scene.js';
import { Camera } from './Camera.js';
import { Lighting } from './Lighting.js';
import { Arena } from './Arena.js';
import { Player } from './Player.js';
import { Projectile } from './Projectile.js';
import { Particles } from './Particles.js';
import { InputManager } from '../input/InputManager.js';
import { SERVER_EVENTS } from 'arena-fury-shared';

const SEND_INTERVAL = 1000 / 30;

let inputSeq = 0;

/**
 * Main game class. Manages the Three.js scene, players, input, and game loop.
 */
export class Game {
  constructor(canvasContainer, socketManager, hud) {
    this.container = canvasContainer;
    this.socketManager = socketManager;
    this.hud = hud;

    this.players = new Map();
    this.projectiles = new Map();
    this.localPlayerId = null;

    this.lastTime = 0;
    this.animationFrameId = null;
    this.isRunning = false;

    // Snapshot queue
    this._pendingSnapshot = null;

    // Pre-allocated Set for projectile sync
    this._serverProjIds = new Set();

    // HUD update throttle
    this._lastHudUpdate = 0;
    this._hudUpdateInterval = 250;

    // FPS monitor
    this._frameCount = 0;
    this._fpsTime = 0;
    this._fps = 0;
    this._fpsEl = null;

    this.loop = this.loop.bind(this);
  }

  /**
   * Initialize the game with an initial snapshot from the server.
   * @param {object} initialSnapshot - First game state from server
   */
  init(initialSnapshot) {
    // Get our player ID from the socket manager (set during ROOM_JOINED)
    this.localPlayerId = this.socketManager.playerId;
    console.log('[Game] Local player ID:', this.localPlayerId);

    // Initialize Three.js components
    this.sceneManager = new Scene(this.container);
    this.scene = this.sceneManager.scene;

    this.camera = new Camera(this.sceneManager.camera);
    this.lighting = new Lighting(this.scene);
    this.arena = new Arena(this.scene);
    this.particles = new Particles(this.scene);

    this.inputManager = new InputManager(
      this.sceneManager.renderer.domElement,
      this.sceneManager.camera,
      this.camera
    );

    // Populate initial players from snapshot
    if (initialSnapshot && initialSnapshot.players) {
      for (const id in initialSnapshot.players) {
        this.addPlayer(initialSnapshot.players[id]);
      }
    }
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.lastInput = null;
    this.lastSendTime = 0;

    this._inputPacket = {
      seq: 0, t: 0,
      movement: { x: 0, z: 0 },
      aimPosition: { x: 0, z: 0 },
      firing: false, dash: false
    };

    this.sceneManager.renderer.setAnimationLoop((time) => this.loop(time));

    // Show mobile touch controls
    this.inputManager.showTouchControls();
  }

  /**
   * Main render loop — simple per-frame update.
   * Matches the approach proven smooth in movement-test.html.
   */
  loop(currentTime) {
    if (!this.isRunning) return;

    let dt = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (dt > 100) dt = 100;
    if (dt <= 0) dt = 1;

    // FPS counter
    this._frameCount++;
    this._fpsTime += dt;
    if (this._fpsTime >= 500) {
      this._fps = Math.round(this._frameCount / (this._fpsTime / 1000));
      this._frameCount = 0;
      this._fpsTime = 0;
      this._updateFpsDisplay(dt);
    }

    // Process queued snapshot
    if (this._pendingSnapshot) {
      this._processSnapshot(this._pendingSnapshot, currentTime);
      this._pendingSnapshot = null;
    }

    // Sample input and set direction on local player
    this.lastInput = this.inputManager.update();
    this._applyInputToLocalPlayer();

    // Send input to server (throttled)
    if (currentTime - this.lastSendTime >= SEND_INTERVAL) {
      this.lastSendTime = currentTime;
      inputSeq++;
      const pkt = this._inputPacket;
      pkt.seq = inputSeq;
      pkt.t = Date.now();
      pkt.movement.x = this.lastInput.movement.x;
      pkt.movement.z = this.lastInput.movement.z;
      pkt.aimPosition.x = this.lastInput.aimPosition.x;
      pkt.aimPosition.z = this.lastInput.aimPosition.z;
      pkt.firing = this.lastInput.firing;
      pkt.dash = this.lastInput.dash;

      // Include client position so server can sync projectile origins
      const lp = this.players.get(this.localPlayerId);
      if (lp) {
        pkt.pos = { x: lp.x, z: lp.z };
      }

      this.socketManager.sendInput(pkt);
    }

    // Update visuals and render
    this.updateVisuals(dt);

    this.sceneManager.render();
  }

  _updateFpsDisplay(lastDt) {
    if (!this._fpsEl) {
      this._fpsEl = document.createElement('div');
      this._fpsEl.style.cssText = 'position:fixed;top:8px;right:8px;color:#0f0;font:bold 14px monospace;background:rgba(0,0,0,0.7);padding:4px 8px;border-radius:4px;z-index:9999;pointer-events:none;';
      document.body.appendChild(this._fpsEl);
    }
    const dtColor = lastDt > 20 ? '#f44' : '#0f0';
    this._fpsEl.innerHTML = `FPS: ${this._fps} | dt: <span style="color:${dtColor}">${lastDt.toFixed(1)}ms</span>`;
  }

  /**
   * Apply current input to local player (set movement direction).
   */
  _applyInputToLocalPlayer() {
    const input = this.lastInput;
    if (!input) return;

    const localPlayer = this.players.get(this.localPlayerId);
    if (!localPlayer) return;

    let dx = input.movement.x;
    let dz = input.movement.z;

    if (dx !== 0 || dz !== 0) {
      const len = Math.sqrt(dx * dx + dz * dz);
      dx /= len;
      dz /= len;
    }

    localPlayer.setMovement(dx, dz);

    if (input.aimPosition.x !== undefined) {
      localPlayer.rotation = Math.atan2(
        input.aimPosition.x,
        input.aimPosition.z
      );
    }
  }

  /**
   * Render update: visuals, animations, camera.
   * @param {number} dt    - Raw frame delta in ms
   * @param {number} alpha - Physics interpolation factor 0..1
   */
  updateVisuals(dt) {
    const time = performance.now() * 0.001;

    this.lighting.update(time);
    this.arena.update(time);
    this.particles.update(dt);

    let localPlayerPos = null;

    // Update all players
    for (const [id, player] of this.players.entries()) {
      player.update(dt);
      if (id === this.localPlayerId) {
        // Force matrix update so camera reads correct position
        player.group.updateMatrixWorld(true);
        localPlayerPos = player.getPosition();
      }
    }

    // Update projectiles
    for (const proj of this.projectiles.values()) {
      proj.update(dt);
    }

    // Camera follows player
    if (localPlayerPos) {
      this.camera.update(dt, localPlayerPos);
    }
  }

  /**
   * Queue a snapshot for processing at the start of the next frame.
   * This prevents socket callbacks from interrupting mid-render.
   */
  handleSnapshot(snapshot) {
    this._pendingSnapshot = snapshot;
  }

  /**
   * Process a queued snapshot. Called at the start of each frame.
   */
  _processSnapshot(snapshot, currentTime) {
    if (!snapshot || !snapshot.players) return;

    // Update or add players
    for (const id in snapshot.players) {
      const pData = snapshot.players[id];
      if (!this.players.has(id)) {
        this.addPlayer(pData);
      } else {
        const p = this.players.get(id);
        if (id === this.localPlayerId) {
          // Local player is purely client-predicted — NEVER touch position.
          // Only sync health/damage state from server.
          if (pData.health < p.lastHealth) {
            p.takeDamage();
          }
          p.lastHealth = pData.health;
        } else {
          // Remote players: smooth interpolation toward server position
          p.setTarget(pData.x, pData.z, pData.rotation);
          if (pData.health < p.lastHealth) {
            p.takeDamage();
          }
          p.lastHealth = pData.health;
        }
      }
    }

    // Remove disconnected players
    for (const id of this.players.keys()) {
      if (!snapshot.players[id]) {
        this.removePlayer(id);
      }
    }

    // ─── Sync projectiles (reuse pre-allocated Set) ───
    const serverProjectiles = snapshot.projectiles || [];
    this._serverProjIds.clear();

    for (const pData of serverProjectiles) {
      this._serverProjIds.add(pData.id);
      if (!this.projectiles.has(pData.id)) {
        const proj = new Projectile(pData, this.scene);
        this.projectiles.set(pData.id, proj);
      } else {
        this.projectiles.get(pData.id).setTarget(pData.x, pData.z);
      }
    }

    for (const [id, proj] of this.projectiles.entries()) {
      if (!this._serverProjIds.has(id)) {
        proj.dispose(this.scene);
        this.projectiles.delete(id);
      }
    }

    // Throttle HUD DOM updates to reduce layout thrashing
    if (currentTime - this._lastHudUpdate > this._hudUpdateInterval) {
      this._lastHudUpdate = currentTime;
      const lp = snapshot.players[this.localPlayerId];
      if (lp) {
        let totalPlayers = 0;
        let alivePlayers = 0;
        for (const id in snapshot.players) {
          totalPlayers++;
          if (snapshot.players[id].state === 'alive') alivePlayers++;
        }
        this.hud.update(
          { alivePlayers, totalPlayers },
          lp,
          this.socketManager.latency
        );
      }
    }
  }

  /**
   * Add a player to the scene.
   */
  addPlayer(data) {
    if (this.players.has(data.id)) return;
    const isLocal = data.id === this.localPlayerId;
    const player = new Player(data, this.scene, isLocal);
    this.players.set(data.id, player);
    console.log(`[Game] Added player: ${data.username || data.id} (${isLocal ? 'local' : 'remote'})`);
  }

  /**
   * Remove a player from the scene.
   */
  removePlayer(id) {
    const p = this.players.get(id);
    if (p) {
      p.dispose(this.scene);
      this.players.delete(id);
    }
  }

  /**
   * Clean up all game resources.
   */
  dispose() {
    this.isRunning = false;
    this.sceneManager.renderer.setAnimationLoop(null);

    this.inputManager.hideTouchControls();
    this.inputManager.dispose();

    for (const p of this.players.values()) {
      p.dispose(this.scene);
    }
    this.players.clear();

    for (const proj of this.projectiles.values()) {
      proj.dispose(this.scene);
    }
    this.projectiles.clear();

    this.sceneManager.dispose();
  }
}
