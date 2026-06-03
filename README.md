# SwitchboardOS

A local-first desktop and web-accessible operations environment for managing
remote computers over SSH.

## Product Summary

SwitchboardOS provides a full application shell with overlapping and tiling windows,
desktop icons, host dashboards, terminals, file tools, logs, service/process views,
generated utility apps, themes, and responsive layouts.

SwitchboardOS should also support an optional hosted mode that serves the UI and
backend API on a configurable local or LAN port. This makes the same operations
environment accessible from a browser while keeping privileged SSH, filesystem,
secret, policy, and audit operations behind the SwitchboardOS backend.

The product is useful without AI. Its core value is a portable operations desktop
for remote hosts. An optional agent endpoint ("Operator") supercharges the environment
by inspecting structured window and app state, diagnosing host issues, generating
helper applications, assisting with bootstrap scripts, summarizing state, and
automating approved actions.

## Tech Stack

- **Electron** — Desktop runtime (privileged host operations, SSH transport,
  local filesystem access, OS keychain, IPC boundaries)
- **Hosted web mode** — Optional local/LAN web server for browser access through
  a configurable port and authenticated backend API
- **Angular + TypeScript** — Application shell and app platform
- **xterm.js** — Terminal rendering
- **Monaco Editor** — Built-in code editing
- **SQLite** — Local configuration database

## Architecture

The Electron main process owns privileged operations in desktop mode. In hosted
web mode, an equivalent SwitchboardOS backend owns those operations and serves
browser clients over authenticated HTTP/WebSocket APIs on a configurable port.
Renderers communicate via typed IPC or typed web APIs through narrow boundaries.
Every app exposes structured state and actions for agent/automation consumption.

## Design Document

See [docs/spec/switchboardos-design-doc.md](docs/spec/switchboardos-design-doc.md)
for the full design specification.

## Project Structure

```
switchboardos/
├── docs/spec/          # Design documents and specs
├── src/                # Source code (Angular + Electron)
│   ├── main/           # Electron main process
│   ├── renderer/       # Angular renderer
│   └── preload/        # IPC bridge
├── tests/              # Unit, integration, and regression tests
├── specs/              # Implementation specs (spec-driven development)
└── docs/               # Documentation
```

## Development

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Git

### Getting Started

```bash
# Install dependencies
npm install

# Development: TypeScript compiler + Electron
npm run start

# Production build
npm run build
npm run electron:package
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Build TypeScript, then launch Electron |
| `npm run build` | Build TypeScript only (`tsc`) |
| `npm run build:ts` | Alias for `tsc` |
| `npm run lint` | Run ESLint |
| `npm run electron:package` | Build Electron distributables |
| `npm test` | Run Angular unit tests (Karma) |

## License

Private project.
