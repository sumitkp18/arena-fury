import { SocketManager } from './network/SocketManager.js';
import { Game } from './game/Game.js';
import { HUD } from './ui/HUD.js';
import { Lobby } from './ui/Lobby.js';
import { SERVER_EVENTS, CLIENT_EVENTS } from 'arena-fury-shared';
import './styles/index.css';
import './styles/hud.css';
import './styles/ui.css';

/**
 * Main application controller.
 * Manages screen state transitions: lobby → playing → gameover.
 */
class App {
  constructor() {
    this.state = 'lobby'; // 'lobby' | 'playing' | 'gameover'

    // Core systems
    this.socketManager = new SocketManager();
    this.game = null;
    this.hud = null;
    this.lobby = null;

    this.init();
  }

  async init() {
    // Initialize UI components
    this.hud = new HUD(document.getElementById('hud-overlay'));
    this.lobby = new Lobby(
      document.getElementById('ui-overlay'),
      this.handleLobbyAction.bind(this)
    );

    // HUD exit button → leave game and return to lobby
    this.hud.onExit(() => {
      this.exitGame();
    });

    // ESC key also exits
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state === 'playing') {
        // Release pointer lock first, second press exits
        if (document.pointerLockElement) {
          document.exitPointerLock();
        } else {
          this.exitGame();
        }
      }
    });

    // Initial view
    this.hud.hide();
    this.lobby.show();

    // Connect to server
    this.socketManager.connect();
    this.setupSocketListeners();
  }

  setupSocketListeners() {
    // Room joined — we're in a lobby waiting for the game
    this.socketManager.on(SERVER_EVENTS.ROOM_JOINED, (data) => {
      console.log('[App] Room joined:', data.roomId);
      if (this.lobby) {
        this.lobby.updateRoomState({
          id: data.roomId,
          players: data.players || {}
        });
      }
    });

    // Room update — player list changed (someone joined/left)
    this.socketManager.on(SERVER_EVENTS.ROOM_UPDATE, (data) => {
      if (this.lobby && data) {
        this.lobby.updateRoomState(data);
      }
    });

    // Player joined — update lobby player list
    this.socketManager.on(SERVER_EVENTS.PLAYER_JOINED, (data) => {
      console.log('[App] Player joined:', data.username);
      // Request updated room state
      if (this.state === 'lobby' && this.lobby?.currentRoom) {
        // Add the new player to the existing room state
        if (this.lobby.currentRoom.players) {
          this.lobby.currentRoom.players[data.id] = data;
          this.lobby.updateRoomState(this.lobby.currentRoom);
        }
      }
    });

    // Player left — update lobby or game
    this.socketManager.on(SERVER_EVENTS.PLAYER_LEFT, (data) => {
      console.log('[App] Player left:', data.id);
      if (this.state === 'lobby' && this.lobby?.currentRoom) {
        if (this.lobby.currentRoom.players) {
          delete this.lobby.currentRoom.players[data.id];
          this.lobby.updateRoomState(this.lobby.currentRoom);
        }
      }
      if (this.game) {
        this.game.removePlayer(data.id);
      }
    });

    // Countdown before game starts
    this.socketManager.on(SERVER_EVENTS.GAME_COUNTDOWN, (data) => {
      console.log('[App] Countdown:', data.count);
      if (this.lobby) {
        this.lobby.showCountdown(data.count);
      }
    });

    // Game starts — transition to gameplay
    this.socketManager.on(SERVER_EVENTS.GAME_START, (initialSnapshot) => {
      console.log('[App] Game starting!');
      this.lobby.hideWinnerBanner();
      this.startGame(initialSnapshot);
    });

    // Game snapshot — forward to game if playing
    this.socketManager.on(SERVER_EVENTS.GAME_SNAPSHOT, (snapshot) => {
      if (this.game && this.state === 'playing') {
        this.game.handleSnapshot(snapshot);
      }
    });

    // Player killed — add to kill feed
    this.socketManager.on(SERVER_EVENTS.PLAYER_KILLED, (data) => {
      if (this.hud) {
        this.hud.addKillFeedEntry(data.killerName, data.victimName);
      }
    });

    // Round over — show winner banner with smooth transition
    this.socketManager.on(SERVER_EVENTS.ROUND_OVER, (data) => {
      console.log('[App] Round over:', data);
      if (this.lobby && this.state === 'playing') {
        this.lobby.showWinnerBanner(data);
      }
    });

    // Game over — return to lobby
    this.socketManager.on(SERVER_EVENTS.GAME_OVER, (results) => {
      this.endGame(results);
    });

    // Error from server
    this.socketManager.on(SERVER_EVENTS.ERROR, (data) => {
      console.error('[App] Server error:', data.message);
      if (this.lobby) {
        this.lobby.showToast(data.message);
      }
    });
  }

  handleLobbyAction(action, data) {
    switch (action) {
      case 'joinGuest':
        this.socketManager.joinAsGuest(data.username);
        break;
      case 'createRoom':
        this.socketManager.createRoom(data?.username);
        break;
      case 'joinRoom':
        this.socketManager.joinRoom(data.roomId, data?.username);
        break;
      case 'toggleReady':
        this.socketManager.emit(CLIENT_EVENTS.READY_TOGGLE, { ready: data.ready });
        break;
      case 'leaveRoom':
        this.socketManager.emit(CLIENT_EVENTS.LEAVE_ROOM);
        break;
    }
  }

  startGame(initialSnapshot) {
    this.state = 'playing';
    this.lobby.hide();
    this.hud.show();

    // Initialize 3D game
    const canvasContainer = document.getElementById('game-canvas');
    canvasContainer.innerHTML = '';

    this.game = new Game(canvasContainer, this.socketManager, this.hud);
    this.game.init(initialSnapshot);
    this.game.start();
  }

  /**
   * Exit the game — clean up, leave room, return to lobby.
   */
  exitGame() {
    // Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    this.state = 'lobby';
    this.hud.hide();
    this.lobby.hideWinnerBanner();

    if (this.game) {
      this.game.dispose();
      this.game = null;
    }

    // Tell server we're leaving
    this.socketManager.emit(CLIENT_EVENTS.LEAVE_ROOM);

    // Reset lobby to login screen
    this.lobby.resetToLogin();
    this.lobby.show();
  }

  endGame(results) {
    this.state = 'gameover';
    this.hud.hide();
    this.lobby.hideWinnerBanner();

    if (this.game) {
      this.game.dispose();
      this.game = null;
    }

    this.lobby.showResults(results);
    this.lobby.show();
  }
}

// Start app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
