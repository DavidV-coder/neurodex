/**
 * NeuroDEX System Monitor
 * Real-time CPU, RAM, Disk, Network stats via gateway system.metrics events.
 */

class SystemMonitor {
  constructor() {
    this.smoothie = null;
    this.cpuSeries = null;
    this.coresInitialized = false;
    this._initCpuChart();
    this._initClock();
    this._subscribeGateway();
  }

  _initCpuChart() {
    const canvas = document.getElementById('cpu-chart');
    if (!canvas || !window.SmoothieChart) return;
    this.smoothie = new SmoothieChart({
      grid: { strokeStyle: 'rgba(0,229,255,0.08)', fillStyle: 'transparent', lineWidth: 1, millisPerLine: 3000, verticalSections: 4 },
      labels: { disabled: true },
      millisPerPixel: 100,
      maxValueScale: 1.1,
      minValue: 0,
      maxValue: 100
    });
    this.cpuSeries = new TimeSeries();
    this.smoothie.addTimeSeries(this.cpuSeries, {
      strokeStyle: 'rgba(0,229,255,0.9)',
      fillStyle: 'rgba(0,229,255,0.1)',
      lineWidth: 1.5
    });
    this.smoothie.streamTo(canvas, 1000);
  }

  _initClock() {
    const update = () => {
      const now = new Date();
      const t = document.getElementById('clock-time');
      const d = document.getElementById('clock-date');
      if (t) t.textContent = now.toTimeString().slice(0, 8);
      if (d) d.textContent = now.toISOString().slice(0, 10);
    };
    update();
    setInterval(update, 1000);
  }

  _subscribeGateway() {
    gateway.addEventListener('event', e => {
      const d = e.detail;
      if (d?.type === 'system.metrics') this._applyMetrics(d.metrics);
    });
    gateway.addEventListener('connected', () => {
      this._fetchSnapshot();
      this._updateCliStatus();
    });
  }

  start() {
    this._fetchSnapshot();
    this._updateCliStatus();
    // Poll CLI status every 30s
    setInterval(() => this._updateCliStatus(), 30000);
  }

  async _updateCliStatus() {
    try {
      const s = await gateway.call('claudecode.status').catch(() => null);
      const dot = document.getElementById('cli-dot');
      const txt = document.getElementById('cli-status-text');
      const fill = document.getElementById('cli-plan-fill');
      const info = document.getElementById('cli-plan-info');
      const reset = document.getElementById('cli-reset-info');
      if (!s) return;

      if (s.available) {
        if (dot) { dot.textContent = '●'; dot.style.color = 'var(--color-success,#00ff88)'; }
        if (txt) txt.textContent = 'CONNECTED — Subscription';
      } else {
        if (dot) { dot.textContent = '○'; dot.style.color = 'var(--color-text-dim)'; }
        if (txt) txt.textContent = 'NOT FOUND — install claude CLI';
        return;
      }

      if (s.rateLimit) {
        const r = s.rateLimit;
        const allowed = r.status === 'allowed';
        const overage = r.isUsingOverage;

        if (fill) {
          fill.style.background = overage ? 'rgba(255,176,0,0.5)' : allowed ? 'rgba(0,255,136,0.4)' : 'rgba(255,51,85,0.5)';
          // We don't have exact usage % from CLI, show status bar state
          fill.style.width = allowed ? (overage ? '75%' : '40%') : '100%';
        }
        if (info) {
          const typeLabel = r.rateLimitType === 'five_hour' ? '5h window' : r.rateLimitType || 'plan';
          info.textContent = allowed
            ? `${typeLabel}: ${overage ? 'OVERAGE' : 'OK'}`
            : `RATE LIMITED (${typeLabel})`;
          info.style.color = allowed ? (overage ? 'var(--color-warn)' : 'inherit') : 'var(--color-danger,#ff3355)';
        }
        if (reset && r.resetsAt) {
          const resetDate = new Date(r.resetsAt * 1000);
          const diff = resetDate - Date.now();
          if (diff > 0) {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            reset.textContent = `Resets in ${h}h ${m}m`;
          } else {
            reset.textContent = '';
          }
        }
      } else {
        if (info) info.textContent = 'Plan: awaiting first request';
        if (fill) fill.style.width = '0%';
      }
    } catch { /* silent */ }
  }

  stop() {}

  async _fetchSnapshot() {
    try {
      const snap = await gateway.call('system.snapshot');
      if (snap) this._applyMetrics(snap);
    } catch { /* gateway not ready yet, will get metrics via events */ }
  }

  _applyMetrics(m) {
    if (!m) return;

    // CPU
    if (m.cpu !== undefined) {
      const usage = typeof m.cpu === 'object' ? m.cpu.usage : m.cpu;
      if (this.cpuSeries) this.cpuSeries.append(Date.now(), usage);

      const cpuPct = document.getElementById('cpu-pct');
      if (cpuPct) cpuPct.textContent = usage.toFixed(1) + '%';

      // Core bars
      const coresGrid = document.getElementById('cpu-cores');
      if (coresGrid && m.cpu.cores?.length) {
        if (!this.coresInitialized) {
          coresGrid.innerHTML = '';
          m.cpu.cores.forEach(() => {
            const bar = document.createElement('div');
            bar.className = 'core-bar';
            bar.innerHTML = '<div class="core-fill"></div>';
            coresGrid.appendChild(bar);
          });
          this.coresInitialized = true;
        }
        Array.from(coresGrid.children).forEach((bar, i) => {
          const fill = bar.querySelector('.core-fill');
          if (fill && m.cpu.cores[i] !== undefined) fill.style.height = m.cpu.cores[i] + '%';
        });
      }
    }

    // Memory
    if (m.memory) {
      const used = m.memory.used;
      const total = m.memory.total;
      const pct = total > 0 ? (used / total * 100) : 0;
      const ramUsed = document.getElementById('ram-used');
      const ramInfo = document.getElementById('ram-info');
      if (ramUsed) ramUsed.style.width = pct.toFixed(0) + '%';
      if (ramInfo) ramInfo.textContent = `${_fmt(used)} / ${_fmt(total)}`;
    }

    // Disk
    if (m.disk) {
      const used = m.disk.total - m.disk.free;
      const total = m.disk.total;
      const pct = m.disk.usedPercent || (total > 0 ? (used / total * 100) : 0);
      const diskUsed = document.getElementById('disk-used');
      const diskInfo = document.getElementById('disk-info');
      if (diskUsed) diskUsed.style.width = pct.toFixed(0) + '%';
      if (diskInfo) diskInfo.textContent = `${_fmt(used)} / ${_fmt(total)} (${pct.toFixed(0)}%)`;
    }

    // Network
    if (m.network) {
      const rx = document.getElementById('net-rx');
      const tx = document.getElementById('net-tx');
      if (rx) rx.textContent = `↓ ${m.network.rx} KB/s`;
      if (tx) tx.textContent = `↑ ${m.network.tx} KB/s`;
    }

    // Uptime
    if (m.uptime !== undefined) {
      const el = document.getElementById('sys-uptime');
      if (el) el.textContent = 'UP ' + _fmtUptime(m.uptime);
    }

    // Processes panel
    if (m.processes?.top) {
      this._updateProcessList(m.processes.top);
      const procCount = document.getElementById('proc-count');
      if (procCount) procCount.textContent = `${m.processes.running}/${m.processes.all}`;
    }
  }

  _updateProcessList(procs) {
    const list = document.getElementById('proc-list');
    if (!list) return;
    list.innerHTML = procs.map(p => `
      <div class="proc-row">
        <span class="proc-pid">${p.pid}</span>
        <span class="proc-cpu ${p.cpu > 20 ? 'hi' : ''}">${p.cpu.toFixed(1)}</span>
        <span class="proc-mem">${p.mem.toFixed(1)}</span>
        <span class="proc-name">${p.name}</span>
      </div>`).join('');
  }

  setCpuModel(model) {
    const el = document.getElementById('cpu-model');
    if (el) el.textContent = model;
  }
}

function _fmt(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function _fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

// ── Mole Panel controller ─────────────────────────────────────────────────────
class MolePanel {
  constructor() {
    this._bind();
    this._loadInfo();
  }

  _bind() {
    document.getElementById('mole-btn-analyze')?.addEventListener('click',  () => this._run('analyze'));
    document.getElementById('mole-btn-clean')?.addEventListener('click',    () => this._run('clean', true));
    document.getElementById('mole-btn-optimize')?.addEventListener('click', () => this._run('optimize', true));
    document.getElementById('mole-btn-purge')?.addEventListener('click',    () => this._run('purge'));
    document.getElementById('mole-btn-check')?.addEventListener('click',    () => this._run('check'));
  }

  async _loadInfo() {
    try {
      const avail = await gateway.call('mole.available');
      const statusEl = document.getElementById('mole-status');
      if (statusEl) statusEl.textContent = avail ? 'READY' : 'NOT INSTALLED';
      if (statusEl) statusEl.className = 'mole-status-badge ' + (avail ? 'ok' : 'off');

      if (avail) {
        const info = await gateway.call('mole.info');
        const vEl = document.getElementById('mole-version');
        if (vEl && info?.version) vEl.textContent = `v${info.version}`;
        const diskEl = document.getElementById('mole-disk-free');
        if (diskEl && info?.diskFree) diskEl.textContent = `Free: ${info.diskFree}`;
      }
    } catch { /* gateway not ready */ }
  }

  async _run(command, dryRun = false) {
    const out = document.getElementById('mole-output');
    if (!out) return;
    out.textContent = `Running: mo ${command}${dryRun ? ' --dry-run' : ''}...\n`;
    out.classList.remove('hidden');
    try {
      const res = await gateway.call('mole.run', { command, dryRun });
      out.textContent = res?.output || '(no output)';
    } catch (e) {
      out.textContent = 'Error: ' + e.message;
    }
  }
}

window.systemMonitor = null;
window.molePanel = null;

// Init mole panel after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.molePanel = new MolePanel();
});
