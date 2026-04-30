/**
 * Shared game constants used by both client and server.
 * Centralizing these ensures physics behave identically on both sides.
 */

// ─── Arena ───────────────────────────────────────────────────
export const ARENA = {
  WIDTH: 60,
  DEPTH: 60,
  WALL_HEIGHT: 4,
  WALL_THICKNESS: 1,
  GRID_DIVISIONS: 30,
};

// ─── Player ──────────────────────────────────────────────────
export const PLAYER = {
  RADIUS: 0.6,
  MAX_HEALTH: 100,
  MOVE_SPEED: 12,          // units per second
  DASH_SPEED: 36,          // units per second during dash
  DASH_DURATION: 200,      // ms
  DASH_COOLDOWN: 5000,     // ms
  DASH_INVULNERABLE: true, // i-frames during dash
  HEALTH_REGEN_RATE: 5,    // HP per second
  HEALTH_REGEN_DELAY: 4000,// ms after last damage before regen starts
  RESPAWN_DELAY: 3000,     // ms
  MASS: 5,
};

// ─── Projectile ──────────────────────────────────────────────
export const PROJECTILE = {
  RADIUS: 0.15,
  SPEED: 30,               // units per second
  DAMAGE: 20,
  CHARGED_DAMAGE: 45,
  CHARGE_TIME: 1500,       // ms to fully charge
  FIRE_RATE: 300,          // ms between shots
  MAX_LIFETIME: 3000,      // ms before despawn
  MAX_ACTIVE: 50,          // max projectiles per room
};

// ─── Power-ups ───────────────────────────────────────────────
export const POWERUP = {
  RADIUS: 0.5,
  HOVER_HEIGHT: 1.2,
  ROTATION_SPEED: 2,       // radians per second
  SPAWN_INTERVAL: 15000,   // ms between spawns
  MAX_ON_FIELD: 3,

  TYPES: {
    HEALTH:     { id: 'health',     value: 50,  duration: 0,    color: 0x00ff88 },
    SPEED:      { id: 'speed',      value: 2,   duration: 5000, color: 0xffaa00 },
    SHIELD:     { id: 'shield',     value: 1,   duration: 0,    color: 0x00ccff },
    TRIPLE_SHOT:{ id: 'triple_shot',value: 3,   duration: 10000,color: 0xff00ff },
  },
};

// ─── Game Rules ──────────────────────────────────────────────
export const GAME = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6,
  ROUNDS_TO_WIN: 3,        // best of 5
  ROUND_TIME_LIMIT: 120000,// ms per round
  COUNTDOWN_TIME: 5000,    // ms before round starts
  LOBBY_TIMEOUT: 300000,   // ms before empty lobby closes
};

// ─── Network ─────────────────────────────────────────────────
export const NETWORK = {
  SERVER_TICK_RATE: 60,     // ticks per second (server simulation)
  CLIENT_SEND_RATE: 30,    // inputs per second to server
  SNAPSHOT_RATE: 20,        // state snapshots per second to clients
  INTERPOLATION_DELAY: 100, // ms delay for entity interpolation
  INPUT_BUFFER_SIZE: 128,  // circular buffer size for inputs
  MAX_PREDICTION_FRAMES: 30,
};

// ─── Physics (used by server & client prediction) ────────────
export const PHYSICS = {
  GRAVITY: -20,
  FIXED_TIMESTEP: 1 / 60,  // 60 Hz
  MAX_SUB_STEPS: 3,
  FRICTION: 0.3,
  RESTITUTION: 0.2,
};
