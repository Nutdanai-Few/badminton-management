// schedule.js
// Pure, side-effect-free match-scheduling logic.  Extracted from script.js so the
// pairing/fairness rules can be unit-tested without a browser or DOM.
//
// UMD-style wrapper: the SAME file works both as a browser <script> global
// (loaded before script.js) and as a CommonJS module (tests).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;        // Node (test suite)
    } else {
        Object.assign(root, api);    // Browser global (window/globalThis)
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // Fisher-Yates.  `rand` is injectable (defaults to Math.random) so tests can
    // make shuffling deterministic.
    function shuffle(arr, rand = Math.random) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ===== Round-Robin (Circle Method) =====
    // Every participant meets every other exactly once.  An odd count gets a BYE
    // (null) that simply sits out that round.
    function roundRobin(participants) {
        const n = participants.length;
        if (n < 2) return [];

        const list = [...participants];
        if (n % 2 === 1) list.push(null); // BYE = sit out

        const total = list.length;
        const numRounds = total - 1;
        const half = total / 2;

        const rotating = [];
        for (let i = 1; i < total; i++) rotating.push(i);

        const allMatches = [];

        for (let r = 0; r < numRounds; r++) {
            const pairs = [[0, rotating[rotating.length - 1]]];
            for (let i = 0; i < half - 1; i++) {
                pairs.push([rotating[i], rotating[rotating.length - 2 - i]]);
            }

            for (const [ai, bi] of pairs) {
                const a = list[ai];
                const b = list[bi];
                if (a !== null && b !== null) {
                    allMatches.push({
                        teams: [a, b],
                        scoreA: null,
                        scoreB: null,
                        round: r + 1
                    });
                }
            }

            rotating.unshift(rotating.pop());
        }

        return allMatches;
    }

    // Default team-string parser ("A / B" -> ["A","B"]).  script.js passes its own
    // getMatchPlayers so the legacy "triple team" lineup is counted correctly.
    function defaultGetPlayers(match, teamIdx) {
        return String(match.teams[teamIdx]).split(' / ').map(s => s.trim());
    }

    // Build a full schedule for the given participants.
    //   players      — array of participant names
    //   mode         — 'doubles' | 'singles'
    //   courts       — number of courts available per round
    //   prevMatches  — the schedule being replaced (used only as a soft tiebreaker
    //                  so players who played a lot last time are deprioritised)
    //   getPlayers   — (match, teamIdx) => string[]; parses a match's team members
    //   rand         — injectable RNG (defaults to Math.random)
    function makeSchedule({ players, mode, courts, prevMatches = [], getPlayers = defaultGetPlayers, rand = Math.random }) {
        // Count individual appearances in the PREVIOUS schedule.  Used as the
        // lowest-priority tiebreaker so players who played more last time wait.
        const prevPlays = {};
        players.forEach(p => { prevPlays[p] = 0; });
        prevMatches.forEach(m => {
            getPlayers(m, 0).forEach(p => { if (p in prevPlays) prevPlays[p]++; });
            getPlayers(m, 1).forEach(p => { if (p in prevPlays) prevPlays[p]++; });
        });

        const maxCourts = courts;

        if (mode === 'doubles') {
            // Individual-based pairing: each round, pick the 4xcourts players who
            // most deserve to play and randomly pair them into teams.  Priority,
            // in order:
            //   1. fewest games played so far     (playCount)        — equal play
            //   2. rested the longest / longest since last game (lastPlayed) — so a
            //      player who JUST played sits out while anyone who has waited
            //      longer goes on; only when there aren't enough rested players to
            //      fill the courts does a just-played player go straight back on
            //   3. played the most last time      (prevPlays)
            // Stops once everyone has played the same number of times (>=1).
            const playCount = {};
            const lastPlayed = {};   // round # a player last played in (0 = not yet)
            // partnerCount[a][b] = how many times a & b have ALREADY been partners.
            // Used to prefer brand-new partnerships; a repeat is only chosen when no
            // unused pairing of the four court players exists (i.e. they have already
            // partnered everyone available to them).
            const partnerCount = {};
            players.forEach(p => { playCount[p] = 0; lastPlayed[p] = 0; partnerCount[p] = {}; });
            const partnered = (a, b) => partnerCount[a][b] || 0;
            const addPartner = (a, b) => {
                partnerCount[a][b] = partnered(a, b) + 1;
                partnerCount[b][a] = partnered(b, a) + 1;
            };
            // The 3 ways to split four players (indices 0-3) into two partnerships.
            const SPLITS = [
                [[0, 1], [2, 3]],
                [[0, 2], [1, 3]],
                [[0, 3], [1, 2]],
            ];
            const selected = [];

            for (let r = 1; r <= 1000; r++) {
                // Shuffle first so equal-priority players are ordered randomly,
                // then stable-sort by the priority keys above.
                const sorted = shuffle(players, rand)
                    .sort((a, b) =>
                        (playCount[a] - playCount[b]) ||
                        (lastPlayed[a] - lastPlayed[b]) ||
                        (prevPlays[a] - prevPlays[b]));

                const usedThisRound = new Set();
                let taken = 0;

                for (let c = 0; c < maxCourts; c++) {
                    const available = sorted.filter(p => !usedThisRound.has(p));
                    if (available.length < 4) break;
                    const picked = available.slice(0, 4);
                    // Of the three ways to split these four into two teams, choose the
                    // one with the fewest already-used partnerships.  Shuffle the
                    // split order first so equally-good (e.g. all-new) pairings break
                    // ties randomly instead of always producing the same teams.
                    let best = null, bestCost = Infinity;
                    for (const [[i, j], [k, l]] of shuffle(SPLITS, rand)) {
                        const cost = partnered(picked[i], picked[j]) + partnered(picked[k], picked[l]);
                        if (cost < bestCost) {
                            bestCost = cost;
                            best = [[i, j], [k, l]];
                        }
                    }
                    const [[i, j], [k, l]] = best;
                    selected.push({
                        teams: [picked[i] + ' / ' + picked[j], picked[k] + ' / ' + picked[l]],
                        scoreA: null,
                        scoreB: null,
                        round: r
                    });
                    addPartner(picked[i], picked[j]);
                    addPartner(picked[k], picked[l]);
                    picked.forEach(p => {
                        usedThisRound.add(p);
                        playCount[p]++;
                        lastPlayed[p] = r;
                    });
                    taken++;
                }

                if (taken === 0) break;

                // Stop when every player has played the same number of times (>=1)
                const counts = players.map(p => playCount[p]);
                if (Math.min(...counts) >= 1 && Math.min(...counts) === Math.max(...counts)) break;
            }

            return selected;
        }

        // Singles mode: greedy round-robin pool scheduling
        const shuffledParticipants = shuffle(players, rand);
        const allMatches = roundRobin(shuffledParticipants);

        const playCount = {};
        shuffledParticipants.forEach(p => { playCount[p] = 0; });

        const pool = shuffle(allMatches, rand);
        const selected = [];

        for (let r = 1; pool.length > 0; r++) {
            pool.sort((a, b) => {
                const minA = Math.min(playCount[a.teams[0]], playCount[a.teams[1]]);
                const minB = Math.min(playCount[b.teams[0]], playCount[b.teams[1]]);
                if (minA !== minB) return minA - minB;
                const sumA = playCount[a.teams[0]] + playCount[a.teams[1]];
                const sumB = playCount[b.teams[0]] + playCount[b.teams[1]];
                return sumA - sumB;
            });

            const inRound = new Set();
            let taken = 0;
            const toRemove = [];

            for (let i = 0; i < pool.length && taken < maxCourts; i++) {
                const m = pool[i];
                if (inRound.has(m.teams[0]) || inRound.has(m.teams[1])) continue;
                selected.push({ ...m, round: r });
                inRound.add(m.teams[0]);
                inRound.add(m.teams[1]);
                playCount[m.teams[0]]++;
                playCount[m.teams[1]]++;
                toRemove.push(i);
                taken++;
            }

            for (let i = toRemove.length - 1; i >= 0; i--) {
                pool.splice(toRemove[i], 1);
            }

            const counts = shuffledParticipants.map(p => playCount[p]);
            const minCount = Math.min(...counts);
            if (minCount >= 1 && counts.every(c => c === minCount)) break;
        }

        return selected;
    }

    return { shuffle, roundRobin, makeSchedule };
});
