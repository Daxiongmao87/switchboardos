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
  a configurable port and backend-owned API surfaces
- **Angular + TypeScript** — Application shell and app platform
- **xterm.js** — Terminal rendering
- **Monaco Editor** — Built-in code editing
- **SQLite** — Local configuration database

## Architecture

The Electron main process owns privileged operations in desktop mode. In hosted
web mode, an equivalent SwitchboardOS backend owns those operations and serves
browser clients over HTTP/WebSocket APIs on a configurable port. MVP test/LAN
mode does not require access-token login; session auth remains an explicit
opt-in backend mode.
Renderers communicate via typed IPC or typed web APIs through narrow boundaries.
Every app exposes structured state and actions for agent/automation consumption.

## Design Document

See [docs/spec/switchboardos-design-doc.md](docs/spec/switchboardos-design-doc.md)
for the full design specification.
UX-facing work is also governed by
[docs/spec/switchboardos-ux-principles.md](docs/spec/switchboardos-ux-principles.md).

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

### Versioning and Release Workflow

SwitchboardOS follows [Semantic Versioning 2.0.0](https://semver.org/) for
release decisions. The source-of-truth package version is `package.json`.

Classify every validated change before commit, tag, package, or hosted release:

- **MAJOR**: incompatible changes to a public or persisted contract after
  `1.0.0`. Before `1.0.0`, record the breaking-change classification in the
  task/validation report and increment the `0.MINOR.0` line for a release.
- **MINOR**: backward-compatible capabilities, routes, applet/platform
  contracts, UI workflows, hosted APIs, IPC/preload API additions, SDK/manifest
  additions, or other new user-visible functionality.
- **PATCH**: backward-compatible bug fixes, security hardening that does not
  remove or break a public contract, documentation corrections, tests, smoke
  checks, and validation-only changes.
- **Prerelease/build metadata**: use SemVer prerelease identifiers such as
  `-alpha.N`, `-beta.N`, or `-rc.N` for release-candidate builds, and build
  metadata such as `+build.N` only for trace labels that do not change ordering.

Public contracts include Electron IPC channels, hosted HTTP/SSE/WebSocket APIs,
preload APIs, applet manifests, app/action/context-menu contracts, persisted
workspace/config/audit shapes, npm scripts used by operators, package outputs,
and documented user workflows.

Every development or validation closeout must include:

- SemVer classification: `major`, `minor`, `patch`, `prerelease`, or
  `no-version-change`.
- Proposed next version when the change is release-bound.
- The public contract or user workflow that controls the classification.
- The validation evidence that supports the classification.

Do not bump `package.json` for every internal development slice. Bump it in the
same change that prepares a release candidate, package, tag, or shipped hosted
build.

### Hosted LAN Availability Gate

After each validated commit that refreshes the hosted product path, keep the
latest committed build reachable on the LAN unless a concrete blocker is
recorded. The active daemon must be identified by tmux session name, port, LAN
URL, and authentication mode.

The availability check must verify:

- A listener on `0.0.0.0:<port>`.
- `GET /` on the LAN URL returns the hosted app shell without token login.
- `GET /api/auth/session` on the LAN URL returns HTTP 200 with
  `loginRequired: false` and `authenticated: true` in MVP test mode.
- The hosted `main.js` bundle returns HTTP 200.
- A state-changing hosted API smoke succeeds without access-token, session
  cookie, or CSRF headers while policy and audit enforcement remain active.

If the latest hosted daemon is down and no newer validation daemon is already
running, start a new daemon for the latest committed build without stopping
unrelated services. Record the exact tmux session, command environment, port,
LAN URL, authentication mode, and verification results in the task report.

## License

Private project.
