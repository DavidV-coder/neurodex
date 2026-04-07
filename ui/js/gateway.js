/**
 * NeuroDEX Gateway Client — WebSocket JSON-RPC 2.0
 */

class GatewayClient extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.port = 18789;
    this.token = null;
    this.pendingRequests = new Map();
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 15000;
    this.connected = false;
    this._msgId = 0;
    this._connecting = false;
    this._reconnectTimer = null;
  }

  async connect(port, token) {
    this.port = port;
    this.token = token;
    return this._connect();
  }

  _connect() {
    if (this._connecting) return Promise.resolve();
    this._connecting = true;

    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${this.port}`;
      let settled = false;

      const done = (err) => {
        if (settled) return;
        settled = true;
        this._connecting = false;
        clearTimeout(connTimeout);
        if (err) reject(err); else resolve();
      };

      const connTimeout = setTimeout(() => {
        this.ws?.close();
        done(new Error('Gateway connection timeout'));
      }, 5000);

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        done(e);
        return;
      }

      this.ws.onopen = async () => {
        try {
          await this._call('auth.login', { token: this.token });
          this.connected = true;
          this.reconnectDelay = 1000;
          this.dispatchEvent(new Event('connected'));
          done(null);
        } catch (err) {
          done(err);
        }
      };

      this.ws.onmessage = (event) => this._handleMessage(event.data);

      this.ws.onclose = () => {
        const wasConnected = this.connected;
        this.connected = false;
        this._connecting = false;
        if (wasConnected) {
          this.dispatchEvent(new Event('disconnected'));
          this._scheduleReconnect();
        }
        // If we never connected, done() already called via timeout or onerror
      };

      this.ws.onerror = () => {
        // onerror is always followed by onclose — just settle the promise
        done(new Error('WebSocket error'));
      };
    });
  }

  _handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.id !== null && msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
        return;
      }
    }

    if (msg.result?.type) {
      this.dispatchEvent(new CustomEvent('event', { detail: msg.result }));
    }
  }

  // Internal call — no readyState guard (used in auth before connected=true)
  _call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this._msgId;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 10000); // 10s for internal calls

      this.pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  // Wait until connected (or timeout)
  waitForConnection(timeoutMs = 8000) {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeEventListener('connected', onConnect);
        reject(new Error('Gateway not connected'));
      }, timeoutMs);
      const onConnect = () => { clearTimeout(timer); resolve(); };
      this.addEventListener('connected', onConnect, { once: true });
    });
  }

  // Public call — waits for connection, then sends
  call(method, params = {}) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return this.waitForConnection(6000).then(() => this.call(method, params));
    }
    return new Promise((resolve, reject) => {
      const id = ++this._msgId;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 30000); // 30s for user calls

      this.pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  _scheduleReconnect() {
    if (this._reconnectTimer || this._connecting) return;
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
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
