/**
 * The user's display preferences and the port that persists them (FR-1.3, FR-1.8).
 *
 * The browser adapter lives in infrastructure/; tests use the in-memory fake.
 */

export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";
export type Language = "en" | "fi" | "sv";

export interface Preferences {
  readonly theme: Theme;
  readonly density: Density;
  readonly language: Language;
  /** J/K/Enter move through and open list rows (FR-7.3). */
  readonly listShortcutsEnabled: boolean;
  /** The sidebar's dragged width in px; null is the 264 px default. */
  readonly sidebarWidth: number | null;
  /** The PR panel's dragged width in px; null is the default, `min(1040px, 72vw)`. */
  readonly prPanelWidth: number | null;
}

export interface PreferencesStore {
  load(): Preferences;
  save(preferences: Preferences): void;
}

export const defaultPreferences: Preferences = Object.freeze({
  theme: "system",
  density: "comfortable",
  language: "en",
  listShortcutsEnabled: true,
  sidebarWidth: null,
  prPanelWidth: null,
});
