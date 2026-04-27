# SwitchboardOS Design Document

## 1. Product Summary

SwitchboardOS is a local-first desktop operations environment for managing remote computers over SSH. It provides a full application shell with overlapping and tiling windows, desktop icons, host dashboards, terminals, file tools, logs, service/process views, generated utility apps, themes, and responsive layouts.

The product should be useful without AI. Its core value is a portable operations desktop for remote hosts. An optional agent endpoint supercharges the environment by inspecting structured window and app state, diagnosing host issues, generating helper applications, assisting with bootstrap scripts, summarizing state, and automating approved actions.

The chosen implementation stack is Angular + Electron. Angular provides a structured TypeScript application framework for the SwitchboardOS shell and app platform. Electron provides the native desktop runtime required for SSH transport, local filesystem access, OS keychain integration, privileged tools, IPC boundaries, and cross-platform packaging.

## 2. Core Principles

### 2.1 Local-first by default

SwitchboardOS should run as a local desktop application. Persistent configuration should live locally unless the user explicitly opts into sync or remote storage in a future version.

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

SwitchboardOS is not only a terminal manager. It is an application environment. It should support built-in apps, user-created apps, and agent-generated apps. Apps should be able to create real graphical frontends using the SwitchboardOS App SDK.

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
- SSH host inventory
- SSH terminal windows
- Host connection testing
- Bootstrap script generation
- Window manager with floating and tiling behavior
- Desktop icons
- Responsive layout behavior
- Themes, wallpaper, dark/light mode
- Built-in apps for common host operations
- App SDK for custom app frontends
- Graphics/UI library for custom dashboards and visualizations
- Optional AI endpoint configuration
- Agent-readable app/window state
- Agent action registry
- Local database for configuration
- OS keychain or equivalent secure secret handling
- Audit/event logging for agent and privileged actions

### 4.2 Out of scope for MVP unless deliberately added

- Multi-user collaboration
- Cloud sync
- Hosted relay service
- Kubernetes-native management beyond simple SSH-host workflows
- Full remote desktop/VNC/RDP replacement
- Centralized enterprise policy management
- Mobile-first experience
- Browser-only direct SSH
- Plugin marketplace
- Long-term metrics retention

## 5. Technical Stack

### 5.1 Application shell

Use Electron as the desktop runtime.

Electron main process responsibilities:

- Own privileged host operations
- Manage SSH sessions
- Handle local filesystem access
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

## 6. High-Level Architecture

### 6.1 Major subsystems

SwitchboardOS consists of these major subsystems:

1. Electron Runtime
2. Angular Desktop Shell
3. Window Manager
4. Host Manager
5. SSH Service
6. Secret Service
7. App Runtime
8. App SDK
9. Graphics/UI Library
10. Agent Service
11. Bootstrap Service
12. Local Database
13. Audit/Event Log
14. Settings and Policy Engine

### 6.2 Runtime boundary

The privileged runtime boundary is the Electron main process.

The renderer is treated as a UI surface. Even first-party Angular code should use typed IPC calls rather than direct access to privileged resources. This keeps the architecture clean and allows user-created/generated apps to be sandboxed more easily later.

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

The shell is the primary user environment.

Core shell features:

- Desktop background/wallpaper
- Desktop icons
- App launcher
- Host launcher
- Taskbar/dock/panel
- System tray/status area
- Command palette
- Notification/toast system
- Global search
- Settings
- Agent/Operator panel

### 7.2 Window behavior

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

### 7.3 Tiling behavior

Tiling should be practical rather than over-engineered for MVP.

Initial tiling features:

- Split left/right
- Split top/bottom
- Snap to halves/quarters
- Save/restore layout
- Drag window to edge to snap
- Keyboard shortcuts for tiling

Advanced tiling can come later.

### 7.4 Responsive behavior

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

1. Built-in apps
2. User-created apps
3. Agent-generated apps
4. Imported app packages

MVP should prioritize built-in apps and local/generated apps. A marketplace is out of scope.

### 11.2 Built-in apps

Initial built-in app candidates:

- Terminal
- Host Dashboard
- File Browser
- Process Viewer
- Service Manager
- Log Viewer
- Bootstrap Generator
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
- host:service:read
- host:service:write
- local:config:read
- local:config:write
- local:file:read
- local:file:write
- agent:read-state
- agent:invoke
- network:http
- secrets:reference-only

The user can configure policy behavior around these capabilities.

### 11.5 App isolation

For MVP, built-in apps can run inside the trusted Angular application. User-created and agent-generated apps should be designed with isolation in mind.

Possible approaches:

- Render generated apps inside sandboxed iframes/webviews.
- Expose only the SwitchboardOS App SDK bridge.
- Deny direct Node integration.
- Validate IPC calls.
- Enforce declared capabilities.

Even if early MVP starts with a simpler trusted model, the app contract should be designed so isolation can be strengthened later without rewriting the platform.

## 12. SwitchboardOS App SDK

### 12.1 Purpose

The App SDK allows built-in, user-created, and agent-generated apps to run inside SwitchboardOS windows and interact with hosts through controlled runtime APIs.

### 12.2 SDK surfaces

Suggested SDK modules:

- window
- host
- terminal
- command
- files
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

### 12.6 Agent state API

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

## 16. Persistence Model

### 16.1 Persistent data

Persist locally:

- Host configuration
- Host grouping/tags
- Non-secret credential references
- App manifests
- User preferences
- Window layouts
- Agent endpoint configuration metadata
- Bootstrap preset metadata
- Audit metadata

### 16.2 Ephemeral/session data

Treat as ephemeral unless explicitly saved:

- Live terminal output
- Raw command outputs
- Host file contents
- Logs fetched from hosts
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

Suggested first-run sequence:

1. Welcome screen
2. Choose theme/light/dark behavior
3. Configure local secret storage preference if needed
4. Add first SSH host
5. Test connection
6. Optionally configure agent endpoint
7. Open host dashboard

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
- Settings storage
- Theme toggle

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

SwitchboardOS is a local-first operations desktop for remote SSH hosts.

It gives users a desktop-like environment for managing machines through windows, apps, terminals, dashboards, and generated tools. Optional AI integration adds an Operator that can inspect structured workspace state, diagnose issues, create tools, and automate approved actions.

The product is not merely an AI chatbot, terminal emulator, or SSH client. It is an operations environment: a local OS-like shell for remote infrastructure work.

