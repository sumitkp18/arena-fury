import { v4 as uuidv4 } from 'uuid';
import { SERVER_EVENTS, PROJECTILE, ARENA, GAME } from 'arena-fury-shared';
import PlayerState from './PlayerState.js';
import { getRandomSpawnPoint } from './GameConfig.js';

const HALF_W = ARENA.WIDTH / 2;
const HALF_D = ARENA.DEPTH / 2;

/**
 * Manages a single game room (match).
 * Lives system: each player has GAME.LIVES lives.
 * On death: respawn with invulnerability if lives remain.
 * When only one player has lives, that player wins → game over.
 */
export default class GameRoom {
  constructor(id, io) {
    this.id = id;
    this.io = io;
    this.players = new Map();       // socketId -> PlayerState
    this.state = 'lobby';           // lobby | countdown | playing | game_over
    this.roundNumber = 0;
    this.scores = {};
    this.powerUps = new Map();
    this.projectiles = new Map();
    this.inputQueues = new Map();   // socketId -> input[]
    this._pendingRespawns = [];     // { playerId, respawnAt }
  }

  addPlayer(socketId, username, color) {
    const id = socketId;
    const player = new PlayerState(id, socketId, username, color);
    this.players.set(socketId, player);
    this.inputQueues.set(socketId, []);
    this.scores[id] = 0;
    console.log(`[Room:${this.id.slice(0,8)}] Player "${username}" joined (${this.players.size} total)`);

    this.broadcast(SERVER_EVENTS.PLAYER_JOINED, {
      id: player.id,
      username: player.username,
      color: player.color
    });

    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.players.delete(socketId);
      this.inputQueues.delete(socketId);
      delete this.scores[player.id];
      console.log(`[Room:${this.id.slice(0,8)}] Player "${player.username}" left (${this.players.size} remaining)`);
      this.broadcast(SERVER_EVENTS.PLAYER_LEFT, { id: player.id });

      // Remove pending respawns for this player
      this._pendingRespawns = this._pendingRespawns.filter(r => r.playerId !== player.id);
    }
  }

  handleInput(socketId, input) {
    const queue = this.inputQueues.get(socketId);
    if (queue) {
      queue.push(input);
    }
  }

  startGame() {
    if (this.state === 'playing' || this.state === 'countdown') return;

    this.state = 'countdown';
    this.roundNumber++;
    this._pendingRespawns = [];
    console.log(`[Room:${this.id.slice(0,8)}] Starting countdown for game ${this.roundNumber}`);

    // Reset all players for new game
    for (const player of this.players.values()) {
      player.resetForNewGame();
    }

    // Clear projectiles
    this.projectiles.clear();

    let count = 3;
    this.broadcast(SERVER_EVENTS.GAME_COUNTDOWN, { count });

    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        this.state = 'playing';
        console.log(`[Room:${this.id.slice(0,8)}] Game ${this.roundNumber} started!`);
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
        queue.length = 0;
      }
    }

    // Update all players
    for (const player of this.players.values()) {
      player.update(dt);
    }

    if (this.state === 'playing') {
      this.updateProjectiles(dt);
      this._processRespawns();
      this._checkGameOver();
    }
  }

  /**
   * Process pending respawns.
   */
  _processRespawns() {
    const now = Date.now();
    const remaining = [];

    for (const entry of this._pendingRespawns) {
      if (now >= entry.respawnAt) {
        const player = this.findPlayerById(entry.playerId);
        if (player && player.lives > 0) {
          const spawn = getRandomSpawnPoint();
          player.respawn(spawn.x, spawn.z);
          console.log(`[Room:${this.id.slice(0,8)}] "${player.username}" respawned (${player.lives} lives left)`);

          this.broadcast(SERVER_EVENTS.PLAYER_RESPAWN, {
            playerId: player.id,
            x: spawn.x,
            z: spawn.z,
            lives: player.lives,
            invulnDuration: GAME.INVULN_TIME
          });
        }
      } else {
        remaining.push(entry);
      }
    }
    this._pendingRespawns = remaining;
  }

  /**
   * Check if only one player has lives remaining → game over.
   */
  _checkGameOver() {
    if (this.players.size < 2) return;

    // Count players with lives > 0
    let playersWithLives = 0;
    let lastAlive = null;
    for (const player of this.players.values()) {
      if (player.lives > 0) {
        playersWithLives++;
        lastAlive = player;
      }
    }

    if (playersWithLives <= 1 && lastAlive) {
      this.state = 'game_over';
      console.log(`[Room:${this.id.slice(0,8)}] Game over! Winner: ${lastAlive.username}`);

      const playerList = [];
      for (const player of this.players.values()) {
        playerList.push({
          id: player.id,
          username: player.username,
          color: player.color,
          kills: player.kills,
          deaths: player.deaths,
          score: player.score,
          lives: player.lives,
          state: player.state
        });
      }

      this.broadcast(SERVER_EVENTS.GAME_OVER, {
        winner: {
          id: lastAlive.id,
          username: lastAlive.username,
          color: lastAlive.color,
          kills: lastAlive.kills
        },
        players: playerList
      });

      // Clear projectiles
      this.projectiles.clear();
    }
  }

  processFireInput(player, input) {
    if (input.firing && player.state === 'alive') {
      const now = Date.now();
      if (now - player.lastFireTime > PROJECTILE.FIRE_RATE) {
        player.lastFireTime = now;
        const id = uuidv4().slice(0, 8);
        const speed = PROJECTILE.SPEED;

        const dirX = Math.sin(player.rotation);
        const dirZ = Math.cos(player.rotation);

        this.projectiles.set(id, {
          id,
          ownerId: player.id,
          x: player.x + dirX * 1.5,
          z: player.z + dirZ * 1.5,
          vx: dirX * speed,
          vz: dirZ * speed,
          damage: PROJECTILE.DAMAGE,
          createdAt: now
        });
      }
    }
  }

  updateProjectiles(dt) {
    const now = Date.now();

    for (const [id, proj] of this.projectiles.entries()) {
      if (now - proj.createdAt > PROJECTILE.MAX_LIFETIME) {
        this.projectiles.delete(id);
        continue;
      }

      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;

      if (Math.abs(proj.x) > HALF_W + 5 || Math.abs(proj.z) > HALF_D + 5) {
        this.projectiles.delete(id);
        continue;
      }

      for (const player of this.players.values()) {
        if (player.id !== proj.ownerId && player.state === 'alive') {
          const dx = player.x - proj.x;
          const dz = player.z - proj.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const hitRadius = 1.2;

          if (dist < hitRadius) {
            const died = player.takeDamage(proj.damage);
            this.projectiles.delete(id);

            if (!died) {
              // Just a hit, not a kill
              this.broadcast(SERVER_EVENTS.PLAYER_HIT, {
                playerId: player.id,
                damage: proj.damage,
                health: player.health
              });
            }

            if (died) {
              const killer = this.findPlayerById(proj.ownerId);
              if (killer) {
                killer.kills++;
                killer.score += 100;
              }

              this.broadcast(SERVER_EVENTS.PLAYER_KILLED, {
                killerId: proj.ownerId,
                killerName: killer ? killer.username : 'Unknown',
                victimId: player.id,
                victimName: player.username,
                victimLives: player.lives
              });

              // Queue respawn if lives remain
              if (player.lives > 0) {
                this._pendingRespawns.push({
                  playerId: player.id,
                  respawnAt: Date.now() + GAME.RESPAWN_DELAY
                });
              }
            }
            break;
          }
        }
      }
    }
  }

  findPlayerById(id) {
    for (const player of this.players.values()) {
      if (player.id === id) return player;
    }
    return null;
  }

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

  getAliveCount() {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.state === 'alive') count++;
    }
    return count;
  }

  broadcast(event, data) {
    this.io.to(this.id).emit(event, data);
  }
}
