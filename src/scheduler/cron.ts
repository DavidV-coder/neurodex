/**
 * NeuroDEX Task Scheduler
 * Cron-based scheduling for background agent tasks.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import cron from 'node-cron';
import { agentPool } from '../agents/agentPool.js';
import { EventEmitter } from 'events';

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  task: string;          // prompt to send to agent
  provider?: string;
  model?: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  lastStatus?: string;
  runCount: number;
  createdAt: number;
}

const CONFIG_DIR  = path.join(os.homedir(), '.config', 'NeuroDEX');
const CRON_FILE   = path.join(CONFIG_DIR, 'cron.json');

export class CronScheduler extends EventEmitter {
  private tasks: ScheduledTask[] = [];
  private jobs: Map<string, ReturnType<typeof cron.schedule>> = new Map();

  constructor() {
    super();
    this.load();
    this._startAll();
  }

  load(): void {
    try {
      if (fs.existsSync(CRON_FILE)) {
        this.tasks = JSON.parse(fs.readFileSync(CRON_FILE, 'utf8'));
      }
    } catch {
      this.tasks = [];
    }
  }

  save(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CRON_FILE, JSON.stringify(this.tasks, null, 2), { mode: 0o600 });
  }

  list(): ScheduledTask[] { return [...this.tasks]; }

  add(data: Omit<ScheduledTask, 'id' | 'runCount' | 'createdAt'>): ScheduledTask {
    if (!cron.validate(data.cronExpression)) {
      throw new Error(`Invalid cron expression: ${data.cronExpression}`);
    }
    const task: ScheduledTask = {
      ...data,
      id: Math.random().toString(36).slice(2),
      runCount: 0,
      enabled: data.enabled ?? true,
      createdAt: Date.now()
    };
    this.tasks.push(task);
    this.save();
    if (task.enabled) this._startJob(task);
    return task;
  }

  remove(id: string): boolean {
    this._stopJob(id);
    const before = this.tasks.length;
    this.tasks = this.tasks.filter(t => t.id !== id);
    if (this.tasks.length !== before) { this.save(); return true; }
    return false;
  }

  update(id: string, patch: Partial<ScheduledTask>): boolean {
    const idx = this.tasks.findIndex(t => t.id === id);
    if (idx === -1) return false;
    this._stopJob(id);
    this.tasks[idx] = { ...this.tasks[idx], ...patch, id };
    this.save();
    if (this.tasks[idx].enabled) this._startJob(this.tasks[idx]);
    return true;
  }

  runNow(id: string): void {
    const task = this.tasks.find(t => t.id === id);
    if (!task) throw new Error(`Task not found: ${id}`);
    this._runTask(task);
  }

  private _startAll(): void {
    for (const task of this.tasks) {
      if (task.enabled) this._startJob(task);
    }
  }

  private _startJob(task: ScheduledTask): void {
    if (!cron.validate(task.cronExpression)) return;
    const job = cron.schedule(task.cronExpression, () => this._runTask(task));
    this.jobs.set(task.id, job);
  }

  private _stopJob(id: string): void {
    const job = this.jobs.get(id);
    if (job) { job.stop(); this.jobs.delete(id); }
  }

  private _runTask(task: ScheduledTask): void {
    const idx = this.tasks.findIndex(t => t.id === task.id);
    if (idx !== -1) {
      this.tasks[idx].lastRun = Date.now();
      this.tasks[idx].runCount++;
      this.save();
    }
    this.emit('fired', { taskId: task.id, name: task.name });
    const agent = agentPool.spawn({
      task: task.task,
      provider: task.provider,
      model: task.model,
      label: `[CRON] ${task.name}`
    });
    agent.on('done', (e) => {
      const i = this.tasks.findIndex(t => t.id === task.id);
      if (i !== -1) {
        this.tasks[i].lastStatus = e.data?.status as string || 'done';
        this.save();
      }
      this.emit('done', { taskId: task.id, agentId: agent.id, status: e.data?.status });
    });
  }
}

export const cronScheduler = new CronScheduler();
