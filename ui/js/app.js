/**
 * NeuroDEX — Main App Entry Point
 */

(async function() {
  // Boot screen — show immediately
  const bootScreen = document.createElement('div');
  bootScreen.className = 'boot-screen';
  bootScreen.innerHTML = `
    <div class="boot-logo">⬡</div>
    <div class="boot-text">NEURODEX</div>
    <div class="boot-progress"><div class="boot-progress-fill"></div></div>
  `;
  document.body.appendChild(bootScreen);

  // Remove boot screen after 1.5s regardless of anything else
  setTimeout(() => {
    bootScreen.style.transition = 'opacity 0.4s';
    bootScreen.style.opacity = '0';
    setTimeout(() => bootScreen.remove(), 400);
  }, 1500);

  // Window controls
  document.getElementById('btn-minimize')?.addEventListener('click', () => window.NeuroDEX?.window.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', () => window.NeuroDEX?.window.maximize());
  document.getElementById('btn-close')?.addEventListener('click', () => window.NeuroDEX?.window.close());
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => window.NeuroDEX?.window.fullscreen());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') { e.preventDefault(); window.NeuroDEX?.window.fullscreen(); }
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); window.modelSelector?.show(); }
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); window.settingsPanel?.show(); }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); window.agentConsole?.clear?.(); }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); window.agentConsole?.newSession?.(); }
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); window.agentsPanel?.toggle(); }
    if (e.ctrlKey && e.key === 'm') { e.preventDefault(); window.memoryPanel?.toggle(); }
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => window.settingsPanel?.show());
  document.getElementById('btn-agents')?.addEventListener('click',   () => window.agentsPanel?.toggle());
  document.getElementById('btn-memory')?.addEventListener('click',   () => window.memoryPanel?.toggle());

  document.getElementById('btn-export-chat')?.addEventListener('click', async () => {
    try {
      const { content, filename } = await gateway.call('sessions.export', { id: 'main', format: 'markdown' });
      const blob = new Blob([content], { type: 'text/markdown' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.settingsPanel?._showToast('Export failed: ' + err.message, true);
    }
  });

  // Token counter in chat header — update on token events
  gateway.addEventListener('event', e => {
    const d = e.detail;
    if (d?.type === 'chat.tokens') {
      const el = document.getElementById('token-counter');
      if (el) el.textContent = `${d.totalCost} · ${d.totalInput}↑ ${d.totalOutput}↓`;
    }
    // Permission request → show dialog
    if (d?.type === 'permission:request') {
      window.settingsPanel?.showPermissionRequest(d);
    }
  });

  // ── Step 1: get gateway token (max 3s wait) ──────────────────────────────
  let gatewayToken = null;
  let gatewayPort = 18789;

  if (window.NeuroDEX?.gateway) {
    await Promise.race([
      new Promise(resolve => {
        window.NeuroDEX.gateway.onToken((data) => {
          gatewayToken = data.token;
          gatewayPort = data.port;
          resolve();
        });
      }),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  }

  // ── Step 2: connect to gateway (max 4s, non-fatal) ───────────────────────
  if (gatewayToken) {
    try {
      await Promise.race([
        gateway.connect(gatewayPort, gatewayToken),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
      ]);
    } catch (err) {
      console.warn('[NeuroDEX] Gateway not ready yet:', err.message);
      // UI still works — gateway will reconnect in background
    }
  }

  // ── Step 3: init subsystems — all non-blocking ───────────────────────────

  // System monitor — pure JS, no gateway needed
  window.systemMonitor = new SystemMonitor();
  window.systemMonitor.start();

  // Agent console — just DOM setup, no async
  window.agentConsole = new AgentConsole();

  // Terminal — init async but don't block
  window.terminal = new NeuroDEXTerminal();
  window.terminal.init().catch(e => console.warn('[Terminal]', e));

  // File browser — show cwd WITHOUT calling gateway (use IPC)
  window.fileBrowser = new FileBrowser();
  const cwd = (await window.NeuroDEX?.system?.info().catch(() => null))?.cwd || '/';
  window.fileBrowser.refreshLocal(cwd); // local read, no gateway

  // Config panel — load keys from gateway async, don't block
  window.configPanel = new ConfigPanel();
  window.configPanel.load().catch(() => {}); // non-blocking
  window.configPanel.loadSkills().catch(() => {});

  // Model selector — load async after gateway ready
  window.modelSelector = new ModelSelector();
  window.modelSelector.loadModels().catch(() => {});

  // ── Step 4: UI events ────────────────────────────────────────────────────
  document.querySelectorAll('.panel-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const panel = btn.dataset.panel;
      document.getElementById('files-panel')?.classList.toggle('hidden', panel !== 'files');
      document.getElementById('processes-panel')?.classList.toggle('hidden', panel !== 'processes');
      document.getElementById('config-panel')?.classList.toggle('hidden', panel !== 'config');
    });
  });

  gateway.addEventListener('connected', () => {
    const badge = document.getElementById('ai-provider');
    if (badge) { badge.classList.add('online'); badge.classList.remove('offline'); }
    // Load models now that gateway is connected
    window.modelSelector?.loadModels().catch(() => {});
    window.configPanel?.load().catch(() => {});
  });
  gateway.addEventListener('disconnected', () => {
    const badge = document.getElementById('ai-provider');
    if (badge) badge.textContent = 'RECONNECTING';
  });

  // Welcome message after UI is visible
  setTimeout(() => {
    window.agentConsole?._appendSystemMsg(
      'NeuroDEX ready. Type a message to begin. Ctrl+K — select model. /help — list skills.'
    );
  }, 2000);

  console.log('[NeuroDEX] Init complete');
})();
