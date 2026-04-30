import { NETWORK, SERVER_EVENTS } from 'arena-fury-shared';

/**
 * Server game loop. Runs at a fixed tick rate and updates all active game rooms.
 * Broadcasts game state snapshots at a lower rate to save bandwidth.
 */
class GameLoop {
  constructor() {
    this.rooms = new Map();
    this.intervalId = null;
    this.lastTick = 0;
    this.tickRate = NETWORK.SERVER_TICK_RATE;        // 60 Hz
    this.snapshotRate = NETWORK.SNAPSHOT_RATE;        // 20 Hz
    this.ticksPerSnapshot = Math.max(1, Math.floor(this.tickRate / this.snapshotRate));
    this.tickCount = 0;
  }

  start() {
    if (this.intervalId) return;

    const tickIntervalMs = 1000 / this.tickRate;
    this.lastTick = performance.now();

    console.log(`[GameLoop] Starting at ${this.tickRate}Hz (Snapshots at ${this.snapshotRate}Hz, every ${this.ticksPerSnapshot} ticks)`);

    this.intervalId = setInterval(() => {
      const now = performance.now();
      const dt = (now - this.lastTick) / 1000; // dt in seconds
      this.lastTick = now;
      this.tickCount++;

      // Update all rooms
      for (const room of this.rooms.values()) {
        room.update(dt);
      }

      // Broadcast snapshots at reduced rate
      if (this.tickCount % this.ticksPerSnapshot === 0) {
        for (const room of this.rooms.values()) {
          if (room.players.size > 0) {
            const snapshot = room.buildSnapshot();
            room.broadcast(SERVER_EVENTS.GAME_SNAPSHOT, snapshot);
          }
        }
      }
    }, tickIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[GameLoop] Stopped');
    }
  }

  addRoom(room) {
    this.rooms.set(room.id, room);
    console.log(`[GameLoop] Room created: ${room.id.slice(0, 8)}...`);
  }

  removeRoom(roomId) {
    this.rooms.delete(roomId);
    console.log(`[GameLoop] Room removed: ${roomId.slice(0, 8)}...`);
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomList() {
    const list = [];
    for (const room of this.rooms.values()) {
      list.push({
        id: room.id,
        playerCount: room.players.size,
        state: room.state
      });
    }
    return list;
  }
}

export const gameLoop = new GameLoop();
