/**
 * Settings service — manages user preferences with typed accessors.
 *
 * Provides getPreference, setPreference, deletePreference, and
 * getAllPreferences backed by a persistence layer.  Typed accessors
 * are provided for common settings (theme, language, window behavior).
 */

import { Injectable } from '@angular/core';
import { DEFAULT_PREFERENCES, PreferenceKey, UserPreferences } from './settings-model';

/* ------------------------------------------------------------------ */
/*  Persistence layer                                                 */
/* ------------------------------------------------------------------ */

/**
 * Abstract persistence interface.  Implementations may use
 * localStorage, electron-store, IndexedDB, etc.
 */
export interface SettingsPersistence {
  read<T>(key: string): T | undefined;
  write<T>(key: string, value: T): void;
  remove(key: string): void;
}

/** localStorage-backed persistence */
@Injectable({ providedIn: 'root' })
export class LocalStoragePersistence implements SettingsPersistence {
  private readonly prefix: string;

  constructor() {
    this.prefix = 'sb:';
  }

  read<T>(key: string): T | undefined {
    const raw = localStorage.getItem(this.prefix + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  write<T>(key: string, value: T): void {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }
}

/* ------------------------------------------------------------------ */
/*  SettingsService                                                   */
/* ------------------------------------------------------------------ */

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly STORAGE_KEY = 'user-preferences';
  private preferences: UserPreferences;
  private readonly listeners: Map<PreferenceKey, Set<() => void>> = new Map();

  constructor(private persistence: SettingsPersistence) {
    // Load persisted preferences or fall back to defaults
    const saved = this.persistence.read<UserPreferences>(this.STORAGE_KEY);
    this.preferences = saved ? this.mergePreferences(saved) : { ...DEFAULT_PREFERENCES };
  }

  /** Get a typed preference by key */
  getPreference<T extends PreferenceKey>(key: T): UserPreferences[T] {
    return this.preferences[key] as UserPreferences[T];
  }

  /** Set a preference and persist */
  setPreference<T extends PreferenceKey>(key: T, value: UserPreferences[T]): void {
    this.preferences[key] = value;
    this.persist();
    this.notifyListeners(key);
  }

  /** Delete a preference — reverts to default */
  deletePreference<T extends PreferenceKey>(key: T): void {
    this.preferences[key] = DEFAULT_PREFERENCES[key];
    this.persist();
    this.notifyListeners(key);
  }

  /** Return a deep copy of all preferences */
  getAllPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  /* ---------- typed accessors ---------- */

  getTheme(): 'light' | 'dark' | 'system' {
    return this.getPreference('theme');
  }

  setTheme(theme: 'light' | 'dark' | 'system'): void {
    this.setPreference('theme', theme);
  }

  getLanguage(): string {
    return this.getPreference('language');
  }

  setLanguage(language: string): void {
    this.setPreference('language', language);
  }

  getWindowBehavior() {
    return this.getPreference('defaultWindowBehavior');
  }

  setWindowBehavior(behavior: UserPreferences['defaultWindowBehavior']): void {
    this.setPreference('defaultWindowBehavior', behavior);
  }

  /* ---------- internals ---------- */

  /** Subscribe to preference changes (for reactive components) */
  onChange<T extends PreferenceKey>(key: T, callback: () => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);
    return () => this.listeners.get(key)?.delete(callback);
  }

  private persist(): void {
    this.persistence.write(this.STORAGE_KEY, this.preferences);
  }

  private notifyListeners(key: PreferenceKey): void {
    this.listeners.get(key)?.forEach((cb) => cb());
  }

  private mergePreferences(saved: UserPreferences): UserPreferences {
    return {
      ...DEFAULT_PREFERENCES,
      ...saved,
      defaultWindowBehavior: {
        ...DEFAULT_PREFERENCES.defaultWindowBehavior,
        ...(saved.defaultWindowBehavior ?? {}),
      },
    };
  }
}
