# ⬡ NeuroDEX

**NeuroDEX** — sci-fi AI terminal for macOS. A full-featured alternative to OpenClaw, built with an eDEX-UI inspired interface. Works with Claude Code CLI subscription (no API key needed) and all major AI providers.

> **If OpenClaw stopped working for you — NeuroDEX is a drop-in replacement.**

---

## ✨ Features

### 🔗 AI Connections
- **Claude Code CLI** — use your Claude.ai subscription directly, **no API key needed**
- **Multi-model** — Claude API, OpenAI, Gemini, DeepSeek, Mistral, Ollama (local)
- Automatic provider detection on startup
- Token usage and cost tracking per session

### 💻 Interface
- eDEX-UI inspired sci-fi terminal aesthetic
- Real-time system monitor (CPU cores, RAM, Disk, Network KB/s, Processes)
- Split layout: system panel / AI chat / file browser + terminal
- Boot screen with live connection diagnostics
- Fullscreen support, frameless window

### 🤖 AI Agent Features
- Full agentic loop with tool use (Bash, Read, Write, Edit, Glob, Grep, Browser, Web)
- 35+ built-in slash commands (`/help`, `/commit`, `/review`, `/debug`, etc.)
- Background agents running in parallel
- Project memory (auto-recalls context per working directory)
- MCP (Model Context Protocol) server support
- Pre/post tool execution hooks

### 🛠️ System Tools
- Integrated PTY terminal (real bash/zsh shell)
- File browser with directory navigation
- **Mole integration** (tw93/mole) — Mac system health: ANALYZE / CLEAN / OPTIMIZE / PURGE
- System health dashboard with live metrics
- Process monitor (top 8 by CPU, updates every 2s)

### 🔒 Security
- OS Keychain for API keys (macOS Keychain / AES-256-GCM fallback)
- Permission system per tool category (allow / ask / deny)
- Sandboxed Electron with contextIsolation
- WebSocket gateway with auth token

---

## 🚀 Quick Start

### 1. Install Claude Code CLI (recommended — no API key needed)

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

### 2. Clone and run NeuroDEX

```bash
git clone https://github.com/DavidV-coder/neurodex.git
cd neurodex
npm install
npm run build:ts
npm start
```

### 3. First launch

The boot screen checks all connections automatically:

```
[INIT] NeuroDEX v1.0.0
[GATEWAY] Connecting to local gateway... OK
[CLI] Detecting Claude Code CLI... FOUND (v2.1.92)
[MODEL] Default: Claude Sonnet (Subscription)
[READY] All systems operational
```

Claude Code CLI is selected automatically — no further setup needed.

---

## ⚙️ Configuration

### Claude Code CLI (recommended)
```bash
npm install -g @anthropic-ai/claude-code
claude login      # opens browser → log in with claude.ai account
claude --version  # verify
```

In NeuroDEX: `Ctrl+K` → **Claude Sonnet (Subscription)** or **Claude Opus (Subscription)**

### API Keys (optional)
`Ctrl+,` → **API KEYS** tab → paste your key:

| Provider | Key format |
|----------|-----------|
| Claude (Anthropic) | `sk-ant-...` |
| OpenAI | `sk-...` |
| Gemini | `AIza...` |
| DeepSeek | `sk-...` |
| Mistral | `...` |

Keys stored in macOS Keychain.

### Local Models (Ollama)
```bash
brew install ollama
ollama pull llama3.3   # or qwen2.5-coder, codestral, etc.
# NeuroDEX auto-detects at localhost:11434
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Select model |
| `Ctrl+,` | Open settings |
| `Ctrl+L` | Clear chat |
| `Ctrl+N` | New session |
| `Ctrl+B` | Background agents |
| `Ctrl+M` | Project memory |
| `F11` | Fullscreen |
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `/help` | List all skills |

---

## 🛠️ Built-in Slash Commands

```
/help         list all skills
/commit       AI-generated git commit message
/review       code review
/debug        debug assistant
/test         run tests
/explain      explain selected code
/refactor     refactor code
/docs         generate documentation
/search       web search
/summarize    summarize content
/translate    translate text
/agents       list/manage background agents
/memory       project memory operations
/mole         system maintenance (clean/analyze/optimize)
+ 20 more...
```

---

## 🆚 NeuroDEX vs OpenClaw

| Feature | OpenClaw | NeuroDEX |
|---------|----------|----------|
| Claude Code CLI (subscription) | ✅ | ✅ |
| Multi-model support | ❌ | ✅ 6 providers |
| Local models (Ollama) | ❌ | ✅ |
| Background agents | ✅ | ✅ |
| Real-time system monitor | ❌ | ✅ |
| PTY Terminal | ✅ | ✅ |
| MCP server support | ✅ | ✅ |
| Telegram integration | ❌ | ✅ |
| System maintenance (Mole) | ❌ | ✅ |
| Open source | ❌ | ✅ MIT |

---

## 🏗️ Architecture

```
neurodex/
├── electron/           Electron main process + preload
├── src/
│   ├── gateway/        WebSocket JSON-RPC 2.0 server (port 18789)
│   ├── models/         AI adapters
│   │   ├── claudeCode.ts   Claude Code CLI (subscription)
│   │   ├── claude.ts       Anthropic SDK
│   │   ├── openai.ts       OpenAI SDK
│   │   ├── gemini.ts       Google Gemini
│   │   ├── deepseek.ts     DeepSeek
│   │   └── ollama.ts       Ollama REST
│   ├── tools/          AI tools (Bash, Read, Write, Browser, Mole...)
│   ├── agents/         Background agent runner
│   ├── sessions/       Session management + compaction
│   ├── skills/         Slash command registry (35+ skills)
│   ├── memory/         Project memory (JSON store)
│   ├── mcp/            MCP stdio client
│   ├── hooks/          Pre/post hooks system
│   ├── security/       Permissions + OS keychain
│   └── telemetry/      Live system metrics (systeminformation)
└── ui/                 Frontend — vanilla JS + xterm.js
```

### How Claude Code CLI subscription works

NeuroDEX runs `claude --print --output-format stream-json --verbose` as a subprocess and parses the NDJSON stream. Uses your Claude.ai subscription — same billing as regular Claude Code, zero additional API key required.

---

## 📋 Requirements

- **macOS 12+** (Apple Silicon M1/M2/M3 or Intel)
- **Node.js 18+**
- **Claude Code CLI** `npm install -g @anthropic-ai/claude-code` — OR any API key

---

## 📄 License

MIT — free to use, modify, distribute.

---

**Built for the community. If OpenClaw stopped working — NeuroDEX has you covered. ⬡**
