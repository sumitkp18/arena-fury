import { v4 as uuidv4 } from 'uuid';
import { SERVER_EVENTS, PROJECTILE, ARENA } from 'arena-fury-shared';
import PlayerState from './PlayerState.js';
import { getRandomSpawnPoint } from './GameConfig.js';

const HALF_W = ARENA.WIDTH / 2;
const HALF_D = ARENA.DEPTH / 2;

/**
 * Manages a single game room (match).
 * Handles player state, projectiles, input processing, and win conditions.
 */
export default class GameRoom {
  constructor(id, io) {
    this.id = id;
    this.io = io;
    this.players = new Map();       // socketId -> PlayerState
    this.state = 'lobby';           // lobby | countdown | playing | round_over | game_over
    this.roundNumber = 0;
    this.scores = {};
    this.powerUps = new Map();
    this.projectiles = new Map();
    this.inputQueues = new Map();   // socketId -> input[]
  }

  /**
   * Add a player to this room.
   */
  addPlayer(socketId, username, color) {
    const id = socketId; // Use socketId as player ID for simpler client mapping
    const player = new PlayerState(id, socketId, username, color);
    this.players.set(socketId, player);
    this.inputQueues.set(socketId, []);
    this.scores[id] = 0;
    console.log(`[Room:${this.id.slice(0,8)}] Player "${username}" joined (${this.players.size} total)`);

    // Notify others in room
    this.broadcast(SERVER_EVENTS.PLAYER_JOINED, {
      id: player.id,
      username: player.username,
      color: player.color
    });

    return player;
  }

  /**
   * Remove a player from this room.
   */
  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.players.delete(socketId);
      this.inputQueues.delete(socketId);
      delete this.scores[player.id];
      console.log(`[Room:${this.id.slice(0,8)}] Player "${player.username}" left (${this.players.size} remaining)`);

      // Notify others
      this.broadcast(SERVER_EVENTS.PLAYER_LEFT, { id: player.id });
    }
  }

  /**
   * Queue a player input for processing on next tick.
   */
  handleInput(socketId, input) {
    // Accept inputs in both lobby (for movement preview) and playing states
    const queue = this.inputQueues.get(socketId);
    if (queue) {
      queue.push(input);
    }
  }

  /**
   * Start the game with a countdown.
   */
  startGame() {
    if (this.state === 'playing' || this.state === 'countdown') return;

    this.state = 'countdown';
    this.roundNumber++;
    console.log(`[Room:${this.id.slice(0,8)}] Starting countdown for round ${this.roundNumber}`);

    // Assign spawn positions
    for (const player of this.players.values()) {
      const spawn = getRandomSpawnPoint();
      player.respawn(spawn.x, spawn.z);
    }

    // Countdown
    let count = 3;
    this.broadcast(SERVER_EVENTS.GAME_COUNTDOWN, { count });

    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        this.state = 'playing';
        console.log(`[Room:${this.id.slice(0,8)}] Round ${this.roundNumber} started!`);

        // Build initial snapshot with all players
        const snapshot = this.buildSnapshot();
        this.broadcast(SERVER_EVENTS.GAME_START, snapshot);
      } else {
        this.broadcast(SERVER_EVENTS.GAME_COUNTDOWN, { count });
      }
    }, 1000);
  }

  /**
   * Main game update. Called every server tick.
   */
  update(dt) {
    // Process inputs even in lobby for movement
    for (const [socketId, player] of this.players.entries()) {
      const queue = this.inputQueues.get(socketId);
      if (queue && queue.length > 0) {
        for (const input of queue) {
          player.applyInput(input, dt);
          if (this.state === 'playing') {
            this.processFireInput(player, input);
          }
        }
        queue.length = 0; // Clear processed inputs
      }
    }

    // Update all players (regen, powerup expiry, etc.)
    for (const player of this.players.values()) {
      player.update(dt);
    }

    // Update projectiles (only during gameplay)
    if (this.state === 'playing') {
      this.updateProjectiles(dt);

      // Check win condition
      if (this.players.size > 1) {
        const aliveCount = this.getAliveCount();
        if (aliveCount <= 1) {
          this.state = 'round_over';
          console.log(`[Room:${this.id.slice(0,8)}] Round over!`);

          // Find the winner (last player alive)
          let winner = null;
          const playerList = [];
          for (const player of this.players.values()) {
            playerList.push({
              id: player.id,
              username: player.username,
              color: player.color,
              kills: player.kills,
              deaths: player.deaths,
              score: player.score,
              state: player.state
            });
            if (player.state === 'alive') {
              winner = {
                id: player.id,
                username: player.username,
                color: player.color,
                kills: player.kills
              };
            }
          }

          this.broadcast(SERVER_EVENTS.ROUND_OVER, {
            winner,
            players: playerList,
            round: this.roundNumber
          });

          // Auto-restart after delay
          setTimeout(() => {
            if (this.players.size >= 2) {
              this.startGame();
            } else {
              this.state = 'lobby';
            }
          }, 5000);
        }
      }
    }
  }

  /**
   * Process fire input from a player.
   */
  processFireInput(player, input) {
    if (input.firing && player.state === 'alive') {
      const now = Date.now();
      if (now - player.lastFireTime > PROJECTILE.FIRE_RATE) {
        player.lastFireTime = now;
        const id = uuidv4().slice(0, 8);
        const speed = PROJECTILE.SPEED;

        // Fire in aim direction
        const dirX = Math.sin(player.rotation);
        const dirZ = Math.cos(player.rotation);

        this.projectiles.set(id, {
          id,
          ownerId: player.id,
          x: player.x + dirX * 1.5,  // Offset from player center
          z: player.z + dirZ * 1.5,
          vx: dirX * speed,
          vz: dirZ * speed,
          damage: PROJECTILE.DAMAGE,
          createdAt: now
        });
      }
    }
  }

  /**
   * Update all projectiles: move, check lifetime, check collisions.
   */
  updateProjectiles(dt) {
    const now = Date.now();

    for (const [id, proj] of this.projectiles.entries()) {
      // Remove expired
      if (now - proj.createdAt > PROJECTILE.MAX_LIFETIME) {
        this.projectiles.delete(id);
        continue;
      }

      // Move
      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;

      // Remove if out of bounds
      if (Math.abs(proj.x) > HALF_W + 5 || Math.abs(proj.z) > HALF_D + 5) {
        this.projectiles.delete(id);
        continue;
      }

      // Collision with players
      for (const player of this.players.values()) {
        if (player.id !== proj.ownerId && player.state === 'alive') {
          const dx = player.x - proj.x;
          const dz = player.z - proj.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const hitRadius = 1.2; // Player radius + projectile radius

          if (dist < hitRadius) {
            const died = player.takeDamage(proj.damage);
            this.projectiles.delete(id);

            // Notify hit
            this.broadcast(SERVER_EVENTS.PLAYER_HIT, {
              playerId: player.id,
              damage: proj.damage,
              health: player.health
            });

            if (died) {
              // Credit the kill to the projectile owner
              const killer = this.findPlayerById(proj.ownerId);
              if (killer) {
                killer.kills++;
                killer.score += 100;
              }

              this.broadcast(SERVER_EVENTS.PLAYER_KILLED, {
                killerId: proj.ownerId,
                killerName: killer ? killer.username : 'Unknown',
                victimId: player.id,
                victimName: player.username
              });
            }
            break;
          }
        }
      }
    }
  }

  /**
   * Find a player by their entity ID.
   */
  findPlayerById(id) {
    for (const player of this.players.values()) {
      if (player.id === id) return player;
    }
    return null;
  }

  /**
   * Build a complete game state snapshot for network transmission.
   */
  buildSnapshot() {
    const playersObj = {};
    for (const player of this.players.values()) {
      playersObj[player.id] = player.toSnapshot();
    }

    const projectilesArr = [];
    for (const [id, p] of this.projectiles.entries()) {
      projectilesArr.push({
        id: p.id,
        x: Math.round(p.x * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        ownerId: p.ownerId
      });
    }

    return {
      roomId: this.id,
      state: this.state,
      round: this.roundNumber,
      players: playersObj,
      projectiles: projectilesArr,
      timestamp: Date.now()
    };
  }

  /**
   * Count alive players.
   */
  getAliveCount() {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.state === 'alive') count++;
    }
    return count;
  }

  /**
   * Broadcast an event to all sockets in this room.
   */
  broadcast(event, data) {
    this.io.to(this.id).emit(event, data);
  }
}
