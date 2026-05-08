/**
 * SwitchboardOS — Settings Storage Service
 *
 * Provides a typed API for reading and writing user preferences.
 * Persists data to localStorage with an in-memory fallback.
 *
 * API:
 *   - getPreference<T>(key: string): T | null
 *   - setPreference(key: string, value: unknown): void
 *   - deletePreference(key: string): void
 *   - getAllPreferences(): Record<string, unknown>
 *   - getTheme(): ThemeMode
 *   - setTheme(theme: ThemeMode): void
 *   - getLanguage(): LanguageCode
 *   - setLanguage(language: LanguageCode): void
 *   - getDefaultWindowBehavior(): DefaultWindowBehavior
 *   - setDefaultWindowBehavior(behavior: DefaultWindowBehavior): void
 *   - reset(): void
 */

import { Injectable } from '@angular/core';
import {
  UserPreferences,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_WINDOW_BEHAVIOR,
  ThemeMode,
  LanguageCode,
  DefaultWindowBehavior,
} from '../models/preferences.model';

const SETTINGS_STORAGE_KEY = 'switchboardos:preferences';

/**
 * Strategy interface for settings persistence backends.
 */
export interface SettingsPersistence {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * LocalStorage implementation of SettingsPersistence.
 */
export class LocalStoragePersistence implements SettingsPersistence {
  read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage unavailable
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage unavailable
    }
  }
}

/**
 * In-memory fallback persistence (for when localStorage is unavailable).
 */
export class MemoryPersistence implements SettingsPersistence {
  private store: Record<string, string> = {};

  read(key: string): string | null {
    return this.store[key] ?? null;
  }

  write(key: string, value: string): void {
    this.store[key] = value;
  }

  remove(key: string): void {
    delete this.store[key];
  }
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  /** The persistence backend (auto-detected). */
  readonly persistence: SettingsPersistence;

  /** Change listeners keyed by preference key. */
  private changeListeners: Map<keyof UserPreferences, Set<() => void>> = new Map();

  constructor() {
    // Auto-detect persistence backend
    this.persistence = new LocalStoragePersistence()
      .read(SETTINGS_STORAGE_KEY) !== null
      ? new LocalStoragePersistence()
      : new MemoryPersistence();

    // Initialise preferences from persistence layer
    this.preferences = this.loadAll();
  }

  /**
   * Load all preferences from the persistence layer.
   */
  private loadAll(): UserPreferences {
    const raw = this.persistence.read(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_USER_PREFERENCES };
    }
    try {
      const stored = JSON.parse(raw) as Partial<UserPreferences>;
      return {
        ...DEFAULT_USER_PREFERENCES,
        ...stored,
        defaultWindowBehavior: {
          ...DEFAULT_WINDOW_BEHAVIOR,
          ...(stored.defaultWindowBehavior ?? {}),
        },
      };
    } catch {
      console.warn('SettingsService: corrupted preferences data, resetting to defaults');
      return { ...DEFAULT_USER_PREFERENCES };
    }
  }

  private preferences: UserPreferences;

  /**
   * Persist current in-memory preferences to the persistence layer.
   */
  private persist(): void {
    this.persistence.write(SETTINGS_STORAGE_KEY, JSON.stringify(this.preferences));
  }

  /**
   * Emit change notifications for a given preference key.
   */
  private emitChange(key: keyof UserPreferences): void {
    const listeners = this.changeListeners.get(key);
    if (listeners) {
      listeners.forEach((fn) => fn());
    }
  }

  /**
   * Subscribe to changes for a specific preference key.
   * Returns an unsubscribe function.
   */
  onChange(key: keyof UserPreferences, callback: () => void): () => void {
    if (!this.changeListeners.has(key)) {
      this.changeListeners.set(key, new Set());
    }
    this.changeListeners.get(key)!.add(callback);
    return () => this.changeListeners.get(key)?.delete(callback);
  }

  /**
   * Get a preference by key (generic, returns any type).
   */
  getPreference<T>(key: keyof UserPreferences): T | null {
    const value = this.preferences[key];
    if (value === undefined || value === null) {
      return null;
    }
    return value as T;
  }

  /**
   * Set a preference by key.
   */
  setPreference(key: keyof UserPreferences, value: unknown): void {
    (this.preferences as unknown as Record<string, unknown>)[key as string] = value;
    this.persist();
    this.emitChange(key);
  }

  /**
   * Delete (reset) a preference to its default value.
   */
  deletePreference(key: keyof UserPreferences): void {
    switch (key) {
      case 'theme':
        this.preferences.theme = DEFAULT_USER_PREFERENCES.theme;
        break;
      case 'language':
        this.preferences.language = DEFAULT_USER_PREFERENCES.language;
        break;
      case 'defaultWindowBehavior':
        this.preferences.defaultWindowBehavior = { ...DEFAULT_WINDOW_BEHAVIOR };
        break;
    }
    this.persist();
    this.emitChange(key);
  }

  /**
   * Get all preferences as a plain record.
   */
  getAllPreferences(): Record<string, unknown> {
    return { ...this.preferences } as Record<string, unknown>;
  }

  // ─── Typed accessors ───

  getTheme(): ThemeMode {
    return this.preferences.theme;
  }

  setTheme(theme: ThemeMode): void {
    this.preferences.theme = theme;
    this.persist();
    this.emitChange('theme');
  }

  getLanguage(): LanguageCode {
    return this.preferences.language;
  }

  setLanguage(language: LanguageCode): void {
    this.preferences.language = language;
    this.persist();
    this.emitChange('language');
  }

  /**
   * Get window behavior (legacy accessor for the settings component).
   */
  getWindowBehavior(): { width: number; height: number } {
    return {
      width: this.preferences.defaultWindowBehavior.defaultWidth,
      height: this.preferences.defaultWindowBehavior.defaultHeight,
    };
  }

  setDefaultWindowBehavior(behavior: DefaultWindowBehavior): void {
    this.preferences.defaultWindowBehavior = { ...behavior };
    this.persist();
  }

  /**
   * Reset all preferences to defaults.
   */
  reset(): void {
    this.preferences = { ...DEFAULT_USER_PREFERENCES };
    this.persist();
  }
}
