/**
 * NeuroDEX Background Agents Panel
 * Shows running/completed background agent tasks with live progress.
 */

class BackgroundAgentsPanel {
  constructor() {
    this._agents = new Map();
    this._visible = false;
    this._panel = null;
    this._list = null;
    this._createPanel();
    this._listenGateway();
    this._pollInterval = null;
  }

  _createPanel() {
    const panel = document.createElement('div');
    panel.id = 'agents-panel';
    panel.style.cssText = `
      position: fixed; top: 36px; right: 0; bottom: 0;
      width: 340px; background: var(--color-bg-panel);
      border-left: 1px solid rgba(0,229,255,0.15);
      display: flex; flex-direction: column; z-index: 800;
      transform: translateX(100%); transition: transform 0.2s ease;
    `;
    panel.innerHTML = `
      <div style="padding:10px 12px;border-bottom:1px solid rgba(0,229,255,0.1);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:10px;letter-spacing:3px;color:var(--color-primary);">AGENTS</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="agents-spawn-btn" style="background:rgba(0,229,255,0.1);border:1px solid var(--color-primary);color:var(--color-primary);font-family:inherit;font-size:9px;letter-spacing:2px;padding:3px 8px;cursor:pointer;">+ SPAWN</button>
          <button id="agents-clear-btn" style="background:transparent;border:1px solid rgba(0,229,255,0.2);color:var(--color-text-dim);font-family:inherit;font-size:9px;letter-spacing:1px;padding:3px 8px;cursor:pointer;">CLEAR</button>
          <button id="agents-close-btn" style="background:transparent;border:none;color:var(--color-text-dim);font-size:14px;cursor:pointer;padding:0 2px;">✕</button>
        </div>
      </div>
      <div id="agents-list" style="flex:1;overflow-y:auto;padding:6px;"></div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;
    this._list = document.getElementById('agents-list');

    document.getElementById('agents-close-btn').addEventListener('click', () => this.hide());
    document.getElementById('agents-spawn-btn').addEventListener('click', () => this._showSpawnDialog());
    document.getElementById('agents-clear-btn').addEventListener('click', () => {
      gateway.call('agents.clearDone').catch(() => {});
      for (const [id, data] of this._agents) {
        if (['done','error','aborted'].includes(data.status)) this._agents.delete(id);
      }
      this._render();
    });
  }

  _listenGateway() {
    gateway.addEventListener('event', e => {
      const d = e.detail;
      if (!d?.agentId) return;
      const existing = this._agents.get(d.agentId) || { id: d.agentId, log: [], iteration: 0 };

      if (d.type === 'agent:status') {
        existing.status = d.data?.status;
        existing.startedAt = existing.startedAt || Date.now();
      } else if (d.type === 'agent:iteration') {
        existing.iteration = d.data?.iteration;
      } else if (d.type === 'agent:chunk') {
        existing.lastChunk = (d.data?.text || '').slice(0, 80);
      } else if (d.type === 'agent:tool') {
        existing.lastTool = d.data?.name;
        existing.log = existing.log || [];
        existing.log.push(`→ ${d.data?.name}`);
        if (existing.log.length > 30) existing.log.shift();
      } else if (d.type === 'agent:done') {
        existing.status = d.data?.status || 'done';
        existing.result = d.data?.result;
        existing.finishedAt = Date.now();
      }

      this._agents.set(d.agentId, existing);
      if (this._visible) this._renderAgent(d.agentId);
    });

    gateway.addEventListener('connected', () => this._loadAll());
  }

  async _loadAll() {
    try {
      const agents = await gateway.call('agents.list');
      for (const a of agents) {
        this._agents.set(a.id, a);
      }
      this._render();
    } catch { /**/ }
  }

  _render() {
    if (!this._list) return;
    this._list.innerHTML = '';
    if (this._agents.size === 0) {
      this._list.innerHTML = '<div style="color:var(--color-text-dim);font-size:10px;padding:16px;text-align:center;">No agents running.<br>Click + SPAWN to start one.</div>';
      return;
    }
    for (const [id] of this._agents) {
      this._renderAgent(id);
    }
  }

  _renderAgent(id) {
    const a = this._agents.get(id);
    if (!a) return;

    let card = document.getElementById(`agent-card-${id}`);
    if (!card) {
      card = document.createElement('div');
      card.id = `agent-card-${id}`;
      card.className = 'agent-card';
      this._list.prepend(card);
    }

    const statusColors = { running:'#00e5ff', queued:'#ffb000', paused:'#ffb000', done:'#00ff9d', error:'#ff3355', aborted:'#888' };
    const color = statusColors[a.status] || '#888';
    const elapsed = a.startedAt ? ((a.finishedAt || Date.now()) - a.startedAt) / 1000 : 0;

    card.style.cssText = `background:rgba(0,229,255,0.03);border:1px solid rgba(0,229,255,0.1);border-left:2px solid ${color};margin-bottom:6px;padding:8px;`;
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:10px;color:${color};letter-spacing:1px;">${a.status?.toUpperCase() || 'UNKNOWN'}</span>
        <span style="font-size:9px;color:var(--color-text-dim);">${this._formatElapsed(elapsed)}</span>
      </div>
      <div style="font-size:10px;color:var(--color-text);margin-bottom:4px;word-break:break-word;">${this._esc(a.label || a.task || id)}</div>
      ${a.status === 'running' ? `
        <div style="font-size:9px;color:var(--color-text-dim);margin-bottom:3px;">
          Iteration ${a.iteration || 0}${a.lastTool ? ' · ' + a.lastTool : ''}
        </div>
        <div style="height:2px;background:rgba(0,229,255,0.1);margin-bottom:4px;overflow:hidden;">
          <div style="height:100%;background:var(--color-primary);width:${Math.min(100,(a.iteration||0)/20*100)}%;transition:width 0.5s;"></div>
        </div>
      ` : ''}
      ${a.result && a.status === 'done' ? `<div style="font-size:9px;color:var(--color-text-dim);max-height:60px;overflow:hidden;word-break:break-word;">${this._esc(a.result.slice(0,200))}</div>` : ''}
      ${a.error ? `<div style="font-size:9px;color:#ff3355;">${this._esc(a.error)}</div>` : ''}
      <div style="display:flex;gap:4px;margin-top:4px;">
        ${a.status === 'running' ? `
          <button onclick="window.agentsPanel._pauseAgent('${id}')" style="font-size:8px;padding:2px 6px;background:transparent;border:1px solid rgba(0,229,255,0.2);color:var(--color-text-dim);cursor:pointer;font-family:inherit;">PAUSE</button>
          <button onclick="window.agentsPanel._abortAgent('${id}')" style="font-size:8px;padding:2px 6px;background:transparent;border:1px solid rgba(255,51,85,0.4);color:#ff3355;cursor:pointer;font-family:inherit;">ABORT</button>
        ` : ''}
        ${a.status === 'paused' ? `
          <button onclick="window.agentsPanel._resumeAgent('${id}')" style="font-size:8px;padding:2px 6px;background:rgba(0,229,255,0.1);border:1px solid var(--color-primary);color:var(--color-primary);cursor:pointer;font-family:inherit;">RESUME</button>
        ` : ''}
        ${['done','error','aborted'].includes(a.status) && a.result ? `
          <button onclick="window.agentsPanel._copyResult('${id}')" style="font-size:8px;padding:2px 6px;background:transparent;border:1px solid rgba(0,229,255,0.2);color:var(--color-text-dim);cursor:pointer;font-family:inherit;">COPY RESULT</button>
        ` : ''}
      </div>
    `;
  }

  async _pauseAgent(id) {
    await gateway.call('agents.pause', { id }).catch(() => {});
  }
  async _resumeAgent(id) {
    await gateway.call('agents.resume', { id }).catch(() => {});
  }
  async _abortAgent(id) {
    await gateway.call('agents.abort', { id }).catch(() => {});
  }
  _copyResult(id) {
    const a = this._agents.get(id);
    if (a?.result) navigator.clipboard.writeText(a.result).catch(() => {});
  }

  _showSpawnDialog() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--color-bg-panel);border:1px solid var(--color-primary);padding:20px;width:480px;max-width:95vw;" data-augmented-ui="tl-clip br-clip border">
        <div style="font-size:11px;letter-spacing:3px;color:var(--color-primary);margin-bottom:12px;">SPAWN BACKGROUND AGENT</div>
        <textarea id="spawn-task-input" rows="4" placeholder="Describe the task for the agent..." style="width:100%;box-sizing:border-box;background:rgba(0,229,255,0.04);border:1px solid rgba(0,229,255,0.2);color:var(--color-text);font-family:inherit;font-size:11px;padding:8px;resize:vertical;outline:none;"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <input id="spawn-model-input" type="text" placeholder="Model (default: current)" style="flex:1;background:rgba(0,229,255,0.04);border:1px solid rgba(0,229,255,0.2);color:var(--color-text);font-family:inherit;font-size:11px;padding:6px 8px;outline:none;">
          <input id="spawn-maxiter-input" type="number" value="20" min="1" max="50" style="width:80px;background:rgba(0,229,255,0.04);border:1px solid rgba(0,229,255,0.2);color:var(--color-text);font-family:inherit;font-size:11px;padding:6px 8px;outline:none;">
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;">
          <button id="spawn-cancel-btn" style="background:transparent;border:1px solid rgba(0,229,255,0.2);color:var(--color-text-dim);font-family:inherit;font-size:10px;letter-spacing:1px;padding:6px 14px;cursor:pointer;">CANCEL</button>
          <button id="spawn-confirm-btn" style="background:rgba(0,229,255,0.1);border:1px solid var(--color-primary);color:var(--color-primary);font-family:inherit;font-size:10px;letter-spacing:2px;padding:6px 14px;cursor:pointer;">SPAWN</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#spawn-cancel-btn').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#spawn-confirm-btn').addEventListener('click', async () => {
      const task = overlay.querySelector('#spawn-task-input').value.trim();
      const model = overlay.querySelector('#spawn-model-input').value.trim() || undefined;
      const maxIterations = parseInt(overlay.querySelector('#spawn-maxiter-input').value) || 20;
      if (!task) return;
      overlay.remove();
      this.show();
      try {
        const result = await gateway.call('agents.spawn', { task, model, maxIterations });
        this._agents.set(result.id, { id: result.id, task, label: task.slice(0, 60), status: 'queued', iteration: 0, log: [] });
        this._render();
      } catch (err) {
        window.settingsPanel?._showToast('Failed to spawn agent: ' + err.message, true);
      }
    });
    overlay.querySelector('#spawn-task-input').focus();
  }

  show() {
    this._visible = true;
    this._panel.style.transform = 'translateX(0)';
    this._loadAll();
  }

  hide() {
    this._visible = false;
    this._panel.style.transform = 'translateX(100%)';
  }

  toggle() {
    this._visible ? this.hide() : this.show();
  }

  _formatElapsed(s) {
    if (s < 60)   return `${Math.floor(s)}s`;
    if (s < 3600) return `${Math.floor(s/60)}m ${Math.floor(s%60)}s`;
    return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
  }

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}

window.agentsPanel = new BackgroundAgentsPanel();
