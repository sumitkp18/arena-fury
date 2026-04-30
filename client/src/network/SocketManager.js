import io from 'socket.io-client';
import { SERVER_EVENTS, CLIENT_EVENTS } from 'arena-fury-shared';

/**
 * Manages the Socket.IO connection to the game server.
 * Provides an event-driven interface for sending and receiving game events.
 */
export class SocketManager {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
    this.connected = false;
    this.latency = 0;
    this.playerId = null;    // Server-assigned player ID
    this.currentRoomId = null;
    this._pingInterval = null;
  }

  /**
   * Connect to the game server.
   * @param {string} [url] - Server URL. Defaults to auto-detect.
   */
  connect(url = undefined) {
    // Connect directly to the game server, bypassing Vite's dev proxy.
    // The proxy adds latency and irregular frame delivery to WebSocket traffic.
    const serverUrl = url || `http://${window.location.hostname}:3001`;
    this.socket = io(serverUrl, {
      reconnectionDelayMax: 10000,
      transports: ['websocket'] // WebSocket only — no polling fallback
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected with ID:', this.socket.id);
      this.connected = true;
      this.trigger('connect');
      this.startPing();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.connected = false;
      this.playerId = null;
      this.currentRoomId = null;
      this.trigger('disconnect', { reason });
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    // Forward all server events to our event system
    Object.values(SERVER_EVENTS).forEach(event => {
      this.socket.on(event, (data) => {
        this.trigger(event, data);
      });
    });

    // Track room join
    this.on(SERVER_EVENTS.ROOM_JOINED, (data) => {
      this.playerId = data.playerId;
      this.currentRoomId = data.roomId;
      console.log(`[Socket] Joined room ${data.roomId}, player ID: ${data.playerId}`);
    });
  }

  /**
   * Start periodic latency measurement.
   */
  startPing() {
    if (this._pingInterval) clearInterval(this._pingInterval);
    this._pingInterval = setInterval(() => {
      if (!this.connected) return;
      const start = Date.now();
      this.socket.emit(CLIENT_EVENTS.PING, () => {
        this.latency = Date.now() - start;
      });
    }, 2000);
  }

  /**
   * Register an event handler.
   */
  on(event, callback) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(callback);
  }

  /**
   * Remove an event handler.
   */
  off(event, callback) {
    if (this.handlers.has(event)) {
      this.handlers.get(event).delete(callback);
    }
  }

  /**
   * Trigger registered handlers for an event.
   */
  trigger(event, data) {
    if (this.handlers.has(event)) {
      this.handlers.get(event).forEach(cb => cb(data));
    }
  }

  /**
   * Emit an event to the server.
   */
  emit(event, data) {
    if (this.connected && this.socket) {
      this.socket.emit(event, data);
    }
  }

  /**
   * Join as a guest player.
   */
  joinAsGuest(username) {
    this.emit(CLIENT_EVENTS.GUEST_JOIN, { username });
  }

  /**
   * Create a new room.
   */
  createRoom(username) {
    this.emit(CLIENT_EVENTS.CREATE_ROOM, { username });
  }

  /**
   * Join an existing room by ID.
   */
  joinRoom(roomId, username) {
    this.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId, username });
  }

  /**
   * Send player input to the server.
   */
  sendInput(inputData) {
    // Use volatile emit — if the socket buffer is full, drop this input
    // instead of queuing it. Prevents bufferbloat-induced stutter.
    if (this.connected && this.socket) {
      this.socket.volatile.emit(CLIENT_EVENTS.PLAYER_INPUT, inputData);
    }
  }

  /**
   * Get the socket ID.
   */
  get id() {
    return this.socket ? this.socket.id : null;
  }

  /**
   * Clean up on dispose.
   */
  dispose() {
    if (this._pingInterval) clearInterval(this._pingInterval);
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.handlers.clear();
  }
}
