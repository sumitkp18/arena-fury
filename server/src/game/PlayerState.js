import { PLAYER, ARENA } from 'arena-fury-shared';
import { getRandomSpawnPoint } from './GameConfig.js';

const HALF_W = ARENA.WIDTH / 2;
const HALF_D = ARENA.DEPTH / 2;

/**
 * Server-side player entity. Tracks position, health, and game state.
 */
export default class PlayerState {
  constructor(id, socketId, username, color) {
    this.id = id;
    this.socketId = socketId;
    this.username = username;
    this.color = color;

    const spawn = getRandomSpawnPoint();
    this.x = spawn.x;
    this.z = spawn.z;
    this.vx = 0;
    this.vz = 0;
    this.rotation = 0;

    this.maxHealth = PLAYER.MAX_HEALTH;
    this.health = this.maxHealth;
    this.state = 'alive';

    this.kills = 0;
    this.deaths = 0;
    this.score = 0;

    this.lastProcessedInput = 0;
    this.dashCooldownEnd = 0;
    this.lastDamageTime = 0;
    this.lastFireTime = 0;

    this.activePowerUps = new Map();
  }

  /**
   * Apply a client input to this player.
   * Input format: { seq, movement: {x, z}, aimPosition: {x, z}, firing, dash }
   */
  applyInput(input, dt) {
    if (input.seq !== undefined) {
      this.lastProcessedInput = input.seq;
    }
    if (this.state !== 'alive') return;

    const speed = PLAYER.MOVE_SPEED;
    let dx = 0;
    let dz = 0;

    // Support both input formats
    if (input.movement) {
      dx = input.movement.x || 0;
      dz = input.movement.z || 0;
    } else {
      if (input.up) dz -= 1;
      if (input.down) dz += 1;
      if (input.left) dx -= 1;
      if (input.right) dx += 1;
    }

    // Normalize diagonal movement
    if (dx !== 0 || dz !== 0) {
      const length = Math.sqrt(dx * dx + dz * dz);
      dx /= length;
      dz /= length;
    }

    this.vx = dx * speed;
    this.vz = dz * speed;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // Look rotation from aim direction
    // aimPosition is a direction vector (camera forward * 100), not a world position
    if (input.aimPosition && input.aimPosition.x !== undefined) {
      this.rotation = Math.atan2(
        input.aimPosition.x,
        input.aimPosition.z
      );
    }

    // Clamp to arena bounds (with player radius padding)
    const pad = PLAYER.RADIUS;
    if (this.x < -HALF_W + pad) this.x = -HALF_W + pad;
    if (this.x > HALF_W - pad) this.x = HALF_W - pad;
    if (this.z < -HALF_D + pad) this.z = -HALF_D + pad;
    if (this.z > HALF_D - pad) this.z = HALF_D - pad;

    // Handle dash
    if (input.dash && Date.now() > this.dashCooldownEnd) {
      this.dashCooldownEnd = Date.now() + PLAYER.DASH_COOLDOWN;
      // Instant dash movement in input direction
      if (dx !== 0 || dz !== 0) {
        this.x += dx * PLAYER.DASH_SPEED * 0.2;
        this.z += dz * PLAYER.DASH_SPEED * 0.2;
        // Re-clamp
        if (this.x < -HALF_W + pad) this.x = -HALF_W + pad;
        if (this.x > HALF_W - pad) this.x = HALF_W - pad;
        if (this.z < -HALF_D + pad) this.z = -HALF_D + pad;
        if (this.z > HALF_D - pad) this.z = HALF_D - pad;
      }
    }
  }

  takeDamage(amount) {
    if (this.state !== 'alive') return false;

    this.health -= amount;
    this.lastDamageTime = Date.now();

    if (this.health <= 0) {
      this.health = 0;
      this.state = 'dead';
      this.deaths++;
      return true; // Player died
    }
    return false;
  }

  heal(amount) {
    if (this.state !== 'alive') return;
    this.health = Math.min(this.health + amount, this.maxHealth);
  }

  respawn(x, z) {
    this.health = this.maxHealth;
    this.state = 'alive';
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
  }

  toSnapshot() {
    return {
      id: this.id,
      socketId: this.socketId,
      x: Math.round(this.x * 100) / 100,
      z: Math.round(this.z * 100) / 100,
      vx: Math.round(this.vx * 100) / 100,
      vz: Math.round(this.vz * 100) / 100,
      rotation: Math.round(this.rotation * 100) / 100,
      health: this.health,
      state: this.state,
      lastProcessedInput: this.lastProcessedInput,
      color: this.color,
      username: this.username,
      score: this.score,
      kills: this.kills,
      deaths: this.deaths
    };
  }

  update(dt) {
    if (this.state !== 'alive') return;

    // Health regen after not taking damage
    if (this.health < this.maxHealth && Date.now() - this.lastDamageTime > PLAYER.HEALTH_REGEN_DELAY) {
      this.health = Math.min(this.maxHealth, this.health + PLAYER.HEALTH_REGEN_RATE * dt);
    }

    // Handle powerup expiry
    const now = Date.now();
    for (const [type, expiry] of this.activePowerUps.entries()) {
      if (now > expiry) {
        this.activePowerUps.delete(type);
      }
    }
  }
}
