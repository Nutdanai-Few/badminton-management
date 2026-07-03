// tournament.js
// Pure, side-effect-free Swiss-tournament logic.  Kept entirely separate from the
// everyday pairing engine in schedule.js — this file powers ONLY the "ทัวร์นาเม้น" tab
// and never touches makeSchedule / continueSchedule or the main scoreboard.
//
// Swiss format: every team plays every round; each round pairs teams with the SAME
// win–loss record (winners meet winners, losers meet losers).  With a power-of-two team
// count it converges to exactly one undefeated champion after log2(N) rounds, and every
// record group has an even size every round, so there are no byes / no remainder.
//
// UMD-style wrapper: the SAME file works both as a browser <script> global (loaded before
// script.js) and as a CommonJS module (tests).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;        // Node (test suite)
    } else {
        Object.assign(root, api);    // Browser global (window/globalThis)
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // Fisher-Yates with an injectable RNG so tests can be deterministic.
    function shuffle(arr, rand = Math.random) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // A positive power of two (2, 4, 8, 16, …).  1 is excluded: a "tournament" needs at
    // least two teams.
    function isPowerOfTwo(n) {
        return Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0;
    }

    // How many teams a roster of `playerCount` produces in the given mode.
    // doubles → fixed pairs (2 players each); singles → one team per player.
    function teamCountFor(mode, playerCount) {
        return mode === 'doubles' ? Math.floor(playerCount / 2) : playerCount;
    }

    // Players that occupy one court in a match: doubles = 4 (2 v 2), singles = 2 (1 v 1).
    function seatsPerCourt(mode) {
        return mode === 'doubles' ? 4 : 2;
    }

    // Matches played in a full round = one per pair of teams.
    function matchesPerRound(teamCount) {
        return Math.floor(teamCount / 2);
    }

    // Courts beyond this would sit idle — a round never has more than teamCount/2 matches.
    function maxUsefulCourts(teamCount) {
        return Math.max(1, matchesPerRound(teamCount));
    }

    // Smallest power of two ≥ n (min 2 — a tournament needs at least two teams).
    function nextPowerOfTwo(n) {
        let p = 2;
        while (p < n) p *= 2;
        return p;
    }

    // Recommended roster size so a tournament can fill all `courts` courts in its first
    // wave: need ≥ 2·courts teams, rounded up to the next power of two, ×seats-per-team.
    function recommendedPlayers(mode, courts) {
        const teams = nextPowerOfTwo(Math.max(2, 2 * courts));
        return mode === 'doubles' ? teams * 2 : teams;
    }

    // True iff this roster can start a clean, no-remainder Swiss tournament.
    function validTeamCount(mode, playerCount) {
        if (mode === 'doubles' && playerCount % 2 !== 0) return false; // odd → a leftover player
        return isPowerOfTwo(teamCountFor(mode, playerCount));
    }

    // Number of rounds a Swiss tournament of `teamCount` power-of-two teams runs.
    function totalRounds(teamCount) {
        return Math.log2(teamCount);
    }

    // Describe whether the roster is ready and, if not, the nearest valid sizes so the UI
    // can tell the user how many players to add or remove.  Returns
    //   { ok, teamCount, rounds, mode, playerCount, need: [...valid player counts...] }
    function rosterStatus(mode, playerCount, courts = 1) {
        const ok = validTeamCount(mode, playerCount);
        const teamCount = teamCountFor(mode, playerCount);
        // Valid player counts around the current size (for the hint).
        const valid = [];
        for (let teams = 2; teams <= 32; teams *= 2) {
            valid.push(mode === 'doubles' ? teams * 2 : teams);
        }
        const c = Math.max(1, courts);
        return {
            ok,
            mode,
            playerCount,
            teamCount,
            rounds: ok ? totalRounds(teamCount) : 0,
            need: valid,
            // Court-aware fields: how many courts this roster can actually use, and the
            // recommended roster to keep the chosen court count busy.
            courts: c,
            seatsPerCourt: seatsPerCourt(mode),
            usableCourts: ok ? Math.min(c, maxUsefulCourts(teamCount)) : 0,
            recommendedPlayers: recommendedPlayers(mode, c),
        };
    }

    // Build the fixed team list from a roster.  doubles → shuffle then pair sequentially
    // ("A / B"); singles → each player is their own team.  Randomised so the draw differs
    // each time; `rand` is injectable for tests.
    function buildTeams(players, mode, rand = Math.random) {
        if (mode !== 'doubles') return shuffle(players, rand);
        const shuffled = shuffle(players, rand);
        const teams = [];
        for (let i = 0; i + 1 < shuffled.length; i += 2) {
            teams.push(shuffled[i] + ' / ' + shuffled[i + 1]);
        }
        return teams;
    }

    // Create a fresh tournament from a roster.  Throws if the roster is not a valid
    // power-of-two team count — callers should gate on validTeamCount / rosterStatus first.
    //   createdAt is injected (browser passes Date.now()) so this stays pure.
    function createTournament({ players, mode, rand = Math.random, createdAt = 0, courts = 1 }) {
        if (!validTeamCount(mode, players.length)) {
            throw new Error('roster is not a power-of-two team count');
        }
        const teams = buildTeams(players, mode, rand);
        const round1 = pairRound(teams, [], rand).map(([a, b]) => ({
            teams: [a, b], scoreA: null, scoreB: null, round: 1,
        }));
        const c = Math.max(1, Math.min(courts, maxUsefulCourts(teams.length)));
        return { mode, teams, matches: round1, createdAt, courts: c };
    }

    // Decided winner of a match: 0 (teamA), 1 (teamB), or null when unscored/tied.
    function matchWinner(m) {
        if (m.scoreA == null || m.scoreB == null || m.scoreA === m.scoreB) return null;
        return m.scoreA > m.scoreB ? 0 : 1;
    }

    // Per-team record derived purely from the tournament's matches.
    //   { team: { wins, losses, played, pointsFor, pointsAgainst } }
    function standings(t) {
        const rec = {};
        t.teams.forEach(team => { rec[team] = { team, wins: 0, losses: 0, played: 0, pointsFor: 0, pointsAgainst: 0 }; });
        t.matches.forEach(m => {
            const w = matchWinner(m);
            if (w === null) return;
            const [a, b] = m.teams;
            if (!rec[a] || !rec[b]) return;
            rec[a].played++; rec[b].played++;
            rec[a].pointsFor += m.scoreA; rec[a].pointsAgainst += m.scoreB;
            rec[b].pointsFor += m.scoreB; rec[b].pointsAgainst += m.scoreA;
            if (w === 0) { rec[a].wins++; rec[b].losses++; }
            else { rec[b].wins++; rec[a].losses++; }
        });
        return rec;
    }

    // A ranked standings array: most wins first, then point differential, then points for.
    function standingsTable(t) {
        const rec = standings(t);
        return t.teams
            .map(team => rec[team])
            .sort((x, y) =>
                (y.wins - x.wins) ||
                ((y.pointsFor - y.pointsAgainst) - (x.pointsFor - x.pointsAgainst)) ||
                (y.pointsFor - x.pointsFor));
    }

    function roundNumbers(t) {
        return [...new Set(t.matches.map(m => m.round))].sort((a, b) => a - b);
    }

    function latestRound(t) {
        const rs = roundNumbers(t);
        return rs.length ? rs[rs.length - 1] : 0;
    }

    // Every match in round `r` has a decided (non-tied) result.
    function roundComplete(t, r = latestRound(t)) {
        const ms = t.matches.filter(m => m.round === r);
        return ms.length > 0 && ms.every(m => matchWinner(m) !== null);
    }

    // Whole tournament is finished: log2(N) rounds have been played and the last one is
    // fully decided.  At that point exactly one team is undefeated.
    function isComplete(t) {
        return latestRound(t) >= totalRounds(t.teams.length) && roundComplete(t);
    }

    // The undefeated champion once the tournament is complete, else null.
    function champion(t) {
        if (!isComplete(t)) return null;
        const rec = standings(t);
        const need = totalRounds(t.teams.length);
        return t.teams.find(team => rec[team].wins === need) || null;
    }

    // Have teams a and b already met anywhere in the tournament?
    function makeHasPlayed(matches) {
        const seen = new Set();
        matches.forEach(m => {
            seen.add(m.teams[0] + ' ' + m.teams[1]);
            seen.add(m.teams[1] + ' ' + m.teams[0]);
        });
        return (a, b) => seen.has(a + ' ' + b);
    }

    // Pair one record-group (or the whole field in round 1) into partnerships, minimising
    // the number of rematches.  Backtracking over ≤16 teams is trivial.  Returns an array
    // of [teamA, teamB] pairs, or null if the group has an odd size (never happens for a
    // power-of-two field, but callers treat null as "cannot pair").
    function pairRound(teams, priorMatches, rand) {
        if (teams.length % 2 !== 0) return null;
        const hasPlayed = makeHasPlayed(priorMatches);
        const order = shuffle(teams, rand);

        let best = null, bestCost = Infinity;
        function bt(remaining, acc, cost) {
            if (cost >= bestCost) return;                 // prune
            if (remaining.length === 0) { best = acc.slice(); bestCost = cost; return; }
            const first = remaining[0];
            const rest = remaining.slice(1);
            for (let i = 0; i < rest.length; i++) {
                const partner = rest[i];
                const c = hasPlayed(first, partner) ? 1 : 0;
                const nextRemaining = rest.slice(0, i).concat(rest.slice(i + 1));
                bt(nextRemaining, acc.concat([[first, partner]]), cost + c);
                if (bestCost === 0) return;               // perfect matching found
            }
        }
        bt(order, [], 0);
        return best;
    }

    // Build the next round by pairing equal-record teams (Swiss).  Requires the current
    // round to be fully decided; returns the new match objects (NOT yet appended), or an
    // empty array when the tournament is already complete.
    function generateNextRound(t, rand = Math.random) {
        if (isComplete(t)) return [];
        if (!roundComplete(t)) return [];

        const rec = standings(t);
        // Group teams by wins so far; higher-win groups first (order is cosmetic).
        const groups = {};
        t.teams.forEach(team => {
            const w = rec[team].wins;
            (groups[w] = groups[w] || []).push(team);
        });

        const nextRoundNum = latestRound(t) + 1;
        // Pair within each record group (winners with winners, losers with losers), then
        // round-robin INTERLEAVE the groups so consecutive matches alternate records:
        // [[w1,w2],[l1,l2]] → [w1,l1,w2,l2].  This way, when courts < matches, each wave
        // of courts mixes winners and losers and losing teams play from the first wave
        // instead of waiting for every winner match to finish.  Pairing itself is
        // unchanged — only the order.
        const groupPairLists = Object.keys(groups)
            .map(Number)
            .sort((a, b) => b - a)
            .map(w => pairRound(groups[w], t.matches, rand) || []);
        const pairs = interleave(groupPairLists);

        return pairs.map(([a, b]) => ({
            teams: [a, b], scoreA: null, scoreB: null, round: nextRoundNum,
        }));
    }

    // Round-robin interleave a list of lists: take element 0 of each, then element 1 of
    // each, and so on, skipping lists that have run out.  Preserves per-list order.
    function interleave(lists) {
        const out = [];
        const max = lists.reduce((m, l) => Math.max(m, l.length), 0);
        for (let i = 0; i < max; i++) {
            for (const l of lists) if (i < l.length) out.push(l[i]);
        }
        return out;
    }

    // Split one round's ordered matches into waves of at most `courts` matches, preserving
    // order.  A "wave" is one simultaneous fill of the courts; wave 2 starts once wave 1's
    // courts free up.  Used only for display / court labelling — never for pairing.
    function courtWaves(matches, courts) {
        const c = Math.max(1, courts);
        const waves = [];
        for (let i = 0; i < matches.length; i += c) {
            waves.push(matches.slice(i, i + c));
        }
        return waves;
    }

    return {
        shuffle,
        isPowerOfTwo,
        teamCountFor,
        seatsPerCourt,
        matchesPerRound,
        maxUsefulCourts,
        recommendedPlayers,
        courtWaves,
        validTeamCount,
        totalRounds,
        rosterStatus,
        buildTeams,
        createTournament,
        matchWinner,
        standings,
        standingsTable,
        roundNumbers,
        latestRound,
        roundComplete,
        isComplete,
        champion,
        generateNextRound,
    };
});
