/**
 * NeuroDEX Project Memory Panel
 * Browse, search, and manage the AI's persistent project memory.
 */

class MemoryPanel {
  constructor() {
    this._visible = false;
    this._panel = null;
    this._createPanel();
  }

  _createPanel() {
    const panel = document.createElement('div');
    panel.id = 'memory-panel';
    panel.style.cssText = `
      position: fixed; top: 36px; left: 0; bottom: 0;
      width: 300px; background: var(--color-bg-panel);
      border-right: 1px solid rgba(0,229,255,0.15);
      display: flex; flex-direction: column; z-index: 800;
      transform: translateX(-100%); transition: transform 0.2s ease;
    `;
    panel.innerHTML = `
      <div style="padding:10px 12px;border-bottom:1px solid rgba(0,229,255,0.1);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:10px;letter-spacing:3px;color:var(--color-primary);">PROJECT MEMORY</span>
        <button id="memory-close-btn" style="background:transparent;border:none;color:var(--color-text-dim);font-size:14px;cursor:pointer;">✕</button>
      </div>
      <div style="padding:8px 10px;border-bottom:1px solid rgba(0,229,255,0.08);">
        <input id="memory-search" type="text" placeholder="Search memories..." style="width:100%;box-sizing:border-box;background:rgba(0,229,255,0.04);border:1px solid rgba(0,229,255,0.15);color:var(--color-text);font-family:inherit;font-size:10px;padding:5px 8px;outline:none;">
      </div>
      <div style="display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid rgba(0,229,255,0.08);">
        <span id="memory-count" style="flex:1;font-size:9px;color:var(--color-text-dim);">Loading...</span>
        <button id="memory-add-btn" style="background:rgba(0,229,255,0.1);border:1px solid var(--color-primary);color:var(--color-primary);font-family:inherit;font-size:9px;letter-spacing:1px;padding:3px 8px;cursor:pointer;">+ ADD</button>
      </div>
      <div id="memory-list" style="flex:1;overflow-y:auto;padding:6px;"></div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    document.getElementById('memory-close-btn').addEventListener('click', () => this.hide());
    document.getElementById('memory-search').addEventListener('input', (e) => this._search(e.target.value));
    document.getElementById('memory-add-btn').addEventListener('click', () => this._showAddDialog());
  }

  async show() {
    this._visible = true;
    this._panel.style.transform = 'translateX(0)';
    await this._load();
  }

  hide() {
    this._visible = false;
    this._panel.style.transform = 'translateX(-100%)';
  }

  toggle() {
    this._visible ? this.hide() : this.show();
  }

  async _load() {
    const list = document.getElementById('memory-list');
    const count = document.getElementById('memory-count');
    if (!list || !gateway.connected) return;
    try {
      const memories = await gateway.call('memory.list');
      const stats = await gateway.call('memory.stats');
      if (count) count.textContent = `${stats.count} memories`;
      this._render(memories, list);
    } catch (err) {
      if (list) list.innerHTML = `<div style="color:var(--color-text-dim);font-size:10px;padding:12px;">Gateway not connected</div>`;
    }
  }

  async _search(query) {
    const list = document.getElementById('memory-list');
    if (!query.trim()) { await this._load(); return; }
    try {
      const results = await gateway.call('memory.recall', { query, topK: 20 });
      this._render(results, list);
    } catch { /**/ }
  }

  _render(memories, list) {
    if (!list) return;
    list.innerHTML = '';
    if (!memories.length) {
      list.innerHTML = '<div style="color:var(--color-text-dim);font-size:10px;padding:12px;text-align:center;">No memories yet.<br>The AI will build memory as you work.</div>';
      return;
    }
    for (const m of memories) {
      const card = document.createElement('div');
      card.style.cssText = 'background:rgba(0,229,255,0.03);border:1px solid rgba(0,229,255,0.08);margin-bottom:5px;padding:8px;font-size:10px;';
      const tags = (m.tags || []).map(t => `<span style="background:rgba(0,229,255,0.1);color:var(--color-primary);font-size:8px;padding:1px 4px;margin-right:3px;">${t}</span>`).join('');
      const date = new Date(m.createdAt).toLocaleDateString();
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:9px;color:var(--color-text-dim);">${date}</span>
          <button data-id="${m.id}" class="mem-del-btn" style="background:transparent;border:none;color:rgba(255,51,85,0.5);cursor:pointer;font-size:11px;padding:0;">✕</button>
        </div>
        ${tags ? `<div style="margin-bottom:4px;">${tags}</div>` : ''}
        <div style="color:var(--color-text);line-height:1.5;">${this._esc(m.content.slice(0, 200))}${m.content.length > 200 ? '...' : ''}</div>
      `;
      card.querySelector('.mem-del-btn').addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        await gateway.call('memory.forget', { id }).catch(() => {});
        await this._load();
      });
      list.appendChild(card);
    }
  }

  _showAddDialog() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--color-bg-panel);border:1px solid var(--color-primary);padding:20px;width:440px;max-width:95vw;">
        <div style="font-size:11px;letter-spacing:3px;color:var(--color-primary);margin-bottom:12px;">ADD MEMORY</div>
        <textarea id="mem-content-input" rows="4" placeholder="What should I remember about this project?" style="width:100%;box-sizing:border-box;background:rgba(0,229,255,0.04);border:1px solid rgba(0,229,255,0.2);color:var(--color-text);font-family:inherit;font-size:11px;padding:8px;resize:vertical;outline:none;"></textarea>
        <input id="mem-tags-input" type="text" placeholder="Tags (comma-separated)" style="width:100%;box-sizing:border-box;margin-top:6px;background:rgba(0,229,255,0.04);border:1px solid rgba(0,229,255,0.2);color:var(--color-text);font-family:inherit;font-size:11px;padding:6px 8px;outline:none;">
        <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;">
          <button id="mem-cancel-btn" style="background:transparent;border:1px solid rgba(0,229,255,0.2);color:var(--color-text-dim);font-family:inherit;font-size:10px;padding:6px 14px;cursor:pointer;">CANCEL</button>
          <button id="mem-save-btn" style="background:rgba(0,229,255,0.1);border:1px solid var(--color-primary);color:var(--color-primary);font-family:inherit;font-size:10px;letter-spacing:2px;padding:6px 14px;cursor:pointer;">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#mem-cancel-btn').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#mem-save-btn').addEventListener('click', async () => {
      const content = overlay.querySelector('#mem-content-input').value.trim();
      const tagsRaw = overlay.querySelector('#mem-tags-input').value.trim();
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
      if (!content) return;
      await gateway.call('memory.add', { content, tags }).catch(() => {});
      overlay.remove();
      await this._load();
    });
    overlay.querySelector('#mem-content-input').focus();
  }

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}

window.memoryPanel = new MemoryPanel();
