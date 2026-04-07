/**
 * Background Agent Pool
 * Manages concurrent background agents with concurrency limiting.
 */
import { EventEmitter } from 'events';
import { BackgroundAgent, AgentOptions, AgentEvent } from './backgroundAgent.js';

const MAX_CONCURRENT = 3;

export class AgentPool extends EventEmitter {
  private agents: Map<string, BackgroundAgent> = new Map();
  private running: number = 0;

  spawn(options: AgentOptions): BackgroundAgent {
    const agent = new BackgroundAgent(options);
    this.agents.set(agent.id, agent);

    // Forward all events
    agent.on('status',    (e: AgentEvent) => this.emit('agent:status', e));
    agent.on('iteration', (e: AgentEvent) => this.emit('agent:iteration', e));
    agent.on('chunk',     (e: AgentEvent) => this.emit('agent:chunk', e));
    agent.on('tool',      (e: AgentEvent) => this.emit('agent:tool', e));
    agent.on('done',      (e: AgentEvent) => {
      this.running = Math.max(0, this.running - 1);
      this.emit('agent:done', e);
    });

    if (this.running < MAX_CONCURRENT) {
      this.running++;
      agent.run().catch(() => {});
    } else {
      // Queue: wait for a slot
      const interval = setInterval(() => {
        if (this.running < MAX_CONCURRENT) {
          clearInterval(interval);
          this.running++;
          agent.run().catch(() => {});
        }
      }, 1000);
    }

    return agent;
  }

  list(): ReturnType<BackgroundAgent['toJSON']>[] {
    return [...this.agents.values()].map(a => a.toJSON());
  }

  get(id: string): BackgroundAgent | undefined {
    return this.agents.get(id);
  }

  abort(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.abort();
    return true;
  }

  pause(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.pause();
    return true;
  }

  resume(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.resume();
    return true;
  }

  clearDone(): void {
    for (const [id, agent] of this.agents) {
      if (agent.status === 'done' || agent.status === 'error' || agent.status === 'aborted') {
        this.agents.delete(id);
      }
    }
  }
}

export const agentPool = new AgentPool();
