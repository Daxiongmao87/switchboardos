#!/usr/bin/env node
// Node-only smoke test for the host connection probe.
// Boots a fake SSH listener and a closed port, then runs probeHost
// against each and asserts the result shape and outcome.

const { createServer } = require('net');
const { setTimeout: delay } = require('timers/promises');
const { probeHost } = require('../dist/src/main/host-connection-tester.js');

let failures = 0;

function assert(label, cond, detail) {
  if (cond) {
    console.log(`  ok  - ${label}`);
  } else {
    failures++;
    console.log(`  FAIL- ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

function listenOnFreePort(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function reserveAndClosePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(() => resolve()));
  return port;
}

async function caseSshBanner() {
  console.log('case: SSH banner');
  const server = await listenOnFreePort((sock) => {
    sock.write('SSH-2.0-OpenSSH_test\r\n');
    sock.end();
  });
  try {
    const { port } = server.address();
    const result = await probeHost({ address: '127.0.0.1', port, timeoutMs: 2000 });
    assert('success is true', result.success === true, JSON.stringify(result));
    assert('protocolDetected is ssh', result.protocolDetected === 'ssh', JSON.stringify(result));
    assert(
      'banner contains SSH-2.0',
      typeof result.banner === 'string' && result.banner.includes('SSH-2.0'),
      JSON.stringify(result)
    );
    assert('addressTried is 127.0.0.1', result.addressTried === '127.0.0.1');
    assert('portTried matches', result.portTried === port);
    assert('latencyMs is a number', typeof result.latencyMs === 'number');
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

async function caseGenericBanner() {
  console.log('case: non-SSH banner');
  const server = await listenOnFreePort((sock) => {
    sock.write('220 mock.smtp\r\n');
    sock.end();
  });
  try {
    const { port } = server.address();
    const result = await probeHost({ address: '127.0.0.1', port, timeoutMs: 2000 });
    assert('success is true', result.success === true, JSON.stringify(result));
    assert(
      'protocolDetected is unknown',
      result.protocolDetected === 'unknown',
      JSON.stringify(result)
    );
    assert(
      'banner non-empty',
      typeof result.banner === 'string' && result.banner.length > 0,
      JSON.stringify(result)
    );
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

async function caseSilentAccept() {
  console.log('case: silent accept (no banner)');
  const sockets = [];
  const server = await listenOnFreePort((sock) => {
    sockets.push(sock);
  });
  try {
    const { port } = server.address();
    const result = await probeHost({ address: '127.0.0.1', port, timeoutMs: 4000 });
    assert('success is true', result.success === true, JSON.stringify(result));
    assert('banner is undefined', result.banner === undefined, JSON.stringify(result));
    assert('protocolDetected is unknown', result.protocolDetected === 'unknown');
  } finally {
    sockets.forEach((s) => s.destroy());
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

async function caseClosedPort() {
  console.log('case: closed port');
  const port = await reserveAndClosePort();
  await delay(50);
  const result = await probeHost({ address: '127.0.0.1', port, timeoutMs: 2000 });
  assert('success is false', result.success === false, JSON.stringify(result));
  assert(
    'errorCode is set',
    typeof result.errorCode === 'string' && result.errorCode.length > 0,
    JSON.stringify(result)
  );
  assert('protocolDetected is unknown', result.protocolDetected === 'unknown');
}

async function caseInvalidPort() {
  console.log('case: invalid port');
  const result = await probeHost({ address: '127.0.0.1', port: 0, timeoutMs: 1000 });
  assert('success is false', result.success === false, JSON.stringify(result));
  assert('errorCode is EPORTRANGE', result.errorCode === 'EPORTRANGE', JSON.stringify(result));
}

async function caseMissingAddress() {
  console.log('case: missing address');
  const result = await probeHost({ address: '', port: 22, timeoutMs: 1000 });
  assert('success is false', result.success === false, JSON.stringify(result));
  assert('errorCode is EADDRMISSING', result.errorCode === 'EADDRMISSING', JSON.stringify(result));
}

async function caseTimeout() {
  console.log('case: connect timeout');
  // RFC 5737 TEST-NET-1 — non-routable, forces ETIMEDOUT.
  const result = await probeHost({ address: '192.0.2.1', port: 22, timeoutMs: 600 });
  assert('success is false', result.success === false, JSON.stringify(result));
  assert(
    'errorCode is set',
    typeof result.errorCode === 'string' && result.errorCode.length > 0,
    JSON.stringify(result)
  );
}

async function main() {
  await caseSshBanner();
  await caseGenericBanner();
  await caseSilentAccept();
  await caseClosedPort();
  await caseInvalidPort();
  await caseMissingAddress();
  await caseTimeout();

  if (failures > 0) {
    console.error(`\n${failures} smoke assertion(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll smoke assertions passed.');
  }
}

main().catch((err) => {
  console.error('Smoke runner crashed:', err);
  process.exit(2);
});
