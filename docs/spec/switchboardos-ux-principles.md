# SwitchboardOS UX and Human-Design Foundation

Status: governing UX foundation for SwitchboardOS UI-facing work.

Retrieval date for external sources: 2026-07-06.

## Purpose

SwitchboardOS is an operations desktop, not a dashboard skin. UX work must make
the system understandable through the user's existing mental models for desktop
objects, files, hosts, terminals, windows, menus, notifications, and approvals.
This document turns human-centered design research into project acceptance rules
that implementation and validation tasks can apply.

## Research Basis

Project sources:

- `docs/spec/switchboardos-design-doc.md`, especially desktop shell and window
  manager, OS interaction model, responsive behavior, UX model, and MVP
  definition.
- `README.md`, especially SemVer classification and hosted LAN availability
  workflow.
- Current UI surfaces under `src/renderer/app`, especially File Browser, Hosts,
  launcher, command palette, generated app runtime, Operator, notifications,
  settings, and terminal flows.

External sources:

- Nielsen Norman Group, "10 Usability Heuristics for User Interface Design",
  updated 2024-01-30:
  https://www.nngroup.com/articles/ten-usability-heuristics/
- W3C Web Accessibility Initiative, "WCAG 2 Overview":
  https://www.w3.org/WAI/standards-guidelines/wcag/
- ISO, "ISO 9241-210:2019 Ergonomics of human-system interaction - Part 210:
  Human-centred design for interactive systems":
  https://www.iso.org/standard/77520.html
- Microsoft Learn, "Design guidelines - Windows apps":
  https://learn.microsoft.com/en-us/windows/apps/design/guidelines-overview
- Apple Developer, "Human Interface Guidelines":
  https://developer.apple.com/design/human-interface-guidelines
- IBM Carbon Design System, "Accessibility overview":
  https://carbondesignsystem.com/guidelines/accessibility/overview/

## Core Principles

1. User context drives design.
   Every UI-facing task must name the user, task, environment, and risk before
   choosing layout or interaction. A server operator checking logs, a user
   organizing workspace files, and a generated-app author have different context
   even when they share the same shell.

2. Desktop object models come first.
   Files, folders, hosts, windows, terminals, applets, notifications, settings,
   generated apps, and Operator proposals must behave as owned objects with
   identity, state, actions, feedback, and lifecycle. Actions belong to the
   object they affect.

3. Recognition beats recall.
   Common choices must be visible through launcher rows, context menus, toolbar
   icons, selected-row affordances, status text, and command palette results.
   Do not make users remember endpoint names, keyboard shortcuts, tokens,
   hidden states, or undocumented command strings.

4. Status is always visible at the point of action.
   Operations that connect, list, upload, download, execute, approve, save, or
   fail must show immediate feedback near the initiating control and on the
   owning object when state persists.

5. Prevent mistakes before recovery.
   Dangerous or irreversible actions need clear object naming, target preview,
   capability/policy explanation, and safe cancellation. Recovery surfaces such
   as Recycle Bin, undo, retry, and audit inspection must be reachable from the
   same object path.

6. Keep advanced power behind progressive disclosure.
   The resting desktop remains quiet. Advanced host operations, Operator,
   generated-app internals, audit details, and developer tools live behind
   launcher, context menu, command palette, or explicit object action surfaces.

7. Accessibility is a baseline behavior.
   UI must be perceivable, operable, understandable, and robust. Keyboard focus,
   screen-reader names, contrast, target size, text wrapping, status messages,
   and error messages are part of feature completion, not polish.

8. Consistency follows user expectations and platform conventions.
   Icons, labels, menus, rows, command placement, selection, drag behavior,
   focus order, and shortcut behavior must match OS and desktop conventions
   unless the design spec names a SwitchboardOS-specific exception.

9. Efficient repeat use is a first-class requirement.
   Operators repeat host, file, terminal, and approval tasks. The first-use path
   must teach the model; the repeat-use path must provide direct object actions,
   search, command palette access, remembered workspace state, and stable
   keyboard flow.

10. Automation remains legible and controlled by the user.
    Operator and generated apps can assist, but the human sees what object is
    affected, what capability is requested, what status changed, what failed,
    and where audit evidence lives.

## Surface Acceptance Heuristics

File Browser:

- Selection must visibly bind the row, path, action buttons, transfer status,
  and property/status panel.
- List, stat, upload, download, rename, move, delete, restore, and open actions
  must come from file/folder object actions, not raw command strings.
- Path, transfer direction, conflict, progress, success, and failure must be
  visible without opening DevTools or reading audit JSON.
- Keyboard users must be able to enter the file list, move selection, invoke
  row actions, and return to the path/action surface.

Hosts:

- Host cards/rows must show identity, address, status, credential state,
  bootstrap status, and primary actions without requiring memory of host IDs.
- Connect, test, terminal, file browser, logs, services, and process actions
  must be host-owned actions.
- Failed connection states must name the failing object and next available user
  action without exposing secrets.

Launcher and command palette:

- Launcher is the broad discovery surface; command palette is the fast repeat
  surface.
- Both must expose the same registered app/object actions with consistent
  names, icons, and disabled reasons.
- Search results must show object type and target context so users can
  distinguish a host, applet, file, setting, and command.

Generated apps:

- Generated apps must expose capabilities, app identity, window identity, and
  owned state through the App SDK.
- Capability denial must be visible to the app and user through a clear status,
  not a silent failure.
- Generated-app UI must not bypass shell window state, app storage, or host SDK
  boundaries to create a faster custom path.

Operator:

- Proposals must identify the target object, risk, capability, and expected
  effect before approval.
- Approval, dispatch, failure, and audit status must be visible in the Operator
  surface.
- Operator UI must support reject, edit, and inspect flows without forcing users
  to copy command strings.

Notifications:

- Notifications are object status, not decorative messages.
- Transient notifications auto-dismiss unless progress, critical failure, or
  user decision is active.
- Every persistent notification must link back to the owning object or action.

Settings:

- Settings must be grouped by user goal and system object: appearance,
  workspace, hosted access, credentials, Operator, generated apps, policy, and
  accessibility.
- Changes that affect safety, data, hosted exposure, credentials, or execution
  policy must state the effect before save and show saved status after save.

Terminal:

- Terminal windows must make host identity, session status, working directory,
  and connection state visible.
- Input, output, resize, disconnect, reconnect, copy, and audit actions must be
  session-owned actions.
- Destructive command approval belongs in Operator/policy surfaces, not hidden
  inside terminal rendering.

## Current Risks and Gaps

- Hosted access previously required access tokens for MVP testing; that violated
  recognition-over-recall and imposed a credential ritual on the first product
  path. The no-auth MVP test path is now the UX baseline for Patrick testing.
- Some surfaces still grew from implementation slices instead of a shared UX
  component contract. Future UI work must audit analogous surfaces before
  reporting completion.
- File Browser transfer flows now have backend-owned route paths, but future
  delete/rename/move SSH file actions need the same selected-object feedback and
  rendered smoke coverage.
- Operator and generated-app workflows need explicit user-facing capability,
  denial, and audit status in every approval or SDK path.
- Accessibility coverage exists mainly as design intent. Future UI slices need
  keyboard, focus, labeling, contrast, and text-overflow checks in rendered
  product-path smokes.

## Future Task Checklist

Every UX-facing implementation or validation task must answer these checks
before completion:

- User and task: Who is using this surface, what are they trying to complete,
  and what failure costs them time, data, security, or confidence?
- Object ownership: Which SwitchboardOS object owns the state, action,
  permission, persistence, and feedback?
- Mental model: Which familiar desktop or operations concept explains this
  action to the user?
- Visible affordance: What on-screen signifier tells the user the action exists
  and whether it is available?
- Status feedback: Where does pending, success, failure, denial, and retry
  appear in the product UI?
- Error prevention: What prevents wrong target, wrong host, wrong file,
  destructive action, credential leak, or invisible failure?
- Recovery: How does the user undo, retry, inspect, restore, or find audit
  evidence?
- Accessibility: What keyboard path, focus order, names, contrast, wrapping,
  target size, and status announcements were verified?
- Consistency: Which analogous surfaces were audited, and which governing rule
  permits any exception?
- Product-path proof: Which rendered Electron or hosted smoke proves the user
  path, not an API shortcut?

## Product-Path Smoke Requirements

Rendered smokes for UI work must prove the user can see and complete the task:

- Start from the normal shell or hosted app path.
- Locate the relevant object through launcher, command palette, context menu,
  desktop, or window state.
- Perform the action using visible controls and keyboard-accessible focus when
  applicable.
- Verify status text, disabled/enabled state, success/failure messaging, and
  cleanup/recovery in the rendered UI.
- Verify no text overlap, hidden clipped labels, inaccessible icon-only action
  without name, or raw backend JSON substituted for user-facing feedback.
- Verify backend state, audit, route contract, policy, storage, or SSH effect
  when the UI action claims to change real state.

## Acceptance Rule

A UX-facing slice is not complete when it adds controls. It is complete when the
user can discover the object, understand the action, perform it through the
normal product path, receive clear feedback, recover from mistakes, and repeat
the task with less effort while route contracts, policy, persistence, audit, and
accessibility remain intact.
