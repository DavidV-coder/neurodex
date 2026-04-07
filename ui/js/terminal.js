/**
 * NeuroDEX Terminal — xterm.js + node-pty via IPC
 */

class NeuroDEXTerminal {
  constructor() {
    this.tabs = [];
    this.activeTab = 0;
    this.$container = document.getElementById('terminal-container');
    this.$tabs = document.getElementById('terminal-tabs');
  }

  async init() {
    if (!window.Terminal) { console.warn('[Terminal] xterm.js not loaded'); return; }
    await this.createTab('shell');
    document.getElementById('btn-new-tab').addEventListener('click', () => this.createTab('shell'));
    window.addEventListener('resize', () => this._fitAll());
  }

  async createTab(name) {
    const tabIndex = this.tabs.length;

    const container = document.createElement('div');
    container.style.cssText = 'width:100%;height:100%;display:none;position:absolute;inset:0;';
    this.$container.style.position = 'relative';
    this.$container.appendChild(container);

    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      theme: {
        background: '#000a0f', foreground: '#b0d8e8',
        cursor: '#00e5ff', cursorAccent: '#000a0f',
        selectionBackground: 'rgba(0,229,255,0.2)',
        black: '#000a0f', red: '#ff3355', green: '#00ff9d',
        yellow: '#ffaa00', blue: '#0088cc', magenta: '#a855f7',
        cyan: '#00e5ff', white: '#b0d8e8',
        brightBlack: '#4a7a90', brightRed: '#ff6680', brightGreen: '#33ffb8',
        brightYellow: '#ffcc33', brightBlue: '#33aaff', brightMagenta: '#c77dff',
        brightCyan: '#33eeff', brightWhite: '#e0f4ff'
      },
      allowTransparency: true, macOptionIsMeta: true,
      rightClickSelectsWord: true, scrollback: 10000,
      cursorBlink: true, cursorStyle: 'block'
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    if (window.WebLinksAddon) term.loadAddon(new WebLinksAddon.WebLinksAddon());

    term.open(container);
    fitAddon.fit();

    let ptyId = null;
    let removeDataListener = null;

    // Try to create real PTY via Electron IPC
    if (window.NeuroDEX?.pty) {
      const rect = container.getBoundingClientRect();
      const cols = Math.floor(rect.width / 9) || 120;
      const rows = Math.floor(rect.height / 18) || 30;
      const result = await window.NeuroDEX.pty.create({ cols, rows });

      if (result && !result.error) {
        ptyId = result.id;

        // Stream PTY output to terminal
        removeDataListener = window.NeuroDEX.pty.onData(ptyId, (data) => term.write(data));

        // Stream terminal input to PTY
        term.onData((data) => window.NeuroDEX.pty.write(ptyId, data));

        // Handle resize
        term.onResize(({ cols, rows }) => {
          if (ptyId !== null) window.NeuroDEX.pty.resize(ptyId, cols, rows);
        });

        window.NeuroDEX.pty.onExit(ptyId, () => {
          term.writeln('\r\n\x1b[31m[Process exited]\x1b[0m');
          ptyId = null;
        });
      } else {
        // Fallback: simulated terminal via gateway Bash tool
        this._initFallbackTerminal(term);
      }
    } else {
      this._initFallbackTerminal(term);
    }

    this.tabs.push({ name, term, container, fitAddon, ptyId, removeDataListener });

    // Tab button
    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn';
    tabBtn.textContent = name;
    tabBtn.dataset.index = tabIndex;
    tabBtn.addEventListener('click', () => this.switchTab(tabIndex));
    this.$tabs.insertBefore(tabBtn, document.getElementById('btn-new-tab'));

    this.switchTab(tabIndex);
    return { term, fitAddon };
  }

  _initFallbackTerminal(term) {
    // Simple REPL using gateway Bash tool
    let currentLine = '';
    term.writeln('\x1b[36m⬡ NeuroDEX Terminal (Gateway mode)\x1b[0m');
    term.writeln('\x1b[2mDirect PTY not available — using gateway shell\x1b[0m\r\n');
    term.write('$ ');

    term.onKey(({ key, domEvent }) => {
      if (domEvent.keyCode === 13) {
        term.write('\r\n');
        if (currentLine.trim()) this._execCmd(term, currentLine.trim());
        else term.write('$ ');
        currentLine = '';
      } else if (domEvent.keyCode === 8) {
        if (currentLine.length > 0) { currentLine = currentLine.slice(0, -1); term.write('\b \b'); }
      } else if (!domEvent.ctrlKey && !domEvent.altKey && key) {
        currentLine += key; term.write(key);
      }
    });
  }

  async _execCmd(term, cmd) {
    try {
      if (window.gateway?.connected) {
        const result = await gateway.call('tools.execute', {
          name: 'Bash', input: { command: cmd }
        });
        if (result.output) term.writeln(result.output.replace(/\n/g, '\r\n'));
        if (result.error && !result.output) term.writeln(`\x1b[31m${result.error}\x1b[0m`);
      } else {
        term.writeln('\x1b[31mGateway not connected\x1b[0m');
      }
    } catch (e) {
      term.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
    }
    term.write('$ ');
  }

  switchTab(index) {
    this.tabs.forEach((tab, i) => {
      tab.container.style.display = i === index ? 'block' : 'none';
    });
    this.activeTab = index;
    this.tabs[index]?.fitAddon?.fit();
    this.$tabs.querySelectorAll('.tab-btn[data-index]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.index) === index);
    });
  }

  _fitAll() {
    const active = this.tabs[this.activeTab];
    if (!active) return;
    active.fitAddon?.fit();
    const { cols, rows } = active.term;
    if (active.ptyId !== null && window.NeuroDEX?.pty) {
      window.NeuroDEX.pty.resize(active.ptyId, cols, rows);
    }
  }
}
