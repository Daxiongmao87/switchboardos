# SwitchboardOS

A local-first desktop operations environment for managing remote computers over SSH.

## Product Summary

SwitchboardOS provides a full application shell with overlapping and tiling windows,
desktop icons, host dashboards, terminals, file tools, logs, service/process views,
generated utility apps, themes, and responsive layouts.

The product is useful without AI. Its core value is a portable operations desktop
for remote hosts. An optional agent endpoint ("Operator") supercharges the environment
by inspecting structured window and app state, diagnosing host issues, generating
helper applications, assisting with bootstrap scripts, summarizing state, and
automating approved actions.

## Tech Stack

- **Electron** — Desktop runtime (privileged host operations, SSH transport,
  local filesystem access, OS keychain, IPC boundaries)
- **Angular + TypeScript** — Application shell and app platform
- **xterm.js** — Terminal rendering
- **Monaco Editor** — Built-in code editing
- **SQLite** — Local configuration database

## Architecture

The Electron main process owns all privileged operations. Renderers communicate
via typed IPC through a narrow preload layer. Every app exposes structured state
and actions for agent/automation consumption.

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

# Development: Angular dev server + Electron
npm run start:dev

# Production build
npm run build
npm run electron:build
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Build renderer + Electron, then launch |
| `npm run start:dev` | Angular dev server + Electron (hot reload) |
| `npm run build` | Build renderer and Electron bundles |
| `npm run build:renderer` | Build Angular app to `dist/switchboardos/` |
| `npm run build:electron` | Bundle Electron main/preload to `dist-electron/` |
| `npm run package` | Full build + package with electron-builder |
| `npm run electron:build` | Build distributables (NSIS, DMG, AppImage) |
| `npm run test` | Run Angular unit tests (Karma) |
| `npm run lint` | Run ESLint |

## License

Private project.
