/**
 * Settings model — TypeScript interfaces for all user preferences.
 *
 * This module defines the shape of the settings store and the typed
 * preference keys that the SettingsService works with.
 */

/** Window layout preferences for a single window or the default layout */
export interface WindowLayoutPrefs {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

/** All user preferences — the complete settings shape */
export interface UserPreferences {
  theme: ThemeMode;
  language: string;
  defaultWindowBehavior: WindowLayoutPrefs;
  [key: string]: unknown;
}

/** Theme mode options */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Default preferences applied when no user overrides exist */
export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark' as const,
  language: 'en',
  defaultWindowBehavior: {
    width: 1280,
    height: 800,
  },
};

/** Type-safe preference key union */
export type PreferenceKey = keyof UserPreferences;
