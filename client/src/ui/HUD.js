export class HUD {
  constructor(container) {
    this.container = container;
    this.elements = {};
    this.createDOM();
  }

  createDOM() {
    this.container.innerHTML = `
      <div class="hud-stats">
        <div>Ping: <span class="stat-value" id="hud-ping">0ms</span></div>
        <div>Alive: <span class="stat-value" id="hud-players">0/0</span></div>
      </div>
      
      <div class="hud-score" id="hud-score">
        Kills: 0
      </div>

      <div class="hud-killfeed" id="hud-killfeed"></div>

      <div class="hud-crosshair"></div>

      <div class="hud-health-container">
        <div class="hud-health-bg">
          <div class="hud-health-fill" id="hud-health-fill"></div>
        </div>
        <div class="hud-dash-bg">
          <div class="hud-dash-fill" id="hud-dash-fill"></div>
        </div>
      </div>

      <button class="btn-neon secondary hud-exit-btn" id="hud-exit-btn">✕ EXIT</button>
    `;

    this.elements = {
      ping: document.getElementById('hud-ping'),
      players: document.getElementById('hud-players'),
      score: document.getElementById('hud-score'),
      killfeed: document.getElementById('hud-killfeed'),
      healthFill: document.getElementById('hud-health-fill'),
      dashFill: document.getElementById('hud-dash-fill'),
      exitBtn: document.getElementById('hud-exit-btn')
    };
  }

  /**
   * Set a callback for when the exit button is clicked.
   */
  onExit(callback) {
    if (this.elements.exitBtn) {
      this.elements.exitBtn.addEventListener('click', callback);
    }
  }

  update(gameState, localPlayerState, latency) {
    if (!localPlayerState) return;

    // Update Health
    const healthPercent = Math.max(0, (localPlayerState.health / 100) * 100);
    this.elements.healthFill.style.width = `${healthPercent}%`;
    if (healthPercent < 30) {
      this.elements.healthFill.classList.add('low');
    } else {
      this.elements.healthFill.classList.remove('low');
    }

    // Update Dash
    const dashPercent = Math.max(0, Math.min(100, (localPlayerState.dashCooldownPercent || 1) * 100));
    this.elements.dashFill.style.width = `${dashPercent}%`;

    // Stats
    this.elements.ping.textContent = `${latency}ms`;
    this.elements.players.textContent = `${gameState.alivePlayers || 0}/${gameState.totalPlayers || 0}`;
    this.elements.score.textContent = `Kills: ${localPlayerState.kills || 0}`;
  }

  addKillFeedEntry(killerName, victimName, weapon = 'blaster') {
    const entry = document.createElement('div');
    entry.className = 'killfeed-entry';
    entry.innerHTML = `
      <span class="killfeed-killer">${this.escapeHTML(killerName)}</span>
      <span class="killfeed-weapon">eliminated</span>
      <span class="killfeed-victim">${this.escapeHTML(victimName)}</span>
    `;
    
    this.elements.killfeed.appendChild(entry);

    // Keep only last 5
    while (this.elements.killfeed.children.length > 5) {
      this.elements.killfeed.removeChild(this.elements.killfeed.firstChild);
    }

    // Fade out and remove
    setTimeout(() => {
      entry.classList.add('fade-out');
      setTimeout(() => {
        if (entry.parentNode) {
          entry.parentNode.removeChild(entry);
        }
      }, 500);
    }, 4000);
  }

  escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  show() {
    this.container.classList.remove('hud-hidden');
  }

  hide() {
    this.container.classList.add('hud-hidden');
  }

  dispose() {
    this.container.innerHTML = '';
  }
}
