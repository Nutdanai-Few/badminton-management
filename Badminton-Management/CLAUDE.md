# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page badminton match manager (Thai-language UI). The whole app is a **static site** served by opening `index.html` — no build step, no bundler, no framework. It runs on plain browser globals plus three CDN scripts (TailwindCSS, qrcodejs, Firebase compat SDK). Firebase Realtime Database is the shared source of truth so multiple devices watching the same session stay in sync in real time.

## Commands

```bash
npm test              # run the whole Node test suite (node --test)
node --test schedule.test.js        # run one test file
node --test --test-name-pattern "gender"   # run tests matching a name
```

There is no build, lint, or dev-server command. To run the app, open `index.html` in a browser (Firebase config is hardcoded in `script.js`).

## Architecture

The codebase is deliberately split into **pure, testable logic modules** and **one DOM/Firebase glue file**. All pure modules use a UMD-style wrapper so the *same file* works both as a browser `<script>` global and as a CommonJS module under `node --test`. Load order matters — `index.html` loads the pure modules before `script.js`, which depends on their globals.

- **`schedule.js`** — the *everyday* pairing/fairness engine, no DOM. Exports `makeSchedule` (build a fresh schedule), `continueSchedule` (mid-game re-pairing after the roster changes), `roundRobin`, `shuffle`, plus the constraint helpers `teamGender`, `forbiddenMatch`, `rankBalanceCost`. All randomness goes through an injectable `rand` param so tests are deterministic. The tournament tab does **not** use this file.
- **`tournament.js`** — a separate, self-contained **Swiss tournament** engine that powers only the "ทัวร์นาเม้น" tab. Each round pairs teams with the same win–loss record (winners meet winners, losers meet losers); nobody is eliminated, and a power-of-two team count converges to one undefeated champion in `log2(N)` rounds with no byes. Exports `createTournament`, `generateNextRound`, `standings`/`standingsTable`, `rosterStatus`/`validTeamCount`, `isComplete`, `champion`, etc. Injectable `rand`; `createdAt` is passed in so it stays pure. Kept deliberately apart from `schedule.js` and the main scoreboard. Its state persists under its **own Firebase ref (`badminton_tournament`)** + its own localStorage cache (`bmTournamentCache`), so the main state's anti-data-loss sync path is untouched. The tournament has its **own court count** (`t.courts`, independent of the Settings tab): `generateNextRound` round-robin **interleaves** the record groups so a round's matches alternate `[win, lose, win, lose]`, and `courtWaves` chunks a round into waves of `courts` — so with fewer courts than matches, each wave mixes winners and losers and losing teams play from the first wave instead of waiting. Courts only affect match *order/display*, never the record-based pairing. Court helpers: `seatsPerCourt`, `matchesPerRound`, `maxUsefulCourts`, `recommendedPlayers`, `courtWaves`; `rosterStatus(mode, playerCount, courts)` reports court-aware fields. See `documents/tournament-courts.md`.
- **`player-meta.js`** — per-player metadata (gender + rank). Exposed as the `PlayerMeta` global. Gender is **required** (blocks schedule generation until set); rank is optional. Pure map transforms: `getMeta`, `setMeta`, `normalizePlayerMeta`, `playersMissingGender`, `mergePlayerMeta`.
- **`sync-guard.js`** — the data-loss guard for Firebase writes. `shouldPersist` decides whether a save is safe; `localCacheWins` / `mergeInitialStates` reconcile a device's local cache with an incoming server snapshot. This logic exists to stop an empty default state from wiping real server data during a slow/failed first load.
- **`known-names.js`** — the remembered-names roster for the add-player autocomplete (`KnownNames` global). Case-insensitive dedup, most-recently-used ordering, `splitNames` for bulk paste.
- **`script.js`** — everything with side effects: the `state` object, all DOM rendering/event handlers, Firebase wiring, and localStorage. ~2000 lines; the pure logic above was extracted out of it specifically so it could be unit-tested. Each pure module has a matching `*.test.js`.

### State shape

A single `state` object in `script.js` is the whole app model, mirrored to Firebase under the `badminton` ref:

```js
state = {
  players: [],                    // names, in roster order — the immutable id used everywhere
  settings: { mode, courts },     // mode: 'singles' | 'doubles'
  matches: [],                    // { teams: [teamA, teamB], scoreA, scoreB, round, ... }
  scores: {},                     // { name: {played, wins, losses} } — survives schedule regen
  history: {},                    // saved daily scoreboard snapshots
  playerMeta: {}                  // { name: {gender, rank} }
}
```

### Two persistence layers (important)

1. **Firebase Realtime DB** — the shared source of truth; `onValue` drives real-time sync and re-render.
2. **localStorage cache** — every change is mirrored synchronously so a reload never flashes empty and edits made just before a sync land safely. On load the app hydrates from cache instantly, then reconciles with the first Firebase snapshot via `sync-guard.js`. Saves stay **blocked until a real server snapshot arrives** (`serverSnapshotReceived`) — this is the core anti-data-loss invariant; preserve it when touching the sync path.

## Domain rules encoded in the scheduler

These are the non-obvious rules the pairing engine enforces. Corresponding design docs live in `documents/` (completed ones in `documents/completed/`).

- **Equal play is the top priority.** In doubles, each round picks the `4 × courts` players who most deserve to play, ordered by: fewest games so far → rested longest → played most last time. Rank/gender only ever influence *how the four on a court are split into teams*, never *which four take the court*, so fairness is never compromised.
- **Gender constraint** (`forbiddenMatch`): a doubles match may never be all-male vs all-female (ช-ช vs ญ-ญ). Mixed teams, all-male-vs-mixed, etc. are all fine. A team counts as male/female only if *every* member is; any unknown member makes it "mixed" (fails safe — incomplete data never triggers the ban). Enforced via a large cost penalty (`GENDER_PENALTY`).
- **Rank balance** (`rankBalanceCost`): of the 3 ways to split 4 court players, prefer the split whose teams are closest in total strength. Optional — if *any* of the four is unranked, balance has no say for that court. Cost ladder is deliberately `gender ≫ balance ≫ partner-variety`.
- **Partner variety**: among equally balanced legal splits, prefer partnerships that haven't happened yet; a repeat is only chosen when forced.
- **Odd rosters get a "triple team"** (`getTripleCombos` / `getParticipantsFromList`): when a doubles roster has an odd count, one 3-person team is formed; only 2 of its 3 members play any given match, tracked via `match.tripleLineup` / `match.tripleTeamIdx`.
- **Mid-game re-pairing** (`continueSchedule`): when a player leaves or a latecomer joins mid-session, already-played (scored) matches are kept and only new matches are appended. Withdrawn players are never paired again; their stats stand. Catch-up rule fills all courts, letting the most-rested play first until the most-behind player reaches the level of whoever was furthest ahead when play paused.

## Conventions

- A player's **name is their immutable id** — scores, matches, history, and meta are all keyed by name. Renaming is not a supported operation.
- Team strings are `"A / B"` (or `"A / B / C"` for a triple). `getMatchPlayers` is the canonical way to extract individual players from a match side, since it handles triple lineups.
- Pure modules must stay DOM-free and side-effect-free so they remain testable under `node --test`. When adding scheduling/meta/sync logic, put it in the relevant pure module with a test, not in `script.js`.
- UI strings are Thai; keep that when editing user-facing text.
