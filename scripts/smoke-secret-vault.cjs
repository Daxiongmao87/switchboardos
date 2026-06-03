#!/usr/bin/env node

const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { app, safeStorage } = require('electron');

const { SecretVault, SecretVaultUnavailableError } = require('../dist/src/main/secret-vault.js');

function createTestEncryptionBackend() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`test-encrypted:${Buffer.from(value, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (value) => {
      const payload = value.toString('utf8');
      assert.ok(payload.startsWith('test-encrypted:'), 'test ciphertext marker is present');
      return Buffer.from(payload.slice('test-encrypted:'.length), 'base64').toString('utf8');
    },
    getSelectedStorageBackend: () => 'smoke-test-backend',
  };
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'switchboardos-secret-vault-'));
  app.setPath('userData', userDataDir);

  try {
    await app.whenReady();

    assert.ok(safeStorage, 'Electron safeStorage is available in normal Electron runtime');
    if (!safeStorage.isEncryptionAvailable()) {
      const blockedVault = new SecretVault(() => app.getPath('userData'), safeStorage);
      assert.throws(
        () => blockedVault.store('blocked-secret', 'legacy-auth-placeholder'),
        SecretVaultUnavailableError,
        'production vault refuses to store secrets when safeStorage encryption is unavailable',
      );
      console.log('secret vault smoke: production safeStorage unavailable; raw secret persistence refused');
    }

    const encryptionBackend = safeStorage.isEncryptionAvailable() ? safeStorage : createTestEncryptionBackend();
    const vault = new SecretVault(() => app.getPath('userData'), encryptionBackend);
    const secretId = `smoke-secret-${Date.now()}`;
    const secretValue = 'fixture-payload';

    const metadata = vault.store(secretId, secretValue);
    assert.equal(metadata.key, secretId);
    assert.equal(vault.retrieveForMain(secretId), secretValue);

    const rawFile = readFileSync(vault.storageFilePath(), 'utf8');
    assert.equal(rawFile.includes(secretValue), false, 'stored vault file must not contain plaintext secret');

    const reopenedVault = new SecretVault(() => app.getPath('userData'), encryptionBackend);
    assert.equal(reopenedVault.retrieveForMain(secretId), secretValue, 'secret survives vault reopen');
    assert.equal(reopenedVault.delete(secretId), true, 'delete removes existing secret');
    assert.equal(reopenedVault.retrieveForMain(secretId), null, 'deleted secret is not retrievable');

    console.log('secret vault smoke: store/retrieve/reopen/delete passed');
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
    app.quit();
  }
}

main().catch((err) => {
  console.error('secret vault smoke failed:', err);
  app.exit(1);
});
