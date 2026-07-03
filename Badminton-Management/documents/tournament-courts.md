# Tournament: courts + win/loss interleaving

Extension to [tournament-swiss.md](tournament-swiss.md). Adds a court count to the
tournament tab, interleaves winner/loser matches within a round so losing teams don't
wait long, and ties the roster-size hint to the chosen court count. The Swiss pairing
rule itself (winners meet winners, losers meet losers) is **unchanged** — this only
affects match *order* and *display*, plus a new court selector.

## Why

The pairing engine already pairs equal-record teams correctly (verified: round 2 of an
8-team draw yields 2 winner-vs-winner + 2 loser-vs-loser matches). The gap the user
raised:

1. Within a round the matches were ordered `[win, win, lose, lose]`. When courts are
   fewer than matches, the losing teams all play in a later wave and wait too long. The
   user wants `[win, lose, win, lose]` so each wave of courts mixes records and losers
   play from the first wave.
2. The tournament tab had no court selector (unlike the everyday Schedule tab).
3. The roster-size guidance should reference the court count (singles = 2 players/court,
   doubles = 4 players/court).

## Scope

In scope:
- `t.courts` frozen onto the tournament at creation (seeded from the draft selector).
- Round-robin **interleave** of per-record-group pairings in `generateNextRound` so
  consecutive matches alternate records.
- A pure `courtWaves(matchesInRound, courts)` helper that chunks a round's ordered
  matches into waves of ≤ `courts`, for display + court labels.
- Court selector (stepper) on the tournament start card; court-aware roster hint.
- Display: each round shows matches labelled with สนาม N, split into เวฟ when a round
  needs more than one wave.

Out of scope:
- Changing the Swiss pairing rule, byes, or non-power-of-two rosters.
- Per-round court rotation fairness (courts are just physical slots here).
- Touching the everyday scheduler or `state.settings.courts`.

## Design decisions

- **Courts do not affect pairing.** Pairing stays record-based; courts + interleaving
  only change the order matches are listed and how they're grouped for play. This keeps
  `tournament.js` pure and the convergence guarantees intact.
- **Interleave = round-robin across record groups.** Collect each group's pair list
  (highest wins first), then emit one pair from each group in rotation:
  `[[w1,w2],[l1,l2]] → [w1,l1,w2,l2]`. Round 1 has a single group so order is unchanged.
- **Court cap.** Useful courts per round = `teamCount / 2` (matches per round). More
  courts than that would sit idle; the start card caps/warns accordingly but never
  blocks — a tournament can still run with idle courts.
- **Roster hint references courts.** `seatsPerCourt = doubles ? 4 : 2`. To use all `C`
  courts in the first wave you need `≥ 2C` teams; combined with the power-of-two rule the
  recommended roster is `nextPow2(max(2, 2C)) × (doubles ? 2 : 1)` players. Shown on the
  start card. The hard requirement is still a power-of-two team count.
- **Backward compat.** Tournaments saved before this change have no `courts`; treat a
  missing value as `1`.

## New / changed pure API (tournament.js)

- `seatsPerCourt(mode)` → 4 (doubles) | 2 (singles).
- `matchesPerRound(teamCount)` → `teamCount / 2`.
- `maxUsefulCourts(teamCount)` → `teamCount / 2`.
- `recommendedPlayers(mode, courts)` → smallest valid roster that fills `courts`.
- `courtWaves(matches, courts)` → array of waves (arrays of matches), preserving order.
- `createTournament({ ..., courts })` stores `t.courts` (default 1, clamped ≥ 1).
- `generateNextRound` now interleaves group pairings (order change only).
- `rosterStatus(mode, playerCount, courts)` gains court-aware fields
  (`seatsPerCourt`, `courts`, `usableCourts`, `recommendedPlayers`) — extra optional arg,
  existing callers/tests unaffected.

## Testing strategy

- `generateNextRound` interleaves: after round 1 of 8 teams, the 4 next matches alternate
  win-record (index 0,2 are winners; 1,3 are losers) while still pairing equal records.
- `courtWaves`: 4 matches / 2 courts → 2 waves of 2; 3 matches / 2 courts → [2,1];
  order preserved.
- `recommendedPlayers` / `maxUsefulCourts` for singles + doubles at a few court counts.
- All existing tournament tests still pass (order-independent assertions).

## Todo
- [x] Design doc (this file)
- [x] Engine: `t.courts`, round-robin interleave in `generateNextRound`, court helpers
      (`seatsPerCourt`, `matchesPerRound`, `maxUsefulCourts`, `recommendedPlayers`,
      `courtWaves`) + court-aware `rosterStatus` — 6 new tests
- [x] UI: court stepper + court-aware hint on the start card (`tournDraftCourts`),
      wave/court display in `tournRoundHTML` (สนาม N labels, เวฟ headers when >1 wave)
- [x] `npm test` green (138/138), no regressions
