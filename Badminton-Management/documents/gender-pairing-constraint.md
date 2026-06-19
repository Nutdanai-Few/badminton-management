# Gender Pairing Constraint

## Feature specification
Apply the per-player gender (already captured — see `player-gender-rank.md`) to the
**doubles** pairing algorithm with a single rule:

> A match must **never** be an all-male team vs an all-female team (ช-ช vs ญ-ญ).

Everything else is allowed, including mixed teams. Concretely, for a doubles match
with team A and team B, the only forbidden configuration is:

- one team is 2 males AND the other team is 2 females.

All of these stay allowed:
- ช-ญ vs ช-ญ (mixed vs mixed)
- ช-ญ vs ช-ช (mixed vs all-male)
- ช-ญ vs ญ-ญ (mixed vs all-female)
- ช-ช vs ช-ช (all-male vs all-male)
- ญ-ญ vs ญ-ญ (all-female vs all-female)

## Scope
- `doubles` mode only — singles has no 2-player teams, so the rule does not apply.
- Applies to BOTH the initial schedule (`makeSchedule`) and mid-game re-pairing
  (`continueSchedule`).
- All other rules unchanged: equal play counts (fairness), rest rotation, and
  fresh-partner preference all behave exactly as before.

### Out of scope
- Rank/skill-balanced teams.
- Forcing a *minimum* number of mixed matches — we only forbid the one bad config.

## Architecture & technical design
Key observation: **any group of 4 players always has at least one legal split.**
The forbidden split (MM | FF) only exists when the four are exactly 2M+2F, and in
that case the other two splits are both mixed-vs-mixed (legal). For 4M / 3M1F /
1M3F / 4F there is no MM-vs-FF split at all. So the gender rule can be enforced at
the **split-selection** step alone — *which* four players take a court is unchanged,
which is why fairness (equal games per player) is fully preserved.

Implementation (in `schedule.js`):
- New optional param `genderOf: (name) => 'male' | 'female' | null` on both
  `makeSchedule` and `continueSchedule` (defaults to `() => null`).
- Helper `teamGender(members, genderOf)` → `'male' | 'female' | 'mixed'`. A team is
  `'male'`/`'female'` only if **every** member is that gender; any unknown gender
  makes it `'mixed'` (fail-safe: incomplete gender data never triggers the ban).
- Helper `forbiddenMatch(teamA, teamB, genderOf)` → true iff one team is all-male
  and the other all-female.
- In the split loop, a forbidden split gets a large additive penalty so it is only
  ever chosen if NO legal split exists (which cannot happen, but keeps the function
  total). Among legal splits the existing fresh-partner cost still decides.

`script.js` passes `genderOf` derived from `PlayerMeta.getMeta(state.playerMeta, name).gender`.

## Edge cases & error handling
- Player with no gender set: treated as making the team `'mixed'`, so never causes a
  forbidden match. (Schedule generation is already blocked until everyone has a
  gender, so in practice all are set.)
- 4M / 4F court: produces all-male / all-female matches — allowed.
- Only 2M + 2F on one court: forced into mixed vs mixed — the legal outcome.

## Testing strategy
Unit tests in `schedule.test.js`:
- No doubles match is MM-vs-FF across many seeds and gender mixes.
- Mixed and same-all-gender matches are still produced (rule isn't over-applied).
- Equal play counts (fairness) still hold with `genderOf` supplied.
- `continueSchedule` also never produces MM-vs-FF.
- Existing tests (no `genderOf`) keep passing unchanged.

## Todo
- [x] Add `teamGender` / `forbiddenMatch` helpers + `genderOf` param in `schedule.js`.
- [x] Wire `genderOf` from `script.js`.
- [x] Tests for the constraint + fairness preserved.
- [x] Run full suite, confirm coverage (103 tests pass; schedule.js 99.51% line / 96.99% branch).
