/**
 * Network protocol message types.
 * Used by both client and server to ensure consistent event naming.
 */

// ─── Client → Server ────────────────────────────────────────
export const CLIENT_EVENTS = {
  // Auth / Connection
  AUTHENTICATE:    'auth:authenticate',
  GUEST_JOIN:      'auth:guest',

  // Lobby / Matchmaking
  CREATE_ROOM:     'lobby:create',
  JOIN_ROOM:       'lobby:join',
  LEAVE_ROOM:      'lobby:leave',
  READY_TOGGLE:    'lobby:ready',
  CHAT_MESSAGE:    'lobby:chat',
  QUICK_MATCH:     'lobby:quickmatch',

  // Gameplay
  PLAYER_INPUT:    'game:input',
  PING:            'game:ping',
};

// ─── Server → Client ────────────────────────────────────────
export const SERVER_EVENTS = {
  // Auth
  AUTH_SUCCESS:     'auth:success',
  AUTH_ERROR:       'auth:error',

  // Lobby
  ROOM_CREATED:    'lobby:created',
  ROOM_JOINED:     'lobby:joined',
  ROOM_LEFT:       'lobby:left',
  ROOM_UPDATE:     'lobby:update',
  PLAYER_JOINED:   'lobby:player_joined',
  PLAYER_LEFT:     'lobby:player_left',
  PLAYER_READY:    'lobby:player_ready',
  CHAT_BROADCAST:  'lobby:chat_broadcast',
  MATCH_FOUND:     'lobby:match_found',

  // Game State
  GAME_COUNTDOWN:  'game:countdown',
  GAME_START:      'game:start',
  GAME_SNAPSHOT:   'game:snapshot',
  GAME_OVER:       'game:over',
  ROUND_START:     'game:round_start',
  ROUND_OVER:      'game:round_over',

  // Events
  PLAYER_HIT:      'game:player_hit',
  PLAYER_KILLED:   'game:player_killed',
  PLAYER_RESPAWN:  'game:player_respawn',
  POWERUP_SPAWN:   'game:powerup_spawn',
  POWERUP_PICKUP:  'game:powerup_pickup',
  PROJECTILE_FIRE: 'game:projectile_fire',

  // System
  PONG:            'game:pong',
  ERROR:           'system:error',
};

// ─── Input Action Types ─────────────────────────────────────
export const INPUT_ACTIONS = {
  MOVE:  'move',    // { x: -1..1, z: -1..1 }
  AIM:   'aim',     // { x: worldX, z: worldZ }
  FIRE:  'fire',    // { charged: boolean }
  DASH:  'dash',    // {}
};

// ─── Game States ─────────────────────────────────────────────
export const ROOM_STATE = {
  LOBBY:      'lobby',
  COUNTDOWN:  'countdown',
  PLAYING:    'playing',
  ROUND_OVER: 'round_over',
  GAME_OVER:  'game_over',
  CLOSED:     'closed',
};

// ─── Player States ───────────────────────────────────────────
export const PLAYER_STATE = {
  ALIVE:    'alive',
  DEAD:     'dead',
  DASHING:  'dashing',
  SPECTATING:'spectating',
};

/**
 * Build a player input message.
 * @param {number} seq - Input sequence number
 * @param {object} movement - { x, z } normalized direction
 * @param {object} aim - { x, z } world position of aim target
 * @param {boolean} firing - Is fire button held
 * @param {boolean} dashing - Is dash triggered this frame
 * @returns {object}
 */
export function buildInput(seq, movement, aim, firing, dashing) {
  return {
    seq,
    t: Date.now(),
    m: movement,   // { x, z }
    a: aim,        // { x, z }
    f: firing ? 1 : 0,
    d: dashing ? 1 : 0,
  };
}

/**
 * Build a minimal game state snapshot for one entity.
 * @param {object} player
 * @returns {object}
 */
export function buildEntitySnapshot(player) {
  return {
    id: player.id,
    x: Math.round(player.x * 100) / 100,
    z: Math.round(player.z * 100) / 100,
    vx: Math.round(player.vx * 100) / 100,
    vz: Math.round(player.vz * 100) / 100,
    r: Math.round(player.rotation * 100) / 100,
    hp: player.health,
    st: player.state,
    seq: player.lastProcessedInput,
  };
}
