# Tournament Mode (Swiss / record-based bracket)

## Feature specification

Add a **separate "ทัวร์นาเม้น" tab** that runs a Swiss-style tournament to crown a
single champion pair (or player). Every round, teams are paired against another team
with the **same win–loss record** — winners meet winners, losers meet losers — and
nobody is eliminated: everyone keeps playing every round until a champion emerges.

This is a *new, self-contained feature*. It must **not** change the existing pairing
engine ([schedule.js](../schedule.js): `makeSchedule` / `continueSchedule`) or the
existing Settings/Schedule/Scoreboard tabs in any way.

### Why Swiss (matches the user's request)
The user described: "แพ้ไปเจอแพ้ ชนะไปเจอชนะ เล่นเรื่อยๆ จนได้แชมป์" — losers play
losers, winners play winners, continue on and on to find the champion. That is exactly a
Swiss pairing keyed on cumulative record. With a **power-of-two** number of teams it
converges to exactly one undefeated champion after `log2(N)` rounds, and every record
group has an even size every round, so there are **no byes / no remainder** — matching
the "เฉพาะในกรณีที่ไม่มีเศษ" (only when it divides evenly) requirement.

## Scope

In scope:
- New pure module `tournament.js` (Swiss engine) + `tournament.test.js`.
- New "ทัวร์นาเม้น" tab: start card, standings, per-round matches with score entry,
  auto-advance to the next round, champion banner, reset.
- Auto-pairing of teams at start (random draw). Doubles → fixed partners for the whole
  tournament. Singles → each player is a team.
- The tournament tab has its **own เดี่ยว/คู่ mode selector** on the start card, seeded
  from the Settings-tab mode but independent of it — so a singles tournament can run even
  while the everyday scheduler is set to doubles (and vice versa). The chosen mode is
  frozen into the tournament (`t.mode`) once it starts.
- Own persistence: a **separate Firebase ref** (`badminton_tournament`) + its own
  localStorage cache, so the main state's anti-data-loss sync guards are untouched.

Out of scope (intentionally NOT covered):
- Double elimination, group-stage+knockout, seeding by rank, third-place playoff.
- Re-pairing teams mid-tournament, adding/removing teams mid-tournament.
- Rosters that are not a power-of-two team count (button stays disabled with a hint).
- Any interaction with the cumulative `state.scores` scoreboard — tournament standings
  are computed only from tournament matches.

## User stories
- As an organizer, I want to start a tournament from the current roster with one tap and
  have teams auto-drawn, so I don't pair them by hand.
- As an organizer, I want each round to pair equal-record teams automatically and advance
  as soon as I finish entering the round's scores, so play flows "ไปเรื่อยๆ".
- As a player, I want to keep playing every round even after a loss (against others who
  also lost), so nobody sits out.
- As everyone, I want a clear champion at the end.

## Acceptance criteria
- Tournament can start only when the roster forms a power-of-two team count
  (doubles: 4/8/16/32 players → 2/4/8/16 teams; singles: 2/4/8/16/32 players). Otherwise
  the start button is disabled and shows how many players to add/remove.
- Round 1 pairs all teams at random. Each later round pairs teams with equal records and
  avoids rematches when possible.
- After `log2(N)` rounds exactly one team is undefeated → shown as champion.
- Everything is DOM-free/testable in `tournament.js`; `node --test` passes.
- Existing tabs and `schedule.js` behavior are byte-for-byte unchanged.
- Tournament state syncs across devices in real time and survives reload.

## Architecture & technical design
- `tournament.js` — UMD wrapper like the other pure modules. Exports:
  `isPowerOfTwo`, `validTeamCount`, `rosterStatus`, `buildTeams`, `createTournament`,
  `standings`, `roundNumbers`, `latestRound`, `roundComplete`, `generateNextRound`,
  `totalRounds`, `isComplete`, `champion`. Randomness via injectable `rand`.
- Data model (`state.tournament`, or `null` when none):
  ```js
  {
    mode: 'doubles' | 'singles',
    teams: ["A / B", "C / D", ...],          // fixed for the whole tournament
    matches: [ { teams:[teamA, teamB], scoreA, scoreB, round } ],  // flat, appended per round
    createdAt: <ms>
  }
  ```
- Standings derive from `matches`: a match with `scoreA !== scoreB` (both non-null)
  counts a win for the higher side. Group = wins so far (all teams have played the same
  number of decided rounds). Pairing within a group uses backtracking to minimize
  rematches (group sizes ≤ 16 → trivial).
- `script.js` glue: `renderTournament()`, a `#tournament-container` click/input handler
  that writes scores into `state.tournament.matches` and, when the round is complete,
  calls `generateNextRound` and appends it. Reuses existing `.match-table` / `.team-btn`
  / `.score-input` / `.btn-save` styles.

## Persistence (isolation-critical)
- Separate ref `db.ref('badminton_tournament')` + cache key `bmTournamentCache`.
- Save gated on `tournServerReceived` (first snapshot seen) exactly like the main state's
  `serverSnapshotReceived`, plus an `updatedAt` local-wins reconciliation, so a slow/empty
  first snapshot can't wipe a tournament created offline. The main `saveState`,
  `shouldPersist`, `applySnapshot`, and `sync-guard.js` are **not touched**.

## Edge cases
- Roster changes after start: the tournament keeps its own frozen `teams`; the start card
  re-validates against the live roster but an in-progress tournament is unaffected.
- Tie score entered (`scoreA === scoreB`): round is treated as not complete → no advance.
- 2 teams: 1 round, immediate champion.
- Rematch unavoidable in a group: allowed as a last resort (backtracking picks the
  minimum-rematch pairing).

## Testing strategy
- `tournament.test.js`: power-of-two validation; team building (doubles pairs, singles);
  round-1 covers all teams once; record grouping (winners vs winners); rematch avoidance;
  convergence to exactly one champion for N = 2, 4, 8; determinism with a seeded `rand`.

## Todo
- [x] Design doc
- [x] `tournament.js` + tests (18 tests: validation, team building, Swiss grouping, convergence to one champion for N=2/4/8, rematch avoidance, determinism)
- [x] Tab UI + glue in `index.html` / `script.js` (start card, standings, per-round scoring, next-round button, champion banner, reset)
- [x] Separate-ref sync (`badminton_tournament` + `bmTournamentCache`, local-wins reconciliation)
- [x] `npm test` green (132/132), no regressions; browser-glue smoke-driven under a DOM/Firebase stub
