# SwitchboardOS — Task Board

## Milestone 1: Electron/Angular Shell (Sprint 1-2)

| ID | Task | Owner | Status |
|---|---|---|---|
| e90f4f55 | M1.1 — Project scaffolding: Angular + Electron, main/renderer/preload, package.json, tsconfig, build config | implementer | **DONE** |
| 0c2cc4aa | M1.2 — Desktop shell: basic shell UI, taskbar/dock, desktop background, command palette stub | implementer | pending |
| 8f1362b2 | M1.3 — Window manager prototype: floating windows with drag, resize, minimize/maximize/close, z-index | shell-dev | pending |
| 50d81b45 | M1.4 — Settings storage: local preference storage service, user preferences model | tech-lead | pending |
| 86f75746 | M1.5 — Theme system: dark/light mode toggle, theme tokens, CSS-based theming | shell-dev | pending |

### M1 Tests

| ID | Task | Owner | Status |
|---|---|---|---|
| c188eb5e | M1.UT — Unit tests for M1.1 (scaffold) | test-engineer | pending |
| ee5fc68f | M1.UT — Unit tests for M1.4 (settings) | test-engineer | pending |
| 1d381131 | M1.IT — Integration tests for M1 | test-engineer | pending |
| d2d7f336 | M1.RT — Regression test suite for M1 | test-engineer | pending |

## Milestone 2: Host and SSH Foundation (Sprint 3-4)

| ID | Task | Owner | Status |
|---|---|---|---|
| d3da4bee | M2.1 — Host inventory: add/edit/delete SSH host, host profile model | ssh-dev | pending |
| 89fadac5 | M2.2 — SQLite persistence: local database with all tables | ssh-dev | pending |
| 394e5883 | M2.3 — SSH service: internal SSH provider interface, ssh2 integration | ssh-dev | pending |
| cb0339ca | M2.4 — Terminal with xterm.js: SSH shell streaming, PTY communication | ssh-dev | pending |

### M2 Tests

| ID | Task | Owner | Status |
|---|---|---|---|
| 22d4a733 | M2.UT — Unit tests for M2.1 (host inventory) | test-engineer | pending |
| c58d7ba5 | M2.UT — Unit tests for M2.2 (SQLite) | test-engineer | pending |
| cb2fd74c | M2.UT — Unit tests for M2.3 (SSH service) | test-engineer | pending |
| 322a8a2b | M2.IT — Integration tests for M2 | test-engineer | pending |
| 4bb0257a | M2.RT — Regression test suite for M2 | test-engineer | pending |

## Milestone 3: Core Operations Apps (Sprint 5-6)

| ID | Task | Owner | Status |
|---|---|---|---|
| ef92c6ab | M3.1 — Host dashboard: real-time host status, quick actions, filtering | ops-dev | pending |
| ccfe9c53 | M3.2 — File browser: SSH file operations, directory navigation | ops-dev | pending |
| 00a005e1 | M3.3 — Process viewer: SSH process listing, kill process | ops-dev | pending |
| 898e0df1 | M3.4 — Service viewer: SSH service listing, start/stop/restart | ops-dev | pending |
| b972dccf | M3.5 — Audit log: capture all user actions, filtering, export | ops-dev | pending |
| cdbacdef | M3.6 — Bootstrap generator: script generation from presets, Monaco preview | ops-dev | pending |

### M3 Tests

| ID | Task | Owner | Status |
|---|---|---|---|
| 7eac645e | M3.UT — Unit tests for M3 | test-engineer | pending |
| a387968e | M3.IT — Integration tests for M3 | test-engineer | pending |
| 92356df6 | M3.RT — Regression test suite for M3 | test-engineer | pending |

## Milestone 4: Bootstrap System (Sprint 7)

| ID | Task | Owner | Status |
|---|---|---|---|
| 8f6db2f4 | M4.1 — Bootstrap system: generator with presets, state machine | ops-dev | pending |

### M4 Tests

| ID | Task | Owner | Status |
|---|---|---|---|
| eefcffa7 | M4.UT — Unit tests for M4 | test-engineer | pending |
| 3d7f4a34 | M4.IT — Integration tests for M4 | test-engineer | pending |
| aaca52c4 | M4.RT — Regression test suite for M4 | test-engineer | pending |

## Milestone 5: Agent Integration (Sprint 8-9)

| ID | Task | Owner | Status |
|---|---|---|---|
| 03135b96 | M5.1 — Agent endpoint: structured state API, agent panel, approval flow | ops-dev | pending |
| 505c12b6 | M5.2 — Agent integration: agent endpoint protocol, state subscription | ops-dev | pending |

### M5 Tests

| ID | Task | Owner | Status |
|---|---|---|---|
| a28dbb3b | M5.UT — Unit tests for M5 | test-engineer | pending |
| fb1531be | M5.IT — Integration tests for M5 | test-engineer | pending |
| cd9b189c | M5.RT — Regression test suite for M5 | test-engineer | pending |

## Milestone 6: App SDK and Graphics (Sprint 10)

| ID | Task | Owner | Status |
|---|---|---|---|
| 1a86bccf | M6.1 — App SDK: app manifest, launcher, IPC contracts, example app | ops-dev | pending |
| 8646dd08 | M6.2 — Graphics/UI library: SVG/CSS primitives, responsive layout | ops-dev | pending |

### M6 Tests

| ID | Task | Owner | Status |
|---|---|---|---|
| 9a163cf6 | M6.UT — Unit tests for M6 | test-engineer | pending |
| 2ad8294a | M6.IT — Integration tests for M6 | test-engineer | pending |
| 238b5828 | M6.RT — Regression test suite for M6 | test-engineer | pending |

## Documentation

| ID | Task | Owner | Status |
|---|---|---|---|
| 518a1eef | README: project setup instructions, developer onboarding | tech-lead | pending |

## Team Assignment Summary

| Member | Responsibilities |
|---|---|
| **implementer** | All M1-M6 implementation code |
| **validator** | Code review, validation, quality checks |

## Execution Order (Sequential — implementer builds, validator reviews)

### Milestone 1:
1. **M1.1** (implementer) → foundation for everything ✅ DONE
2. **M1.2** (implementer) → desktop shell UI
3. **M1.4** (implementer) → settings storage
4. **M1.5** (implementer) → theme system
5. **M1.3** (implementer) → window manager
6. **validator** reviews all M1 code after each milestone
7. **M1.UT/IT/RT** (validator) → test validation after all M1 code done

### Milestone 2:
1. **M2.1** (ssh-dev) → host model
2. **M2.2** (ssh-dev) → SQLite persistence
3. **M2.3** (ssh-dev) → SSH service (depends on M2.1 + M2.2)
4. **M2.4** (ssh-dev) → terminal (depends on M2.3)
5. **M2.UT/IT/RT** (test-engineer) → after all M2 code done

### Milestone 3:
1. **M3.1** (ops-dev) → host dashboard
2. **M3.2** (ops-dev) → file browser (depends on M2.3)
3. **M3.3** (ops-dev) → process viewer
4. **M3.4** (ops-dev) → service viewer
5. **M3.5** (ops-dev) → audit log
6. **M3.6** (ops-dev) → bootstrap generator
7. **M3.UT/IT/RT** (test-engineer) → after all M3 code done

### Milestone 4-6:
Sequential as above, with tests after each milestone.
