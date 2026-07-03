// Tests for the Swiss-tournament logic (tournament.js).  Fully independent of the
// everyday scheduler in schedule.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./tournament.js');

// Deterministic RNG (LCG) so tests never flake.
function seededRand(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

const names = n => Array.from({ length: n }, (_, i) => 'P' + (i + 1));

// Resolve every unscored match in the latest round: the team that appears later in the
// fixed `teams` list ("stronger") wins 21–10.  Deterministic and tie-free, so the
// tournament always converges — good enough to exercise the pairing structure.
function playLatestRound(t) {
    const r = T.latestRound(t);
    const idx = Object.fromEntries(t.teams.map((tm, i) => [tm, i]));
    t.matches.filter(m => m.round === r).forEach(m => {
        const aStronger = idx[m.teams[0]] > idx[m.teams[1]];
        m.scoreA = aStronger ? 21 : 10;
        m.scoreB = aStronger ? 10 : 21;
    });
}

// Play a whole tournament to completion, returning the per-round match groups.
function runToCompletion(t, rand) {
    const roundsPlayed = [];
    let guard = 0;
    while (!T.isComplete(t) && guard++ < 100) {
        playLatestRound(t);
        roundsPlayed.push(t.matches.filter(m => m.round === T.latestRound(t)));
        const next = T.generateNextRound(t, rand);
        if (next.length === 0) break;
        t.matches.push(...next);
    }
    return roundsPlayed;
}

// ===== isPowerOfTwo =====

test('isPowerOfTwo: 2,4,8,16 are valid; 1 and non-powers are not', () => {
    assert.ok(T.isPowerOfTwo(2));
    assert.ok(T.isPowerOfTwo(4));
    assert.ok(T.isPowerOfTwo(8));
    assert.ok(T.isPowerOfTwo(16));
    assert.ok(!T.isPowerOfTwo(1), 'need at least two teams');
    assert.ok(!T.isPowerOfTwo(3));
    assert.ok(!T.isPowerOfTwo(6));
    assert.ok(!T.isPowerOfTwo(0));
});

// ===== validTeamCount =====

test('validTeamCount: doubles needs an even roster that halves to a power of two', () => {
    assert.ok(T.validTeamCount('doubles', 4));   // 2 teams
    assert.ok(T.validTeamCount('doubles', 8));   // 4 teams
    assert.ok(T.validTeamCount('doubles', 16));  // 8 teams
    assert.ok(!T.validTeamCount('doubles', 6), '3 teams is not a power of two');
    assert.ok(!T.validTeamCount('doubles', 7), 'odd roster leaves a player over');
    assert.ok(!T.validTeamCount('doubles', 2), '1 team is not a tournament');
});

test('validTeamCount: singles needs a power-of-two player count', () => {
    assert.ok(T.validTeamCount('singles', 2));
    assert.ok(T.validTeamCount('singles', 8));
    assert.ok(!T.validTeamCount('singles', 6));
    assert.ok(!T.validTeamCount('singles', 1));
});

// ===== buildTeams =====

test('buildTeams: doubles pairs players two-by-two, keeping every player once', () => {
    const teams = T.buildTeams(names(8), 'doubles', seededRand(1));
    assert.equal(teams.length, 4);
    const members = teams.flatMap(s => s.split(' / '));
    assert.deepEqual([...members].sort(), [...names(8)].sort());
    teams.forEach(s => assert.equal(s.split(' / ').length, 2));
});

test('buildTeams: singles makes one team per player', () => {
    const teams = T.buildTeams(names(4), 'singles', seededRand(1));
    assert.deepEqual([...teams].sort(), [...names(4)].sort());
});

// ===== createTournament =====

test('createTournament: throws on an invalid roster', () => {
    assert.throws(() => T.createTournament({ players: names(6), mode: 'doubles', rand: seededRand(1) }));
    assert.throws(() => T.createTournament({ players: names(3), mode: 'singles', rand: seededRand(1) }));
});

test('createTournament: round 1 pairs all teams exactly once', () => {
    const t = T.createTournament({ players: names(8), mode: 'doubles', rand: seededRand(2) });
    assert.equal(t.teams.length, 4);
    const r1 = t.matches.filter(m => m.round === 1);
    assert.equal(r1.length, 2, '4 teams → 2 matches');
    const seated = r1.flatMap(m => m.teams);
    assert.deepEqual([...seated].sort(), [...t.teams].sort(), 'every team plays once');
});

test('createTournament: is deterministic for a fixed seed', () => {
    const a = T.createTournament({ players: names(8), mode: 'doubles', rand: seededRand(5), createdAt: 1 });
    const b = T.createTournament({ players: names(8), mode: 'doubles', rand: seededRand(5), createdAt: 1 });
    assert.deepEqual(a, b);
});

// ===== matchWinner / roundComplete =====

test('matchWinner: null when unscored or tied', () => {
    assert.equal(T.matchWinner({ scoreA: null, scoreB: null }), null);
    assert.equal(T.matchWinner({ scoreA: 15, scoreB: 15 }), null, 'ties are not decided');
    assert.equal(T.matchWinner({ scoreA: 21, scoreB: 10 }), 0);
    assert.equal(T.matchWinner({ scoreA: 10, scoreB: 21 }), 1);
});

test('roundComplete: false while a match is unscored or tied', () => {
    const t = T.createTournament({ players: names(8), mode: 'doubles', rand: seededRand(3) });
    assert.ok(!T.roundComplete(t), 'nothing scored yet');
    const r1 = t.matches.filter(m => m.round === 1);
    r1[0].scoreA = 21; r1[0].scoreB = 10;
    r1[1].scoreA = 15; r1[1].scoreB = 15; // tie
    assert.ok(!T.roundComplete(t), 'a tie leaves the round undecided');
    r1[1].scoreB = 12;
    assert.ok(T.roundComplete(t));
});

// ===== generateNextRound: Swiss grouping =====

test('generateNextRound: pairs teams with equal win records', () => {
    const t = T.createTournament({ players: names(16), mode: 'doubles', rand: seededRand(7) });
    playLatestRound(t);
    const rec = T.standings(t);               // records after round 1
    const next = T.generateNextRound(t, seededRand(9));
    assert.equal(next.length, 4, '8 teams → 4 matches');
    next.forEach(m => {
        assert.equal(rec[m.teams[0]].wins, rec[m.teams[1]].wins,
            'winners meet winners, losers meet losers');
    });
});

test('generateNextRound: interleaves winner/loser matches (win, lose, win, lose)', () => {
    const t = T.createTournament({ players: names(16), mode: 'doubles', rand: seededRand(7) });
    playLatestRound(t);
    const rec = T.standings(t);
    const next = T.generateNextRound(t, seededRand(9));
    assert.equal(next.length, 4, '8 teams → 4 matches');
    // Two record groups (1 win / 0 wins), interleaved: matches 0 & 2 are the winner group,
    // matches 1 & 3 are the loser group — so losers play from the first wave.
    const winsOf = m => rec[m.teams[0]].wins;
    assert.equal(winsOf(next[0]), 1, 'match 1 = winners');
    assert.equal(winsOf(next[1]), 0, 'match 2 = losers');
    assert.equal(winsOf(next[2]), 1, 'match 3 = winners');
    assert.equal(winsOf(next[3]), 0, 'match 4 = losers');
});

// ===== courts helpers =====

test('seatsPerCourt / matchesPerRound / maxUsefulCourts', () => {
    assert.equal(T.seatsPerCourt('doubles'), 4);
    assert.equal(T.seatsPerCourt('singles'), 2);
    assert.equal(T.matchesPerRound(8), 4);
    assert.equal(T.maxUsefulCourts(8), 4, '8 teams → at most 4 courts busy');
    assert.equal(T.maxUsefulCourts(2), 1, 'never below 1');
});

test('recommendedPlayers: roster needed to fill the chosen courts', () => {
    // doubles: 3 courts → need ≥6 teams → next pow2 = 8 teams → 16 players.
    assert.equal(T.recommendedPlayers('doubles', 3), 16);
    assert.equal(T.recommendedPlayers('doubles', 2), 8, '2 courts → 4 teams → 8 players');
    assert.equal(T.recommendedPlayers('doubles', 1), 4, '1 court → 2 teams → 4 players');
    // singles: teams == players.
    assert.equal(T.recommendedPlayers('singles', 3), 8);
    assert.equal(T.recommendedPlayers('singles', 1), 2);
});

test('courtWaves: chunks a round into waves of at most `courts`, order preserved', () => {
    const ms = [1, 2, 3, 4].map(n => ({ n }));
    assert.deepEqual(T.courtWaves(ms, 2), [[{ n: 1 }, { n: 2 }], [{ n: 3 }, { n: 4 }]]);
    assert.deepEqual(T.courtWaves(ms.slice(0, 3), 2), [[{ n: 1 }, { n: 2 }], [{ n: 3 }]]);
    assert.deepEqual(T.courtWaves(ms, 4), [[{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]], 'one wave when courts ≥ matches');
});

test('createTournament: stores courts, clamped to the useful maximum', () => {
    const t = T.createTournament({ players: names(8), mode: 'doubles', rand: seededRand(1), courts: 9 });
    assert.equal(t.courts, 2, '4 teams → 2 matches/round → at most 2 courts');
    const t1 = T.createTournament({ players: names(8), mode: 'doubles', rand: seededRand(1) });
    assert.equal(t1.courts, 1, 'defaults to 1 court');
});

test('rosterStatus: reports court-aware fields', () => {
    const s = T.rosterStatus('doubles', 16, 3);
    assert.equal(s.seatsPerCourt, 4);
    assert.equal(s.usableCourts, 3, '8 teams → 4 matches → 3 courts all usable');
    assert.equal(s.recommendedPlayers, 16);
    const over = T.rosterStatus('doubles', 8, 5);
    assert.equal(over.usableCourts, 2, '4 teams → only 2 courts can be busy');
});

test('generateNextRound: returns nothing until the round is complete', () => {
    const t = T.createTournament({ players: names(8), mode: 'doubles', rand: seededRand(1) });
    assert.deepEqual(T.generateNextRound(t, seededRand(1)), [], 'round 1 not scored yet');
});

// ===== full tournament =====

for (const [players, mode, label] of [
    [4, 'doubles', '2 teams'],
    [8, 'doubles', '4 teams'],
    [16, 'doubles', '8 teams'],
    [8, 'singles', '8 players'],
]) {
    test(`full run (${label}): converges to exactly one champion`, () => {
        const rand = seededRand(42);
        const t = T.createTournament({ players: names(players), mode, rand });
        const teamCount = t.teams.length;
        const roundsPlayed = runToCompletion(t, rand);

        assert.ok(T.isComplete(t), 'tournament finished');
        assert.equal(roundsPlayed.length, T.totalRounds(teamCount), 'log2(N) rounds');

        // Exactly one undefeated champion.
        const rec = T.standings(t);
        const undefeated = t.teams.filter(tm => rec[tm].losses === 0);
        assert.equal(undefeated.length, 1, 'one team never loses');
        assert.equal(T.champion(t), undefeated[0]);
        assert.equal(rec[undefeated[0]].wins, T.totalRounds(teamCount));

        // Every round: every team plays exactly once, no repeats within the round.
        roundsPlayed.forEach((ms, i) => {
            assert.equal(ms.length, teamCount / 2, `round ${i + 1} fills all teams`);
            const seated = ms.flatMap(m => m.teams);
            assert.equal(new Set(seated).size, seated.length, 'no team plays twice in a round');
            assert.deepEqual([...seated].sort(), [...t.teams].sort(), 'no team sits out');
        });
    });
}

test('full run: no rematches for a clean 4-team bracket', () => {
    // 4 teams over 2 rounds: round 2 pairs the two winners together and the two losers
    // together — none of which met in round 1, so there is never a rematch.
    const rand = seededRand(11);
    const t = T.createTournament({ players: names(8), mode: 'doubles', rand });
    runToCompletion(t, rand);
    const seen = new Set();
    let rematches = 0;
    t.matches.forEach(m => {
        const key = [m.teams[0], m.teams[1]].sort().join(' :: ');
        if (seen.has(key)) rematches++;
        seen.add(key);
    });
    assert.equal(rematches, 0);
});

test('champion: null until the tournament is complete', () => {
    const t = T.createTournament({ players: names(8), mode: 'doubles', rand: seededRand(1) });
    assert.equal(T.champion(t), null);
    assert.ok(!T.isComplete(t));
});
