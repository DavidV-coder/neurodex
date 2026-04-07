/**
 * NeuroDEX Config Panel + Model Selector
 */

class ConfigPanel {
  constructor() {
    this.$keysList = document.getElementById('api-keys-list');
    this.$permsConfig = document.getElementById('permissions-config');
    this.$themeSelector = document.getElementById('theme-selector');
    this.$btnAddKey = document.getElementById('btn-add-key');
    this.$keyOverlay = document.getElementById('key-input-overlay');
    this.$providerSelect = document.getElementById('key-provider-select');

    this._initKeyInput();
    this._initThemes();
  }

  async load() {
    await this._loadKeys();
    this._loadPermissions();
  }

  _initKeyInput() {
    const providers = ['claude', 'openai', 'gemini', 'deepseek', 'mistral'];
    if (this.$providerSelect) {
      providers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
        this.$providerSelect.appendChild(opt);
      });
    }

    this.$btnAddKey?.addEventListener('click', () => {
      this.$keyOverlay?.classList.remove('hidden');
    });

    document.querySelectorAll('.overlay-close').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
      });
    });

    document.getElementById('btn-save-key')?.addEventListener('click', async () => {
      const provider = this.$providerSelect?.value;
      const key = document.getElementById('key-value-input')?.value?.trim();
      if (!provider || !key) return;

      try {
        await gateway.call('config.setKey', { provider, key });
        document.getElementById('key-value-input').value = '';
        this.$keyOverlay?.classList.add('hidden');
        await this._loadKeys();
        window.agentConsole?._appendSystemMsg(`API key saved for ${provider}`);
      } catch (err) {
        alert('Failed to save key: ' + err.message);
      }
    });
  }

  async _loadKeys() {
    const providers = await gateway.call('config.listKeys').catch(() => []);
    if (!this.$keysList) return;
    this.$keysList.innerHTML = '';

    if (providers.length === 0) {
      this.$keysList.innerHTML = '<div style="color:var(--color-text-dim);font-size:10px">No keys configured</div>';
      return;
    }

    for (const provider of providers) {
      const item = document.createElement('div');
      item.className = 'key-item';
      item.innerHTML = `
        <span class="key-provider">${provider.toUpperCase()}</span>
        <span class="key-status">●  CONFIGURED</span>
        <button class="key-delete" data-provider="${provider}">✕</button>
      `;
      item.querySelector('.key-delete').addEventListener('click', async () => {
        if (confirm(`Delete ${provider} API key?`)) {
          await gateway.call('config.deleteKey', { provider });
          await this._loadKeys();
        }
      });
      this.$keysList.appendChild(item);
    }
  }

  _loadPermissions() {
    if (!this.$permsConfig) return;
    gateway.call('permissions.getConfig').then(config => {
      if (!config) return;
      this.$permsConfig.innerHTML = '';
      const perms = [
        { key: 'bash', label: 'Shell Commands' },
        { key: 'fileRead', label: 'File Read' },
        { key: 'fileWrite', label: 'File Write' },
        { key: 'fileDelete', label: 'File Delete' },
        { key: 'networkFetch', label: 'Network Fetch' },
        { key: 'browserControl', label: 'Browser Control' },
        { key: 'mcpTools', label: 'MCP Tools' },
      ];
      perms.forEach(({ key, label }) => {
        const row = document.createElement('div');
        row.className = 'perm-row';
        row.innerHTML = `
          <span class="perm-name">${label}</span>
          <select class="perm-select" data-key="${key}">
            <option value="allow" ${config[key] === 'allow' ? 'selected' : ''}>ALLOW</option>
            <option value="ask" ${config[key] === 'ask' ? 'selected' : ''}>ASK</option>
            <option value="deny" ${config[key] === 'deny' ? 'selected' : ''}>DENY</option>
          </select>
        `;
        row.querySelector('select').addEventListener('change', async (e) => {
          await gateway.call('permissions.updateConfig', { [key]: e.target.value });
        });
        this.$permsConfig.appendChild(row);
      });
    }).catch(() => {});
  }

  async loadSkills() {
    // Add skills section to config panel
    const configPanel = document.getElementById('config-panel');
    if (!configPanel) return;

    let skillsSection = document.getElementById('skills-section');
    if (!skillsSection) {
      skillsSection = document.createElement('div');
      skillsSection.id = 'skills-section';
      skillsSection.className = 'config-section';
      configPanel.appendChild(skillsSection);
    }

    try {
      const skills = await gateway.call('skills.list');
      const byCategory = {};
      for (const s of skills) {
        if (!byCategory[s.category]) byCategory[s.category] = [];
        byCategory[s.category].push(s);
      }

      skillsSection.innerHTML = `<div class="config-title">SKILLS (/${Object.values(byCategory).flat().length})</div>`;

      for (const [cat, catSkills] of Object.entries(byCategory)) {
        const catEl = document.createElement('div');
        catEl.style.cssText = 'margin-bottom:8px;';
        catEl.innerHTML = `<div style="font-size:9px;letter-spacing:2px;color:var(--color-text-dim);margin:6px 0 3px;">${cat.toUpperCase()}</div>`;
        for (const skill of catSkills) {
          const btn = document.createElement('div');
          btn.className = 'file-item';
          btn.style.cssText = 'cursor:pointer;font-size:10px;';
          btn.innerHTML = `<span style="color:var(--color-primary);min-width:80px;">/${skill.trigger}</span><span style="color:var(--color-text-dim);">${skill.description}</span>`;
          btn.title = skill.description;
          btn.addEventListener('click', () => {
            document.getElementById('chat-input').value = `/${skill.trigger} `;
            document.getElementById('chat-input').focus();
          });
          catEl.appendChild(btn);
        }
        skillsSection.appendChild(catEl);
      }
    } catch { /**/ }
  }

  _initThemes() {
    if (!this.$themeSelector) return;
    const themes = [
      { id: 'tron', name: 'TRON (Default)', primary: '#00e5ff', bg: '#000a0f' },
      { id: 'matrix', name: 'MATRIX', primary: '#00ff41', bg: '#000300' },
      { id: 'amber', name: 'AMBER', primary: '#ffb000', bg: '#0a0700' },
      { id: 'violet', name: 'VIOLET', primary: '#b44fff', bg: '#07000a' },
      { id: 'red', name: 'RED ALERT', primary: '#ff3355', bg: '#0a0003' },
    ];
    themes.forEach(theme => {
      const btn = document.createElement('div');
      btn.className = 'theme-btn';
      btn.innerHTML = `
        <div class="theme-swatch" style="background:${theme.bg};border-color:${theme.primary}"></div>
        <span>${theme.name}</span>
      `;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._applyTheme(theme);
      });
      this.$themeSelector.appendChild(btn);
    });
  }

  _applyTheme(theme) {
    const colors = {
      tron: { primary: '#00e5ff', secondary: '#0088cc', accent: '#00ff9d', bg: '#000a0f', bgPanel: '#000d14' },
      matrix: { primary: '#00ff41', secondary: '#008f11', accent: '#39ff14', bg: '#000300', bgPanel: '#000500' },
      amber: { primary: '#ffb000', secondary: '#cc8800', accent: '#ffd700', bg: '#0a0700', bgPanel: '#0d0900' },
      violet: { primary: '#b44fff', secondary: '#7b2fff', accent: '#e040fb', bg: '#07000a', bgPanel: '#0a000f' },
      red: { primary: '#ff3355', secondary: '#cc0022', accent: '#ff6688', bg: '#0a0003', bgPanel: '#0d0005' },
    };
    const c = colors[theme.id] || colors.tron;
    const root = document.documentElement;
    root.style.setProperty('--color-primary', c.primary);
    root.style.setProperty('--color-secondary', c.secondary);
    root.style.setProperty('--color-accent', c.accent);
    root.style.setProperty('--color-bg', c.bg);
    root.style.setProperty('--color-bg-panel', c.bgPanel);
  }
}

class ModelSelector {
  constructor() {
    this.$overlay = document.getElementById('model-selector-overlay');
    this.$list = document.getElementById('model-list');
  }

  async loadModels() {
    try {
      const models = await gateway.call('models.list');
      const available = await gateway.call('models.available').catch(() => []);
      this._renderModels(models, available);
    } catch { /**/ }
  }

  _renderModels(models, available) {
    if (!this.$list) return;
    this.$list.innerHTML = '';

    const byProvider = {};
    models.forEach(m => {
      if (!byProvider[m.provider]) byProvider[m.provider] = [];
      byProvider[m.provider].push(m);
    });

    const providerOrder = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'ollama'];
    for (const provider of providerOrder) {
      const providerModels = byProvider[provider];
      if (!providerModels?.length) continue;

      const isAvailable = available.includes(provider);
      const title = document.createElement('div');
      title.className = 'model-group-title';
      title.textContent = `${provider.toUpperCase()} ${isAvailable ? '' : '(no key)'}`;
      this.$list.appendChild(title);

      providerModels.forEach(m => {
        const item = document.createElement('div');
        item.className = 'model-item';
        if (!isAvailable) item.style.opacity = '0.4';

        const caps = [];
        if (m.supportsTools) caps.push('TOOLS');
        if (m.supportsVision) caps.push('VISION');
        if (m.supportsThinking) caps.push('THINK');

        item.innerHTML = `
          <span class="model-provider-badge badge-${provider}">${provider.slice(0,3).toUpperCase()}</span>
          <span class="model-name">${m.displayName}</span>
          <span class="model-context">${(m.contextWindow/1000).toFixed(0)}K</span>
          <div class="model-caps">${caps.map(c => `<span class="model-cap">${c}</span>`).join('')}</div>
        `;
        item.addEventListener('click', () => {
          if (!isAvailable) {
            window.agentConsole?._appendSystemMsg(`Add ${provider} API key in Config panel first.`);
            return;
          }
          window.agentConsole?.setModel(m.provider, m.model, m.displayName);
          this.hide();
          window.agentConsole?._appendSystemMsg(`Model: ${m.displayName}`);
        });
        this.$list.appendChild(item);
      });
    }
  }

  show() { this.$overlay?.classList.remove('hidden'); }
  hide() { this.$overlay?.classList.add('hidden'); }
}
