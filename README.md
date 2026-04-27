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

### Milestones

| # | Milestone | Description |
|---|-----------|-------------|
| 1 | Electron/Angular shell | Main/renderer/preload, desktop shell, window manager, settings, theme |
| 2 | Host and SSH foundation | Host inventory, SQLite, SSH connection, terminal with xterm.js |
| 3 | Core operations apps | Host dashboard, file browser, process/service viewer, audit log |
| 4 | Bootstrap system | Bootstrap generator with presets, script preview |
| 5 | Agent integration | Agent endpoint, panel, structured state, approval flow, audit trail |
| 6 | App SDK and graphics | App manifest, launcher, UI library, graphics primitives, example app |

### Running

(To be configured once the shell is scaffolded.)

## License

Private project.
