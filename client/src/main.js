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

    // HUD exit button → show confirmation
    this.hud.onExit(() => {
      this.showExitConfirmation();
    });

    // ESC key → release pointer lock, then show confirmation
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state === 'playing') {
        if (this._exitDialogVisible) {
          this.hideExitConfirmation();
          return;
        }
        if (document.pointerLockElement) {
          document.exitPointerLock();
        } else {
          this.showExitConfirmation();
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
    // Room joined — lobby or mid-game join
    this.socketManager.on(SERVER_EVENTS.ROOM_JOINED, (data) => {
      console.log('[App] Room joined:', data.roomId, 'state:', data.state);

      // If the room is already playing, jump straight into the game
      if (data.state === 'playing' || data.state === 'countdown') {
        this.startGame({
          roomId: data.roomId,
          players: data.players || {},
          projectiles: [],
          state: data.state,
          timestamp: Date.now()
        });
        return;
      }

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
      if (this.state === 'lobby' && this.lobby?.currentRoom) {
        if (this.lobby.currentRoom.players) {
          this.lobby.currentRoom.players[data.id] = data;
          this.lobby.updateRoomState(this.lobby.currentRoom);
        }
      }
    });

    // Player ready — update ready status badge
    this.socketManager.on(SERVER_EVENTS.PLAYER_READY, (data) => {
      if (this.lobby) {
        this.lobby.updatePlayerReady(data);
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

    // Game starts — transition to gameplay (also handles restart after game over)
    this.socketManager.on(SERVER_EVENTS.GAME_START, (initialSnapshot) => {
      console.log('[App] Game starting!');
      this.lobby.hideWinnerBanner();

      // If already playing (restart), dispose old game first
      if (this.game) {
        this.game.dispose();
        this.game = null;
      }

      this.startGame(initialSnapshot);
    });

    // Game snapshot — forward to game if playing
    this.socketManager.on(SERVER_EVENTS.GAME_SNAPSHOT, (snapshot) => {
      if (this.game && this.state === 'playing') {
        this.game.handleSnapshot(snapshot);
      }
    });

    // Player killed — add to kill feed + show remaining lives
    this.socketManager.on(SERVER_EVENTS.PLAYER_KILLED, (data) => {
      if (this.hud) {
        const livesText = data.victimLives > 0 ? ` (${data.victimLives} lives left)` : ' (eliminated!)';
        this.hud.addKillFeedEntry(data.killerName, data.victimName + livesText);
      }
    });

    // Player respawn — teleport and start invulnerability glow
    this.socketManager.on(SERVER_EVENTS.PLAYER_RESPAWN, (data) => {
      if (this.game) {
        const p = this.game.players.get(data.playerId);
        if (p) {
          p.respawn(data.x, data.z, data.invulnDuration || 3000);
        }
      }
    });

    // Game over — show winner banner with Play Again / Exit options
    this.socketManager.on(SERVER_EVENTS.GAME_OVER, (results) => {
      console.log('[App] Game over:', results);
      // Keep the 3D scene running — show banner over it
      if (this.lobby) {
        this.lobby.showGameOverBanner(results, {
          onPlayAgain: () => {
            this.lobby.hideWinnerBanner();
            // Clean up game and return to lobby to ready up again
            if (this.game) {
              this.game.dispose();
              this.game = null;
            }
            this.state = 'lobby';
            this.hud.hide();
            this.lobby.show();
            // Re-fetch room state from server
            if (this.lobby.currentRoom) {
              this.lobby.isReady = false;
              this.lobby.updateReadyButton();
            }
          },
          onExit: () => {
            this.lobby.hideWinnerBanner();
            this.exitGame();
          }
        });
      }
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
      case 'startGame':
        this.socketManager.emit(CLIENT_EVENTS.START_GAME);
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

    // Show room code in HUD
    if (initialSnapshot.roomId) {
      this.hud.setRoomCode(initialSnapshot.roomId);
    }
  }

  /**
   * Show an exit confirmation dialog.
   */
  showExitConfirmation() {
    if (this._exitDialogVisible) return;
    this._exitDialogVisible = true;

    // Release pointer lock so mouse is free
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    this._exitDialog = document.createElement('div');
    this._exitDialog.className = 'exit-confirm-overlay';
    this._exitDialog.innerHTML = `
      <div class="exit-confirm-box">
        <h2 class="exit-confirm-title">Leave Game?</h2>
        <p class="exit-confirm-text">You'll lose your progress in this match.</p>
        <div class="exit-confirm-actions">
          <button class="btn-neon secondary" id="exit-confirm-leave">Leave Game</button>
          <button class="btn-neon" id="exit-confirm-stay">Keep Playing</button>
        </div>
      </div>
    `;
    document.body.appendChild(this._exitDialog);

    // Animate in
    requestAnimationFrame(() => {
      this._exitDialog.classList.add('exit-confirm-visible');
    });

    document.getElementById('exit-confirm-leave').addEventListener('click', () => {
      this.hideExitConfirmation();
      this.exitGame();
    });

    document.getElementById('exit-confirm-stay').addEventListener('click', () => {
      this.hideExitConfirmation();
    });
  }

  hideExitConfirmation() {
    this._exitDialogVisible = false;
    if (this._exitDialog) {
      this._exitDialog.classList.remove('exit-confirm-visible');
      setTimeout(() => {
        if (this._exitDialog && this._exitDialog.parentNode) {
          this._exitDialog.parentNode.removeChild(this._exitDialog);
        }
        this._exitDialog = null;
      }, 300);
    }
  }

  /**
   * Exit the game — clean up, leave room, return to lobby.
   */
  exitGame() {
    this.hideExitConfirmation();

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
