import type {
  BootstrapGenerateInput,
  BootstrapGenerateOptions,
  BootstrapGenerateResult,
  BootstrapPreset,
  BootstrapPresetId,
  HostRecord,
} from '../shared/mvp-models';

const PRESETS: readonly BootstrapPreset[] = [
  {
    id: 'debian-ubuntu',
    name: 'Debian / Ubuntu',
    description: 'Checks a Debian-family host and optionally installs common SwitchboardOS helpers with apt.',
  },
  {
    id: 'generic-posix',
    name: 'Generic POSIX',
    description: 'Portable checks for POSIX-like hosts without assuming a package manager.',
  },
];

const DEFAULT_OPTIONS: Required<BootstrapGenerateOptions> = {
  installPackages: true,
  includeDockerCheck: false,
};

export function listBootstrapPresets(): BootstrapPreset[] {
  return PRESETS.map((preset) => ({ ...preset }));
}

export function generateBootstrapScript(input: BootstrapGenerateInput, host: HostRecord | null = null): BootstrapGenerateResult {
  const preset = PRESETS.find((item) => item.id === input.presetId);
  if (!preset) {
    throw new Error(`Unknown bootstrap preset: ${input.presetId}`);
  }

  const options = {
    ...DEFAULT_OPTIONS,
    ...(input.options ?? {}),
  };
  const generatedAt = new Date().toISOString();
  const script = preset.id === 'debian-ubuntu'
    ? renderDebianUbuntuScript(host, options, generatedAt)
    : renderGenericPosixScript(host, options, generatedAt);

  return {
    preset: { ...preset },
    hostId: host?.id ?? input.hostId ?? null,
    script,
    generatedAt,
  };
}

function renderHeader(presetId: BootstrapPresetId, host: HostRecord | null, generatedAt: string): string[] {
  const lines = [
    '#!/bin/sh',
    'set -eu',
    '',
    '# SwitchboardOS local bootstrap script',
    `# Preset: ${presetId}`,
    `# Generated at: ${generatedAt}`,
    '# This script contains no secrets and does not configure stored credentials.',
  ];

  if (host) {
    lines.push(
      `# Host profile: ${host.name}`,
      `# Host address: ${host.address || host.hostname}`,
      `# Host port: ${host.port}`,
      `# Host user: ${host.username || '(not set)'}`,
    );
  } else {
    lines.push('# Host profile: none selected');
  }

  lines.push('');
  return lines;
}

function renderDebianUbuntuScript(host: HostRecord | null, options: Required<BootstrapGenerateOptions>, generatedAt: string): string {
  const lines = [
    ...renderHeader('debian-ubuntu', host, generatedAt),
    'echo "SwitchboardOS bootstrap: Debian / Ubuntu preset"',
    '',
    'if ! command -v apt-get >/dev/null 2>&1; then',
    '  echo "apt-get was not found. This preset is intended for Debian or Ubuntu hosts." >&2',
    '  exit 1',
    'fi',
    '',
    'echo "Host kernel: $(uname -srm 2>/dev/null || uname -a)"',
    'echo "Current user: $(id -un 2>/dev/null || echo unknown)"',
    'if [ -r /etc/os-release ]; then',
    '  . /etc/os-release',
    '  echo "OS release: ${PRETTY_NAME:-unknown}"',
    'fi',
    '',
    'echo "Checking required commands..."',
    'for cmd in sh uname id ssh; do',
    '  if command -v "$cmd" >/dev/null 2>&1; then',
    '    echo "ok: $cmd"',
    '  else',
    '    echo "missing: $cmd"',
    '  fi',
    'done',
    '',
  ];

  if (options.installPackages) {
    lines.push(
      'echo "Installing practical helper packages with apt-get..."',
      'if [ "$(id -u)" -eq 0 ]; then',
      '  APT_PREFIX=""',
      'elif command -v sudo >/dev/null 2>&1; then',
      '  APT_PREFIX="sudo"',
      'else',
      '  echo "sudo is unavailable and current user is not root; skipping package installation." >&2',
      '  APT_PREFIX=""',
      'fi',
      '',
      'if [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1; then',
      '  $APT_PREFIX apt-get update',
      '  $APT_PREFIX apt-get install -y ca-certificates curl openssh-client procps',
      'fi',
      '',
    );
  } else {
    lines.push('echo "Package installation disabled by generator option."', '');
  }

  appendDockerCheck(lines, options.includeDockerCheck);
  lines.push(
    'echo "Bootstrap checks complete. No secrets were read or stored."',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function renderGenericPosixScript(host: HostRecord | null, options: Required<BootstrapGenerateOptions>, generatedAt: string): string {
  const lines = [
    ...renderHeader('generic-posix', host, generatedAt),
    'echo "SwitchboardOS bootstrap: generic POSIX preset"',
    '',
    'echo "Host kernel: $(uname -srm 2>/dev/null || uname -a)"',
    'echo "Current user: $(id -un 2>/dev/null || echo unknown)"',
    '',
    'echo "Checking portable command availability..."',
    'for cmd in sh uname id ssh scp cat grep sed awk; do',
    '  if command -v "$cmd" >/dev/null 2>&1; then',
    '    echo "ok: $cmd"',
    '  else',
    '    echo "missing: $cmd"',
    '  fi',
    'done',
    '',
    'echo "Checking writable temp directory..."',
    'TMP_CHECK="${TMPDIR:-/tmp}/switchboardos-bootstrap-$$"',
    'if mkdir "$TMP_CHECK" 2>/dev/null; then',
    '  rmdir "$TMP_CHECK"',
    '  echo "ok: temporary directory is writable"',
    'else',
    '  echo "warning: unable to create temporary directory at ${TMPDIR:-/tmp}" >&2',
    'fi',
    '',
  ];

  if (options.installPackages) {
    lines.push(
      'echo "No package manager is assumed by the generic POSIX preset; no packages were installed."',
      '',
    );
  }

  appendDockerCheck(lines, options.includeDockerCheck);
  lines.push(
    'echo "Bootstrap checks complete. No secrets were read or stored."',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function appendDockerCheck(lines: string[], includeDockerCheck: boolean): void {
  if (!includeDockerCheck) {
    return;
  }

  lines.push(
    'echo "Checking Docker availability..."',
    'if command -v docker >/dev/null 2>&1; then',
    '  docker --version || true',
    'else',
    '  echo "docker not found"',
    'fi',
    '',
  );
}
