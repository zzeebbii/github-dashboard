# ADR-0021: i18n, themes and accessibility

**Status:** Accepted
**Date:** 2026-10-13

## Context

The dashboard must meet current web-app standards: more than one language,
light and dark themes, and accessibility "to the max". The UI follows the Claude
Design prototype in `docs/pr-dashboard-designs/`, which already carries English,
Finnish, Swedish and German strings and light and dark tokens.

## Decision

**Languages.** English, Finnish and Swedish (German is out of scope). A typed message
catalogue with English as the source and fallback; runtime switching without reload;
`<html lang>` follows the choice; dates and numbers use `Intl` in the selected
language. GitHub content (titles, comments) is never translated. No i18n library
unless the catalogue needs plural rules beyond `Intl.PluralRules`. `pnpm i18n:check`
is part of `verify:static`.

**Themes.** Light, dark and system (the default, following `prefers-color-scheme`
live). The header has a quick light/dark toggle; Settings offers all three. The
theme is applied before first paint by a small static script, so there is no flash
and no inline script (the CSP forbids one). Colour tokens come from the design file.

**Accessibility.** WCAG 2.2 AA as the floor:

- real `<button>`, `<a href>` and labelled `<input>` elements; no click handlers on
  `div`/`span`; `aria-label` on icon-only buttons;
- status always as icon plus text, never colour alone; text contrast at least 4.5:1
  (3:1 for large text and UI components) in both themes, tested over the token table;
- landmarks, a skip link, visible focus, one polite live region for status updates;
- modal dialogs (PR panel, command palette, drawer) trap focus, return it on close
  and close on Esc;
- single-key shortcuts work only when the list has focus, never while typing, and can
  be turned off;
- `prefers-reduced-motion` disables animations;
- layouts work from 320 px wide;
- axe runs in every component test and every E2E step, in both themes.

## Consequences

- Accessibility and translation regressions fail CI.
- Adding a language is adding one catalogue file.
- Cost: every UI string goes through the catalogue, including small labels.
- Cost: Finnish and Swedish strings need a human review whenever they change.

## Alternatives considered

| Option                           | Why not                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| i18next / FormatJS               | Plurals and formatting are covered by `Intl`; a library adds weight for no gain today. |
| Light/dark only, no system       | Users expect the OS setting to be respected by default.                                |
| Manual accessibility audits only | Unchecked accessibility decays, the same reasoning as ADR-0005.                        |

## Revisit when

A language with complex plural or gender rules is added, or the app grows UI that
axe cannot check (canvas, charts).
