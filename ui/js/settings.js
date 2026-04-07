/**
 * NeuroDEX Settings Panel
 * Full settings overlay: API keys, models, MCP servers, permissions, CLI info, about.
 */

class SettingsPanel {
  constructor() {
    this.$overlay = document.getElementById('settings-overlay');
    this._activeTab = 'keys';
    this._permPendingId = null;

    this._initTabs();
    this._initKeysSave();
    this._initMcpForm();
    this._initCliCopy();
    this._initOverlayClose();
    this._initPermDialog();
  }

  // ── Open / Close ────────────────────────────────────────────────────────────
  show(tab) {
    this.$overlay?.classList.remove('hidden');
    if (tab) this._switchTab(tab);
    this._loadTab(this._activeTab);
  }

  hide() {
    this.$overlay?.classList.add('hidden');
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────
  _initTabs() {
    document.querySelectorAll('.stab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.stab;
        this._switchTab(tab);
        this._loadTab(tab);
      });
    });
  }

  _switchTab(tab) {
    this._activeTab = tab;
    document.querySelectorAll('.stab').forEach(b =>
      b.classList.toggle('active', b.dataset.stab === tab));
    document.querySelectorAll('.stab-content').forEach(c =>
      c.classList.toggle('hidden', c.id !== `stab-${tab}`));
  }

  _loadTab(tab) {
    switch (tab) {
      case 'keys':   this._loadKeys();    break;
      case 'models': this._loadModels();  break;
      case 'mcp':    this._loadMcp();     break;
      case 'perms':  this._loadPerms();   break;
      case 'cli':    this._loadCli();     break;
      case 'about':  this._loadAbout();   break;
    }
  }

  // ── API Keys ─────────────────────────────────────────────────────────────────
  _initKeysSave() {
    document.getElementById('settings-btn-save-key')?.addEventListener('click', async () => {
      const provider = document.getElementById('settings-provider-select')?.value;
      const key      = document.getElementById('settings-key-input')?.value?.trim();
      if (!provider || !key) return;
      try {
        await gateway.call('config.setKey', { provider, key });
        document.getElementById('settings-key-input').value = '';
        this._showToast(`Key saved for ${provider}`);
        this._loadKeys();
        // Also refresh the legacy config panel if open
        window.configPanel?._loadKeys?.();
      } catch (err) {
        this._showToast(`Error: ${err.message}`, true);
      }
    });
  }

  async _loadKeys() {
    const $list = document.getElementById('settings-keys-list');
    if (!$list) return;
    const providers = await gateway.call('config.listKeys').catch(() => null);
    if (!providers) {
      $list.innerHTML = '<div class="stab-hint">Gateway not connected — start the app first.</div>';
      return;
    }

    const all = ['claude','openai','gemini','deepseek','mistral'];
    $list.innerHTML = '';
    all.forEach(p => {
      const has = providers.includes(p);
      const row = document.createElement('div');
      row.className = 'settings-key-row';
      row.innerHTML = `
        <span class="key-provider-badge badge-${p}">${p.slice(0,3).toUpperCase()}</span>
        <span class="key-name">${this._providerLabel(p)}</span>
        <span class="key-status ${has ? 'key-ok' : 'key-missing'}">${has ? '● CONFIGURED' : '○ NOT SET'}</span>
        ${has ? `<button class="settings-btn-danger key-del-btn" data-p="${p}">REMOVE</button>` : ''}
        ${!has ? `<button class="settings-btn-secondary key-test-btn" data-p="${p}">ADD</button>` : ''}
      `;
      if (has) {
        row.querySelector('.key-del-btn')?.addEventListener('click', async () => {
          if (confirm(`Remove ${p} API key?`)) {
            await gateway.call('config.deleteKey', { provider: p }).catch(() => {});
            this._loadKeys();
            window.configPanel?._loadKeys?.();
          }
        });
      } else {
        row.querySelector('.key-test-btn')?.addEventListener('click', () => {
          const sel = document.getElementById('settings-provider-select');
          if (sel) sel.value = p;
          document.getElementById('settings-key-input')?.focus();
        });
      }
      $list.appendChild(row);
    });
  }

  _providerLabel(p) {
    return { claude:'Claude (Anthropic)', openai:'OpenAI', gemini:'Gemini (Google)',
             deepseek:'DeepSeek', mistral:'Mistral' }[p] || p;
  }

  // ── Models ───────────────────────────────────────────────────────────────────
  async _loadModels() {
    const $list = document.getElementById('settings-model-list');
    if (!$list) return;
    try {
      const [models, available, current] = await Promise.all([
        gateway.call('models.list'),
        gateway.call('models.available').catch(() => []),
        gateway.call('config.get', { key: 'defaultModel' }).catch(() => null)
      ]);

      $list.innerHTML = '';
      let currentProvider = null;

      models.forEach(m => {
        if (m.provider !== currentProvider) {
          currentProvider = m.provider;
          const isAvail = available.includes(m.provider);
          const hdr = document.createElement('div');
          hdr.className = 'settings-model-group';
          hdr.innerHTML = `${m.provider.toUpperCase()} <span class="${isAvail ? 'key-ok' : 'key-missing'}">${isAvail ? '● KEY OK' : '○ NO KEY'}</span>`;
          $list.appendChild(hdr);
        }

        const isAvail = available.includes(m.provider);
        const isCurrent = current === m.model;
        const row = document.createElement('div');
        row.className = `settings-model-row ${isCurrent ? 'model-selected' : ''} ${!isAvail ? 'model-unavail' : ''}`;

        const caps = [];
        if (m.supportsTools)    caps.push('TOOLS');
        if (m.supportsVision)   caps.push('VISION');
        if (m.supportsThinking) caps.push('THINK');

        row.innerHTML = `
          <span class="model-provider-badge badge-${m.provider}">${m.provider.slice(0,3).toUpperCase()}</span>
          <span class="model-name">${m.displayName}</span>
          <span class="model-context">${(m.contextWindow/1000).toFixed(0)}K</span>
          <div class="model-caps">${caps.map(c=>`<span class="model-cap">${c}</span>`).join('')}</div>
          ${isCurrent ? '<span class="model-current-badge">DEFAULT</span>' : ''}
        `;
        row.addEventListener('click', async () => {
          if (!isAvail) {
            this._showToast(`Add ${m.provider} API key first`, true);
            this._switchTab('keys');
            this._loadKeys();
            return;
          }
          await gateway.call('config.set', { key: 'defaultModel', value: m.model }).catch(() => {});
          await gateway.call('config.set', { key: 'defaultProvider', value: m.provider }).catch(() => {});
          window.agentConsole?.setModel(m.provider, m.model, m.displayName);
          this._showToast(`Default model: ${m.displayName}`);
          this._loadModels();
        });
        $list.appendChild(row);
      });
    } catch {
      $list.innerHTML = '<div class="stab-hint">Gateway not connected.</div>';
    }
  }

  // ── MCP Servers ──────────────────────────────────────────────────────────────
  _initMcpForm() {
    document.getElementById('settings-btn-add-mcp')?.addEventListener('click', async () => {
      const id      = document.getElementById('mcp-id-input')?.value?.trim();
      const command = document.getElementById('mcp-command-input')?.value?.trim();
      const argsRaw = document.getElementById('mcp-args-input')?.value?.trim();
      const envRaw  = document.getElementById('mcp-env-input')?.value?.trim();
      if (!id || !command) { this._showToast('ID and command are required', true); return; }

      const args = argsRaw ? argsRaw.split(/\s+/) : [];
      const env  = {};
      if (envRaw) envRaw.split(/\s+/).forEach(pair => {
        const [k, ...rest] = pair.split('=');
        if (k) env[k] = rest.join('=');
      });

      try {
        await gateway.call('mcp.add', { id, command, args, env });
        ['mcp-id-input','mcp-command-input','mcp-args-input','mcp-env-input']
          .forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
        this._showToast(`MCP server '${id}' added`);
        this._loadMcp();
      } catch (err) {
        this._showToast(`Error: ${err.message}`, true);
      }
    });
  }

  async _loadMcp() {
    const $list = document.getElementById('settings-mcp-list');
    const $presets = document.getElementById('settings-mcp-presets');
    if (!$list) return;

    try {
      const servers = await gateway.call('mcp.list');
      $list.innerHTML = '';
      if (!servers.length) {
        $list.innerHTML = '<div class="stab-hint">No MCP servers configured.</div>';
      } else {
        servers.forEach(s => {
          const row = document.createElement('div');
          row.className = 'settings-mcp-row';
          row.innerHTML = `
            <span class="mcp-status ${s.connected ? 'key-ok' : 'key-missing'}">${s.connected ? '●' : '○'}</span>
            <span class="mcp-id">${s.id}</span>
            <span class="mcp-cmd">${s.command} ${(s.args||[]).join(' ')}</span>
            <span class="mcp-tools">${s.tools?.length || 0} tools</span>
            <button class="settings-btn-danger mcp-remove-btn" data-id="${s.id}">REMOVE</button>
          `;
          row.querySelector('.mcp-remove-btn')?.addEventListener('click', async () => {
            await gateway.call('mcp.remove', { id: s.id }).catch(() => {});
            this._loadMcp();
          });
          $list.appendChild(row);
        });
      }

      // Presets
      if ($presets) {
        const presets = await gateway.call('mcp.presets').catch(() => []);
        $presets.innerHTML = '';
        presets.forEach(p => {
          const btn = document.createElement('button');
          btn.className = 'settings-btn-secondary mcp-preset-btn';
          btn.textContent = p.name || p.id;
          btn.title = `${p.command} ${(p.args||[]).join(' ')}`;
          btn.addEventListener('click', async () => {
            try {
              await gateway.call('mcp.addPreset', { id: p.id });
              this._showToast(`Added preset: ${p.id}`);
              this._loadMcp();
            } catch (err) {
              this._showToast(`Error: ${err.message}`, true);
            }
          });
          $presets.appendChild(btn);
        });
      }
    } catch {
      $list.innerHTML = '<div class="stab-hint">Gateway not connected.</div>';
    }
  }

  // ── Permissions ──────────────────────────────────────────────────────────────
  async _loadPerms() {
    const $list = document.getElementById('settings-perms-list');
    if (!$list) return;
    try {
      const config = await gateway.call('permissions.getConfig');
      $list.innerHTML = '';
      const perms = [
        { key: 'bash',          label: 'Shell Commands (Bash)',    desc: 'Execute terminal commands' },
        { key: 'fileRead',      label: 'File Read',                desc: 'Read files on your system' },
        { key: 'fileWrite',     label: 'File Write',               desc: 'Create or modify files' },
        { key: 'fileDelete',    label: 'File Delete',              desc: 'Delete files' },
        { key: 'networkFetch',  label: 'Network / HTTP Fetch',     desc: 'Make HTTP requests' },
        { key: 'browserControl',label: 'Browser Control',          desc: 'Control browser via MCP' },
        { key: 'mcpTools',      label: 'MCP Tools',                desc: 'Use external MCP server tools' },
        { key: 'systemInfo',    label: 'System Info',              desc: 'Read CPU, memory, processes' },
      ];
      perms.forEach(({ key, label, desc }) => {
        const row = document.createElement('div');
        row.className = 'settings-perm-row';
        row.innerHTML = `
          <div class="perm-info">
            <span class="perm-label">${label}</span>
            <span class="perm-desc">${desc}</span>
          </div>
          <select class="perm-mode-select" data-key="${key}">
            <option value="allow" ${config[key]==='allow'?'selected':''}>ALLOW</option>
            <option value="ask"   ${config[key]==='ask'  ?'selected':''}>ASK</option>
            <option value="deny"  ${config[key]==='deny' ?'selected':''}>DENY</option>
          </select>
        `;
        row.querySelector('select').addEventListener('change', async e => {
          await gateway.call('permissions.updateConfig', { [key]: e.target.value }).catch(() => {});
        });
        $list.appendChild(row);
      });
    } catch {
      $list.innerHTML = '<div class="stab-hint">Gateway not connected.</div>';
    }
  }

  // ── CLI ───────────────────────────────────────────────────────────────────────
  _initCliCopy() {
    document.querySelectorAll('.cli-cmd-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.copy;
        const text = document.getElementById(targetId)?.textContent?.trim();
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'COPIED!';
            setTimeout(() => btn.textContent = 'COPY', 1500);
          }).catch(() => {});
        }
      });
    });
  }

  async _loadCli() {
    // Claude Code CLI detection
    const $ccStatus = document.getElementById('claudecode-status');
    if ($ccStatus && gateway.connected) {
      try {
        const info = await gateway.call('claudecode.detect').catch(() => null);
        if (info?.available) {
          $ccStatus.innerHTML = `<span class="key-ok">● CLAUDE CODE CLI DETECTED</span>
            <span style="margin-left:10px;font-size:10px;color:var(--color-text-dim)">${info.binary || ''} ${info.version ? '— ' + info.version : ''}</span>
            <div style="margin-top:4px;font-size:10px;color:var(--color-success,#00ff88)">✓ Subscription models available (no API key needed)</div>`;
        } else {
          $ccStatus.innerHTML = `<span class="key-missing">○ CLAUDE CODE CLI NOT FOUND</span>
            <div style="margin-top:4px;font-size:10px;color:var(--color-text-dim)">Install below to use subscription-based models</div>`;
        }
      } catch {
        $ccStatus.innerHTML = '<span class="key-missing">○ Not checked (gateway offline)</span>';
      }
    }

    const $status = document.getElementById('settings-cli-status');
    const $gateway = document.getElementById('settings-gateway-info');
    if ($status) {
      const connected = gateway.connected;
      $status.innerHTML = `
        <div class="cli-status-row">
          <span class="${connected ? 'key-ok' : 'key-missing'}">${connected ? '● GATEWAY CONNECTED' : '○ GATEWAY OFFLINE'}</span>
          <span style="margin-left:12px;color:var(--color-text-dim);font-size:10px;">port ${gateway.port}</span>
        </div>
        <div class="cli-status-row" style="margin-top:6px;color:var(--color-text-dim);font-size:10px;">
          Install globally with <code>npm install -g .</code> from the NeuroDEX project directory, then use <code>neurodex</code> from anywhere.
        </div>
      `;
    }
    if ($gateway && gateway.connected) {
      try {
        const info = await gateway.call('gateway.info').catch(() => null);
        if (info) {
          $gateway.innerHTML = `
            <div class="gateway-info-row"><span>Host:</span><span>${info.host}:${info.port}</span></div>
            <div class="gateway-info-row"><span>Sessions:</span><span>${info.sessions || 0}</span></div>
            <div class="gateway-info-row"><span>Uptime:</span><span>${this._formatUptime(info.uptime)}</span></div>
          `;
        } else {
          $gateway.innerHTML = '<div class="stab-hint">Gateway info not available.</div>';
        }
      } catch {
        $gateway.innerHTML = '<div class="stab-hint">Could not fetch gateway info.</div>';
      }
    } else if ($gateway) {
      $gateway.innerHTML = '<div class="stab-hint">Not connected.</div>';
    }
  }

  _formatUptime(ms) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
    return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
  }

  // ── About ─────────────────────────────────────────────────────────────────────
  async _loadAbout() {
    if (!gateway.connected) return;
    try {
      const [model, mcpServers, skills] = await Promise.all([
        gateway.call('config.get', { key: 'defaultModel' }).catch(() => null),
        gateway.call('mcp.list').catch(() => []),
        gateway.call('skills.list').catch(() => []),
      ]);
      const aboutModel = document.getElementById('about-model');
      const aboutGateway = document.getElementById('about-gateway');
      const aboutMcp = document.getElementById('about-mcp-count');
      const aboutSkills = document.getElementById('about-skills-count');
      if (aboutModel)  aboutModel.textContent  = `Model: ${model || 'not set'}`;
      if (aboutGateway) aboutGateway.textContent = `Gateway: connected (port ${gateway.port})`;
      if (aboutMcp)    aboutMcp.textContent    = `MCP Servers: ${mcpServers.length}`;
      if (aboutSkills) aboutSkills.textContent = `Skills: ${skills.length}`;
    } catch { /**/ }
  }

  // ── Permission Dialog ─────────────────────────────────────────────────────────
  _initPermDialog() {
    document.getElementById('perm-allow-btn')?.addEventListener('click', () => {
      if (this._permPendingId) {
        const remember = document.getElementById('perm-remember')?.checked || false;
        gateway.call('permissions.respond', { id: this._permPendingId, granted: true, remember }).catch(() => {});
        this._permPendingId = null;
        document.getElementById('permission-dialog')?.classList.add('hidden');
      }
    });
    document.getElementById('perm-deny-btn')?.addEventListener('click', () => {
      if (this._permPendingId) {
        const remember = document.getElementById('perm-remember')?.checked || false;
        gateway.call('permissions.respond', { id: this._permPendingId, granted: false, remember }).catch(() => {});
        this._permPendingId = null;
        document.getElementById('permission-dialog')?.classList.add('hidden');
      }
    });
  }

  showPermissionRequest(req) {
    this._permPendingId = req.id;
    const $body = document.getElementById('perm-dialog-body');
    if ($body) {
      const argsStr = JSON.stringify(req.args, null, 2);
      $body.innerHTML = `
        <div class="perm-tool-name">${req.tool}</div>
        <div class="perm-description">${this._escapeHtml(req.description)}</div>
        <pre class="perm-args">${this._escapeHtml(argsStr.length > 500 ? argsStr.slice(0, 500) + '…' : argsStr)}</pre>
      `;
    }
    const $remember = document.getElementById('perm-remember');
    if ($remember) $remember.checked = false;
    document.getElementById('permission-dialog')?.classList.remove('hidden');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  _initOverlayClose() {
    this.$overlay?.addEventListener('click', e => {
      if (e.target === this.$overlay) this.hide();
    });
    document.getElementById('permission-dialog')?.addEventListener('click', e => {
      if (e.target === document.getElementById('permission-dialog')) {
        // Don't close permission dialog on backdrop click — explicit choice required
      }
    });
    // overlay-close buttons (including in settings-overlay)
    this.$overlay?.querySelectorAll('.overlay-close').forEach(btn => {
      btn.addEventListener('click', () => this.hide());
    });
  }

  _showToast(msg, isError = false) {
    let toast = document.getElementById('nd-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'nd-toast';
      toast.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        padding:8px 16px;font-size:11px;letter-spacing:1px;
        background:var(--color-bg-panel);border:1px solid var(--color-primary);
        color:var(--color-primary);transition:opacity 0.3s;pointer-events:none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.borderColor = isError ? 'var(--color-danger)' : 'var(--color-primary)';
    toast.style.color        = isError ? 'var(--color-danger)' : 'var(--color-primary)';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  _escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}

window.settingsPanel = new SettingsPanel();

// Hook gateway permission:request events into the dialog
gateway.addEventListener('event', e => {
  if (e.detail?.type === 'permission:request') {
    window.settingsPanel?.showPermissionRequest(e.detail);
  }
});
