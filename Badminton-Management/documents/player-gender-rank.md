# Player Gender & Rank

## Feature specification
Allow each player in the setup page to carry two extra attributes:

1. **Gender** — `ชาย` (male) or `หญิง` (female). **Required**, no default: a newly
   added player has no gender until the user picks one.
2. **Rank / skill level** — one of 4 simple levels (`มือใหม่`, `มือกลาง`, `มือเก่ง`,
   `มือโปร`). **Optional** — may be left unset (`ไม่ระบุ`).

Both are edited from the player chip on the Settings tab via an inline editor.

## Scope
- Capture, display, persist (Firebase + local cache) and sync gender & rank per player.
- Block schedule generation until **every** player has a gender (enforces "required").
- Display gender (colour-coded avatar + ช/ญ tag) and rank badge on each chip.

### Out of scope (for now)
- ~~Using gender/rank inside the pairing algorithm~~ — now done: gender constraint
  (`gender-pairing-constraint.md`) and rank-balanced teams (`rank-balanced-pairing.md`).

## Data model
`state.players` stays a plain `string[]` (the immutable player id used everywhere:
scores, matches, history). Metadata lives in a parallel map keyed by name:

```js
state.playerMeta = {
  "ฟิวส์": { gender: "male",   rank: "advanced" },
  "มุก":   { gender: "female", rank: null }
}
```

- Pruned to the current roster on every normalize (removing a player drops its meta).
- Persisted alongside the rest of state to Firebase + localStorage cache.
- Merged on first-snapshot reconciliation (union of names) in `sync-guard.js`.

## Architecture
- `player-meta.js` — new pure, DOM-less, UMD module (mirrors `sync-guard.js`):
  `GENDERS`, `RANKS`, `isValidGender`, `isValidRank`, `getMeta`, `setMeta`,
  `normalizePlayerMeta`, `playersMissingGender`, `mergePlayerMeta`.
- `player-meta.test.js` — `node --test` suite for the above.
- `script.js` — owns `state.playerMeta`, persistence, chip rendering, the edit
  modal, and the generate-button guard.
- `sync-guard.js` — `mergeInitialStates` extended to merge `playerMeta`.

## UI/UX (inline — no modal)
All editing happens directly on the chip; no modal/extra taps:
- **Gender** — an inline ช / ญ toggle on each chip. One tap sets it (avatar +
  toggle colour-code blue=male, pink=female). Updates in place (no re-render, so
  it never re-animates or pops the mobile keyboard).
- **Rank** — an inline native `<select>` ("ระดับมือ" placeholder + 4 levels). The
  native picker is the easiest mobile control; tints accent once a level is set.
- Chips are laid out in a responsive grid (`auto-fill minmax(240px,1fr)`): one
  roomy row per player on phones, multiple columns when there's width.
- Chips missing a gender keep an amber dashed "attention" outline.
- Generate button disabled with `เลือกเพศให้ครบทุกคน (เหลือ N คน)` until all set.
- `renderPlayers` no longer force-focuses the name input on every render (that
  popped the keyboard on each sync/edit); add paths focus it explicitly instead.

## Edge cases
- Player removed → meta entry pruned.
- Legacy state with no `playerMeta` → treated as all-unset; user must set genders
  before generating (back-compat: existing boards keep working, just prompt for gender).
- Duplicate add is already blocked upstream; meta is keyed by the canonical name.

## Testing strategy
- Unit test all `player-meta.js` helpers (validation, prune, set, missing-gender,
  merge) + a `mergeInitialStates` case that carries `playerMeta`.
- Manually verify chip editing, the generate-button guard, and Firebase round-trip.

## Todo
- [x] `player-meta.js` + tests
- [x] persistence (state default, save, cache, applySnapshot, clears)
- [x] `sync-guard.js` merge + test
- [x] chip rendering + edit modal + styles
- [x] generate-button gender guard
- [x] pairing algorithm integration (gender constraint + rank-balanced teams)
