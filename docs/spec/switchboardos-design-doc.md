# SwitchboardOS Design Document

## 1. Product Summary

SwitchboardOS is a local-first desktop and web-accessible operations environment for managing remote computers over SSH. It provides a full application shell with overlapping and tiling windows, desktop icons, host dashboards, terminals, file tools, logs, service/process views, generated utility apps, themes, and responsive layouts.

SwitchboardOS should also support an optional hosted access mode that serves the UI and backend API on a configurable local or LAN port. This makes the same operations environment accessible from a browser while keeping privileged SSH, SwitchboardOS system/workspace filesystem, remote filesystem, secret, policy, and audit operations behind the SwitchboardOS backend.

The product should be useful without AI. Its core value is a portable operations desktop for remote hosts. An optional agent endpoint supercharges the environment by inspecting structured window and app state, diagnosing host issues, generating helper applications, assisting with bootstrap scripts, summarizing state, and automating approved actions.

The chosen implementation stack is Angular + Electron. Angular provides a structured TypeScript application framework for the SwitchboardOS shell and app platform. Electron provides the native desktop runtime required for SSH transport, the SwitchboardOS system/workspace filesystem, user-mediated import/export, remote filesystem mediation, OS keychain integration, privileged tools, IPC boundaries, and cross-platform packaging. Hosted web mode should reuse the same Angular UI and route browser clients through a SwitchboardOS-controlled backend service rather than exposing privileged capabilities directly to the browser.

## 2. Core Principles

### 2.1 Local-first by default

SwitchboardOS should run as a local desktop application and may optionally expose a hosted web UI/API from the local machine or an approved host. Persistent configuration should live locally unless the user explicitly opts into sync or remote storage in a future version.

Hosted access should preserve the local-first model. The default bind address should be localhost. LAN or remote binding should be an explicit user choice with authentication, session controls, audit logging, and clear warnings about the privileged nature of the application.

The local database should be limited to SwitchboardOS configuration and metadata, including:

- SSH host profiles
- Host groups and tags
- Connection settings
- User preferences
- Window layouts
- Installed app manifests
- Agent endpoint configuration
- Bootstrap presets and generated script history metadata
- Non-secret references to credentials

Secrets should not be stored casually in the application database. SSH private keys, passphrases, tokens, and API keys should use OS-backed secure storage where possible, with fallbacks clearly marked.

### 2.2 Useful without AI

The product must stand on its own as a remote operations desktop. AI should not be required for basic host management, terminals, dashboards, file browsing, logs, services, or window management.

The agent is an optional acceleration layer, not the core dependency.

### 2.3 Agent-operable, not agent-dependent

Every app and window should expose structured state and structured actions. The agent should interact with SwitchboardOS through typed contracts rather than screen scraping.

For example, a process viewer should expose:

- Current host
- Process list
- Selected process
- Sort/filter state
- Suspicious or highlighted processes
- Available actions such as kill process, inspect process, open terminal, or view logs

The visual UI remains for the human. The semantic state/action layer exists for the agent and automation.

### 2.4 Power-user autonomy with explicit policy modes

SwitchboardOS should use a capability-based architecture internally, but users should be able to configure how restrictive or permissive the system is.

Recommended policy modes:

- Safe: agent can inspect state and propose actions; destructive actions require confirmation.
- Balanced: agent can execute low-risk read-only actions and common diagnostics; risky actions require confirmation.
- Permissive: agent can execute most actions on approved hosts/apps.
- Full Trust: agent may bypass most restrictions within user-configured scope.

The architecture should still retain audit logging and capability definitions even when the user chooses a permissive mode.

### 2.5 App platform first-class

SwitchboardOS is not only a terminal manager. It is an application environment. It should support system applets, user-created applets, and agent-generated applets. Applets should be able to create real graphical frontends using the SwitchboardOS App SDK.

Custom apps should be able to build dashboards, host topology maps, monitoring panels, process trees, log visualizers, deployment views, file explorers, service dependency graphs, and other operational interfaces.

## 3. Target Users

Primary users:

- Developers managing personal servers, homelabs, VPS instances, dev boxes, or cloud VMs
- DevOps/SRE-style users who want a local control surface across multiple hosts
- Power users who want a desktop-like SSH workspace
- AI-assisted development and operations users who want an agent that can operate real host tools

Secondary users:

- Small teams managing shared infrastructure
- Homelab communities
- Founders or solo builders managing multiple machines
- Developers who want AI-generated operational tools without building full web apps from scratch

## 4. Product Scope

### 4.1 In scope for initial product direction

- Local desktop application
- Optional web-accessible hosted mode served by the SwitchboardOS backend on a configurable port
- SSH host inventory
- SSH terminal windows
- Host connection testing
- Bootstrap script generation
- Window manager with floating and tiling behavior
- Desktop icons
- OS-like context menus for desktop, taskbar/dock/panel, icons, files, folders, hosts, terminals, windows, and app content
- Full-fledged SwitchboardOS system/workspace filesystem with basic file/folder utilities
- SSH/SFTP-backed host filesystem providers for configured remote systems
- Responsive layout behavior
- Themes, wallpaper, dark/light mode
- Built-in apps for common host operations
- Built-in file explorer for the SwitchboardOS workspace root
- Applet and scriptlet creation as first-class workspace artifacts
- App SDK for custom app frontends
- Graphics/UI library for custom dashboards and visualizations
- Optional AI endpoint configuration
- Agent-readable app/window state
- Agent action registry
- Local database for configuration
- OS keychain or equivalent secure secret handling
- Audit/event logging for agent and privileged actions
- Authentication and access controls for hosted web mode

### 4.2 Out of scope for MVP unless deliberately added

- Multi-user collaboration
- Cloud sync
- Hosted relay service
- Kubernetes-native management beyond simple SSH-host workflows
- Full remote desktop/VNC/RDP replacement
- Centralized enterprise policy management
- Mobile-first experience
- Browser-only direct SSH that bypasses the SwitchboardOS backend
- Plugin marketplace
- Long-term metrics retention

## 5. Technical Stack

### 5.1 Application shell

Use Electron as the desktop runtime.

Electron main process responsibilities:

- Own privileged host operations
- Manage SSH sessions
- Own the SwitchboardOS system/workspace filesystem, user-mediated local import/export, and remote filesystem brokering
- Access OS keychain/secrets
- Own SQLite database access
- Execute bootstrap generation workflows
- Execute approved tools/actions
- Broker IPC between renderers and privileged services
- Manage app installation/loading
- Manage audit log writes
- Integrate with OS menus, tray, notifications, and file dialogs

Electron renderer responsibilities:

- Render SwitchboardOS desktop shell
- Render windows and apps
- Render terminal surfaces
- Render settings, host inventory, dashboards, and custom app UIs
- Request operations through typed IPC APIs
- Never directly own secrets or privileged host access

Preload layer responsibilities:

- Expose a narrow, typed API from main process to renderer
- Prevent direct Node access from untrusted renderer contexts
- Validate IPC method shapes where possible
- Keep the renderer boundary explicit

### 5.2 Frontend framework

Use Angular with TypeScript.

Angular is well-suited because SwitchboardOS is a large structured application shell. It needs strong internal organization around services, components, dependency injection, routing-like app surfaces, state management, and reusable UI primitives.

Angular responsibilities:

- Desktop shell UI
- Window manager UI
- App launcher
- Desktop icon layer
- Host inventory UI
- Built-in app components
- Settings panels
- App SDK frontend components
- Theme system
- Responsive layout logic
- Agent panel UI
- Command palette

### 5.3 Terminal rendering

Use xterm.js for terminal windows.

Terminal architecture:

- xterm.js renders terminal UI in Angular windows.
- Renderer sends terminal input events to main process over IPC.
- Main process writes input to the active SSH channel.
- Main process streams SSH output back to renderer.
- Terminal sessions are associated with host IDs and session IDs.
- Terminal windows expose semantic metadata to the agent, including host, cwd when known, active command when known, exit status when known, and visible output summary.

### 5.4 Code editor and app authoring

Use Monaco Editor for built-in editing experiences.

Use cases:

- Editing generated app code
- Editing app manifests
- Editing bootstrap templates
- Editing scripts
- Reviewing agent-generated code
- Inspecting config files from hosts

### 5.5 Local database

Use SQLite for local persistent configuration and metadata.

Suggested tables:

- hosts
- host_groups
- host_tags
- host_credentials_refs
- app_manifests
- app_permissions
- window_layouts
- user_preferences
- agent_endpoints
- bootstrap_presets
- bootstrap_runs
- audit_events
- command_history_metadata

The database should not store raw private keys, passphrases, or AI API keys unless an explicit encrypted fallback is required and clearly labeled.

### 5.6 Secret storage

Preferred secret handling:

- Use OS keychain/keyring APIs for private keys, passphrases, tokens, and AI endpoint credentials.
- Support ssh-agent where available.
- Support importing keys with secure storage.
- Support referencing existing key files without copying them into SwitchboardOS.
- Avoid frequent re-auth prompts when the OS/session has already unlocked the credential.

Credential access should be mediated by main process services, not renderer code.

### 5.7 Optional web-hosted access mode

Hosted web mode should serve the SwitchboardOS UI and backend APIs over HTTP/WebSocket interfaces on a configurable port.

Core requirements:

- Reuse the Angular UI where practical.
- Keep SSH, SwitchboardOS system/workspace filesystem, SSH/SFTP-backed host filesystem, secret storage, policy checks, and audit writes in the trusted SwitchboardOS backend.
- Do not expose raw SSH credentials, OS keychain access, or arbitrary host command execution directly to browser code.
- Use typed request/response contracts equivalent to desktop IPC contracts.
- Support a configurable bind address and port, defaulting to localhost.
- Require authentication for browser sessions, especially for LAN or remote binding.
- Apply CSRF, session timeout, and rate-limit protections where relevant.
- Support TLS directly or document reverse-proxy deployment for non-local access.
- Record hosted-mode login, privileged action, approval, and failure events in the audit log.

This mode is not the same as browser-only direct SSH. Browser clients should operate through the SwitchboardOS backend, which remains the privileged execution boundary.

## 6. High-Level Architecture

### 6.1 Major subsystems

SwitchboardOS consists of these major subsystems:

1. Electron Runtime
2. Hosted Web Server / HTTP API
3. Angular Desktop Shell
4. Window Manager
5. Host Manager
6. SSH Service
7. Secret Service
8. App Runtime
9. App SDK
10. Graphics/UI Library
11. Agent Service
12. Bootstrap Service
13. Local Database
14. Audit/Event Log
15. Settings and Policy Engine

### 6.2 Runtime boundary

The privileged runtime boundary is the SwitchboardOS backend. In desktop mode, this is the Electron main process. In hosted web mode, this is the local/server process that owns SSH sessions, SwitchboardOS system/workspace filesystem access, SSH/SFTP-backed host filesystem access, SQLite, secrets, policy checks, and audit writes.

The renderer or browser client is treated as a UI surface. Even first-party Angular code should use typed IPC calls or typed hosted APIs rather than direct access to privileged resources. This keeps the architecture clean and allows user-created/generated apps to be sandboxed more easily later.

### 6.3 Data flow example: opening a terminal

1. User selects a host and opens Terminal.
2. Angular shell creates a terminal window.
3. Terminal app requests a new SSH session via IPC.
4. Main process SSH Service loads host config from SQLite.
5. Secret Service retrieves credential from OS keychain or ssh-agent.
6. SSH Service opens a session.
7. Output streams to renderer and xterm.js.
8. User input streams back to SSH Service.
9. Audit service records session start/end and relevant metadata.
10. Terminal window exposes semantic state for agent inspection.

### 6.4 Data flow example: agent diagnoses a host

1. User asks Operator to diagnose a host.
2. Agent Service collects structured state from relevant windows/apps.
3. Agent Service requests additional read-only diagnostics from allowed host tools.
4. SSH Service executes approved diagnostic commands.
5. Results are summarized and passed to the agent endpoint.
6. Agent proposes findings and actions.
7. Policy Engine determines whether actions require user confirmation.
8. User approves, rejects, or edits proposed actions.
9. Main process executes approved actions.
10. Audit log records agent inputs, proposed actions, approvals, and executed commands.

## 7. Desktop Shell and Window Manager

### 7.1 Desktop shell

The shell is the primary user environment. The default experience must clearly resemble a desktop operating environment, not an admin dashboard or multi-panel web app. On first launch, the user should see a calm wallpaper-backed desktop with only the minimal OS-style default icons, a taskbar/dock/panel with a main menu affordance, and no app windows unless the user explicitly opens one.

Core shell features:

- Desktop background/wallpaper using the bundled default wallpaper at `docs/assets/default-wallpaper.png`
- Wallpaper display options in Settings include:
  - Source selection with existing sources: Default, Grid, Topology, Plain
  - Layout selection: Stretch, Fit, Fill (default), Fit with tile, Tile with original size, Center
- Desktop icons
- App launcher
- Host launcher
- Taskbar/dock/panel
- System tray/status area
- Context menu system
- Command palette
- Notification/toast system
- Global search
- File explorer
- Workspace file/folder utilities
- Settings
- Agent/Operator panel

Default desktop acceptance criteria:

- The default visual state should be wallpaper-forward and uncluttered.
- The default theme should use a neutral palette with restrained contrast and accents. Avoid a saturated, busy, or novelty color scheme as the default.
- Persistent always-visible controls should be limited to desktop-environment primitives such as the desktop, taskbar/dock/panel, main menu affordance, tray/status area, and the minimal default desktop icons.
- The default desktop icon set should contain exactly two shell-owned icons: File Explorer and Recycle Bin. File Explorer opens the SwitchboardOS workspace/system filesystem root; Recycle Bin opens the deleted-item recovery surface. Additional app, host, profile, operator, settings, state, workspace, applet, or scriptlet icons should not appear by default unless the user explicitly creates or pins them.
- Apps, hosts, profiles, settings, operator tools, state inspection, workspace utilities, applets, scriptlets, and administrative surfaces should primarily live behind a main menu system similar to a Start menu, application menu, launcher, or command palette.
- Apps, Search, Hosts, Profiles, Save Profile, Restore Profile, State, Settings, Operator, State Inspector, Workspace, and similar surfaces should not appear as separate default panels or toolbars on an empty desktop. They should be available through the launcher, context menus, keyboard shortcuts, or explicit user action.
- Titlebar controls such as minimize, maximize, restore, and close should only appear on actual open windows. They should not appear on the desktop when no app window is present.
- Notification toasts should be transient and auto-dismiss by default. Only critical, pinned, or active-progress notifications may persist, and the empty default state should not contain persistent toasts.

Launcher taxonomy and default launcher policy:

- Core launcher system applets: File Explorer, Recycle Bin, Hosts, Terminal, Settings, and App Manager.
- Contextual host/file/window tools: host-scoped windows and operations (for example, Host Dashboard, Host Terminal, File Browser, Process Viewer, Service Manager, Log Viewer).
- Advanced/developer tools: Bootstrap, Command History, App Studio, Host Map, and equivalent diagnostic surfaces.
- Optional/configured tools: Operator / agent management surfaces remain hidden until configured or explicitly opened. Installed user-created or agent-generated applets may appear after the core launcher set once the user installs or enables them, but they are not part of the default first-run row set.
- Demo/non-core apps are not part of the default launcher row set and should be discoverable via search or context-specific flows.

Desktop icon behavior:

- Desktop icons should be draggable, snap or align to a stable grid, and persist their positions.
- Desktop icons should not show a permanent close/delete `x` button.
- Removing, hiding, renaming, or configuring a desktop icon should happen through a right-click context menu, not through an always-visible corner control.
- Right-clicking a desktop icon should open a context menu or submenu with relevant actions such as Open, Rename, Remove Shortcut, and host/app-specific commands.
- Right-clicking the desktop background should open a desktop context menu for wallpaper, theme, icon arrangement, and launcher-related actions.
- Wallpaper layout for the Default wallpaper source should default to Fill. The supported fill modes are Stretch, Fit, Fill, Fit with tile, Tile with original size, and Center.

### 7.2 OS interaction model

SwitchboardOS should behave like an operating environment. Basic interactions that users expect from Linux, Windows, and macOS should exist unless there is a deliberate product reason to omit them.

Expected OS-grade interactions:

- Right-click should be captured by SwitchboardOS and should open a SwitchboardOS context menu instead of the browser default context menu.
- Context menus should be target-aware. The desktop background, desktop icons, taskbar/dock/panel items, tray/status items, open windows, app content regions, files, folders, hosts, terminals, and notifications should each be able to show relevant menu items.
- Context menus should support nested submenus, disabled items, separators, destructive-action styling, icons, keyboard shortcut labels, and async action handlers.
- Apps should be able to contribute context menu items through the App SDK for their own windows and for specific registered elements inside their windows.
- App-contributed menu items must be scoped by capabilities and cannot bypass host, filesystem, policy, or audit controls.
- Shell-owned menu items should remain predictable and should match common desktop conventions where applicable: Open, Open With, New Folder, Rename, Duplicate, Copy, Cut, Paste, Delete/Remove, Properties/Get Info, Pin/Unpin, Close Window, Minimize, Restore, Move to Workspace, and Settings.
- The same action should be available through context menus, keyboard shortcuts, and command palette entries where that is a normal desktop expectation.

Required target menus:

- Desktop background: New Folder, New Applet, New Scriptlet, Paste, Arrange Icons, Change Wallpaper, Display/Theme Settings, Open File Explorer, and Refresh.
- Desktop icon: Open, Open With where relevant, Rename, Duplicate Shortcut, Remove Shortcut, Properties, and app/host-specific actions.
- Taskbar/dock/panel empty area: Panel Settings, Add Applet, Arrange/Lock Panel, Show Desktop, and Task Manager or running-window list.
- Taskbar/dock/panel app item: Open/New Window, Pin/Unpin, Show/Hide, Minimize/Restore, Close Window, and app-specific actions.
- File or folder: Open, Open With, New Folder where applicable, Rename, Copy, Cut, Paste, Duplicate, Delete/Move to Recycle Bin if implemented, Properties, and applet/scriptlet actions where permitted.
- Host item: Open Dashboard, Open Terminal, Open File Explorer via SSH/SFTP, Run Scriptlet, Edit Host, Test Connection, and Properties.
- Terminal selection or terminal window: Copy, Paste, Clear, Split/New Terminal, Open Host Dashboard, and terminal/session properties.

### 7.3 SwitchboardOS system/workspace filesystem and basic utilities

SwitchboardOS should provide a full-fledged app-owned system/workspace filesystem that supports OS-like file and folder workflows without granting arbitrary access to the user's full machine.

This filesystem is a first-class SwitchboardOS storage layer, not a synonym for unrestricted local disk access. It should be capable enough to hold ordinary user-created workspace files and folders, applet/scriptlet source, notes, generated artifacts, desktop shortcut metadata, app manifests, app-owned configuration, caches, trash, exported profiles, and other SwitchboardOS-created artifacts.

The user-facing mental model should be similar to a small OS filesystem rooted inside SwitchboardOS, with stable roots such as `workspace://` or `switchboard://`. The backing implementation may use native storage, SQLite metadata, package directories, or another local persistence mechanism, but all access must go through SwitchboardOS backend APIs and capability checks.

System/workspace filesystem requirements:

- SwitchboardOS should create and manage a workspace root folder. The built-in file explorer should be constrained to that root by default.
- User-created applets, scriptlets, notes, saved generated files, layouts, exported profiles, and other SwitchboardOS-created artifacts should live under the workspace root unless the user explicitly exports them elsewhere.
- Users should be able to create, rename, move, copy, duplicate, delete, and organize files and folders inside the workspace root.
- The desktop should be able to contain file, folder, applet, scriptlet, host, and app shortcuts backed by workspace metadata.
- File and folder operations should be available from the file explorer, desktop icons, context menus, keyboard shortcuts, and command palette where appropriate.
- The file explorer should expose the current workspace path, breadcrumbs, list/grid views, sorting, filtering, preview/properties, and basic open-with behavior.
- Apps may request scoped access to workspace files or folders through declared capabilities. They should not receive arbitrary local filesystem access.
- Generated applets and scriptlets should be stored as workspace artifacts with manifest metadata, permissions, and audit-relevant provenance.
- App installation files, app bundles, generated app code, app manifests, per-app settings, per-app caches, and uninstall records may be stored in the system/workspace filesystem, but installed app lifecycle state is owned by the app registry and package manager rather than by raw file presence alone.

Remote filesystem requirements:

- Access to a host filesystem should happen through SSH-backed workflows such as SFTP, SSH commands, applets, or scriptlets tied to a configured host.
- Configured hosts should appear as separate filesystem providers or roots, for example `host://<host-id>/...`, rather than being merged with the SwitchboardOS workspace root.
- SwitchboardOS should not treat remote filesystem access as a browser-side or renderer-side direct filesystem grant.
- Remote file explorers, applets, and scriptlets should use host credentials and policy checks mediated by the SwitchboardOS backend.
- Remote filesystem operations should be auditable when they modify files, run commands, or cross privilege boundaries.
- A user may create applets or scriptlets that expose specific remote folders or operations, but those artifacts must declare their host scope, filesystem scope, and capabilities.
- The current machine's host filesystem should not be implicitly exposed as arbitrary native local filesystem access. If SwitchboardOS needs to operate on the current machine as a managed host, it should use an explicit "This Machine" provider with separate approval and capabilities, preferably modeled like any other configured SSH host such as SSH-to-localhost.

Basic utility expectations:

- File Explorer for the SwitchboardOS workspace root.
- Workspace properties/settings.
- Applet and scriptlet creation from the desktop, launcher, file explorer, and context menus.
- Properties/Get Info surfaces for files, folders, applets, scriptlets, hosts, windows, and apps.
- Clipboard-aware copy/cut/paste for workspace items where supported.
- Recycle Bin or delete semantics should be explicit. If Recycle Bin is not implemented, delete actions must clearly state that they are permanent.

### 7.4 Window behavior

Windows should support:

- Dragging
- Resizing
- Minimize/maximize/restore
- Close
- Snap/tiling
- Focus/blur
- Z-index ordering
- Multiple windows of same app
- Host-scoped windows
- Saved window layouts
- Workspace profiles

Window metadata:

- Window ID
- App ID
- Host ID if applicable
- Title
- Bounds
- State: floating, tiled, minimized, maximized, fullscreen
- Focus state
- Semantic state provider
- Registered actions

### 7.5 Tiling behavior

Tiling should be practical rather than over-engineered for MVP.

Initial tiling features:

- Split left/right
- Split top/bottom
- Snap to halves/quarters
- Save/restore layout
- Drag window to edge to snap
- Keyboard shortcuts for tiling

Advanced tiling can come later.

### 7.6 Responsive behavior

SwitchboardOS should adapt to different screen sizes and window dimensions.

Desktop-sized displays should use the full desktop/windowing metaphor.

Smaller displays should preserve the same app model but adjust presentation:

- More stacked views
- Drawer navigation
- Simplified window switching
- More emphasis on active task
- Avoid tiny overlapping windows where impractical

This is responsive UX, not a separate mobile product.

## 8. Host Management

### 8.1 Host profile

A host profile should include:

- Host ID
- Display name
- Hostname/IP
- Port
- Username
- Credential reference
- Tags
- Groups
- OS hint
- Bootstrap status
- Last connection status
- Notes
- Default shell
- Default working directory
- Known capabilities

### 8.2 Host inventory features

- Add/edit/remove host
- Test connection
- Group hosts
- Tag hosts
- Search/filter hosts
- Import/export host configs
- Duplicate host profile
- Mark host as favorite
- Open host dashboard
- Open terminal
- Open file browser
- Open logs/services/process apps

### 8.3 Host dashboard

Each host should have a dashboard window.

Possible dashboard modules:

- Connection status
- OS information
- Uptime
- CPU/memory/disk summary
- Running services
- Recent logs
- Open terminals
- Recent commands
- Bootstrap readiness
- Agent recommendations

MVP can start with connection status, OS info, uptime, disk, memory, and quick actions.

## 9. SSH Service

### 9.1 Responsibilities

The SSH Service lives in the Electron main process.

Responsibilities:

- Manage SSH connections
- Open shell sessions
- Execute commands
- Stream terminal I/O
- Transfer files where supported
- Detect host OS/capabilities
- Manage connection lifecycle
- Provide structured command results
- Enforce policy decisions
- Emit audit events

### 9.2 SSH library choice

Use a mature Node-compatible SSH library initially, likely `ssh2`, because Electron main process can use Node APIs. The abstraction should be wrapped behind an internal SSH provider interface so the implementation can be replaced later if needed.

Suggested internal interface:

- connect(hostId)
- disconnect(sessionId)
- openShell(hostId, options)
- exec(hostId, command, options)
- upload(hostId, localPath, remotePath)
- download(hostId, remotePath, localPath)
- stat(hostId, remotePath)
- listDir(hostId, remotePath)
- getSessionStatus(sessionId)

### 9.3 Connection model

The system should distinguish between:

- Host profile
- Connection
- Terminal session
- Command execution
- File transfer session

A single host may have multiple open terminal sessions and command executions.

## 10. Bootstrap System

### 10.1 Purpose

The bootstrap system helps prepare a host so SwitchboardOS can interact with it reliably.

It should generate a script the user can copy and paste into the host. The script should verify or install required components, confirm SSH assumptions, detect OS details, and optionally configure helper capabilities.

### 10.2 Preset-first design

The system should include vetted presets for common targets:

- Ubuntu/Debian
- RHEL/CentOS/Fedora/Rocky/Alma
- Arch
- macOS
- Windows with OpenSSH
- Generic POSIX shell

Presets should be preferred over agent-generated scripts.

### 10.3 AI-assisted fallback

For unusual hosts, the user may choose Other / AI-assisted if an agent endpoint is configured.

The agent should not freehand arbitrary scripts. It should generate from a strict rubric/template.

Rubric requirements:

- Detect OS and shell
- Avoid destructive changes
- Be idempotent where possible
- Explain each major step in comments
- Check required commands before using them
- Avoid hardcoded secrets
- Avoid changing firewall/auth settings unless explicitly requested
- Produce a dry-run mode where practical
- Report success/failure clearly
- Emit machine-readable summary if possible

### 10.4 Bootstrap script outputs

A generated bootstrap script should include:

- Human-readable comments
- Safety checks
- Dependency checks
- Host capability detection
- Optional install/config steps
- Final summary
- SwitchboardOS host readiness marker if needed

## 11. App Platform

### 11.1 App types

SwitchboardOS should support multiple app classes:

1. System applets
2. User-created applets
3. Agent-generated applets
4. Imported applet packages
5. Lower-level shell primitives

MVP should prioritize system applets and local/generated applets. A marketplace is out of scope.

### 11.2 System applets

Any app-like SwitchboardOS feature should be implemented as a system applet whenever it presents a launchable window, settings surface, file view, host tool, operator console, or other user-facing app experience. System applets should use the same applet programming language, manifest model, runtime lifecycle, window APIs, context menu APIs, and SDK surfaces that user-created and agent-generated applets use.

System applet requirements:

- System applets are first-party, trusted applets with system-level capabilities, not bespoke web panels that bypass the applet platform.
- Settings, File Explorer, Recycle Bin, host tools, terminals, operator tools, bootstrap tools, and similar launchable experiences should be represented as system applets.
- System applets should declare manifests, capabilities, launcher entries, context-menu contributions, default window behavior, semantic state, and app metadata through the same applet contract used by non-system applets.
- System applets may receive privileged capabilities that user applets cannot request directly, but those capabilities still go through SwitchboardOS backend services, policy checks, and audit where applicable.
- The shell primitives themselves, such as the desktop surface, taskbar/dock/panel, window manager, main menu, tray/status area, global context-menu dispatcher, and notification compositor, may remain shell-owned infrastructure rather than applets.
- The applet programming language and SDK should be dogfooded by system applets so the applet platform is capable enough for real SwitchboardOS features before it is exposed as a user development surface.

Initial system applet candidates:

- Terminal
- Host Dashboard
- File Explorer
- Recycle Bin
- Remote File Browser over SSH/SFTP
- Process Viewer
- Service Manager
- Log Viewer
- Bootstrap Generator
- Applet/Scriptlet Studio
- App Studio
- Settings
- Agent/Operator Console
- Command History
- Host Inventory

### 11.3 App manifest

Each app should have a manifest.

Suggested fields:

- appId
- name
- version
- description
- author
- entrypoint
- icon
- category
- requestedCapabilities
- supportedWindowModes
- minimumSwitchboardOSVersion
- agentStateProvider
- actionRegistry
- settingsSchema

### 11.4 Capability model

Capabilities should describe what an app may request.

Example capabilities:

- host:read
- host:terminal
- host:exec:read-only
- host:exec:write
- host:file:read
- host:file:write
- host:file:read:path-scoped
- host:file:write:path-scoped
- host:service:read
- host:service:write
- local:config:read
- local:config:write
- workspace:file:read
- workspace:file:write
- local:file:import
- local:file:export
- context-menu:contribute
- agent:read-state
- agent:invoke
- network:http
- secrets:reference-only

The user can configure policy behavior around these capabilities.

### 11.5 App isolation

For MVP, system applets can run inside the trusted Angular application. User-created and agent-generated applets should be designed with isolation in mind.

Possible approaches:

- Render generated apps inside sandboxed iframes/webviews.
- Expose only the SwitchboardOS App SDK bridge.
- Deny direct Node integration.
- Validate IPC calls.
- Enforce declared capabilities.

Even if early MVP starts with a simpler trusted model, the app contract should be designed so isolation can be strengthened later without rewriting the platform.

### 11.6 App lifecycle and filesystem storage

App installation, upgrade, disablement, and uninstallation should be managed by an app registry/package layer above the filesystem.

App lifecycle requirements:

- The app registry should be the source of truth for installed app identity, version, enabled/disabled state, requested capabilities, granted capabilities, shell contributions, context-menu contributions, launcher entries, desktop pins, taskbar/dock pins, and uninstall status.
- App bundles, generated app source, app manifests, per-app settings, per-app caches, uninstall manifests, and user-created app artifacts may live in the SwitchboardOS system/workspace filesystem.
- Deleting files in File Explorer should not silently uninstall, disable, or corrupt a registered app. Uninstall and disable actions should go through the app manager so permissions, menu contributions, pins, caches, generated files, audit records, and registry state are handled coherently.
- App-created user documents should remain ordinary workspace files unless the user explicitly removes them during uninstall.
- Remote host filesystems should not be used as the default installation location for SwitchboardOS apps. Remote app deployment or host-side helper installation should be an explicit host operation with SSH scope, policy checks, and audit.

## 12. SwitchboardOS App SDK

### 12.1 Purpose

The App SDK allows system, user-created, and agent-generated applets to run inside SwitchboardOS windows and interact with hosts through controlled runtime APIs.

### 12.2 SDK surfaces

Suggested SDK modules:

- window
- host
- terminal
- command
- files
- workspaceFiles
- services
- processes
- logs
- metrics
- storage
- settings
- theme
- graphics
- agent
- actions
- contextMenu
- notifications

### 12.3 Window API

The window API should expose:

- Current window ID
- Current bounds
- Focus state
- Tiling/floating state
- Theme and scale
- Title updates
- Badge/status updates
- Min/max preferred size

### 12.4 Host API

The host API should expose controlled host operations:

- listHosts()
- getHost(hostId)
- getHostStatus(hostId)
- testConnection(hostId)
- openTerminal(hostId)
- exec(hostId, command, options)
- getCapabilities(hostId)

### 12.5 App storage API

Apps should have scoped storage.

Storage categories:

- App settings
- App layout preferences
- App cache
- Temporary data

Generated apps should not get arbitrary persistent storage without a declared capability.

### 12.6 Context menu API

Apps should be able to register context menu contributions for their own windows and for specific elements they own.

The context menu API should support:

- Registering menu items by app/window/element scope
- Nested submenus
- Separators
- Icons
- Disabled/loading states
- Keyboard shortcut labels
- Destructive action styling
- Async action handlers
- Capability-gated actions
- Shell-owned default items that apps can augment but not silently replace

Apps should not be able to globally hijack shell context menus. Desktop, taskbar/dock/panel, host, workspace file, and system menus remain shell-owned surfaces that may accept declared app contributions only through explicit extension points.

### 12.7 System/workspace and remote file APIs

File APIs should distinguish between the SwitchboardOS system/workspace filesystem and remote host filesystems.

System/workspace file API requirements:

- Provide scoped access to files and folders inside the SwitchboardOS workspace root.
- Support creating, reading, updating, renaming, moving, copying, deleting, and listing workspace files and folders when an app declares the relevant capability.
- Preserve file/folder metadata needed for desktop shortcuts, applets, scriptlets, generated artifacts, and open-with behavior.
- Prevent generated apps from receiving arbitrary local filesystem access by default.
- Expose app installation artifacts only through app registry/package APIs unless the user is explicitly inspecting package contents.

Remote file API requirements:

- Access remote files through configured SSH/SFTP host services owned by the SwitchboardOS backend.
- Require host scope, path scope where practical, and declared capabilities.
- Route writes, deletes, command-backed transforms, and privilege-sensitive operations through policy and audit checks.
- Allow applets and scriptlets to expose narrow remote filesystem workflows without granting broad direct filesystem access.
- Treat the current machine's host filesystem as an explicit provider, not as an ambient local filesystem entitlement.

### 12.8 Agent state API

Apps should provide structured semantic state for the agent.

Example:

```ts
interface AgentReadableState {
  appId: string;
  windowId: string;
  hostId?: string;
  summary: string;
  entities: AgentEntity[];
  observations: AgentObservation[];
  availableActions: AgentActionDescriptor[];
  riskHints?: RiskHint[];
}
```

The point is not the exact interface yet. The point is that app state should be semantically readable.

## 13. Graphics and UI Library

### 13.1 Purpose

SwitchboardOS should include a graphics/UI library for custom application frontends.

This matters because custom apps should be able to render real operational interfaces, not just text and forms.

### 13.2 Standard UI components

The UI library should include:

- Buttons
- Inputs
- Selects
- Checkboxes
- Tables
- Tree views
- Tabs
- Cards
- Modals
- Context menus
- Command palette hooks
- Split panes
- Inspectors
- Badges
- Progress bars
- Toasts
- Toolbars
- Status bars

### 13.3 Graphics primitives

The graphics layer should support:

- Canvas-based rendering
- SVG rendering
- Charts
- Graphs/networks
- Node-link diagrams
- Timelines
- Log visualizations
- Process trees
- Disk usage maps
- Host topology maps
- Service dependency graphs

The first implementation can be a curated wrapper around existing web graphics libraries rather than a fully custom renderer.

### 13.4 Theme integration

All custom apps should inherit SwitchboardOS theme tokens:

- Color palette
- Backgrounds
- Foregrounds
- Accent color
- Fonts
- Font scale
- Spacing
- Border radius
- Shadows
- Light/dark mode
- Reduced motion preference
- UI sound preference

### 13.5 Agent-awareness in graphical apps

Graphical apps must expose semantic state in addition to visual state.

Example: a topology map should expose nodes, edges, statuses, selected host, failed hosts, warnings, and available actions. The agent should not need to infer these from pixels.

## 14. Agent / Operator Layer

### 14.1 Role

The agent layer is optional. When configured, it acts as an operator inside SwitchboardOS.

It can:

- Inspect structured window/app state
- Read host state through approved tools
- Diagnose issues
- Summarize logs
- Generate commands
- Generate bootstrap scripts from templates
- Generate custom SwitchboardOS apps
- Propose actions
- Execute actions according to policy
- Create reports

### 14.2 Agent endpoint configuration

SwitchboardOS should support pluggable agent endpoints.

Configuration fields:

- Provider type
- Base URL
- API key credential reference
- Model name
- Context limits
- Tool-use support flag
- Streaming support flag
- Default policy mode

The design should not assume a single model provider.

### 14.3 Agent context model

Agent context should include:

- User request
- Relevant host profiles
- Active window/app states
- Available actions
- Policy mode
- Prior command outputs relevant to task
- Explicit warnings and risk constraints

Host logs, terminal output, file contents, and command results should be treated as untrusted data.

### 14.4 Action execution

The agent should never execute arbitrary privileged operations directly from text output.

Instead:

1. Agent proposes structured action.
2. Policy Engine evaluates risk and permissions.
3. User approval is requested when required.
4. Runtime executes the action.
5. Result is returned to agent and UI.
6. Audit log records the event.

### 14.5 Prompt injection threat model

SwitchboardOS must assume host output can contain malicious instructions.

Examples:

- Log files telling the agent to ignore system instructions
- README files instructing the agent to exfiltrate secrets
- Terminal output pretending to be an SwitchboardOS system message
- Remote files containing adversarial text

Mitigations:

- Separate system/developer/user/tool/host-output contexts
- Label host output as untrusted
- Use structured tools instead of text-command free-for-all
- Require approval for risky actions
- Never expose secrets to the model unless explicitly needed and approved
- Keep audit trails

## 15. Security Model

### 15.1 Main security posture

SwitchboardOS is a privileged local operations tool. It can access remote hosts, execute commands, and manage secrets. Security must be part of the architecture, not a late patch.

### 15.2 Renderer hardening

Recommended Electron settings:

- contextIsolation: true
- nodeIntegration: false for untrusted/generated app contexts
- sandbox: true where practical
- Use preload scripts for narrow APIs
- Validate all IPC payloads
- Avoid remote module patterns
- Avoid arbitrary eval in trusted contexts

### 15.3 IPC validation

Every IPC call should have:

- Typed request schema
- Typed response schema
- Caller identity
- Capability check
- Policy check where relevant
- Audit event when privileged

### 15.4 Secrets

Secrets should:

- Live in OS keychain where possible
- Be retrieved only by main process services
- Never be exposed wholesale to renderer apps
- Never be sent to the agent unless explicitly required and approved
- Be referenced by credential IDs in the database

### 15.5 Audit logging

Audit events should include:

- Timestamp
- User action or agent action
- Host ID
- App/window ID when relevant
- Command/action type
- Approval status
- Result status
- Error summary
- Policy mode

Do not log raw secrets.

### 15.6 Hosted web mode security

Hosted web mode increases the blast radius because browser clients can reach SwitchboardOS through a network port. It should therefore be secure by default:

- Bind to localhost unless the user explicitly enables LAN or remote access.
- Require login for all browser access.
- Use short-lived sessions with explicit logout and idle timeout.
- Enforce CSRF protection for state-changing requests.
- Require capability and policy checks for every privileged API call.
- Treat browser clients as untrusted UI surfaces.
- Warn clearly before exposing the service beyond localhost.
- Prefer TLS for non-local access, either built in or through a documented reverse proxy.
- Audit login attempts, session changes, privileged calls, approvals, and denied actions.

## 16. Persistence Model

### 16.1 Persistent data

Persist locally:

- Host configuration
- Host grouping/tags
- Non-secret credential references
- App manifests
- Applet and scriptlet manifests
- Workspace file/folder metadata where needed
- Desktop shortcut/icon metadata
- User preferences
- Window layouts
- Agent endpoint configuration metadata
- Bootstrap preset metadata
- Audit metadata
- Context menu customization and extension metadata

### 16.2 Ephemeral/session data

Treat as ephemeral unless explicitly saved:

- Live terminal output
- Raw command outputs
- Host file contents
- Logs fetched from hosts
- Remote filesystem listings and file previews fetched over SSH/SFTP
- Metrics snapshots
- Agent intermediate reasoning/context payloads

### 16.3 Optional caches

Caches may be useful, but should be bounded and clearable:

- Host capability cache
- Recent command metadata
- Recently opened paths
- App cache
- Icons/assets

## 17. UX Model

### 17.1 First-run flow

Required first-run behavior:

1. Open to the default desktop environment with the bundled wallpaper, neutral theme, taskbar/dock/panel, main menu affordance, and exactly two default desktop icons: File Explorer and Recycle Bin.
2. Show a dismissible first-run panel on first launch until the user dismisses it.
3. Teach OS primitives in that panel before surfacing advanced workflows:
   - Start menu usage.
   - Right-click context menus on desktop, icons, and windows.
   - File Explorer workspace navigation and Recycle Bin behavior.
   - Hosts and SSH setup basics for first host onboarding.
   - Where advanced tools live (host operations, developer tools, and Operator) without flooding core launcher rows.
4. Keep the desktop shell intact while showing the first-run panel.
5. Provide quick actions for File Explorer, Hosts, Settings, App Manager, and Start menu.
6. Choose theme/light/dark behavior if the user opens personalization or first-run setup.
7. Configure local secret storage preference if needed.
8. Add first SSH host.
9. Test connection.
10. Optionally configure agent endpoint.
11. Open host dashboard.

### 17.2 Daily usage flow

Typical user flow:

1. Open SwitchboardOS
2. Select host or workspace
3. Open terminal/logs/files/services/dashboard windows
4. Arrange windows or load saved layout
5. Run commands or inspect state
6. Optionally ask Operator agent for diagnosis or automation
7. Approve suggested actions if required
8. Save layout or close session

### 17.3 Agent flow

Agent interaction should feel like asking an operator to work inside the current workspace.

Examples:

- “Diagnose why this host is slow.”
- “Make me a dashboard for these three hosts.”
- “Generate a bootstrap script for this weird Alpine box.”
- “Find what service is failing and show me the logs.”
- “Create an app that tails these logs and highlights errors.”

### 17.4 Custom app creation flow

Suggested App Studio flow:

1. User describes desired app.
2. Agent generates app manifest and code.
3. Monaco opens generated app code for review.
4. SwitchboardOS shows requested capabilities.
5. User approves installation.
6. App appears in launcher/desktop.
7. App runs in a window and exposes semantic state/actions.

## 18. MVP Definition

### 18.1 MVP goal

Prove that SwitchboardOS is a useful local SSH operations desktop with an optional agent that can inspect app state and assist with real workflows.

### 18.2 MVP features

Required MVP:

- Electron + Angular application shell
- Desktop-like default shell with bundled wallpaper, neutral theme, exactly two default desktop icons named File Explorer and Recycle Bin, a Start/menu-like launcher for everything else, taskbar/dock/panel, right-click desktop/icon/taskbar/window/file/host menus, and no default dashboard clutter
- Constrained SwitchboardOS workspace root with File Explorer and basic file/folder creation, rename, move/copy, delete, properties, and open-with behavior
- Applet and scriptlet artifacts stored in the workspace with manifests, declared capabilities, and context-menu integration
- Local SQLite configuration database
- Host inventory
- Add/edit/delete SSH host
- OS keychain or secure credential reference strategy
- SSH connection test
- Terminal window using xterm.js
- Floating windows
- Basic tiling/snap behavior
- Host dashboard with simple status
- Bootstrap generator with at least Debian/Ubuntu preset and generic POSIX preset
- Settings app
- Theme/dark/light mode
- Agent endpoint configuration
- Agent panel
- Agent-readable state for terminal and host dashboard
- Agent can propose diagnostic commands
- User approval flow for command execution
- Audit log for agent/host actions
- Basic App SDK skeleton
- One example custom graphical app, such as a host health dashboard

### 18.3 MVP non-goals

- Full marketplace
- Full plugin isolation perfection
- Team collaboration
- Cloud sync
- Browser-only mode
- Mobile polished experience
- Complex tiling window manager
- Advanced monitoring backend
- Full package manager

## 19. Suggested Milestones

### Milestone 1: Electron/Angular shell

Deliver:

- Angular app inside Electron
- Main/renderer/preload structure
- Basic desktop shell
- Window manager prototype
- OS-like context menu system for desktop, icons, taskbar/dock/panel, windows, hosts, and files
- Settings storage
- Theme toggle
- Workspace root and basic File Explorer

### Milestone 2: Host and SSH foundation

Deliver:

- Host inventory
- SQLite persistence
- Credential reference model
- SSH connection test
- Terminal app with xterm.js
- Multiple terminal windows

### Milestone 3: Core operations apps

Deliver:

- Host dashboard
- File browser or log viewer
- Process/service viewer prototype
- Command execution API
- Audit log viewer

### Milestone 4: Bootstrap system

Deliver:

- Bootstrap app
- Ubuntu/Debian preset
- Generic POSIX preset
- Script preview/copy
- Bootstrap result parser/summary

### Milestone 5: Agent integration

Deliver:

- Agent endpoint settings
- Agent panel
- Structured app/window state collection
- Diagnostic proposal flow
- Approval/execution flow
- Agent audit trail

### Milestone 6: App SDK and graphics layer

Deliver:

- App manifest format
- App launcher integration
- UI component library starter
- Graphics/chart primitives starter
- Example generated/custom app
- Capability display/approval UX

## 20. Open Design Decisions

### 20.1 App isolation strategy

Need to decide how generated apps are run:

- Trusted Angular modules during MVP
- Sandboxed iframe/webview app bundles
- Separate renderer processes
- Hybrid model

Recommendation: design the manifest/capability model now, even if initial MVP uses a simpler trusted execution path.

### 20.2 SSH implementation details

Need to choose initial SSH library and key handling strategy.

Recommendation: wrap `ssh2` or equivalent behind an internal provider interface so the rest of the app does not depend on the specific library.

### 20.3 Graphics library selection

Need to decide whether the graphics layer is custom or wrapper-based.

Recommendation: start with wrappers around established web libraries for charts/graphs/canvas/SVG, unified through SwitchboardOS theme tokens and SDK APIs.

### 20.4 Agent provider interface

Need to define the minimum supported AI endpoint contract.

Recommendation: support generic OpenAI-compatible endpoints first, but keep the provider abstraction flexible.

### 20.5 Naming hierarchy

Current working name:

- Product: SwitchboardOS
- Agent feature: Operator
- Runtime: SwitchboardOS Runtime
- App SDK: SwitchboardOS App SDK

## 21. Risks and Mitigations

### Risk: Scope becomes too large

Mitigation: MVP must prove host inventory, terminal, windows, bootstrap, and agent-assisted diagnostics before building advanced desktop niceties.

### Risk: Electron security mistakes

Mitigation: enforce main/renderer boundary, context isolation, no Node integration for untrusted apps, typed IPC validation, and explicit capabilities.

### Risk: Agent becomes gimmicky

Mitigation: base product must remain useful without AI. Agent should operate structured state and real tools, not just chat.

### Risk: Generated apps become unsafe

Mitigation: manifests, capabilities, app sandboxing, user approval, and audit logs.

### Risk: Bootstrap scripts damage hosts

Mitigation: preset-first, idempotent scripts, comments, dry-run where possible, and user review before execution/copy.

### Risk: Secret handling undermines trust

Mitigation: use OS keychain/ssh-agent, avoid storing raw secrets in SQLite, expose references not values, and prevent renderer/agent access by default.

## 22. Positioning

SwitchboardOS is a local-first operations desktop and optional hosted web control surface for remote SSH hosts.

It gives users a desktop-like environment for managing machines through windows, apps, terminals, dashboards, and generated tools. Optional hosted web mode makes that environment available from a browser through a SwitchboardOS backend on a configurable port. Optional AI integration adds an Operator that can inspect structured workspace state, diagnose issues, create tools, and automate approved actions.

The product is not merely an AI chatbot, terminal emulator, or SSH client. It is an operations environment: a local OS-like shell for remote infrastructure work.
