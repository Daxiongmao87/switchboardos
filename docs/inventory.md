# SwitchboardOS - Implementation Inventory

## Project Overview
- **Name**: SwitchboardOS
- **Type**: Electron + Angular desktop application
- **Electron**: 38.x | **Angular**: 20.x | **TypeScript**: Strict mode
- **Build**: npm scripts + Angular CLI + electron-builder
- **Platform**: Cross-platform (Win32, Darwin, Linux)
- **Package Manager**: npm 11.6.4

---

## Implementation Surfaces

### 1. Main Process — `src/main/main.ts`
**Purpose**: Electron main process entry point handling window lifecycle, system tray, auto-updater, and protocol handler.

| Area | Details |
|------|---------|
| **Window Lifecycle** | `ready` → create browser window (800x600, dark theme #1a1a2e), `window-all-closed` → quit on non-macOS, `activate` → recreate window on macOS |
| **AutoUpdater** | Deferred `checkForUpdates` calls (TODO stubs), no actual update logic implemented yet |
| **System Tray** | Tray icon created from `linux.png`, context menu with "SwitchboardOS" and "Quit" |
| **Protocol Handler** | Registers `switchboard://` deep-link protocol via `app.setAsDefaultProtocolClient` |
| **IPC** | No IPC handlers defined yet (preload exposes empty API) |

### 2. Preload Script — `src/preload/preload.ts`
**Purpose**: Bridge between main and renderer processes with context isolation.

| Area | Details |
|------|---------|
| **Context Bridge** | `contextBridge.exposeInMainWorld` with `isBrowser: true` |
| **API Surface** | `window.switchboardAPI` currently empty (`{}`) |
| **Security** | Uses `contextIsolation: true`, `nodeIntegration: false` — good security posture |

### 3. Renderer — `src/renderer/app/`
**Purpose**: Angular 20 application with 4 components and 2 services.

#### Components
| Component | File | Status |
|-----------|------|--------|
| `AppComponent` | `app.component.ts` | Skeleton — title="switchboardos", no template |
| `DashboardComponent` | `dashboard/dashboard.component.ts` | Skeleton — selector `app-dashboard`, no template |
| `LoginComponent` | `login/login.component.ts` | Form with email/password fields, submit handler (stub) |
| `SettingsComponent` | `settings/settings.component.ts` | Skeleton — selector `app-settings`, no template |

#### Services
| Service | File | Status |
|---------|------|--------|
| `AuthService` | `auth.service.ts` | `login()`, `logout()` methods — stubbed implementations |
| `SessionManagerService` | `session-manager.service.ts` | `initSession()`, `endSession()`, `refreshSession()` — stubbed |

#### Module
| Module | File |
|--------|------|
| `AppModule` | `app.module.ts` (declares all components and services) |

### 4. Configuration Files
| File | Purpose |
|------|---------|
| `package.json` | Project metadata, dependencies, npm scripts |
| `tsconfig.json` | TypeScript config with path aliases (`@main/*`, `@preload/*`, `@app/*`) |
| `angular.json` | Angular CLI workspace config |
| `electron-builder.yml` | Electron packaging config |
| `.gitignore` | Git ignore rules |
| `electron.vite.dev.json` | Vite config (mismatched — project uses Angular CLI, not Vite) |
| `electron.vite.prod.json` | Vite config (mismatched — project uses Angular CLI, not Vite) |

### 5. Test Files
| File | Purpose |
|------|---------|
| `src/renderer/app/app.component.spec.ts` | AppComponent unit tests (skeleton) |
| `test-project/test-runner.py` | Empty Python test runner file |

### 6. Scripts
| File | Purpose |
|------|---------|
| `scripts/build.sh` | Empty build script |
| `scripts/deploy.sh` | Empty deploy script |

### 7. Assets
| File | Purpose |
|------|---------|
| `public/electron.js` | Stale/duplicate Electron entry point (not used — `src/main/main.ts` is the real entry) |

---

## Build & Run Commands

| Command | Description | Status |
|---------|-------------|--------|
| `npm run build` | Angular production build | ⚠️ Fails — tsconfig path issue (`src/renderer/tsconfig.app.json` references `src/renderer/main.ts` with wrong relative path) |
| `npm run electron:dev` | Electron + Angular dev server (port 4200) | Depends on `npm run build` succeeding |
| `npm run electron:build` | Electron builder (packaged app) | Depends on `npm run build` succeeding |
| `npm run electron:package` | Electron packaging | Depends on `npm run build` succeeding |
| `npm run electron:publish` | Electron publishing | Depends on `npm run build` succeeding |
| `npm run preview` | Angular dev server preview (port 4200) | Depends on `npm run build` succeeding |
| `npm run lint` | ESLint check | ⚠️ Fails — ESLint config file (`eslint.config.*`) is missing |
| `npm run test` | Jest unit tests | ⚠️ Hangs — timeout (karma/jest config mismatch — angular.json references karma builder but package.json says jest) |

---

## Key Observations

1. **Skeleton Project**: The project structure is complete but most implementations are stubs with TODO comments.
2. **Missing Templates**: None of the Angular components have HTML templates defined.
3. **No IPC Communication**: The preload script exposes an empty API — no IPC handlers exist in the main process.
4. **Stale Files**: `public/electron.js` and `electron.vite.*.json` configs appear unused (project uses Angular CLI).
5. **Security Posture**: Good — context isolation enabled, no node integration in renderer.
6. **Test Infrastructure**: Jest configured but no real tests exist.
7. **Empty Scripts**: `build.sh` and `deploy.sh` are empty.
8. **Services Unconnected**: AuthService and SessionManagerService are implemented but not wired to UI components.

---

## Dependency Summary

### Production Dependencies
- `electron`: 38.x (main runtime)
- `@angular/core`: 20.x, `@angular/platform-browser`: 20.x, `@angular/forms`: 20.x
- `rxjs`: 8.x
- `@electron/quick-start`: 38.x
- `electron-builder`: 26.x
- `electron-updater`: 6.x

### Dev Dependencies
- `@angular/cli`: 20.x
- `typescript`: 6.x
- `jest`: 30.x
- `@types/jest`: 30.x
- `eslint`: 9.x
- `concurrently`: 9.x

---

## Open Items (from TODOs)
1. **main.ts:23** — Implement proper update check with error handling
2. **main.ts:27** — Implement update download/installation
3. **main.ts:31** — Implement update ready notification
4. **main.ts:35** — Implement download progress tracking
5. **main.ts:39** — Implement error handling for update failures

---

## Configuration Issues Found

| Issue | File | Details |
|-------|------|---------|
| **tsconfig path** | `src/renderer/tsconfig.app.json` | `"files": ["src/renderer/main.ts"]` should be `"./main.ts"` (relative to tsconfig location) |
| **Duplicate tsconfig** | Root `tsconfig.app.json` vs `src/renderer/tsconfig.app.json` | Both exist; angular.json uses the one in `src/renderer/` |
| **Missing ESLint config** | Root directory | `eslint.config.*` file not found; `npm run lint` fails |
| **Test runner mismatch** | `angular.json` vs `package.json` | angular.json references karma builder, package.json says jest |
| **Vite configs unused** | `electron.vite.dev.json`, `electron.vite.prod.json` | Project uses Angular CLI, not Vite |
