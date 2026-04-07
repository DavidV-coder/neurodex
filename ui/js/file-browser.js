/**
 * NeuroDEX File Browser
 */

class FileBrowser {
  constructor() {
    this.$path = document.getElementById('files-path');
    this.$list = document.getElementById('files-list');
    this.currentPath = '/';
  }

  async refresh(dirPath) {
    this.currentPath = dirPath;
    if (this.$path) this.$path.textContent = dirPath;
    if (!this.$list) return;

    try {
      const result = await gateway.call('tools.execute', {
        name: 'Bash',
        input: {
          command: `ls -la --time-style=long-iso "${dirPath}" 2>/dev/null || ls -la "${dirPath}"`,
          description: 'List directory'
        }
      });

      this.$list.innerHTML = '';

      // Add parent directory
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

      const lines = (result.output || '').split('\n').slice(1); // skip total line
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 8) continue;
        const isDir = line.startsWith('d');
        const name = parts.slice(7).join(' ');
        if (!name || name === '.' || name === '..') continue;

        const size = parts[4];
        const item = document.createElement('div');
        item.className = 'file-item';
        const icon = isDir ? '📁' : this._getFileIcon(name);
        item.innerHTML = `
          <span class="file-icon">${icon}</span>
          <span class="file-name">${this._escapeHtml(name)}</span>
          <span class="file-size">${isDir ? '' : this._formatSize(parseInt(size))}</span>
        `;
        item.addEventListener('click', () => {
          if (isDir) {
            this.refresh(`${dirPath}/${name}`.replace('//', '/'));
          } else {
            // Send file path to agent context
            const fullPath = `${dirPath}/${name}`.replace('//', '/');
            window.agentConsole?._appendSystemMsg(`Selected: ${fullPath}`);
            document.getElementById('chat-input').value += ` "${fullPath}"`;
          }
        });
        this.$list.appendChild(item);
      }
    } catch (err) {
      if (this.$list) this.$list.textContent = `Error: ${err.message}`;
    }
  }

  _getFileIcon(name) {
    const ext = name.split('.').pop()?.toLowerCase();
    const icons = {
      js: '📜', ts: '📘', jsx: '⚛', tsx: '⚛',
      py: '🐍', rs: '🦀', go: '🐹', rb: '💎',
      json: '📋', yaml: '📋', yml: '📋', toml: '📋',
      md: '📝', txt: '📄', pdf: '📕',
      png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼',
      mp4: '🎬', mp3: '🎵',
      zip: '📦', tar: '📦', gz: '📦',
      sh: '⚡', bash: '⚡', zsh: '⚡',
      html: '🌐', css: '🎨'
    };
    return icons[ext] || '📄';
  }

  _formatSize(bytes) {
    if (isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(0)}K`;
    return `${(bytes/1048576).toFixed(1)}M`;
  }

  _escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
