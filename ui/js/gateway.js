/**
 * NeuroDEX Gateway Client
 * WebSocket JSON-RPC 2.0 client for renderer process.
 */

class GatewayClient extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.port = 18789;
    this.token = null;
    this.pendingRequests = new Map();
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.connected = false;
    this._msgId = 0;
  }

  async connect(port, token) {
    this.port = port;
    this.token = token;
    return this._connect();
  }

  _connect() {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${this.port}`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        this.ws.close();
        reject(new Error('Gateway connection timeout'));
      }, 5000);

      this.ws.onopen = async () => {
        clearTimeout(timeout);
        try {
          await this._authenticate();
          this.connected = true;
          this.reconnectDelay = 1000;
          this.dispatchEvent(new Event('connected'));
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      this.ws.onmessage = (event) => this._handleMessage(event.data);

      this.ws.onclose = () => {
        this.connected = false;
        this.dispatchEvent(new Event('disconnected'));
        this._scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        this.dispatchEvent(new CustomEvent('error', { detail: err }));
        reject(err);
      };
    });
  }

  async _authenticate() {
    await this.call('auth.login', { token: this.token });
  }

  _handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // RPC response
    if (msg.id !== null && msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
        return;
      }
    }

    // Server-pushed event (result.type)
    if (msg.result?.type) {
      this.dispatchEvent(new CustomEvent('event', { detail: msg.result }));
    }
  }

  call(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected to gateway'));
    }

    return new Promise((resolve, reject) => {
      const id = ++this._msgId;
      this.pendingRequests.set(id, { resolve, reject });

      // Timeout individual calls
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 60000);

      // Wrap resolve/reject to clear timeout
      const origResolve = resolve;
      const origReject = reject;
      this.pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timeout); origResolve(v); },
        reject: (e) => { clearTimeout(timeout); origReject(e); }
      });

      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this._connect();
      } catch {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this._scheduleReconnect();
      }
    }, this.reconnectDelay);
  }
}

window.gateway = new GatewayClient();
