# Feature: Name Suggestions Dropdown (Player Roster)

## Feature specification
When a user types a player/team name into the "ผู้แข่งขัน" input and adds it, the
name is remembered in a persistent roster. The next time the user focuses or types
in the input, previously used names appear in a custom dropdown that can be tapped
to add the player instantly. Each saved name has a small "×" to remove it from the
roster when it is no longer needed.

Goal: stop people from re-typing the same regular players every session.

## Scope
- Persist every added name into a roster (localStorage, device-local).
- Auto-seed the roster from names already present on the board (incl. synced ones).
- Custom dropdown below the input: full list on focus, filtered as you type.
- Tap a suggestion → add that player immediately (dropdown stays open for more).
- Per-suggestion "×" removes the name from the roster.
- Hide names already in the current player list from the suggestions.
- Keyboard: ↑/↓ to move, Enter to add highlighted, Esc to close. Outside click closes.

## Out of scope
- Syncing the roster across devices via Firebase (kept local to avoid touching the
  delicate save/merge guards). The roster still grows from synced player names that
  land on the board, which gives a partial shared benefit for free.
- Editing/renaming a saved name in place.
- Categories/tags/favourites ordering beyond most-recently-used first.

## User stories
- As an organiser, I want my regular players suggested so that I can rebuild the
  roster in a few taps instead of retyping every name.
- As an organiser, I want to remove a name I mistyped or no longer use so that the
  suggestions stay clean.

## Acceptance criteria
- Adding a name stores it; it appears in the dropdown on the next focus.
- Typing filters suggestions (case-insensitive substring).
- A name already in the current list is not suggested.
- Tapping a suggestion adds the player and removes it from the visible list.
- Tapping "×" removes the name from the roster permanently (survives reload).
- Roster survives reload (localStorage). All pure logic covered by tests ≥95%.

## Architecture & technical design
- `known-names.js` — pure, browser/Node dual module (mirrors `schedule.js`):
  `addKnownName`, `removeKnownName`, `mergeKnownNames`, `filterKnownNames`,
  `normalizeName`. No DOM, no storage — fully unit-testable.
- `script.js` — owns the localStorage read/write (`bmKnownNames`), the dropdown
  DOM rendering, and event wiring. Seeds the roster from `state.players` after each
  render so existing/synced names populate it.
- `index.html` — wraps the input in a positioned container + an empty `<div>` the
  dropdown renders into.
- `style.css` — dropdown styling consistent with the existing dark/light theme.

## UI/UX
- Dropdown anchored under the input, scrollable, max-height capped.
- Empty/no-match → dropdown hidden (no empty box).
- Active row highlighted for keyboard nav.

## Edge cases
- Duplicate names (case-insensitive) are not stored twice; latest casing wins.
- Empty/whitespace names ignored.
- Removing a roster name does not remove an already-added player.

## Testing strategy
- Unit-test all `known-names.js` functions incl. dedup, filtering, exclusion,
  ordering, and empty/whitespace handling (`known-names.test.js`, node:test).
- Manual: add/remove, reload persistence, filter, keyboard nav.

## Todo
- [x] known-names.js pure module
- [x] known-names.test.js (24 tests, all functions/branches covered)
- [x] HTML markup (`.player-input-wrap` + `#name-suggestions`)
- [x] script.js wiring + localStorage (`bmKnownNames`)
- [x] CSS (themed dropdown)
- [x] run tests — 58/58 pass
