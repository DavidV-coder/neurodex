/**
 * NeuroDEX Telegram Integration
 * Connects as a Telegram USER (not bot) via GramJS StringSession.
 * Allows triggering AI agents from Telegram and sending results back.
 */
import { EventEmitter } from 'events';
import { agentPool } from '../../agents/agentPool.js';

export interface TelegramMessage {
  id: number;
  chatId: string | number;
  senderId: string | number;
  text: string;
  date: number;
  isOutgoing: boolean;
}

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
  session: string;         // StringSession string
  triggerPattern?: string; // regex — messages matching this trigger an agent
  autoReply: boolean;
}

export class TelegramClient extends EventEmitter {
  private client: unknown = null;
  private config: TelegramConfig | null = null;
  private connected = false;
  private triggerRegex: RegExp | null = null;

  isConnected(): boolean { return this.connected; }

  getConfig(): TelegramConfig | null { return this.config; }

  async connect(config: TelegramConfig): Promise<{ qrCode?: string; phoneRequired?: boolean; sessionString?: string }> {
    try {
      // Dynamic import — telegram package must be installed
      const { TelegramClient: GramClient } = await import('telegram');
      const { StringSession } = await import('telegram/sessions').catch(() => {
        throw new Error('Telegram package not installed. Run: npm install telegram');
      });

      this.config = config;
      if (config.triggerPattern) {
        this.triggerRegex = new RegExp(config.triggerPattern, 'i');
      }

      const stringSession = new StringSession(config.session || '');
      const client = new GramClient(stringSession, config.apiId, config.apiHash, {
        connectionRetries: 5,
      });

      await client.connect();
      this.client = client;
      this.connected = true;

      // Listen for new messages
      client.addEventHandler((update: unknown) => {
        this._handleUpdate(update as Record<string, unknown>);
      });

      // Return session string for saving
      const sessionString = (stringSession as unknown as { save: () => string }).save();
      return { sessionString };
    } catch (err) {
      throw new Error(`Telegram connect failed: ${(err as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try { await (this.client as { disconnect: () => Promise<void> }).disconnect(); } catch { /**/ }
      this.client = null;
    }
    this.connected = false;
  }

  async sendMessage(chatId: string | number, text: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error('Not connected to Telegram');
    await (this.client as { sendMessage: (chatId: string | number, opts: Record<string, unknown>) => Promise<void> })
      .sendMessage(chatId, { message: text });
  }

  async getHistory(chatId: string | number, limit = 20): Promise<TelegramMessage[]> {
    if (!this.client || !this.connected) return [];
    try {
      const messages = await (this.client as { getMessages: (chatId: string | number, opts: Record<string, unknown>) => Promise<Array<Record<string, unknown>>> })
        .getMessages(chatId, { limit });
      return messages.map((m): TelegramMessage => ({
        id: m.id as number,
        chatId,
        senderId: (m.senderId as Record<string, unknown>)?.value?.toString() || String(m.senderId),
        text: (m.message as string) || '',
        date: (m.date as number) * 1000,
        isOutgoing: (m.out as boolean) || false
      }));
    } catch {
      return [];
    }
  }

  private _handleUpdate(update: Record<string, unknown>): void {
    // Handle new message updates
    const message = update.message as Record<string, unknown> | undefined;
    if (!message?.text || message.out) return;

    const msg: TelegramMessage = {
      id: message.id as number,
      chatId: (message.chatId as Record<string, unknown>)?.value?.toString() || String(message.chatId),
      senderId: (message.senderId as Record<string, unknown>)?.value?.toString() || String(message.senderId),
      text: message.message as string || message.text as string || '',
      date: (message.date as number) * 1000,
      isOutgoing: false
    };

    this.emit('message', msg);

    // Auto-trigger agent if pattern matches
    if (this.triggerRegex && this.triggerRegex.test(msg.text) && this.config?.autoReply) {
      this._triggerAgent(msg);
    }
  }

  private async _triggerAgent(msg: TelegramMessage): Promise<void> {
    const agent = agentPool.spawn({
      task: msg.text,
      label: `Telegram: ${msg.text.slice(0, 50)}`
    });

    this.emit('agent:started', { agentId: agent.id, message: msg });

    agent.on('done', async (e) => {
      if (this.config?.autoReply && agent.result) {
        try {
          await this.sendMessage(msg.chatId, agent.result.slice(0, 4000));
        } catch (err) {
          console.error('[Telegram] Failed to send reply:', err);
        }
      }
      this.emit('agent:done', { agentId: agent.id, result: agent.result });
    });
  }

  status(): { connected: boolean; config?: Omit<TelegramConfig, 'session' | 'apiHash'> } {
    if (!this.config || !this.connected) return { connected: false };
    return {
      connected: true,
      config: {
        apiId: this.config.apiId,
        triggerPattern: this.config.triggerPattern,
        autoReply: this.config.autoReply
      }
    };
  }
}

export const telegramClient = new TelegramClient();
