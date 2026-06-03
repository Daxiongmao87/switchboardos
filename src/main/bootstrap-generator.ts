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
    id: 'rhel-family',
    name: 'RHEL / CentOS / Fedora / Rocky / Alma',
    description: 'Checks a RHEL-family host and optionally installs helpers with dnf or yum.',
  },
  {
    id: 'arch-linux',
    name: 'Arch Linux',
    description: 'Checks an Arch host and optionally installs helpers with pacman.',
  },
  {
    id: 'macos',
    name: 'macOS',
    description: 'Checks a macOS host and optionally reports Homebrew helper availability.',
  },
  {
    id: 'windows-openssh',
    name: 'Windows OpenSSH',
    description: 'PowerShell bootstrap checks for Windows hosts using OpenSSH Server.',
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
  const script = renderPresetScript(preset.id, host, options, generatedAt);

  return {
    preset: { ...preset },
    hostId: host?.id ?? input.hostId ?? null,
    script,
    generatedAt,
  };
}

function renderPresetScript(
  presetId: BootstrapPresetId,
  host: HostRecord | null,
  options: Required<BootstrapGenerateOptions>,
  generatedAt: string,
): string {
  switch (presetId) {
    case 'debian-ubuntu':
      return renderDebianUbuntuScript(host, options, generatedAt);
    case 'rhel-family':
      return renderRhelFamilyScript(host, options, generatedAt);
    case 'arch-linux':
      return renderArchLinuxScript(host, options, generatedAt);
    case 'macos':
      return renderMacosScript(host, options, generatedAt);
    case 'windows-openssh':
      return renderWindowsOpenSshScript(host, options, generatedAt);
    case 'generic-posix':
      return renderGenericPosixScript(host, options, generatedAt);
  }
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
    '',
    'echo ""',
    'echo "=============================================="',
    'echo "  Bootstrap Summary"',
    'echo "=============================================="',
    'echo "Preset:     debian-ubuntu"',
    'echo "Generated:  ' + generatedAt + '"',
    'echo "Host:       ' + (host ? host.name || host.address || host.hostname : 'N/A') + '"',
    'echo "Packages:   ' + (options.installPackages ? 'Will install (idempotent)"' : 'Skipped (install disabled)') + '"',
    'echo "Docker:     ' + (options.includeDockerCheck ? 'Checked"' : 'Skipped') + '"',
    'echo "Secrets:    None read or stored"',
    'echo "=============================================="',
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
    '',
    'echo ""',
    'echo "=============================================="',
    'echo "  Bootstrap Summary"',
    'echo "=============================================="',
    'echo "Preset:     generic-posix"',
    'echo "Generated:  ' + generatedAt + '"',
    'echo "Host:       ' + (host ? host.name || host.address || host.hostname : 'N/A') + '"',
    'echo "Packages:   No package manager assumed in generic preset"',
    'echo "Docker:     ' + (options.includeDockerCheck ? 'Checked"' : 'Skipped') + '"',
    'echo "Secrets:    None read or stored"',
    'echo "=============================================="',
    'echo "Bootstrap checks complete. No secrets were read or stored."',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function renderRhelFamilyScript(host: HostRecord | null, options: Required<BootstrapGenerateOptions>, generatedAt: string): string {
  const lines = [
    ...renderHeader('rhel-family', host, generatedAt),
    'echo "SwitchboardOS bootstrap: RHEL-family preset"',
    '',
    'if command -v dnf >/dev/null 2>&1; then',
    '  PKG="dnf"',
    'elif command -v yum >/dev/null 2>&1; then',
    '  PKG="yum"',
    'else',
    '  echo "dnf/yum was not found. This preset is intended for RHEL, CentOS, Fedora, Rocky, or Alma hosts." >&2',
    '  exit 1',
    'fi',
    '',
    'echo "Host kernel: $(uname -srm 2>/dev/null || uname -a)"',
    'if [ -r /etc/os-release ]; then . /etc/os-release; echo "OS release: ${PRETTY_NAME:-unknown}"; fi',
    'for cmd in sh uname id ssh systemctl journalctl; do command -v "$cmd" >/dev/null 2>&1 && echo "ok: $cmd" || echo "missing: $cmd"; done',
    '',
  ];

  if (options.installPackages) {
    lines.push(
      'echo "Installing practical helper packages with $PKG..."',
      'if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else SUDO=""; fi',
      'if [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1; then',
      '  $SUDO "$PKG" install -y ca-certificates curl openssh-clients procps-ng',
      'else',
      '  echo "sudo unavailable and current user is not root; skipping package installation." >&2',
      'fi',
      '',
    );
  } else {
    lines.push('echo "Package installation disabled by generator option."', '');
  }

  appendDockerCheck(lines, options.includeDockerCheck);
  appendSummary(lines, 'rhel-family', host, options, generatedAt, options.installPackages ? 'dnf/yum helper install if privileged' : 'Skipped');
  return `${lines.join('\n')}\n`;
}

function renderArchLinuxScript(host: HostRecord | null, options: Required<BootstrapGenerateOptions>, generatedAt: string): string {
  const lines = [
    ...renderHeader('arch-linux', host, generatedAt),
    'echo "SwitchboardOS bootstrap: Arch Linux preset"',
    '',
    'if ! command -v pacman >/dev/null 2>&1; then',
    '  echo "pacman was not found. This preset is intended for Arch Linux hosts." >&2',
    '  exit 1',
    'fi',
    '',
    'echo "Host kernel: $(uname -srm 2>/dev/null || uname -a)"',
    'if [ -r /etc/os-release ]; then . /etc/os-release; echo "OS release: ${PRETTY_NAME:-unknown}"; fi',
    'for cmd in sh uname id ssh systemctl journalctl; do command -v "$cmd" >/dev/null 2>&1 && echo "ok: $cmd" || echo "missing: $cmd"; done',
    '',
  ];

  if (options.installPackages) {
    lines.push(
      'echo "Installing practical helper packages with pacman..."',
      'if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else SUDO=""; fi',
      'if [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1; then',
      '  $SUDO pacman -Sy --needed --noconfirm ca-certificates curl openssh procps-ng',
      'else',
      '  echo "sudo unavailable and current user is not root; skipping package installation." >&2',
      'fi',
      '',
    );
  } else {
    lines.push('echo "Package installation disabled by generator option."', '');
  }

  appendDockerCheck(lines, options.includeDockerCheck);
  appendSummary(lines, 'arch-linux', host, options, generatedAt, options.installPackages ? 'pacman helper install if privileged' : 'Skipped');
  return `${lines.join('\n')}\n`;
}

function renderMacosScript(host: HostRecord | null, options: Required<BootstrapGenerateOptions>, generatedAt: string): string {
  const lines = [
    ...renderHeader('macos', host, generatedAt),
    'echo "SwitchboardOS bootstrap: macOS preset"',
    '',
    'if [ "$(uname -s 2>/dev/null || echo unknown)" != "Darwin" ]; then',
    '  echo "This preset is intended for macOS/Darwin hosts." >&2',
    '  exit 1',
    'fi',
    '',
    'echo "macOS version: $(sw_vers -productVersion 2>/dev/null || echo unknown)"',
    'echo "Host kernel: $(uname -srm 2>/dev/null || uname -a)"',
    'for cmd in sh uname id ssh scp log ps df; do command -v "$cmd" >/dev/null 2>&1 && echo "ok: $cmd" || echo "missing: $cmd"; done',
    '',
  ];

  if (options.installPackages) {
    lines.push(
      'if command -v brew >/dev/null 2>&1; then',
      '  echo "Homebrew detected; installing optional helpers if missing."',
      '  brew list curl >/dev/null 2>&1 || brew install curl',
      'else',
      '  echo "Homebrew not found; no packages installed by macOS preset."',
      'fi',
      '',
    );
  } else {
    lines.push('echo "Package installation disabled by generator option."', '');
  }

  appendDockerCheck(lines, options.includeDockerCheck);
  appendSummary(lines, 'macos', host, options, generatedAt, options.installPackages ? 'Homebrew helper check' : 'Skipped');
  return `${lines.join('\n')}\n`;
}

function renderWindowsOpenSshScript(host: HostRecord | null, options: Required<BootstrapGenerateOptions>, generatedAt: string): string {
  const lines = [
    '# SwitchboardOS local bootstrap script',
    '# PowerShell preset: windows-openssh',
    `# Generated at: ${generatedAt}`,
    '# This script contains no secrets and does not configure stored credentials.',
    host ? `# Host profile: ${host.name}` : '# Host profile: none selected',
    '',
    'Set-StrictMode -Version Latest',
    '$ErrorActionPreference = "Stop"',
    'Write-Host "SwitchboardOS bootstrap: Windows OpenSSH preset"',
    '$os = Get-CimInstance Win32_OperatingSystem',
    'Write-Host ("OS release: {0} {1}" -f $os.Caption, $os.Version)',
    '$sshService = Get-Service sshd -ErrorAction SilentlyContinue',
    'if ($null -eq $sshService) {',
    '  Write-Warning "OpenSSH Server service (sshd) is not installed."',
    '} else {',
    '  Write-Host ("sshd status: {0}" -f $sshService.Status)',
    '}',
    'foreach ($cmd in @("ssh", "scp", "powershell", "Get-Process", "Get-Service")) {',
    '  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Write-Host "ok: $cmd" } else { Write-Warning "missing: $cmd" }',
    '}',
    options.installPackages
      ? 'Write-Host "Package installation is not automated by this MVP preset; install OpenSSH Server through Windows Optional Features if needed."'
      : 'Write-Host "Package installation disabled by generator option."',
    'Write-Host "=============================================="',
    'Write-Host "  Bootstrap Summary"',
    'Write-Host "=============================================="',
    'Write-Host "Preset:     windows-openssh"',
    `Write-Host "Generated:  ${generatedAt}"`,
    `Write-Host "Host:       ${host ? host.name || host.address || host.hostname : 'N/A'}"`,
    'Write-Host "Secrets:    None read or stored"',
    'Write-Host "=============================================="',
    'Write-Host "Bootstrap checks complete. No secrets were read or stored."',
    '',
  ];
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

function appendSummary(
  lines: string[],
  presetId: BootstrapPresetId,
  host: HostRecord | null,
  options: Required<BootstrapGenerateOptions>,
  generatedAt: string,
  packageSummary: string,
): void {
  lines.push(
    '',
    'echo ""',
    'echo "=============================================="',
    'echo "  Bootstrap Summary"',
    'echo "=============================================="',
    `echo "Preset:     ${presetId}"`,
    `echo "Generated:  ${generatedAt}"`,
    'echo "Host:       ' + (host ? host.name || host.address || host.hostname : 'N/A') + '"',
    `echo "Packages:   ${packageSummary}"`,
    'echo "Docker:     ' + (options.includeDockerCheck ? 'Checked"' : 'Skipped') + '"',
    'echo "Secrets:    None read or stored"',
    'echo "=============================================="',
    'echo "Bootstrap checks complete. No secrets were read or stored."',
    '',
  );
}
