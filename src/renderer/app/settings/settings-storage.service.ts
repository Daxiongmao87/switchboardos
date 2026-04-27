/**
 * SwitchboardOS — Settings Storage Service
 *
 * Provides typed access to user preferences with local persistence.
 *
 * Storage strategy:
 *   - MVP: localStorage for user preferences (fast, no extra deps)
 *   - M2.2+: SQLite persistence can be added via Electron main process IPC
 *     (service will accept an injectable PersistenceLayer abstraction)
 *
 * Preferences persisted:
 *   - theme: current theme token (e.g. "catppuccin-mocha", "catppuccin-latte")
 *   - language: locale string (e.g. "en-US", "zh-CN")
 *   - defaultWindowBehavior: how new windows should open ("floating" | "tile-right" | "tile-bottom")
 */

import { Injectable } from '@angular/core';

/* ── Preference Types ─────────────────────────────────────────────── */

/** Window behavior when opening a new window */
export type DefaultWindowBehavior = 'floating' | 'tile-right' | 'tile-bottom';

/** All preferences the user can configure */
export interface UserPreferences {
  theme: string;
  language: string;
  defaultWindowBehavior: DefaultWindowBehavior;
}

/** Keys that can be individually stored/retrieved */
export type PreferenceKey = keyof UserPreferences;

/* ── Default Values ───────────────────────────────────────────────── */

const DEFAULTS: UserPreferences = {
  theme: 'catppuccin-mocha',
  language: 'en-US',
  defaultWindowBehavior: 'floating',
};

const STORAGE_KEY = 'switchboardos:preferences';

/* ── Service ──────────────────────────────────────────────────────── */

@Injectable({
  providedIn: 'root',
})
export class SettingsStorageService {
  /* ── Read all preferences ─────────────────────────────────────── */

  /** Return a fresh copy of all preferences from storage (defaults if none saved). */
  getAllPreferences(): UserPreferences {
    const stored = this.readFromStorage();
    return { ...DEFAULTS, ...stored };
  }

  /* ── Individual getters (typed accessors) ─────────────────────── */

  /** Get the current theme token. */
  getTheme(): string {
    return this.getAllPreferences().theme;
  }

  /** Get the current language/locale. */
  getLanguage(): string {
    return this.getAllPreferences().language;
  }

  /** Get the default window behavior. */
  getDefaultWindowBehavior(): DefaultWindowBehavior {
    return this.getAllPreferences().defaultWindowBehavior;
  }

  /* ── Individual typed setters ─────────────────────────────────── */

  setTheme(theme: string): void {
    this.setPreference('theme', theme);
  }

  setLanguage(language: string): void {
    this.setPreference('language', language);
  }

  setDefaultWindowBehavior(
    behavior: DefaultWindowBehavior,
  ): void {
    this.setPreference('defaultWindowBehavior', behavior);
  }

  /* ── Generic key-based API ────────────────────────────────────── */

  /**
   * Get a single preference by key.
   * @returns the value, or the default if not yet stored.
   */
  getPreference<K extends PreferenceKey>(
    key: K,
  ): UserPreferences[K] {
    const all = this.getAllPreferences();
    return all[key];
  }

  /**
   * Set a single preference by key.
   * @throws if value is not a valid value for the given key.
   */
  setPreference<K extends PreferenceKey>(
    key: K,
    value: UserPreferences[K],
  ): void {
    const all = this.getAllPreferences();
    const updated: UserPreferences = { ...all, [key]: value };
    this.writeToStorage(updated);
  }

  /**
   * Delete (reset) a single preference to its default value.
   */
  deletePreference<K extends PreferenceKey>(key: K): void {
    const all = this.getAllPreferences();
    const updated: UserPreferences = { ...all };
    // Remove the key from stored values, falling back to default on next read.
    delete updated[key];
    // Also remove from storage entirely so the default surfaces.
    this.clearStorageIfEmpty();
    // Re-write remaining keys; if nothing remains, just clear storage.
    const remaining = { ...DEFAULTS, ...all };
    delete remaining[key];
    this.writeToStorage(remaining);
  }

  /**
   * Batch-set multiple preferences at once.
   */
  setPreferences(partial: Partial<UserPreferences>): void {
    const all = this.getAllPreferences();
    const updated: UserPreferences = { ...all, ...partial };
    this.writeToStorage(updated);
  }

  /* ── Persistence (localStorage) ───────────────────────────────── */

  /** Read stored preferences from localStorage. Returns `{}` when none exist. */
  private readFromStorage(): Partial<UserPreferences> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return {};
      return JSON.parse(raw) as Partial<UserPreferences>;
    } catch {
      // Corrupt storage — treat as empty.
      return {};
    }
  }

  /** Write preferences to localStorage. */
  private writeToStorage(prefs: UserPreferences): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Storage full or unavailable — silently degrade.
      // The in-memory defaults + partial storage still work.
    }
  }

  /** If storage is empty, remove the key to keep things clean. */
  private clearStorageIfEmpty(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null || raw === '{}') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore — best effort.
    }
  }
}
