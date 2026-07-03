# Live Court Scorer (นับแต้มสด)

## Feature specification
Add a **full-screen live point counter** for a match that is currently being played on a
court. Instead of only typing a final score into the schedule row, a user (referee /
phone-on-court) can tap a match to open a big scoreboard and tally points rally-by-rally
with large `+1` / `−1` buttons for each side. When the game ends, the result is saved back
into that match's `scoreA` / `scoreB`, feeding the existing cumulative scoreboard.

## Scope
- A "นับแต้ม" (count points) button on every match row that opens a full-screen scorer.
- Full-screen overlay: team names, big live scores, `+1` / `−1` per side, reset, save/close.
- Enforce official 21-point badminton rules (see below), highlighting game point & winner.
- Live tally persists in state (`match.liveA` / `match.liveB`) so it survives reloads and
  **syncs across devices in real time** via the existing Firebase path.
- Committing the result copies the live tally into `scoreA` / `scoreB` (the existing save
  path), then clears the live fields.

### Out of scope
- No per-court assignment/tracking is added — the scorer is opened per **match**, not per
  physical court. (Matches already imply courts via round layout.)
- No multi-game/best-of-3 rubber tracking; one game per match, as today.
- The tournament tab keeps its own read-only score inputs — not wired to this scorer.

## Rules (as specified by the user)
- First side to **21** wins, **but** must lead by **2**.
- From **20–20** it's deuce: keep playing until one side leads by 2 (e.g. 22–24).
- Hard cap at **30**: the first side to reach **30** wins immediately, even by 1 (30–29).

Encoded in `live-score.js`:
```
gameWinner(a, b) → 'A' | 'B' | null
  A wins if (a >= 30 && a > b) || (a >= 21 && a - b >= 2)   (symmetric for B)
```

## Architecture & technical design
- **New pure module `live-score.js`** (UMD wrapper, DOM-free, matches the other pure
  modules): `WIN_SCORE`, `CAP_SCORE`, `gameWinner`, `isGameOver`, `isGamePoint`,
  `canIncrement`, `clampScore`. Unit-tested in `live-score.test.js`.
- **`script.js`** owns the DOM: an overlay (`#live-scorer`), an open handler that seeds the
  tally from any existing saved score, `+/−` handlers that mutate `match.liveA/liveB` and
  `saveState()`, and a commit handler that runs `updateScoresForMatch` + sets `scoreA/scoreB`.
  A `refreshLiveScorer()` keeps the open overlay in sync when a remote snapshot arrives.
- **`index.html`** loads `live-score.js` before `script.js` and holds the overlay markup.
- **`style.css`** styles the launch button + full-screen scorer (light/dark aware).

## State changes
`match` gains two optional ephemeral fields: `liveA`, `liveB` (current tally, cleared on
commit). No migration needed — absent = not counting yet.

## Edge cases
- Opening a match with a saved score seeds the tally from it (lets you correct/continue).
- Can't increment once the game is over; can always decrement down to 0 to fix a miscount.
- Triple teams / gender display reuse the existing name helpers.
- Remote device changes to the live tally re-render the open overlay without closing it.

## Testing strategy
- `live-score.test.js`: normal 21–x wins, win-by-2 requirement, deuce past 20–20, 30 cap,
  in-progress (null), game-point detection, increment guard, clamp.
- Manual: open scorer, tally to a win, confirm scoreboard updates and row shows the score.

## Todo
- [x] `live-score.js` + tests
- [x] Overlay markup in `index.html`, script load order
- [x] Launch button + overlay wiring in `script.js`
- [x] Styles in `style.css`
- [ ] Manual verify in browser
