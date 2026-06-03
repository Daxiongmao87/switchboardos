#!/usr/bin/env node
// Focused smoke test for the MVP bootstrap generator.
// Expects `npm run build` to have emitted dist/src/main/bootstrap-generator.js.

const assert = require('assert/strict');
const {
  generateBootstrapScript,
  listBootstrapPresets,
} = require('../dist/src/main/bootstrap-generator.js');

const host = {
  id: 'bootstrap-smoke-host',
  name: 'Bootstrap smoke host',
  address: '192.0.2.42',
  hostname: 'smoke.example',
  port: 2222,
  username: 'operator',
  authMode: 'agent',
  tags: ['smoke'],
  notes: '',
  lastConnectionStatus: 'untested',
  lastCheckedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const presets = listBootstrapPresets();
assert.equal(presets.length, 6, 'expected full design-doc bootstrap preset set');
assert.deepEqual(
  presets.map((preset) => preset.id).sort(),
  ['arch-linux', 'debian-ubuntu', 'generic-posix', 'macos', 'rhel-family', 'windows-openssh'],
);

const debian = generateBootstrapScript({
  presetId: 'debian-ubuntu',
  hostId: host.id,
  options: {
    installPackages: true,
    includeDockerCheck: true,
  },
}, host);
assert.equal(debian.hostId, host.id);
assert.match(debian.script, /SwitchboardOS local bootstrap script/);
assert.match(debian.script, /Host profile: Bootstrap smoke host/);
assert.match(debian.script, /apt-get install -y/);
assert.match(debian.script, /Checking Docker availability/);
assert.doesNotMatch(debian.script, /passphrase|password/i);

const generic = generateBootstrapScript({
  presetId: 'generic-posix',
  options: {
    installPackages: false,
    includeDockerCheck: false,
  },
});
assert.equal(generic.hostId, null);
assert.match(generic.script, /Host profile: none selected/);
assert.doesNotMatch(generic.script, /apt-get install/);
assert.doesNotMatch(generic.script, /Checking Docker availability/);

const rhel = generateBootstrapScript({ presetId: 'rhel-family' }, host);
assert.match(rhel.script, /dnf\/yum/);
assert.match(rhel.script, /openssh-clients/);

const arch = generateBootstrapScript({ presetId: 'arch-linux' }, host);
assert.match(arch.script, /pacman/);
assert.match(arch.script, /openssh/);

const macos = generateBootstrapScript({ presetId: 'macos' }, host);
assert.match(macos.script, /Darwin/);
assert.match(macos.script, /Homebrew/);

const windows = generateBootstrapScript({ presetId: 'windows-openssh' }, host);
assert.match(windows.script, /PowerShell preset: windows-openssh/);
assert.match(windows.script, /OpenSSH Server/);

console.log('Bootstrap generator smoke passed.');
