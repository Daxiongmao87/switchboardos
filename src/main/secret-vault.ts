import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface SecretVaultBackend {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  getSelectedStorageBackend?(): string;
}

interface StoredSecretRecord {
  key: string;
  ciphertext: string;
  backend: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSecretFile {
  version: 1;
  records: StoredSecretRecord[];
}

export interface SecretMetadata {
  key: string;
  backend: string;
  createdAt: string;
  updatedAt: string;
}

export class SecretVaultUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretVaultUnavailableError';
  }
}

export class SecretVault {
  private readonly fileName = 'secure-secrets.json';

  constructor(
    private readonly userDataPath: () => string,
    private readonly backend: SecretVaultBackend,
  ) {}

  storageFilePath(): string {
    return join(this.userDataPath(), this.fileName);
  }

  store(key: string, value: string): SecretMetadata {
    const normalizedKey = this.normalizeKey(key);
    this.assertAvailable();

    if (value.length === 0) {
      throw new Error('Secret value must not be empty.');
    }

    const now = new Date().toISOString();
    const state = this.readState();
    const existing = state.records.find((record) => record.key === normalizedKey);
    const ciphertext = this.backend.encryptString(value).toString('base64');
    const backend = this.selectedBackend();

    if (existing) {
      existing.ciphertext = ciphertext;
      existing.backend = backend;
      existing.updatedAt = now;
    } else {
      state.records.push({
        key: normalizedKey,
        ciphertext,
        backend,
        createdAt: now,
        updatedAt: now,
      });
    }

    this.writeState(state);
    const record = state.records.find((entry) => entry.key === normalizedKey);
    if (!record) {
      throw new Error('Stored secret record could not be found after write.');
    }

    return this.toMetadata(record);
  }

  retrieveForMain(key: string): string | null {
    const normalizedKey = this.normalizeKey(key);
    this.assertAvailable();

    const record = this.readState().records.find((entry) => entry.key === normalizedKey);
    if (!record) {
      return null;
    }

    return this.backend.decryptString(Buffer.from(record.ciphertext, 'base64'));
  }

  has(key: string): boolean {
    const normalizedKey = this.normalizeKey(key);
    return this.readState().records.some((entry) => entry.key === normalizedKey);
  }

  delete(key: string): boolean {
    const normalizedKey = this.normalizeKey(key);
    const state = this.readState();
    const nextRecords = state.records.filter((entry) => entry.key !== normalizedKey);
    if (nextRecords.length === state.records.length) {
      return false;
    }

    this.writeState({
      version: 1,
      records: nextRecords,
    });
    return true;
  }

  metadata(key: string): SecretMetadata | null {
    const normalizedKey = this.normalizeKey(key);
    const record = this.readState().records.find((entry) => entry.key === normalizedKey);
    return record ? this.toMetadata(record) : null;
  }

  private assertAvailable(): void {
    if (!this.backend.isEncryptionAvailable()) {
      throw new SecretVaultUnavailableError(
        'Electron safeStorage encryption is unavailable; refusing to persist raw secret material.',
      );
    }
  }

  private selectedBackend(): string {
    return this.backend.getSelectedStorageBackend?.() ?? 'safeStorage';
  }

  private normalizeKey(key: string): string {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new Error('Secret key is required.');
    }
    return normalizedKey;
  }

  private readState(): StoredSecretFile {
    const filePath = this.storageFilePath();
    if (!existsSync(filePath)) {
      return {
        version: 1,
        records: [],
      };
    }

    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<StoredSecretFile>;
    return {
      version: 1,
      records: Array.isArray(parsed.records)
        ? parsed.records.filter((record): record is StoredSecretRecord => this.isStoredRecord(record))
        : [],
    };
  }

  private writeState(state: StoredSecretFile): void {
    const filePath = this.storageFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(tempPath, filePath);
  }

  private isStoredRecord(record: unknown): record is StoredSecretRecord {
    if (!record || typeof record !== 'object') {
      return false;
    }

    const candidate = record as Partial<StoredSecretRecord>;
    return (
      typeof candidate.key === 'string' &&
      typeof candidate.ciphertext === 'string' &&
      typeof candidate.backend === 'string' &&
      typeof candidate.createdAt === 'string' &&
      typeof candidate.updatedAt === 'string'
    );
  }

  private toMetadata(record: StoredSecretRecord): SecretMetadata {
    return {
      key: record.key,
      backend: record.backend,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
