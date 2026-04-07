/**
 * NeuroDEX File Browser
 * refreshLocal() — instant, no gateway needed
 * refresh() — via gateway Bash tool (called after gateway connects)
 */

class FileBrowser {
  constructor() {
    this.$path = document.getElementById('files-path');
    this.$list = document.getElementById('files-list');
    this.currentPath = '/';
  }

  // Called on startup — no gateway, just show current path text
  refreshLocal(dirPath) {
    this.currentPath = dirPath;
    if (this.$path) this.$path.textContent = dirPath;
    if (!this.$list) return;
    this.$list.innerHTML = `<div style="color:var(--color-text-dim);font-size:10px;padding:8px;">
      ${this._escapeHtml(dirPath)}<br><span style="opacity:0.5">Connecting to gateway...</span>
    </div>`;
    // Try real load once gateway is available
    gateway.addEventListener('connected', () => this.refresh(this.currentPath), { once: true });
  }

  async refresh(dirPath) {
    this.currentPath = dirPath;
    if (this.$path) this.$path.textContent = dirPath;
    if (!this.$list) return;

    if (!gateway.connected) {
      this.refreshLocal(dirPath);
      return;
    }

    try {
      const result = await gateway.call('tools.execute', {
        name: 'Bash',
        input: {
          command: `ls -la "${dirPath}" 2>&1`,
          description: 'List directory'
        }
      });

      this.$list.innerHTML = '';

      if (dirPath !== '/') {
        const parent = document.createElement('div');
        parent.className = 'file-item';
        parent.innerHTML = `<span class="file-icon">📁</span><span class="file-name">..</span>`;
        parent.addEventListener('click', () => {
          const parts = dirPath.split('/').filter(Boolean);
          parts.pop();
          this.refresh('/' + parts.join('/') || '/');
        });
        this.$list.appendChild(parent);
      }

      const lines = (result.output || '').split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 8) continue;
        const isDir = line.startsWith('d');
        const name = parts.slice(8).join(' ') || parts.slice(7).join(' ');
        if (!name || name === '.' || name === '..') continue;

        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
          <span class="file-icon">${isDir ? '📁' : this._getFileIcon(name)}</span>
          <span class="file-name">${this._escapeHtml(name)}</span>
          <span class="file-size">${isDir ? '' : this._formatSize(parseInt(parts[4]))}</span>
        `;
        item.addEventListener('click', () => {
          const fullPath = (dirPath + '/' + name).replace('//', '/');
          if (isDir) {
            this.refresh(fullPath);
          } else {
            const input = document.getElementById('chat-input');
            if (input) input.value += ` "${fullPath}"`;
            window.agentConsole?._appendSystemMsg(`File: ${fullPath}`);
          }
        });
        this.$list.appendChild(item);
      }
    } catch (err) {
      if (this.$list) this.$list.innerHTML =
        `<div style="color:var(--color-text-dim);font-size:10px;padding:8px;">${this._escapeHtml(err.message)}</div>`;
    }
  }

  _getFileIcon(name) {
    const ext = name.split('.').pop()?.toLowerCase();
    const m = { js:'📜',ts:'📘',jsx:'⚛',tsx:'⚛',py:'🐍',rs:'🦀',go:'🐹',rb:'💎',
      json:'📋',yaml:'📋',yml:'📋',toml:'📋',md:'📝',txt:'📄',pdf:'📕',
      png:'🖼',jpg:'🖼',jpeg:'🖼',gif:'🖼',svg:'🖼',mp4:'🎬',mp3:'🎵',
      zip:'📦',tar:'📦',gz:'📦',sh:'⚡',bash:'⚡',zsh:'⚡',html:'🌐',css:'🎨' };
    return m[ext] || '📄';
  }

  _formatSize(b) {
    if (!b || isNaN(b)) return '';
    if (b < 1024) return b + 'B';
    if (b < 1048576) return (b/1024).toFixed(0) + 'K';
    return (b/1048576).toFixed(1) + 'M';
  }

  _escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
