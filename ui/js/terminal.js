/**
 * NeuroDEX Terminal
 * xterm.js-based terminal with multiple tabs.
 */

class NeuroDEXTerminal {
  constructor() {
    this.tabs = [];
    this.activeTab = 0;
    this.$container = document.getElementById('terminal-container');
    this.$tabs = document.getElementById('terminal-tabs');
    this.fitAddon = null;
  }

  async init() {
    if (!window.Terminal) {
      console.warn('[Terminal] xterm.js not loaded');
      return;
    }

    await this.createTab('bash');

    document.getElementById('btn-new-tab').addEventListener('click', () => {
      this.createTab(`bash-${this.tabs.length + 1}`);
    });

    window.addEventListener('resize', () => this._fitAll());
  }

  async createTab(name) {
    const tabIndex = this.tabs.length;
    const container = document.createElement('div');
    container.style.cssText = 'width:100%;height:100%;display:none;';
    this.$container.appendChild(container);

    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      theme: {
        background: '#000a0f',
        foreground: '#b0d8e8',
        cursor: '#00e5ff',
        cursorAccent: '#000a0f',
        selection: 'rgba(0, 229, 255, 0.2)',
        black: '#000a0f',
        red: '#ff3355',
        green: '#00ff9d',
        yellow: '#ffaa00',
        blue: '#0088cc',
        magenta: '#a855f7',
        cyan: '#00e5ff',
        white: '#b0d8e8',
        brightBlack: '#4a7a90',
        brightRed: '#ff6680',
        brightGreen: '#33ffb8',
        brightYellow: '#ffcc33',
        brightBlue: '#33aaff',
        brightMagenta: '#c77dff',
        brightCyan: '#33eeff',
        brightWhite: '#e0f4ff'
      },
      allowTransparency: true,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      scrollback: 5000,
      cursorBlink: true,
      cursorStyle: 'block'
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    if (window.WebLinksAddon) {
      term.loadAddon(new WebLinksAddon.WebLinksAddon());
    }

    if (window.WebglAddon) {
      try {
        term.loadAddon(new WebglAddon.WebglAddon());
      } catch { /**/ }
    }

    term.open(container);
    fitAddon.fit();

    this.tabs.push({ name, term, container, fitAddon });

    // Create tab button
    const existingTabs = this.$tabs.querySelectorAll('.tab-btn:not(#btn-new-tab)');
    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn';
    tabBtn.textContent = name;
    tabBtn.dataset.index = tabIndex;
    tabBtn.addEventListener('click', () => this.switchTab(tabIndex));
    this.$tabs.insertBefore(tabBtn, document.getElementById('btn-new-tab'));

    this.switchTab(tabIndex);

    // Write welcome message
    term.writeln(`\x1b[36m⬡ NeuroDEX Terminal — ${name}\x1b[0m`);
    term.writeln('\x1b[2mType commands here. The AI agent can also execute commands.\x1b[0m');
    term.write('\r\n$ ');

    // Simple input handling (fallback without PTY)
    let currentLine = '';
    term.onKey(({ key, domEvent }) => {
      if (domEvent.keyCode === 13) { // Enter
        term.write('\r\n');
        if (currentLine.trim()) {
          this._executeCommand(term, currentLine.trim());
        } else {
          term.write('$ ');
        }
        currentLine = '';
      } else if (domEvent.keyCode === 8) { // Backspace
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      } else if (key) {
        currentLine += key;
        term.write(key);
      }
    });

    return { term, fitAddon };
  }

  async _executeCommand(term, cmd) {
    try {
      const result = await gateway.call('tools.execute', {
        name: 'Bash',
        input: { command: cmd, description: cmd }
      });
      if (result.output) {
        term.writeln(result.output);
      }
      if (result.error) {
        term.writeln(`\x1b[31m${result.error}\x1b[0m`);
      }
    } catch (err) {
      term.writeln(`\x1b[31mError: ${err.message}\x1b[0m`);
    }
    term.write('$ ');
  }

  switchTab(index) {
    this.tabs.forEach((tab, i) => {
      tab.container.style.display = i === index ? 'block' : 'none';
    });
    this.activeTab = index;
    this.tabs[index]?.fitAddon?.fit();

    // Update tab buttons
    this.$tabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.index) === index);
    });
  }

  write(text) {
    this.tabs[this.activeTab]?.term.write(text);
  }

  writeln(text) {
    this.tabs[this.activeTab]?.term.writeln(text);
  }

  _fitAll() {
    this.tabs.forEach(tab => tab.fitAddon?.fit());
  }
}
