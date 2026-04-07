/**
 * NeuroDEX — Main App Entry Point
 */

(async function() {
  // ── Boot screen ────────────────────────────────────────────────────────────
  const VERSION = '1.0.0';

  const bootScreen = document.createElement('div');
  bootScreen.className = 'boot-screen';
  bootScreen.innerHTML = `
    <div class="boot-logo">⬡</div>
    <div class="boot-text">NEURODEX</div>
    <div class="boot-terminal" id="boot-terminal"></div>
    <div class="boot-actions hidden" id="boot-actions">
      <button class="boot-settings-btn" id="boot-open-settings">⚙ Open Settings</button>
    </div>
  `;
  document.body.appendChild(bootScreen);

  const $terminal = document.getElementById('boot-terminal');
  const $actions  = document.getElementById('boot-actions');

  /** Append one terminal line with optional status badge */
  function bootLine(text, status) {
    const el = document.createElement('div');
    el.className = 'boot-line' + (status ? ` boot-line-${status}` : '');
    el.textContent = text;
    $terminal.appendChild(el);
    $terminal.scrollTop = $terminal.scrollHeight;
    return el;
  }

  /** Small async delay helper */
  const wait = ms => new Promise(r => setTimeout(r, ms));

  bootLine(`[INIT] NeuroDEX v${VERSION}`);
  await wait(120);
  bootLine('[SYS] Checking system...');
  await wait(180);

  // ── Step 1: get gateway token (cached in preload, max 6s wait) ──────────
  let gatewayToken = null;
  let gatewayPort  = 18789;

  if (window.NeuroDEX?.gateway) {
    await Promise.race([
      new Promise(resolve => {
        window.NeuroDEX.gateway.onToken((data) => {
          gatewayToken = data.token;
          gatewayPort  = data.port;
          resolve();
        });
      }),
      new Promise(resolve => setTimeout(resolve, 6000))
    ]);
  }

  // ── Step 2: connect to gateway ───────────────────────────────────────────
  let gatewayOk = false;

  const gwLine = bootLine('[GATEWAY] Connecting to local gateway...');
  if (gatewayToken) {
    try {
      await Promise.race([
        gateway.connect(gatewayPort, gatewayToken),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
      gatewayOk = true;
      gwLine.textContent = '[GATEWAY] Connecting to local gateway... OK';
      gwLine.classList.add('boot-line-ok');
    } catch (err) {
      gwLine.textContent = `[GATEWAY] Connecting to local gateway... FAILED (${err.message})`;
      gwLine.classList.add('boot-line-fail');
      console.warn('[NeuroDEX] Gateway not ready yet:', err.message);
    }
  } else {
    gwLine.textContent = '[GATEWAY] Connecting to local gateway... FAILED (no token)';
    gwLine.classList.add('boot-line-fail');
  }
  await wait(120);

  // ── Step 3: check providers ───────────────────────────────────────────────
  let cliAvailable   = false;
  let cliVersion     = '';
  let apiAvailable   = false;
  let availableProviders = [];

  if (gatewayOk) {
    // CLI check
    const cliLine = bootLine('[CLI] Detecting Claude Code CLI...');
    try {
      const cliInfo = await gateway.call('claudecode.available').catch(() => null);
      if (cliInfo?.available) {
        cliAvailable = true;
        cliVersion   = cliInfo.version ? ` (v${cliInfo.version})` : '';
        cliLine.textContent = `[CLI] Detecting Claude Code CLI... FOUND${cliVersion}`;
        cliLine.classList.add('boot-line-ok');
      } else {
        cliLine.textContent = '[CLI] Detecting Claude Code CLI... NOT FOUND';
        cliLine.classList.add('boot-line-warn');
      }
    } catch {
      cliLine.textContent = '[CLI] Detecting Claude Code CLI... NOT FOUND';
      cliLine.classList.add('boot-line-warn');
    }
    await wait(120);

    // Provider/API check
    const modLine = bootLine('[MODEL] Checking available providers...');
    try {
      availableProviders = await gateway.call('models.available').catch(() => []) || [];
      if (availableProviders.length > 0) {
        apiAvailable = true;
        const preferred = availableProviders.includes('claude-code')
          ? 'Claude Sonnet (Subscription)'
          : availableProviders[0];
        modLine.textContent = `[MODEL] Default: ${preferred}`;
        modLine.classList.add('boot-line-ok');
      } else {
        modLine.textContent = '[MODEL] No providers configured';
        modLine.classList.add('boot-line-warn');
      }
    } catch {
      modLine.textContent = '[MODEL] Could not query providers';
      modLine.classList.add('boot-line-warn');
    }
    await wait(120);
  }

  const anyProvider = cliAvailable || apiAvailable;

  // ── Step 4: verdict ───────────────────────────────────────────────────────
  if (!gatewayOk) {
    bootLine('[ERROR] Gateway connection failed', 'fail');
    await wait(80);
    bootLine('[ERROR] No AI provider available', 'fail');
    await wait(80);
    bootLine('[ACTION] → Start the NeuroDEX backend service', 'warn');
    await wait(80);
    bootLine('[ACTION] → Or install Claude CLI: npm install -g @anthropic-ai/claude-code', 'warn');
    await wait(80);
    bootLine('[ACTION] → Or add an API key in Settings (Ctrl+,)', 'warn');
    $actions.classList.remove('hidden');
    // Block — don't dismiss, let user open settings
    document.getElementById('boot-open-settings').addEventListener('click', () => {
      dismissBoot();
      setTimeout(() => window.settingsPanel?.show(), 50);
    });
  } else if (!anyProvider) {
    bootLine('[WARN] No AI provider configured', 'warn');
    await wait(80);
    bootLine('[ACTION] → Install Claude CLI: npm install -g @anthropic-ai/claude-code', 'warn');
    await wait(80);
    bootLine('[ACTION] → Or add an API key in Settings (Ctrl+,)', 'warn');
    $actions.classList.remove('hidden');
    document.getElementById('boot-open-settings').addEventListener('click', () => {
      dismissBoot();
      setTimeout(() => window.settingsPanel?.show(), 50);
    });
    // Non-blocking — allow use after short delay
    await wait(2000);
    dismissBoot();
  } else {
    bootLine('[READY] All systems operational', 'ok');
    await wait(600);
    dismissBoot();
  }

  function dismissBoot() {
    bootScreen.style.transition = 'opacity 0.4s';
    bootScreen.style.opacity = '0';
    setTimeout(() => bootScreen.remove(), 400);
  }

  // ── Step 5: window controls ───────────────────────────────────────────────
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

  // ── Step 6: init subsystems — all non-blocking ───────────────────────────

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

  // ── Step 7: UI events ────────────────────────────────────────────────────
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
