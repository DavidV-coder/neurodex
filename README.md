# ⬡ NeuroDEX

**Sci-fi AI Terminal** — Full-featured AI CLI terminal with multi-model support, built on eDEX-UI aesthetic.

![NeuroDEX Screenshot](docs/screenshot.png)

## Features

### AI Models
| Provider | Models | Tools | Vision | Thinking |
|----------|--------|-------|--------|----------|
| Claude | Opus 4.6, Sonnet 4.6, Haiku 4.5 | ✓ | ✓ | ✓ |
| OpenAI | GPT-4o, o1, o3-mini | ✓ | ✓ | ✓ |
| Gemini | 2.0 Flash, 2.0 Pro | ✓ | ✓ | - |
| DeepSeek | V3, R1 (Reasoning) | ✓ | - | ✓ |
| Mistral | Large, Codestral | ✓ | - | - |
| Ollama | Any local model | ✓ | - | - |

### Tools Available to AI
- **Bash** — Execute shell commands (with permission system)
- **Read/Write/Edit** — File operations
- **Glob/Grep** — Code search
- **WebFetch** — Fetch web pages
- **TodoWrite** — Task management

### Security
- API keys stored in OS Keychain (macOS Keychain / Windows Credential Manager)
- AES-256-GCM fallback encryption for keys
- Path sandboxing — restricts file access to allowed directories
- Permission system — `allow/ask/deny` per tool category
- Dangerous command detection (prevents `rm -rf /`, etc.)
- Localhost-only Gateway (no external access without explicit config)
- Content Security Policy in Electron renderer

### UI
- Sci-fi terminal aesthetic (inspired by eDEX-UI / TRON Legacy)
- Real-time system monitoring (CPU, RAM, Network)
- Multi-tab terminal (xterm.js)
- Streaming AI responses with tool execution display
- Permission dialog for sensitive operations
- 5 built-in themes: TRON, MATRIX, AMBER, VIOLET, RED ALERT
- File browser with AI context integration

## Quick Start

```bash
# Clone
git clone https://github.com/DavidV-coder/neurodex
cd neurodex

# Setup (installs deps + configures API keys)
npm run setup

# Run
npm run dev

# Build
npm run build:mac   # macOS DMG
npm run build:linux # AppImage
npm run build:win   # Windows NSIS
```

## Configuration

Settings stored in `~/.config/NeuroDEX/`

```
~/.config/NeuroDEX/
├── settings.json    # App settings
├── vault.enc        # Encrypted API keys (fallback)
├── gateway.token    # Runtime gateway token (auto-generated)
└── sessions/        # Conversation history
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | Newline in input |
| `Ctrl+K` | Open model selector |
| `F11` | Toggle fullscreen |

## Architecture

```
NeuroDEX
├── Electron (Main Process)
│   ├── BrowserWindow — frameless, sci-fi UI
│   ├── Gateway lifecycle management
│   └── Secure IPC bridge (preload)
├── Gateway Server (Node.js WebSocket)
│   ├── JSON-RPC 2.0 protocol
│   ├── Session management
│   ├── Agentic loop (tool calls → model → tools → model...)
│   └── Permission bridge → UI
├── Model Registry
│   ├── Claude (Anthropic SDK)
│   ├── OpenAI (OpenAI SDK)
│   ├── Gemini (@google/generative-ai)
│   ├── DeepSeek (OpenAI-compatible)
│   ├── Mistral (OpenAI-compatible)
│   └── Ollama (REST API)
├── Tool System
│   ├── Bash, Read, Write, Edit, Glob, Grep
│   ├── WebFetch, TodoWrite
│   └── [MCP support coming]
├── Security Layer
│   ├── KeyVault (OS Keychain + AES-256-GCM fallback)
│   ├── Sandbox (path restrictions)
│   └── PermissionManager (approve/deny/remember)
└── UI (eDEX-inspired)
    ├── Agent Console (streaming chat + tool display)
    ├── Terminal (xterm.js, multi-tab)
    ├── System Monitor (CPU/RAM/Network)
    ├── File Browser
    └── Config Panel
```

## License

MIT — See [LICENSE](LICENSE)
