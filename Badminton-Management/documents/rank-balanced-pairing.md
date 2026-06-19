# Rank-Balanced Pairing

## Feature specification
Use the per-player **rank** (already captured — see `player-gender-rank.md`) to make
each **doubles** match as evenly matched as possible, so games are competitive and the
winner isn't decided before the first serve.

Rank has four levels, mapped to an ascending strength value:

| rank id        | label (Thai) | strength |
|----------------|--------------|----------|
| `beginner`     | มือใหม่       | 1 |
| `intermediate` | มือกลาง       | 2 |
| `advanced`     | มือเก่ง       | 3 |
| `pro`          | มือโปร        | 4 |

> Within the four players on a court, choose the team split whose two teams have the
> **smallest difference in total strength** (the "strong-with-weak" convention).

For four players sorted by strength `s1 ≤ s2 ≤ s3 ≤ s4`, this normally pairs the
extremes — `{s1, s4}` vs `{s2, s3}` — so neither team is stacked.

## The two fairnesses, kept separate
There are two different notions of fairness, and they can pull against each other. This
feature only touches the second one; the first is left exactly as it was.

| Fairness | Meaning | Owner |
|----------|---------|-------|
| **Opportunity** | everyone plays the same number of games, rests equally | unchanged (play-count rules) |
| **Match** | each individual game is close, not a blowout | this feature (rank balance) |

**Rank never decides who gets to play.** It only decides how the chosen four are split
into two teams. That keeps opportunity-fairness (equal games per player) fully intact —
exactly like the gender constraint, which also acts only at the split step.

## Scope
- `doubles` mode only. In singles the matchups are fixed by the round-robin (everyone
  meets everyone); you cannot balance a 1v1 without changing *who plays whom*, which
  would break the round-robin and opportunity-fairness. So singles is untouched.
- Applies to both `makeSchedule` (initial) and `continueSchedule` (mid-game re-pairing).
- Acts only at split-selection. **Court composition (which four play) is unchanged** —
  driven purely by play-count / rest fairness as before.

### Out of scope (deliberately)
- **Level-segregated courts** (pros only with pros, beginners with beginners). This was
  considered and rejected as a primary rule: it fights opportunity-fairness (e.g. 3 pros
  would be forced to wait for each other) and reduces partner variety. Could later be
  added as a *low-priority tiebreaker* among players with identical play-count + rest,
  but is not part of this change.
- Forcing a minimum strength gap or handicap scoring.

## Architecture & technical design
Mirrors the gender constraint in `schedule.js`:

- New optional param `rankOf: (name) => 'beginner'|'intermediate'|'advanced'|'pro'|null`
  on both `makeSchedule` and `continueSchedule` (defaults to `() => null` — no effect).
- Helper `rankBalanceCost(teamA, teamB, rankOf)` → `|strengthA − strengthB|`, **but
  returns 0 if any of the four players is unranked**. Rank is optional, so an incomplete
  foursome must not be penalised or mis-balanced — it falls back to today's behaviour
  (partner-variety decides). Fail-safe, same spirit as `teamGender` treating unknown
  gender as `mixed`.
- The split-selection cost becomes a strict priority ladder:

  ```
  cost = GENDER_PENALTY · forbidden          // hard: never MM-vs-FF        (1e9)
       + BALANCE_WEIGHT  · strengthDiff       // primary: closest match      (1e3)
       + partnerRepeats                       // tiebreaker: fresh partners
  ```

  `BALANCE_WEIGHT = 1000` keeps the order **gender ≫ balance ≫ partner-variety**: the
  largest realistic strength diff (6) costs 6000, far below `GENDER_PENALTY`, while any
  realistic partner-repeat count stays below 1000, so balance outranks it. Among splits
  with equal balance, the existing fresh-partner preference still decides (and the split
  order is still shuffled first, so equally-good splits break ties randomly).

`script.js` passes `rankOf: rankForPairing`, where `rankForPairing(name)` reads
`PlayerMeta.getMeta(state.playerMeta, name).rank`.

## Edge cases & error handling
- Any of the four unranked → balance cost 0 for every split → behaves like today.
- All four same rank → every split has diff 0 → partner-variety decides (unchanged).
- 2M+2F court that's also rank-skewed → gender penalty still dominates, so the match
  stays mixed-vs-mixed; balance only picks among the legal (mixed) splits.

## Testing strategy
Unit tests in `schedule.test.js`:
- Given a ranked foursome (e.g. 1,2,3,4) on one court, the produced teams are the
  minimum-gap split across many seeds.
- A clearly stacked split (e.g. {pro,pro} vs {beginner,beginner}) is never chosen when a
  balanced split exists.
- Unranked player in the foursome → balance ignored (no change vs no-`rankOf` run).
- Gender constraint still wins over balance (no MM-vs-FF even if it would balance best).
- Opportunity-fairness (equal play counts) still holds with `rankOf` supplied.
- `continueSchedule` balances too, and existing tests (no `rankOf`) keep passing.

## Todo
- [x] `rankBalanceCost` helper + `rankOf` param in `makeSchedule` & `continueSchedule`.
- [x] Wire `rankForPairing` from `script.js` into both call sites.
- [x] Tests for balance, unranked fallback, gender-over-balance, fairness preserved.
- [x] Run full suite; confirm coverage stays high (113 tests pass; schedule.js 99.56% line / 97.22% branch).
