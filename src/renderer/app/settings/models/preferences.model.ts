/**
 * SwitchboardOS — Settings Models
 *
 * Shared type definitions for the settings storage system.
 */

export type DefaultWindowBehavior = 'floating' | 'tile-right' | 'tile-bottom';

export interface UserPreferences {
  theme: string;
  language: string;
  defaultWindowBehavior: DefaultWindowBehavior;
}

export type PreferenceKey = keyof UserPreferences;
