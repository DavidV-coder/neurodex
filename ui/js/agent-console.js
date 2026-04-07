/**
 * NeuroDEX Agent Console
 * Chat interface with streaming, tool display, and permission handling.
 */

class AgentConsole {
  constructor() {
    this.sessionId = 'main';
    this.currentModel = { provider: 'claude', model: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' };
    this.isStreaming = false;
    this.streamingEl = null;
    this.toolStreamItems = new Map();

    this.$messages = document.getElementById('chat-messages');
    this.$input = document.getElementById('chat-input');
    this.$toolStream = document.getElementById('tool-stream');
    this.$permDialog = document.getElementById('permission-dialog');
    this.$btnSend = document.getElementById('btn-send');

    this._initEvents();
    this._listenGatewayEvents();
  }

  _initEvents() {
    this.$btnSend.addEventListener('click', () => this._send());

    this.$input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
      // Auto-resize
      setTimeout(() => this._resizeInput(), 0);
    });

    this.$input.addEventListener('input', () => this._resizeInput());

    document.getElementById('btn-clear-chat').addEventListener('click', async () => {
      await gateway.call('sessions.clear', { id: this.sessionId });
      this.$messages.innerHTML = '';
      this._appendSystemMsg('Chat cleared.');
    });

    document.getElementById('btn-new-session').addEventListener('click', async () => {
      const session = await gateway.call('sessions.create', {
        config: { provider: this.currentModel.provider, model: this.currentModel.model }
      });
      this.sessionId = session.id;
      this.$messages.innerHTML = '';
      this._appendSystemMsg(`New session: ${session.id.slice(0, 8)}...`);
    });

    document.getElementById('btn-model-select').addEventListener('click', () => {
      window.modelSelector?.show();
    });
  }

  _resizeInput() {
    this.$input.style.height = 'auto';
    this.$input.style.height = Math.min(this.$input.scrollHeight, 160) + 'px';
  }

  _listenGatewayEvents() {
    gateway.addEventListener('event', (e) => {
      const data = e.detail;
      switch (data.type) {
        case 'chat.stream.chunk':
          if (data.sessionId === this.sessionId) this._handleChunk(data.chunk);
          break;
        case 'chat.stream.start':
          if (data.sessionId === this.sessionId) this._onStreamStart();
          break;
        case 'chat.stream.done':
          if (data.sessionId === this.sessionId) this._onStreamDone();
          break;
        case 'chat.tool.start':
          if (data.sessionId === this.sessionId) this._onToolStart(data);
          break;
        case 'chat.tool.done':
          if (data.sessionId === this.sessionId) this._onToolDone(data);
          break;
        case 'permission.request':
          this._showPermissionDialog(data.request);
          break;
      }
    });
  }

  async _send() {
    let text = this.$input.value.trim();
    if (!text || this.isStreaming) return;

    // Handle slash commands → skills
    if (text.startsWith('/')) {
      const [trigger, ...rest] = text.slice(1).split(' ');
      const input = rest.join(' ').trim() || undefined;
      await this._runSkill(trigger, input);
      this.$input.value = '';
      this._resizeInput();
      return;
    }

    this.$input.value = '';
    this._resizeInput();

    // Add user message
    this._appendUserMsg(text);

    // Show streaming state
    this.isStreaming = true;
    this.$btnSend.classList.add('loading');
    this.$btnSend.textContent = '...';

    // Create assistant message placeholder
    this.streamingEl = this._appendAssistantMsg('');
    this.streamingEl.querySelector('.msg-bubble').innerHTML = '<span class="streaming-cursor"></span>';

    this.$toolStream.classList.add('hidden');
    this.toolStreamItems.clear();

    // Update session model config
    await gateway.call('sessions.config', {
      id: this.sessionId,
      config: { provider: this.currentModel.provider, model: this.currentModel.model }
    }).catch(() => {});

    try {
      await gateway.call('chat.send', {
        sessionId: this.sessionId,
        message: text
      });
    } catch (err) {
      this._appendError(err.message);
    } finally {
      this.isStreaming = false;
      this.$btnSend.classList.remove('loading');
      this.$btnSend.textContent = 'SEND';
      this.$toolStream.classList.add('hidden');
    }
  }

  _onStreamStart() {
    // Reset the streaming element text
    if (this.streamingEl) {
      this.streamingEl.querySelector('.msg-bubble').innerHTML = '<span class="streaming-cursor"></span>';
      this._currentStreamText = '';
      this._currentThinkingText = '';
    }
    this._currentStreamText = '';
    this._currentThinkingText = '';
  }

  _handleChunk(chunk) {
    if (!this.streamingEl) return;
    const bubble = this.streamingEl.querySelector('.msg-bubble');

    if (chunk.type === 'text') {
      this._currentStreamText = (this._currentStreamText || '') + chunk.text;
      bubble.innerHTML = this._renderMarkdown(this._currentStreamText) + '<span class="streaming-cursor"></span>';
      this._scrollToBottom();
    } else if (chunk.type === 'thinking') {
      // Show thinking separately
      let thinkingEl = this.streamingEl.querySelector('.thinking-block');
      if (!thinkingEl) {
        thinkingEl = document.createElement('div');
        thinkingEl.className = 'chat-msg chat-msg-thinking';
        thinkingEl.innerHTML = '<div class="msg-label msg-label-thinking">THINKING</div><div class="msg-bubble thinking-bubble"></div>';
        this.streamingEl.parentNode.insertBefore(thinkingEl, this.streamingEl);
      }
      this._currentThinkingText = (this._currentThinkingText || '') + chunk.thinking;
      thinkingEl.querySelector('.thinking-bubble').textContent = this._currentThinkingText;
    }
  }

  _onStreamDone() {
    if (this.streamingEl) {
      const bubble = this.streamingEl.querySelector('.msg-bubble');
      const cursor = bubble.querySelector('.streaming-cursor');
      if (cursor) cursor.remove();
      if (this._currentStreamText) {
        bubble.innerHTML = this._renderMarkdown(this._currentStreamText);
        // Syntax highlight code blocks
        bubble.querySelectorAll('pre code').forEach(el => {
          if (window.hljs) hljs.highlightElement(el);
        });
      }
      this.streamingEl = null;
      this._currentStreamText = '';
    }
    this._scrollToBottom();
    // Update token counter
    this._updateTokens();
  }

  _onToolStart(data) {
    this.$toolStream.classList.remove('hidden');
    const item = document.createElement('div');
    item.className = 'tool-call';
    item.innerHTML = `
      <span class="tool-call-icon">⚙</span>
      <span class="tool-call-name">${this._escapeHtml(data.tool)}</span>
      <span class="tool-call-status running">RUNNING</span>
    `;
    this.$toolStream.appendChild(item);
    this.toolStreamItems.set(data.toolId, item);
    this._scrollToBottom();
  }

  _onToolDone(data) {
    const item = this.toolStreamItems.get(data.toolId);
    if (item) {
      const status = item.querySelector('.tool-call-status');
      status.classList.remove('running');
      if (data.result?.success) {
        status.classList.add('done');
        status.textContent = 'DONE';
      } else {
        status.classList.add('error');
        status.textContent = 'ERROR';
      }
    }
  }

  _showPermissionDialog(request) {
    this.$permDialog.classList.remove('hidden');
    this.$permDialog.innerHTML = `
      <div class="permission-title">⚠ PERMISSION REQUIRED</div>
      <div class="permission-desc">${this._escapeHtml(request.description)}</div>
      ${request.args.command ? `<div class="permission-cmd">${this._escapeHtml(String(request.args.command))}</div>` : ''}
      <div class="permission-btns">
        <button class="perm-btn perm-btn-allow" data-id="${request.id}" data-action="allow">✓ ALLOW</button>
        <button class="perm-btn perm-btn-allow" data-id="${request.id}" data-action="allow-always">✓ ALWAYS ALLOW</button>
        <button class="perm-btn perm-btn-deny" data-id="${request.id}" data-action="deny">✕ DENY</button>
      </div>
    `;

    this.$permDialog.querySelectorAll('.perm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        gateway.call('permissions.respond', {
          id,
          granted: action !== 'deny',
          remember: action === 'allow-always'
        }).catch(() => {});
        this.$permDialog.classList.add('hidden');
        this.$permDialog.innerHTML = '';
      });
    });
  }

  _appendUserMsg(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg-user';
    el.innerHTML = `
      <div class="msg-label msg-label-user">YOU</div>
      <div class="msg-bubble">${this._escapeHtml(text)}</div>
    `;
    this.$messages.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  _appendAssistantMsg(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg-assistant';
    el.innerHTML = `
      <div class="msg-label msg-label-assistant">⬡ NEURODEX [${this.currentModel.displayName}]</div>
      <div class="msg-bubble">${text ? this._renderMarkdown(text) : ''}</div>
    `;
    this.$messages.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  _appendSystemMsg(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg';
    el.innerHTML = `<div class="msg-bubble" style="color:var(--color-text-dim);font-size:10px;letter-spacing:1px;">${this._escapeHtml(text)}</div>`;
    this.$messages.appendChild(el);
    this._scrollToBottom();
  }

  _appendError(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg';
    el.innerHTML = `<div class="msg-bubble" style="border-left-color:var(--color-error);color:var(--color-error)">ERROR: ${this._escapeHtml(text)}</div>`;
    this.$messages.appendChild(el);
    this._scrollToBottom();
  }

  _renderMarkdown(text) {
    if (window.marked) {
      return marked.parse(text, { breaks: true, gfm: true });
    }
    return this._escapeHtml(text).replace(/\n/g, '<br>');
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _scrollToBottom() {
    this.$messages.scrollTop = this.$messages.scrollHeight;
  }

  async _updateTokens() {
    try {
      const session = await gateway.call('sessions.get', { id: this.sessionId });
      document.getElementById('tokens-in').textContent = session.totalInputTokens.toLocaleString();
      document.getElementById('tokens-out').textContent = session.totalOutputTokens.toLocaleString();
    } catch { /**/ }
  }

  async _runSkill(trigger, input) {
    this._appendSystemMsg(`⚡ Running skill: /${trigger}${input ? ` ${input}` : ''}`);
    this.isStreaming = true;
    this.$btnSend.classList.add('loading');
    this.$btnSend.textContent = '...';
    this.streamingEl = this._appendAssistantMsg('');
    this.streamingEl.querySelector('.msg-bubble').innerHTML = '<span class="streaming-cursor"></span>';
    this._currentStreamText = '';

    try {
      const result = await gateway.call('skills.run', {
        trigger, input, sessionId: this.sessionId
      });
      if (result?.needsInput) {
        this._appendSystemMsg(`💬 ${result.hint || 'Please provide input for this skill'}`);
        document.getElementById('chat-input').placeholder = result.hint || 'Enter input...';
        this.pendingSkill = trigger;
      }
    } catch (err) {
      this._appendError(err.message);
    } finally {
      this.isStreaming = false;
      this.$btnSend.classList.remove('loading');
      this.$btnSend.textContent = 'SEND';
    }
  }

  setModel(provider, model, displayName) {
    this.currentModel = { provider, model, displayName };
    document.getElementById('ai-provider').textContent = provider.toUpperCase();
    document.getElementById('ai-provider').className = `sysinfo-value ai-badge online`;
    document.getElementById('ai-model').textContent = displayName;
  }
}

window.agentConsole = null; // initialized in app.js
