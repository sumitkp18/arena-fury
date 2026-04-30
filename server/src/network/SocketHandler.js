import { v4 as uuidv4 } from 'uuid';
import { CLIENT_EVENTS, SERVER_EVENTS } from 'arena-fury-shared';
import GameRoom from '../game/GameRoom.js';

const COLORS = ['#ff0055', '#00ff88', '#00ccff', '#ffaa00', '#ff00ff', '#aaffee'];
let colorIndex = 0;

/** Map of socketId -> roomId */
const socketToRoom = new Map();

/**
 * Socket.IO event routing.
 * Maps client events to server game logic.
 */
export default {
  init(io, gameLoop) {
    io.on('connection', (socket) => {
      console.log(`[Server] Socket connected: ${socket.id}`);

      // ─── GUEST JOIN ──────────────────────────────────────────
      socket.on(CLIENT_EVENTS.GUEST_JOIN, (data) => {
        // Leave current room first if already in one
        leaveCurrentRoom(socket, gameLoop);

        const username = data?.username || 'Player_' + Math.random().toString(36).substring(2, 6);
        const color = COLORS[colorIndex % COLORS.length];
        colorIndex++;

        // Find an open room or create one
        let targetRoom = null;
        for (const room of gameLoop.rooms.values()) {
          if (room.state === 'lobby' && room.players.size < 6) {
            targetRoom = room;
            break;
          }
        }

        if (!targetRoom) {
          targetRoom = new GameRoom(uuidv4(), io);
          gameLoop.addRoom(targetRoom);
        }

        socket.join(targetRoom.id);
        socketToRoom.set(socket.id, targetRoom.id);
        const player = targetRoom.addPlayer(socket.id, username, color);

        // Tell the joining player about their room and ID
        socket.emit(SERVER_EVENTS.ROOM_JOINED, {
          roomId: targetRoom.id,
          playerId: player.id,
          username: player.username,
          color: player.color,
          state: targetRoom.state,
          players: Object.fromEntries(
            [...targetRoom.players.entries()].map(([sid, p]) => [p.id, p.toSnapshot()])
          )
        });

        // Auto-start when 2+ players are in the room
        if (targetRoom.players.size >= 2 && targetRoom.state === 'lobby') {
          setTimeout(() => {
            if (targetRoom.players.size >= 2 && targetRoom.state === 'lobby') {
              targetRoom.startGame();
            }
          }, 2000); // Give a moment for UI to settle
        }
      });

      // ─── CREATE ROOM ─────────────────────────────────────────
      socket.on(CLIENT_EVENTS.CREATE_ROOM, (data) => {
        // Leave current room first if already in one
        leaveCurrentRoom(socket, gameLoop);

        const username = data?.username || 'Player_' + Math.random().toString(36).substring(2, 6);
        const color = COLORS[colorIndex % COLORS.length];
        colorIndex++;

        const targetRoom = new GameRoom(uuidv4(), io);
        gameLoop.addRoom(targetRoom);

        socket.join(targetRoom.id);
        socketToRoom.set(socket.id, targetRoom.id);
        const player = targetRoom.addPlayer(socket.id, username, color);

        socket.emit(SERVER_EVENTS.ROOM_CREATED, {
          roomId: targetRoom.id,
          playerId: player.id,
          username: player.username,
          color: player.color,
          state: targetRoom.state
        });

        socket.emit(SERVER_EVENTS.ROOM_JOINED, {
          roomId: targetRoom.id,
          playerId: player.id,
          username: player.username,
          color: player.color,
          state: targetRoom.state,
          players: { [player.id]: player.toSnapshot() }
        });
      });

      // ─── JOIN ROOM ───────────────────────────────────────────
      socket.on(CLIENT_EVENTS.JOIN_ROOM, (data) => {
        const { roomId, username } = data || {};
        if (!roomId) {
          socket.emit(SERVER_EVENTS.ERROR, { message: 'Room code is required' });
          return;
        }

        // Leave current room first if in one
        leaveCurrentRoom(socket, gameLoop);

        // Support both full UUID and short 8-char room codes
        const code = roomId.trim().toLowerCase();
        let targetRoom = gameLoop.getRoom(code);

        // If not found by exact match, try prefix match (short code)
        if (!targetRoom) {
          for (const room of gameLoop.rooms.values()) {
            if (room.id.toLowerCase().startsWith(code)) {
              targetRoom = room;
              break;
            }
          }
        }

        if (!targetRoom) {
          socket.emit(SERVER_EVENTS.ERROR, { message: 'Room not found. Check the code and try again.' });
          return;
        }

        if (targetRoom.players.size >= 6) {
          socket.emit(SERVER_EVENTS.ERROR, { message: 'Room is full (6/6 players)' });
          return;
        }

        if (targetRoom.state !== 'lobby') {
          socket.emit(SERVER_EVENTS.ERROR, { message: 'Game already in progress' });
          return;
        }

        const name = username || 'Player_' + Math.random().toString(36).substring(2, 6);
        const color = COLORS[colorIndex % COLORS.length];
        colorIndex++;

        socket.join(targetRoom.id);
        socketToRoom.set(socket.id, targetRoom.id);
        const player = targetRoom.addPlayer(socket.id, name, color);

        socket.emit(SERVER_EVENTS.ROOM_JOINED, {
          roomId: targetRoom.id,
          playerId: player.id,
          username: player.username,
          color: player.color,
          state: targetRoom.state,
          players: Object.fromEntries(
            [...targetRoom.players.entries()].map(([sid, p]) => [p.id, p.toSnapshot()])
          )
        });

        // Auto-start
        if (targetRoom.players.size >= 2 && targetRoom.state === 'lobby') {
          setTimeout(() => {
            if (targetRoom.players.size >= 2 && targetRoom.state === 'lobby') {
              targetRoom.startGame();
            }
          }, 2000);
        }
      });

      // ─── LEAVE ROOM ──────────────────────────────────────────
      socket.on(CLIENT_EVENTS.LEAVE_ROOM, () => {
        leaveCurrentRoom(socket, gameLoop);
      });

      // ─── READY TOGGLE ────────────────────────────────────────
      socket.on(CLIENT_EVENTS.READY_TOGGLE, () => {
        // Placeholder for ready system
      });

      // ─── PLAYER INPUT ────────────────────────────────────────
      socket.on(CLIENT_EVENTS.PLAYER_INPUT, (input) => {
        const roomId = socketToRoom.get(socket.id);
        if (roomId) {
          const room = gameLoop.getRoom(roomId);
          if (room) {
            room.handleInput(socket.id, input);
          }
        }
      });

      // ─── PING ────────────────────────────────────────────────
      socket.on(CLIENT_EVENTS.PING, (callback) => {
        if (typeof callback === 'function') {
          callback(Date.now());
        } else {
          socket.emit(SERVER_EVENTS.PONG, Date.now());
        }
      });

      // ─── DISCONNECT ──────────────────────────────────────────
      socket.on('disconnect', () => {
        console.log(`[Server] Socket disconnected: ${socket.id}`);
        leaveCurrentRoom(socket, gameLoop);
      });
    });
  }
};

/**
 * Helper to remove a socket from its current room.
 */
function leaveCurrentRoom(socket, gameLoop) {
  const roomId = socketToRoom.get(socket.id);
  if (roomId) {
    const room = gameLoop.getRoom(roomId);
    if (room) {
      room.removePlayer(socket.id);
      socket.leave(roomId);
      if (room.players.size === 0) {
        gameLoop.removeRoom(roomId);
      }
    }
    socketToRoom.delete(socket.id);
  }
}
