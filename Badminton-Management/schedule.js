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

    // ===== Gender pairing constraint =====
    // A doubles match must never be an all-male team vs an all-female team
    // (ช-ช vs ญ-ญ).  Mixed teams are always fine, and an all-male match or an
    // all-female match is fine too — only the pure male-vs-female matchup is banned.
    // `genderOf(name)` returns 'male' | 'female' | null/undefined.

    // A team's gender is 'male'/'female' ONLY if every member is that gender; any
    // unknown or mixed member makes it 'mixed'.  Treating unknowns as 'mixed' fails
    // safe: incomplete gender data can never trigger the ban.
    function teamGender(members, genderOf) {
        let male = 0, female = 0;
        for (const m of members) {
            const g = genderOf(m);
            if (g === 'male') male++;
            else if (g === 'female') female++;
        }
        if (male === members.length) return 'male';
        if (female === members.length) return 'female';
        return 'mixed';
    }

    // True iff pairing teamA against teamB is the forbidden ช-ช vs ญ-ญ matchup.
    function forbiddenMatch(teamA, teamB, genderOf) {
        const ga = teamGender(teamA, genderOf);
        const gb = teamGender(teamB, genderOf);
        return (ga === 'male' && gb === 'female') || (ga === 'female' && gb === 'male');
    }

    // Penalty added to a forbidden split's cost.  Far larger than any achievable
    // partner-repeat cost, so a legal split always wins; a forbidden split is only
    // ever chosen when NO legal split of the four exists (which, given any group of
    // four always has one, never happens — it just keeps the selection total).
    const GENDER_PENALTY = 1e9;

    // Build a full schedule for the given participants.
    //   players      — array of participant names
    //   mode         — 'doubles' | 'singles'
    //   courts       — number of courts available per round
    //   prevMatches  — the schedule being replaced (used only as a soft tiebreaker
    //                  so players who played a lot last time are deprioritised)
    //   getPlayers   — (match, teamIdx) => string[]; parses a match's team members
    //   genderOf     — (name) => 'male'|'female'|null; enforces the no-(ช-ช vs ญ-ญ)
    //                  rule in doubles (defaults to all-unknown = no constraint)
    //   rand         — injectable RNG (defaults to Math.random)
    function makeSchedule({ players, mode, courts, prevMatches = [], getPlayers = defaultGetPlayers, genderOf = () => null, rand = Math.random }) {
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
                        const penalty = forbiddenMatch([picked[i], picked[j]], [picked[k], picked[l]], genderOf)
                            ? GENDER_PENALTY : 0;
                        const cost = penalty + partnered(picked[i], picked[j]) + partnered(picked[k], picked[l]);
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

    // ===== Mid-game re-pairing =====
    // Continue an in-progress schedule after the roster has changed mid-session (a
    // player left, or a latecomer joined).  The caller keeps the matches that were
    // already PLAYED (scored) and passes them as `playedMatches`; this returns ONLY
    // the new matches to append.  Players not in `players` (i.e. removed) are never
    // paired again — their already-played games and stats stand as-is.
    //
    // Fairness rule: keep pairing the CURRENT roster until EVERYONE has played the same
    // number of games, then stop.  Each player's games-played carries over (no reset), so
    // a player who is ahead simply RESTS while the others catch up to them — nobody is
    // dragged into extra games past the equal level.  A latecomer starts behind and is
    // paired more often until they reach everyone else's level.
    //
    // Every round fills ALL configured courts (the fewest-played play first, so whoever is
    // ahead rests).  A court is left empty ONLY when the roster has already become equal
    // partway through a round — opening another court would then push someone past the
    // equal level.  This is what lets the schedule reach EXACT equality even when the
    // courts are big enough to seat the whole roster (e.g. 8 players / 2 courts): the final
    // catch-up round opens just one court for the four behind players while the four ahead
    // rest, instead of seating all eight and overshooting forever.
    //   players        — current roster (withdrawn players already removed / latecomers added)
    //   mode           — 'doubles' | 'singles'
    //   courts         — courts available per round
    //   playedMatches  — the matches already played (kept by the caller)
    //   getPlayers     — (match, teamIdx) => string[]; honours the legacy triple team
    //   genderOf       — (name) => 'male'|'female'|null; same no-(ช-ช vs ญ-ญ) rule
    //   rand           — injectable RNG
    function continueSchedule({ players, mode, courts, playedMatches = [], getPlayers = defaultGetPlayers, genderOf = () => null, rand = Math.random }) {
        const seatsPerCourt = mode === 'doubles' ? 4 : 2;

        // Games already played by each CURRENT player (withdrawn players are ignored
        // because they are not in `players`).  Also find the last round number so the
        // appended matches continue the numbering.
        const playCount = {};
        players.forEach(p => { playCount[p] = 0; });
        let maxRound = 0;
        playedMatches.forEach(m => {
            if (m.round > maxRound) maxRound = m.round;
            getPlayers(m, 0).forEach(p => { if (p in playCount) playCount[p]++; });
            getPlayers(m, 1).forEach(p => { if (p in playCount) playCount[p]++; });
        });

        // Nobody has played yet -> there is nothing to "continue" from, so build a full
        // fresh schedule.  (Also makes this function correct when called standalone.)
        if (!players.length || Math.max(...players.map(p => playCount[p])) === 0) {
            return makeSchedule({ players, mode, courts, prevMatches: playedMatches, getPlayers, genderOf, rand });
        }

        // Too few players left to fill even one court.
        if (players.length < seatsPerCourt) return [];

        // Carry partner history over from the played matches so fresh partnerships are
        // still preferred across the whole session (doubles only).
        const partnerCount = {};
        players.forEach(p => { partnerCount[p] = {}; });
        const partnered = (a, b) => partnerCount[a][b] || 0;
        const addPartner = (a, b) => {
            partnerCount[a][b] = partnered(a, b) + 1;
            partnerCount[b][a] = partnered(b, a) + 1;
        };
        if (mode === 'doubles') {
            playedMatches.forEach(m => {
                [0, 1].forEach(t => {
                    const ps = getPlayers(m, t).filter(p => p in partnerCount);
                    for (let i = 0; i < ps.length; i++) {
                        for (let j = i + 1; j < ps.length; j++) addPartner(ps[i], ps[j]);
                    }
                });
            });
        }

        const SPLITS = [
            [[0, 1], [2, 3]],
            [[0, 2], [1, 3]],
            [[0, 3], [1, 2]],
        ];

        const lastPlayed = {};
        players.forEach(p => { lastPlayed[p] = 0; });
        const selected = [];

        const spread = () => {
            const c = players.map(p => playCount[p]);
            return Math.max(...c) - Math.min(...c);
        };

        // Each round fills ALL configured courts with the fewest-played players first, so
        // whoever is ahead is the one who rests until the rest catch up.  Stop the instant
        // everyone is level (spread 0).  The only time a court is left empty is when the
        // roster becomes equal partway through a round (see the inner loop): opening one
        // more court would push someone past the equal level.  At least one behind player
        // advances every round while a gap remains, so this marches toward equality and
        // terminates.  The +1000 ceiling is only a backstop.
        for (let r = maxRound + 1; r <= maxRound + 1000; r++) {
            if (spread() === 0) break;

            const sorted = shuffle(players, rand)
                .sort((a, b) =>
                    (playCount[a] - playCount[b]) ||
                    (lastPlayed[a] - lastPlayed[b]));

            const usedThisRound = new Set();
            let opened = 0;

            for (let c = 0; c < courts; c++) {
                // Use ALL configured courts every round — EXCEPT stop opening more courts
                // the moment everyone has become equal partway through this round.  Seating
                // another court would then push someone past the equal level and break it,
                // so we leave that court empty.  This is the ONLY time a court is left idle:
                // every round where players are still behind fills all the courts (the
                // fewest-played play first, so whoever is ahead is the one who rests).
                if (spread() === 0) break;
                const available = sorted.filter(p => !usedThisRound.has(p));
                if (available.length < seatsPerCourt) break;
                const picked = available.slice(0, seatsPerCourt);

                if (mode === 'doubles') {
                    let best = null, bestCost = Infinity;
                    for (const [[i, j], [k, l]] of shuffle(SPLITS, rand)) {
                        const penalty = forbiddenMatch([picked[i], picked[j]], [picked[k], picked[l]], genderOf)
                            ? GENDER_PENALTY : 0;
                        const cost = penalty + partnered(picked[i], picked[j]) + partnered(picked[k], picked[l]);
                        if (cost < bestCost) { bestCost = cost; best = [[i, j], [k, l]]; }
                    }
                    const [[i, j], [k, l]] = best;
                    selected.push({
                        teams: [picked[i] + ' / ' + picked[j], picked[k] + ' / ' + picked[l]],
                        scoreA: null, scoreB: null, round: r,
                    });
                    addPartner(picked[i], picked[j]);
                    addPartner(picked[k], picked[l]);
                } else {
                    selected.push({
                        teams: [picked[0], picked[1]],
                        scoreA: null, scoreB: null, round: r,
                    });
                }
                picked.forEach(p => { usedThisRound.add(p); playCount[p]++; lastPlayed[p] = r; });
                opened++;
            }

            if (opened === 0) break;
        }

        return selected;
    }

    return { shuffle, roundRobin, makeSchedule, continueSchedule, teamGender, forbiddenMatch };
});
