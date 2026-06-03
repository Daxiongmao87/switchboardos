import { SettingsStorageService } from './settings-storage.service';

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Clear localStorage before and after each test to isolate runs. */
function cleanStorage(): void {
  localStorage.removeItem('switchboardos:preferences');
}

describe('SettingsStorageService', () => {
  let service: SettingsStorageService;

  beforeEach(() => {
    cleanStorage();
    service = new SettingsStorageService();
  });

  afterEach(() => {
    cleanStorage();
  });

  /* ── getAllPreferences ─────────────────────────────────────────── */

  it('should return defaults when no preferences are stored', () => {
    const prefs = service.getAllPreferences();
    expect(prefs.theme).toBe('catppuccin-mocha');
    expect(prefs.language).toBe('en-US');
    expect(prefs.defaultWindowBehavior).toBe('floating');
  });

  it('should return stored values when preferences exist', () => {
    service.setTheme('catppuccin-latte');
    const prefs = service.getAllPreferences();
    expect(prefs.theme).toBe('catppuccin-latte');
  });

  it('should merge stored values with defaults for unset keys', () => {
    service.setTheme('catppuccin-latte');
    const prefs = service.getAllPreferences();
    expect(prefs.theme).toBe('catppuccin-latte');
    // These were never set — should fall back to defaults.
    expect(prefs.language).toBe('en-US');
    expect(prefs.defaultWindowBehavior).toBe('floating');
  });

  /* ── getPreference (typed key-based getter) ────────────────────── */

  it('should get a specific preference by key', () => {
    service.setTheme('catppuccin-latte');
    expect(service.getPreference('theme')).toBe('catppuccin-latte');
  });

  it('should return default for unset key', () => {
    expect(service.getPreference('language')).toBe('en-US');
  });

  /* ── setPreference (typed key-based setter) ────────────────────── */

  it('should persist a single preference', () => {
    service.setPreference('theme', 'catppuccin-latte');
    expect(service.getPreference('theme')).toBe('catppuccin-latte');
  });

  it('should persist through a fresh getAllPreferences call', () => {
    service.setPreference('language', 'zh-CN');
    const prefs = service.getAllPreferences();
    expect(prefs.language).toBe('zh-CN');
  });

  it('should update only the specified key', () => {
    service.setTheme('catppuccin-latte');
    service.setPreference('language', 'zh-CN');
    expect(service.getPreference('theme')).toBe('catppuccin-latte');
    expect(service.getPreference('language')).toBe('zh-CN');
    expect(service.getPreference('defaultWindowBehavior')).toBe('floating');
  });

  /* ── setPreferences (batch) ────────────────────────────────────── */

  it('should batch-set multiple preferences', () => {
    service.setPreferences({
      theme: 'catppuccin-latte',
      language: 'zh-CN',
    });
    expect(service.getPreference('theme')).toBe('catppuccin-latte');
    expect(service.getPreference('language')).toBe('zh-CN');
  });

  it('should leave unset keys at their defaults', () => {
    service.setPreferences({ theme: 'catppuccin-latte' });
    expect(service.getPreference('theme')).toBe('catppuccin-latte');
    expect(service.getPreference('language')).toBe('en-US');
  });

  /* ── deletePreference (reset to default) ────────────────────────── */

  it('should reset a preference to its default after delete', () => {
    service.setTheme('catppuccin-latte');
    expect(service.getPreference('theme')).toBe('catppuccin-latte');

    service.deletePreference('theme');
    expect(service.getPreference('theme')).toBe('catppuccin-mocha');
  });

  it('should not affect other preferences when deleting one', () => {
    service.setPreferences({
      theme: 'catppuccin-latte',
      language: 'zh-CN',
    });
    service.deletePreference('theme');
    expect(service.getPreference('theme')).toBe('catppuccin-mocha');
    expect(service.getPreference('language')).toBe('zh-CN');
  });

  /* ── Typed Accessors ───────────────────────────────────────────── */

  it('getTheme should return stored theme', () => {
    service.setTheme('catppuccin-latte');
    expect(service.getTheme()).toBe('catppuccin-latte');
  });

  it('getLanguage should return stored language', () => {
    service.setLanguage('zh-CN');
    expect(service.getLanguage()).toBe('zh-CN');
  });

  it('getDefaultWindowBehavior should return stored behavior', () => {
    service.setDefaultWindowBehavior('tile-right');
    expect(service.getDefaultWindowBehavior()).toBe('tile-right');
  });

  it('setTheme should update the theme', () => {
    service.setTheme('catppuccin-latte');
    expect(service.getTheme()).toBe('catppuccin-latte');
  });

  it('setLanguage should update the language', () => {
    service.setLanguage('zh-CN');
    expect(service.getLanguage()).toBe('zh-CN');
  });

  it('setDefaultWindowBehavior should update the behavior', () => {
    service.setDefaultWindowBehavior('tile-bottom');
    expect(service.getDefaultWindowBehavior()).toBe('tile-bottom');
  });

  it('defaults should be catppuccin-mocha, en-US, floating', () => {
    const all = service.getAllPreferences();
    expect(all.theme).toBe('catppuccin-mocha');
    expect(all.language).toBe('en-US');
    expect(all.defaultWindowBehavior).toBe('floating');
  });

  /* ── Persistence (localStorage) ────────────────────────────────── */

  it('should persist preferences to localStorage', () => {
    service.setTheme('catppuccin-latte');
    const raw = localStorage.getItem('switchboardos:preferences');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.theme).toBe('catppuccin-latte');
  });

  it('should survive localStorage read (fresh instance picks up stored data)', () => {
    service.setPreferences({
      theme: 'catppuccin-latte',
      language: 'zh-CN',
      defaultWindowBehavior: 'tile-right',
    });

    // Simulate a fresh instance — storage should be picked up.
    const fresh = new SettingsStorageService();
    const prefs = fresh.getAllPreferences();
    expect(prefs.theme).toBe('catppuccin-latte');
    expect(prefs.language).toBe('zh-CN');
    expect(prefs.defaultWindowBehavior).toBe('tile-right');
  });

  it('should handle corrupt localStorage gracefully', () => {
    localStorage.setItem('switchboardos:preferences', 'not-json');
    const prefs = service.getAllPreferences();
    // Should fall back to defaults, not throw.
    expect(prefs.theme).toBe('catppuccin-mocha');
  });

  /* ── DefaultWindowBehavior type ────────────────────────────────── */

  it('should accept all valid DefaultWindowBehavior values', () => {
    service.setDefaultWindowBehavior('floating');
    service.setDefaultWindowBehavior('tile-right');
    service.setDefaultWindowBehavior('tile-bottom');
    expect(service.getDefaultWindowBehavior()).toBe('tile-bottom');
  });
});
