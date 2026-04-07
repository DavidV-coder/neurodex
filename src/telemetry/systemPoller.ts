/**
 * NeuroDEX System Poller
 * Polls system metrics and broadcasts via gateway events.
 */
import { EventEmitter } from 'events';
import * as si from 'systeminformation';

export interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    cores: number[];
    speed: number;
    temp?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
    swapUsed: number;
    swapTotal: number;
  };
  disk: {
    free: number;
    total: number;
    usedPercent: number;
  };
  network: {
    rx: number;
    tx: number;
  };
  processes: {
    all: number;
    running: number;
    top: Array<{ name: string; cpu: number; mem: number; pid: number }>;
  };
  uptime: number;
}

export class SystemPoller extends EventEmitter {
  private interval: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private lastMetrics: SystemMetrics | null = null;
  private lastNetStats: { rx: number; tx: number } | null = null;

  constructor(intervalMs = 2000) {
    super();
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.interval) return;
    this._poll();
    this.interval = setInterval(() => this._poll(), this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getLatest(): SystemMetrics | null {
    return this.lastMetrics;
  }

  setInterval(ms: number): void {
    this.intervalMs = ms;
    if (this.interval) {
      this.stop();
      this.start();
    }
  }

  private async _poll(): Promise<void> {
    try {
      const [cpuLoad, cpuData, memData, diskData, netData, processData, time] = await Promise.all([
        si.currentLoad(),
        si.cpu(),
        si.mem(),
        si.fsStats(),
        si.networkStats(),
        si.processes(),
        si.time()
      ]);

      const topProcesses = processData.list
        .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
        .slice(0, 8)
        .map(p => ({ name: p.name, cpu: Math.round((p.cpu || 0) * 10) / 10, mem: Math.round((p.mem || 0) * 10) / 10, pid: p.pid }));

      const netStats = Array.isArray(netData) ? netData[0] : netData;
      const rxRate = this.lastNetStats ? Math.max(0, (netStats?.rx_bytes || 0) - this.lastNetStats.rx) : 0;
      const txRate = this.lastNetStats ? Math.max(0, (netStats?.tx_bytes || 0) - this.lastNetStats.tx) : 0;
      this.lastNetStats = { rx: netStats?.rx_bytes || 0, tx: netStats?.tx_bytes || 0 };

      const metrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: {
          usage: Math.round((cpuLoad.currentLoad || 0) * 10) / 10,
          cores: (cpuLoad.cpus || []).map(c => Math.round((c.load || 0) * 10) / 10),
          speed: cpuData.speed || 0,
          temp: undefined
        },
        memory: {
          total: memData.total,
          used: memData.active,
          free: memData.available,
          usedPercent: Math.round((memData.active / memData.total) * 100 * 10) / 10,
          swapUsed: memData.swapused,
          swapTotal: memData.swaptotal
        },
        disk: {
          free: diskData.rx || 0,
          total: diskData.wx || 0,
          usedPercent: 0
        },
        network: {
          rx: Math.round(rxRate / 1024),  // KB/s
          tx: Math.round(txRate / 1024)
        },
        processes: {
          all: processData.all,
          running: processData.running,
          top: topProcesses
        },
        uptime: time.uptime || 0
      };

      // Get actual disk usage
      try {
        const fsSize = await si.fsSize();
        const root = fsSize.find(f => f.mount === '/') || fsSize[0];
        if (root) {
          metrics.disk.total = root.size;
          metrics.disk.free = root.size - root.used;
          metrics.disk.usedPercent = Math.round((root.use || 0) * 10) / 10;
        }
      } catch { /* ignore disk errors */ }

      this.lastMetrics = metrics;
      this.emit('metrics', metrics);
    } catch (err) {
      console.error('[SystemPoller]', err);
    }
  }
}

export const systemPoller = new SystemPoller(2000);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
