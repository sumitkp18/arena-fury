/**
 * Lobby UI component.
 * Handles pre-game menu: username input, room creation/joining,
 * player list, ready-up, countdown, and game results.
 */
export class Lobby {
  constructor(container, onAction) {
    this.container = container;
    this.onAction = onAction;
    this.currentRoom = null;
    this.isReady = false;
    this.playerCount = 0;

    this.createDOM();
  }

  createDOM() {
    this.container.innerHTML = `
      <div class="glass-panel lobby-container" id="lobby-main">
        <h1 class="lobby-title">ARENA<br/><span class="title-accent">FURY</span></h1>
        <p class="lobby-subtitle">REAL-TIME ARENA COMBAT</p>

        <div id="login-section">
          <div class="input-group">
            <label>Call Sign</label>
            <input type="text" id="input-username" class="neon-input" placeholder="Enter your name..." maxlength="16" autocomplete="off">
          </div>

          <div class="lobby-actions">
            <button class="btn-neon" id="btn-quickmatch">⚡ Quick Match</button>
            <button class="btn-neon secondary" id="btn-createroom">🔒 Create Room</button>
          </div>

          <div class="room-section">
            <input type="text" id="input-roomcode" class="neon-input" placeholder="Room Code" maxlength="36" autocomplete="off">
            <button class="btn-neon" id="btn-joinroom">Join</button>
          </div>
        </div>

        <div id="room-section" style="display: none;">
          <div class="room-header">
            <h3>Lobby</h3>
            <div class="room-code" id="display-roomcode">CODE: ----</div>
          </div>

          <div class="player-list" id="player-list">
            <!-- Player cards injected here -->
          </div>

          <div class="ready-count" id="ready-count">0/0 Ready</div>

          <div id="countdown-display" class="countdown-text" style="display: none;"></div>

          <div class="room-bottom-actions">
            <button class="btn-neon btn-ready" id="btn-ready">READY UP</button>
            <button class="btn-neon btn-start-game" id="btn-startgame" disabled>⚡ START GAME</button>
            <button class="btn-neon secondary btn-leave" id="btn-leaveroom">✕ Leave</button>
          </div>
        </div>
      </div>

      <div id="toast-container" class="toast"></div>

      <div class="glass-panel results-container lobby-hidden" id="results-screen">
        <h1 class="results-title" id="results-title">GAME OVER</h1>
        <div id="results-stats"></div>
        <button class="btn-neon" id="btn-backtolobby" style="margin-top: 1.5rem;">Back to Lobby</button>
      </div>
    `;

    // Create the winner banner outside the lobby container so it's visible during gameplay
    this._bannerEl = document.createElement('div');
    this._bannerEl.className = 'winner-banner-overlay';
    this._bannerEl.id = 'winner-banner';
    this._bannerEl.style.display = 'none';
    this._bannerEl.innerHTML = `
      <div class="winner-banner-content">
        <div class="winner-crown">👑</div>
        <h1 class="winner-title" id="winner-title">VICTORY</h1>
        <p class="winner-subtitle" id="winner-subtitle">Game Over</p>
        <div class="winner-stats" id="winner-stats"></div>
        <div class="winner-actions" id="winner-actions">
          <button class="btn-neon" id="btn-play-again">⚡ PLAY AGAIN</button>
          <button class="btn-neon secondary" id="btn-exit-game">✕ EXIT</button>
        </div>
      </div>
    `;
    document.body.appendChild(this._bannerEl);

    this.bindEvents();
  }

  bindEvents() {
    const getUsername = () => {
      const val = document.getElementById('input-username').value.trim();
      return val || `Pilot_${Math.floor(Math.random() * 9999)}`;
    };

    document.getElementById('btn-quickmatch').addEventListener('click', () => {
      this.onAction('joinGuest', { username: getUsername() });
    });

    document.getElementById('btn-createroom').addEventListener('click', () => {
      this.onAction('createRoom', { username: getUsername() });
    });

    document.getElementById('btn-joinroom').addEventListener('click', () => {
      const code = document.getElementById('input-roomcode').value.trim();
      if (code.length > 0) {
        this.onAction('joinRoom', { roomId: code, username: getUsername() });
      } else {
        this.showToast('Please enter a room code');
      }
    });

    // Click room code to copy to clipboard
    document.getElementById('display-roomcode').addEventListener('click', () => {
      if (this._currentRoomCode) {
        navigator.clipboard.writeText(this._currentRoomCode).then(() => {
          this.showToast('Room code copied to clipboard!');
        }).catch(() => {
          this.showToast('Could not copy — try selecting the code manually');
        });
      }
    });

    document.getElementById('btn-ready').addEventListener('click', () => {
      this.isReady = !this.isReady;
      this.updateReadyButton();
      this.onAction('toggleReady', { ready: this.isReady });
    });

    document.getElementById('btn-startgame').addEventListener('click', () => {
      this.onAction('startGame');
    });

    document.getElementById('btn-leaveroom').addEventListener('click', () => {
      this.onAction('leaveRoom');
      this.resetToLogin();
    });

    document.getElementById('btn-backtolobby').addEventListener('click', () => {
      document.getElementById('results-screen').classList.add('lobby-hidden');
      document.getElementById('lobby-main').classList.remove('lobby-hidden');
      this.showRoomSection(false);
    });

    // Enter key on username input → quick match
    document.getElementById('input-username').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.onAction('joinGuest', { username: getUsername() });
      }
    });
  }

  /**
   * Update the room state display with player list.
   */
  updateRoomState(state) {
    if (!state) return;
    this.currentRoom = state;

    this.showRoomSection(true);
    const displayCode = state.id.slice(0, 8).toUpperCase();
    this._currentRoomCode = displayCode;
    const codeEl = document.getElementById('display-roomcode');
    codeEl.textContent = `CODE: ${displayCode}`;
    codeEl.title = 'Click to copy';

    const list = document.getElementById('player-list');
    list.innerHTML = '';

    const players = state.players || {};
    this.playerCount = Object.keys(players).length;

    let readyCount = 0;
    Object.values(players).forEach(p => {
      if (p.ready) readyCount++;
      const card = document.createElement('div');
      card.className = 'player-card';
      card.id = `player-card-${p.id}`;
      const statusClass = p.ready ? 'player-status-ready' : 'player-status-waiting';
      const statusText = p.ready ? '✓ READY' : 'NOT READY';
      card.innerHTML = `
        <div class="player-info">
          <div class="player-color" style="background-color: ${p.color || '#fff'}; box-shadow: 0 0 8px ${p.color || '#fff'}"></div>
          <div class="player-name">${this.escapeHTML(p.username || 'Unknown')}</div>
        </div>
        <div class="player-status ${statusClass}">${statusText}</div>
      `;
      list.appendChild(card);
    });

    this._updateReadyCount(readyCount, this.playerCount);
    this.updateReadyButton();
  }

  /**
   * Update a single player's ready status without re-rendering the whole list.
   */
  updatePlayerReady(data) {
    const { playerId, ready, readyCount, totalCount } = data;

    // Update the player card badge
    const card = document.getElementById(`player-card-${playerId}`);
    if (card) {
      const statusEl = card.querySelector('.player-status');
      if (statusEl) {
        statusEl.className = `player-status ${ready ? 'player-status-ready' : 'player-status-waiting'}`;
        statusEl.textContent = ready ? '✓ READY' : 'NOT READY';
      }
    }

    // Also update in cached room state
    if (this.currentRoom?.players?.[playerId]) {
      this.currentRoom.players[playerId].ready = ready;
    }

    this._updateReadyCount(readyCount, totalCount);
    this.updateStartButton(readyCount);
  }

  _updateReadyCount(readyCount, totalCount) {
    const el = document.getElementById('ready-count');
    if (el) {
      el.textContent = `${readyCount}/${totalCount} Ready`;
      el.className = readyCount >= 2 ? 'ready-count ready-count-enough' : 'ready-count';
    }
  }

  updateStartButton(readyCount) {
    const btn = document.getElementById('btn-startgame');
    if (!btn) return;
    if (readyCount >= 2) {
      btn.disabled = false;
      btn.textContent = `⚡ START GAME (${readyCount} ready)`;
    } else {
      btn.disabled = true;
      btn.textContent = '⚡ START GAME';
    }
  }

  /**
   * Update the ready button visual state.
   */
  updateReadyButton() {
    const btn = document.getElementById('btn-ready');
    if (!btn) return;

    if (this.isReady) {
      btn.classList.add('is-ready');
      btn.textContent = '✓ READY';
    } else {
      btn.classList.remove('is-ready');
      btn.textContent = 'READY UP';
    }
  }

  /**
   * Display countdown before game starts.
   */
  showCountdown(seconds) {
    const el = document.getElementById('countdown-display');
    if (el) {
      el.style.display = 'block';
      el.textContent = seconds > 0 ? `Starting in ${seconds}...` : 'GO!';
      el.className = 'countdown-text' + (seconds <= 0 ? ' countdown-go' : '');
    }
  }

  /**
   * Show the game over banner with winner info + Play Again / Exit buttons.
   * The banner stays visible until the player clicks a button.
   * @param {object} data - { winner, players }
   * @param {object} callbacks - { onPlayAgain, onExit }
   */
  showGameOverBanner(data, callbacks) {
    const banner = document.getElementById('winner-banner');
    const title = document.getElementById('winner-title');
    const subtitle = document.getElementById('winner-subtitle');
    const stats = document.getElementById('winner-stats');

    if (!banner) return;

    // Determine winner
    if (data.winner) {
      title.textContent = `${this.escapeHTML(data.winner.username)} WINS!`;
      title.style.color = data.winner.color || 'var(--color-warning)';
      subtitle.textContent = `${data.winner.kills || 0} Kills`;
    } else {
      title.textContent = 'GAME OVER';
      title.style.color = 'var(--color-warning)';
      subtitle.textContent = 'No winner';
    }

    // Build leaderboard
    let html = '';
    const sorted = (data.players || []).sort((a, b) => (b.kills || 0) - (a.kills || 0));
    sorted.slice(0, 4).forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      html += `<div class="winner-stat-row">
        <span>${medal} ${this.escapeHTML(p.username)}</span>
        <span>${p.kills || 0} kills</span>
      </div>`;
    });
    stats.innerHTML = html;

    // Wire up buttons
    const playAgainBtn = document.getElementById('btn-play-again');
    const exitBtn = document.getElementById('btn-exit-game');

    // Clean up old listeners by replacing elements
    if (playAgainBtn) {
      const newPlayBtn = playAgainBtn.cloneNode(true);
      playAgainBtn.parentNode.replaceChild(newPlayBtn, playAgainBtn);
      if (callbacks?.onPlayAgain) {
        newPlayBtn.addEventListener('click', callbacks.onPlayAgain);
      }
    }
    if (exitBtn) {
      const newExitBtn = exitBtn.cloneNode(true);
      exitBtn.parentNode.replaceChild(newExitBtn, exitBtn);
      if (callbacks?.onExit) {
        newExitBtn.addEventListener('click', callbacks.onExit);
      }
    }

    // Show with animation — stays until user clicks a button
    banner.style.display = 'flex';
    requestAnimationFrame(() => {
      banner.classList.add('banner-visible');
    });

    if (this._bannerTimeout) clearTimeout(this._bannerTimeout);
  }

  /**
   * Legacy alias — calls showGameOverBanner without callbacks.
   */
  showWinnerBanner(data) {
    this.showGameOverBanner(data, null);
  }

  /**
   * Hide the winner banner immediately.
   */
  hideWinnerBanner() {
    const banner = document.getElementById('winner-banner');
    if (banner) {
      banner.classList.remove('banner-visible');
      banner.style.display = 'none';
    }
    if (this._bannerTimeout) clearTimeout(this._bannerTimeout);
  }

  showRoomSection(show) {
    const login = document.getElementById('login-section');
    const room = document.getElementById('room-section');
    if (login) login.style.display = show ? 'none' : 'block';
    if (room) room.style.display = show ? 'block' : 'none';
  }

  resetToLogin() {
    this.currentRoom = null;
    this.isReady = false;
    this.playerCount = 0;
    this.showRoomSection(false);
    const countdown = document.getElementById('countdown-display');
    if (countdown) countdown.style.display = 'none';
  }

  showResults(results) {
    this.container.classList.remove('lobby-hidden');
    const lobby = document.getElementById('lobby-main');
    if (lobby) lobby.classList.add('lobby-hidden');
    const rs = document.getElementById('results-screen');
    if (rs) rs.classList.remove('lobby-hidden');

    const statsContainer = document.getElementById('results-stats');
    if (results && results.winner) {
      document.getElementById('results-title').textContent = `${this.escapeHTML(results.winner.username)} WINS!`;
    } else {
      document.getElementById('results-title').textContent = 'GAME OVER';
    }

    let statsHTML = '<div class="player-list">';
    const sorted = Object.values(results?.players || {}).sort((a, b) => (b.kills || 0) - (a.kills || 0));
    sorted.forEach(p => {
      statsHTML += `
        <div class="player-card">
          <div class="player-info">
            <div class="player-color" style="background-color: ${p.color}; box-shadow: 0 0 8px ${p.color}"></div>
            <span>${this.escapeHTML(p.username || 'Unknown')}</span>
          </div>
          <div>${p.kills || 0} Kills</div>
        </div>
      `;
    });
    statsHTML += '</div>';
    if (statsContainer) statsContainer.innerHTML = statsHTML;

    this.isReady = false;
    this.playerCount = 0;
    this.updateReadyButton();
  }

  showToast(msg) {
    const toast = document.getElementById('toast-container');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  show() {
    this.container.classList.remove('lobby-hidden');
    this.container.style.pointerEvents = 'auto';
  }

  hide() {
    this.container.classList.add('lobby-hidden');
    this.container.style.pointerEvents = 'none';
  }

  escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  dispose() {
    this.container.innerHTML = '';
    if (this._bannerTimeout) clearTimeout(this._bannerTimeout);
    if (this._bannerEl && this._bannerEl.parentNode) {
      this._bannerEl.parentNode.removeChild(this._bannerEl);
    }
  }
}
