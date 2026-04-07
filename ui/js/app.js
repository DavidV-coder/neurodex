/**
 * NeuroDEX — Main App Entry Point
 * Initializes all subsystems after gateway connects.
 */

(async function() {
  // Boot screen
  const bootScreen = document.createElement('div');
  bootScreen.className = 'boot-screen';
  bootScreen.innerHTML = `
    <div class="boot-logo">⬡</div>
    <div class="boot-text">NEURODEX INITIALIZING</div>
    <div class="boot-progress"><div class="boot-progress-fill"></div></div>
  `;
  document.body.appendChild(bootScreen);

  // Window controls
  document.getElementById('btn-minimize')?.addEventListener('click', () => window.NeuroDEX?.window.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', () => window.NeuroDEX?.window.maximize());
  document.getElementById('btn-close')?.addEventListener('click', () => window.NeuroDEX?.window.close());
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => window.NeuroDEX?.window.fullscreen());

  // F11 fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') { e.preventDefault(); window.NeuroDEX?.window.fullscreen(); }
  });

  // Wait for gateway token from Electron main
  let gatewayToken = null;
  let gatewayPort = 18789;

  if (window.NeuroDEX?.gateway) {
    await new Promise(resolve => {
      window.NeuroDEX.gateway.onToken((data) => {
        gatewayToken = data.token;
        gatewayPort = data.port;
        resolve();
      });
      // Timeout fallback for dev mode
      setTimeout(resolve, 3000);
    });
  }

  // Connect to Gateway
  try {
    if (gatewayToken) {
      await gateway.connect(gatewayPort, gatewayToken);
    }
  } catch (err) {
    console.error('[NeuroDEX] Gateway connection failed:', err);
  }

  // Initialize subsystems
  window.systemMonitor = new SystemMonitor();
  window.systemMonitor.start();

  window.agentConsole = new AgentConsole();

  window.terminal = new NeuroDEXTerminal();
  await window.terminal.init();

  window.fileBrowser = new FileBrowser();
  await window.fileBrowser.refresh(process?.cwd?.() || '/');

  window.configPanel = new ConfigPanel();
  await window.configPanel.load();

  window.modelSelector = new ModelSelector();
  await window.modelSelector.loadModels();

  // Right panel tab switching
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

  // Gateway status indicator
  gateway.addEventListener('connected', () => {
    document.getElementById('ai-provider').classList.replace('offline', 'online');
  });
  gateway.addEventListener('disconnected', () => {
    document.getElementById('ai-provider').textContent = 'RECONNECTING...';
  });

  // Remove boot screen
  setTimeout(() => {
    bootScreen.style.transition = 'opacity 0.5s';
    bootScreen.style.opacity = '0';
    setTimeout(() => bootScreen.remove(), 500);
  }, 1500);

  // Show welcome message
  setTimeout(() => {
    window.agentConsole?._appendSystemMsg(
      'NeuroDEX ready. Type a message or command to begin. Press Ctrl+K to select model.'
    );
  }, 2000);

  // Keyboard shortcut: Ctrl+K = model selector
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      window.modelSelector?.show();
    }
  });

  console.log('[NeuroDEX] Initialization complete');
})();
