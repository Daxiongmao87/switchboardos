/**
 * SwitchboardOS — User Preferences Model
 *
 * Defines the shape of user preferences stored in the settings persistence layer.
 */

/**
 * Supported UI themes.
 */
export type ThemeMode = 'dark' | 'light';

/**
 * Supported display languages (BCP 47 tags).
 */
export type LanguageCode = string;

/**
 * Default window behavior preferences.
 */
export interface DefaultWindowBehavior {
  /** Whether new windows maximize on creation */
  maximizeOnOpen: boolean;
  /** Whether new windows start fullscreen */
  fullscreenOnOpen: boolean;
  /** Default window width (in pixels) */
  defaultWidth: number;
  /** Default window height (in pixels) */
  defaultHeight: number;
  /** Whether windows should remember their last position */
  rememberPosition: boolean;
}

/**
 * Default values for window behavior.
 */
export const DEFAULT_WINDOW_BEHAVIOR: DefaultWindowBehavior = {
  maximizeOnOpen: false,
  fullscreenOnOpen: false,
  defaultWidth: 1280,
  defaultHeight: 800,
  rememberPosition: true,
};

/**
 * User preferences — the complete preferences model.
 */
export interface UserPreferences {
  /** UI theme (dark/light) */
  theme: ThemeMode;
  /** Display language */
  language: LanguageCode;
  /** Default window behavior settings */
  defaultWindowBehavior: DefaultWindowBehavior;
}

/**
 * Default preferences.
 */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'dark',
  language: 'en-US',
  defaultWindowBehavior: { ...DEFAULT_WINDOW_BEHAVIOR },
};
