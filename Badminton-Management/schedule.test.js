// Tests for the match-scheduling logic — the pairing/fairness rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const { shuffle, roundRobin, makeSchedule, continueSchedule } = require('./schedule.js');

// A deterministic RNG so tests don't flake.  A simple LCG seeded per test.
function seededRand(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

const names = n => Array.from({ length: n }, (_, i) => String(i + 1));

// Split a doubles match into the four player names that took the court.
function playersOf(match) {
    return [...match.teams[0].split(' / '), ...match.teams[1].split(' / ')].map(s => s.trim());
}

// playCount per player across a whole schedule (works for singles & doubles).
function playCounts(players, matches) {
    const c = Object.fromEntries(players.map(p => [p, 0]));
    matches.forEach(m => {
        const ps = m.teams.flatMap(t => String(t).split(' / ').map(s => s.trim()));
        ps.forEach(p => { if (p in c) c[p]++; });
    });
    return c;
}

function rounds(matches) {
    const byRound = {};
    matches.forEach(m => { (byRound[m.round] ||= []).push(m); });
    return Object.keys(byRound).map(Number).sort((a, b) => a - b).map(r => byRound[r]);
}

// ===== shuffle =====

test('shuffle: returns a permutation, does not mutate input', () => {
    const input = names(10);
    const copy = [...input];
    const out = shuffle(input, seededRand(1));
    assert.deepEqual(input, copy, 'input must not be mutated');
    assert.deepEqual([...out].sort(), [...input].sort(), 'must be a permutation');
});

// ===== roundRobin =====

test('roundRobin: fewer than 2 participants yields no matches', () => {
    assert.deepEqual(roundRobin([]), []);
    assert.deepEqual(roundRobin(['A']), []);
});

test('roundRobin: every pair meets exactly once (even count)', () => {
    const players = names(4);
    const matches = roundRobin(players);
    // 4 players -> C(4,2) = 6 unique pairings, no BYE.
    assert.equal(matches.length, 6);
    const seen = new Set(matches.map(m => [m.teams[0], m.teams[1]].sort().join('-')));
    assert.equal(seen.size, 6, 'all pairings unique');
});

test('roundRobin: odd count adds a BYE so nobody is double-booked in a round', () => {
    const players = names(5);
    const matches = roundRobin(players);
    // 5 players -> C(5,2) = 10 matches; the BYE drops one match per round.
    assert.equal(matches.length, 10);
    // No player appears twice in the same round.
    for (const roundMatches of rounds(matches)) {
        const inRound = roundMatches.flatMap(m => m.teams);
        assert.equal(new Set(inRound).size, inRound.length, 'no double-booking in a round');
    }
});

// ===== doubles: equal play count (the stop condition) =====

test('doubles: everyone ends with an equal play count', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const players = names(9);
        const matches = makeSchedule({ players, mode: 'doubles', courts: 1, rand: seededRand(seed) });
        const counts = Object.values(playCounts(players, matches));
        assert.equal(Math.min(...counts), Math.max(...counts), `seed ${seed}: counts must be equal`);
        assert.ok(Math.min(...counts) >= 1, `seed ${seed}: everyone plays at least once`);
        // 9 players, 1 court -> 9 rounds of 4 -> everyone plays 4 times.
        assert.equal(Math.max(...counts), 4);
    }
});

test('doubles: each round fills as many courts as players allow', () => {
    const players = names(8);
    const matches = makeSchedule({ players, mode: 'doubles', courts: 2, rand: seededRand(7) });
    for (const roundMatches of rounds(matches)) {
        assert.ok(roundMatches.length <= 2, 'never exceeds court count');
        // No player plays twice within the same round.
        const inRound = roundMatches.flatMap(playersOf);
        assert.equal(new Set(inRound).size, inRound.length, 'no player twice per round');
    }
});

// ===== doubles: partner diversity (new partners before repeats) =====

// Count, for a doubles schedule, how many times each unordered partnership occurs.
function partnerCounts(matches) {
    const c = {};
    matches.forEach(m => {
        m.teams.forEach(t => {
            const [a, b] = t.split(' / ').map(s => s.trim()).sort();
            const key = a + '|' + b;
            c[key] = (c[key] || 0) + 1;
        });
    });
    return c;
}

// Replay the schedule match-by-match and assert the chosen split of the four
// court players always has the minimum possible already-used-partner cost.  This
// is the exact guarantee: a fresh pairing is always preferred, and a repeat is
// only ever produced when NO unused split of those four players exists (i.e. they
// have already partnered everyone available to them that round).
function assertMinPartnerCost(matches, label) {
    const pc = {};
    const seen = (a, b) => (pc[a + '|' + b] || 0);
    const add = (a, b) => { pc[a + '|' + b] = seen(a, b) + 1; pc[b + '|' + a] = seen(b, a) + 1; };
    for (const m of matches) {
        const [a, b] = m.teams[0].split(' / ').map(s => s.trim());
        const [c, d] = m.teams[1].split(' / ').map(s => s.trim());
        // Cost of the split actually chosen, vs the best of all three splits.
        const chosen = seen(a, b) + seen(c, d);
        const splits = [
            seen(a, b) + seen(c, d),
            seen(a, c) + seen(b, d),
            seen(a, d) + seen(b, c),
        ];
        const best = Math.min(...splits);
        assert.equal(chosen, best,
            `${label}: round ${m.round} chose a ${chosen}-repeat split when a ${best}-repeat split existed`);
        add(a, b);
        add(c, d);
    }
}

test('doubles: always pairs to minimise repeats (fresh partners preferred, repeat only when forced)', () => {
    // 5 players, 1 court -> 5 rounds, everyone plays 4 times: enough partnerships to
    // force the question of repeats.  Across many seeds the chosen pairing must
    // always be a minimum-repeat split.
    for (const seed of [1, 2, 3, 7, 13, 42, 99, 123, 256, 1000]) {
        const players = names(5);
        const matches = makeSchedule({ players, mode: 'doubles', courts: 1, rand: seededRand(seed) });
        assertMinPartnerCost(matches, `seed ${seed}`);
    }
});

test('doubles: minimise-repeat holds with multiple courts too', () => {
    for (const seed of [4, 8, 16, 32]) {
        const players = names(7); // 1 court fits, the 8th-ish rotates; long enough run
        const matches = makeSchedule({ players, mode: 'doubles', courts: 1, rand: seededRand(seed) });
        assertMinPartnerCost(matches, `seed ${seed}`);
    }
    const players = names(12);
    const matches = makeSchedule({ players, mode: 'doubles', courts: 2, rand: seededRand(77) });
    assertMinPartnerCost(matches, 'multi-court');
});

test('doubles: when each plays once there are no repeats at all', () => {
    const players = names(8);
    const matches = makeSchedule({ players, mode: 'doubles', courts: 2, rand: seededRand(5) });
    const counts = partnerCounts(matches);
    assert.ok(Object.values(counts).every(n => n === 1), 'each plays once -> no repeats');
});

// ===== doubles: the rest-rotation feature =====

test('doubles: when enough players, the four who just played all rest next round', () => {
    // 8 players, 1 court: exactly two disjoint groups of four should alternate.
    for (const seed of [1, 2, 3, 11, 42, 99]) {
        const players = names(8);
        const matches = makeSchedule({ players, mode: 'doubles', courts: 1, rand: seededRand(seed) });
        const rs = rounds(matches);
        const r1 = new Set(playersOf(rs[0][0]));
        const r2 = playersOf(rs[1][0]);
        for (const p of r2) {
            assert.ok(!r1.has(p), `seed ${seed}: player ${p} played round 1 AND round 2 despite enough rested players`);
        }
    }
});

test('doubles: rested players are never left waiting while a just-played player goes on', () => {
    // General invariant: in any round, no player who is resting has both a lower
    // playCount AND played-longer-ago than someone who was selected.  We verify the
    // weaker, decisive property: a player picked in round r whose previous game was
    // round r-1 implies every player NOT picked also played in round r-1 (i.e. there
    // was nobody more-rested to take their place).
    for (const seed of [3, 8, 21, 55]) {
        const players = names(12); // 1 court -> 4 play, 8 rest each round
        const matches = makeSchedule({ players, mode: 'doubles', courts: 1, rand: seededRand(seed) });
        const rs = rounds(matches);
        const lastPlayed = Object.fromEntries(players.map(p => [p, 0]));
        rs.forEach((roundMatches, idx) => {
            const r = idx + 1;
            const picked = new Set(roundMatches.flatMap(playersOf));
            const justPlayedAndPickedAgain = [...picked].filter(p => lastPlayed[p] === r - 1 && r > 1);
            if (justPlayedAndPickedAgain.length > 0) {
                // Then every resting player must ALSO have played last round
                // (otherwise a more-rested player should have been chosen).
                const resting = players.filter(p => !picked.has(p));
                for (const rp of resting) {
                    assert.equal(lastPlayed[rp], r - 1,
                        `seed ${seed} round ${r}: rested player ${rp} (idle) should have replaced a just-played player`);
                }
            }
            picked.forEach(p => { lastPlayed[p] = r; });
        });
    }
});

test('doubles: too few players to rest -> players go straight back on (old behaviour)', () => {
    // 4 players, 1 court: only 4 can play, so the same four replay every round.
    const players = names(4);
    const matches = makeSchedule({ players, mode: 'doubles', courts: 1, rand: seededRand(1) });
    // Everyone equal after a single round of 4 -> stops at 1 round.
    assert.equal(matches.length, 1);
    assert.deepEqual(playersOf(matches[0]).sort(), players.sort());
});

test('doubles: prevMatches biases who waits (players who played a lot last time)', () => {
    // 5 players, 1 court.  Previous schedule had player "1" play a lot; with all
    // else equal "1" should be among the first to rest.  Run many seeds and check
    // "1" is not over-favoured: its total play count equals everyone else's.
    const players = names(5);
    const prevMatches = [
        { teams: ['1 / 2', '3 / 4'], round: 1 },
        { teams: ['1 / 2', '3 / 5'], round: 2 },
    ];
    const matches = makeSchedule({ players, mode: 'doubles', courts: 1, prevMatches, rand: seededRand(4) });
    const counts = Object.values(playCounts(players, matches));
    assert.equal(Math.min(...counts), Math.max(...counts), 'fairness still holds with prevMatches');
});

test('doubles: fewer than 4 players yields no matches', () => {
    const matches = makeSchedule({ players: names(3), mode: 'doubles', courts: 1, rand: seededRand(1) });
    assert.deepEqual(matches, []);
});

// ===== singles =====

test('singles: everyone plays an equal number of times, no double-booking per round', () => {
    const players = names(4);
    const matches = makeSchedule({ players, mode: 'singles', courts: 1, rand: seededRand(2) });
    const counts = Object.values(playCounts(players, matches));
    assert.equal(Math.min(...counts), Math.max(...counts));
    for (const roundMatches of rounds(matches)) {
        const inRound = roundMatches.flatMap(m => m.teams);
        assert.equal(new Set(inRound).size, inRound.length);
    }
});

test('singles: multiple courts schedule several matches per round', () => {
    const players = names(6);
    const matches = makeSchedule({ players, mode: 'singles', courts: 2, rand: seededRand(5) });
    const maxPerRound = Math.max(...rounds(matches).map(r => r.length));
    assert.ok(maxPerRound >= 1 && maxPerRound <= 2);
});

test('singles: fewer than 2 players yields no matches', () => {
    assert.deepEqual(makeSchedule({ players: names(1), mode: 'singles', courts: 1, rand: seededRand(1) }), []);
});

// ===== custom getPlayers (legacy triple-team prevMatches counting) =====

test('makeSchedule: custom getPlayers is used to count previous appearances', () => {
    let called = false;
    const getPlayers = (m, i) => { called = true; return String(m.teams[i]).split(' / '); };
    makeSchedule({
        players: names(8),
        mode: 'doubles',
        courts: 1,
        prevMatches: [{ teams: ['1 / 2', '3 / 4'], round: 1 }],
        getPlayers,
        rand: seededRand(1),
    });
    assert.ok(called, 'custom getPlayers must be invoked for prevMatches');
});

// ===== continueSchedule: mid-game re-pairing =====

// Build a played doubles match (with scores so it counts as "played").
function played(teamA, teamB, round) {
    return { teams: [teamA, teamB], scoreA: 21, scoreB: 15, round };
}
const spreadOf = vals => Math.max(...vals) - Math.min(...vals);

test('continueSchedule: a withdrawn player never appears in the new matches', () => {
    // 8 players played, leaving 1/2/5/6 at 2 and 3/4/7/8 at 1; player "8" then leaves.
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
        played('1 / 2', '5 / 6', 2),
    ];
    const remaining = ['1', '2', '3', '4', '5', '6', '7']; // 8 withdrawn
    const out = continueSchedule({
        players: remaining, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(1),
    });
    const everyoneNew = out.flatMap(playersOf);
    assert.ok(out.length > 0, 'remaining players were unequal -> must re-pair');
    assert.ok(!everyoneNew.includes('8'), 'withdrawn player 8 must not be re-paired');
    everyoneNew.forEach(p => assert.ok(remaining.includes(p), `unexpected player ${p}`));
});

test('REGRESSION: a player ahead by a game RESTS while the rest catch up — never pushed past equal', () => {
    // The reported bug: after someone left mid-game, one player (here "1") had played
    // 3 games while the other eight had played 2.  Re-pairing must NOT drag "1" into a
    // 4th game; it must rest "1" and seat the eight laggards so EVERYONE ends equal at 3.
    // Counts come out as 1@3, 2..9@2, X@1 (X is the player who left).
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
        played('1 / 9', 'X / 2', 2),
        played('3 / 5', '4 / 6', 2),
        played('7 / 9', '8 / 1', 3),
    ];
    const remaining = ['1', '2', '3', '4', '5', '6', '7', '8', '9']; // X withdrew
    const out = continueSchedule({
        players: remaining, mode: 'doubles', courts: 2, playedMatches, rand: seededRand(7),
    });
    const everyoneNew = out.flatMap(playersOf);
    assert.ok(!everyoneNew.includes('X'), 'withdrawn player X must not be re-paired');
    assert.ok(!everyoneNew.includes('1'), 'the player already ahead (1) must rest, not play a 4th game');
    const counts = playCounts(remaining, [...playedMatches, ...out]);
    assert.equal(spreadOf(Object.values(counts)), 0, 'everyone remaining ends with EQUAL games');
    assert.equal(counts['1'], 3, 'the ahead player stays at 3 (was not dragged higher)');
});

test('continueSchedule: already equal -> nothing more to pair', () => {
    // Two groups of 4 each played one round -> everyone at 1, nobody left/joined.
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
    ];
    const out = continueSchedule({
        players: names(8), mode: 'doubles', courts: 1, playedMatches, rand: seededRand(2),
    });
    assert.equal(out.length, 0, 'all equal already -> stop, no new matches');
});

test('continueSchedule: keeps pairing until everyone is exactly equal', () => {
    // 1-4 played round 1 (count 1), 5-7 are behind (count 0).  Continue must run until
    // all seven are level — not just "within one game".
    const playedMatches = [played('1 / 2', '3 / 4', 1)];
    const remaining = ['1', '2', '3', '4', '5', '6', '7'];
    const out = continueSchedule({
        players: remaining, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(3),
    });
    assert.ok(out.length >= 1, 'must produce matches so the behind players catch up');
    const counts = playCounts(remaining, [...playedMatches, ...out]);
    assert.equal(spreadOf(Object.values(counts)), 0, 'everyone ends exactly equal');
});

test('continueSchedule: new round numbers continue after the played rounds', () => {
    const playedMatches = [played('1 / 2', '3 / 4', 1)];
    const remaining = ['1', '2', '3', '4', '5', '6', '7'];
    const out = continueSchedule({
        players: remaining, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(3),
    });
    out.forEach(m => assert.ok(m.round >= 2, `new match round ${m.round} should be >= 2`));
});

test('continueSchedule: prefers fresh partnerships carried over from played matches', () => {
    const playedMatches = [played('1 / 2', '3 / 4', 1)];
    const remaining = ['1', '2', '3', '4', '5', '6', '7'];
    for (const seed of [1, 2, 3, 7, 13]) {
        const out = continueSchedule({
            players: remaining, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(seed),
        });
        // Replay partner cost across played + new; the chosen split must always be a
        // minimum-repeat split (same guarantee as makeSchedule).
        assertMinPartnerCost([...playedMatches, ...out], `seed ${seed}`);
    }
});

test('continueSchedule: no prior play -> behaves like a full fresh schedule', () => {
    const out = continueSchedule({
        players: names(8), mode: 'doubles', courts: 1, playedMatches: [], rand: seededRand(5),
    });
    const counts = Object.values(playCounts(names(8), out));
    assert.equal(Math.min(...counts), Math.max(...counts), 'fresh schedule: everyone equal');
    assert.ok(Math.min(...counts) >= 1, 'everyone plays at least once');
});

test('continueSchedule: always terminates and ends equal (no runaway)', () => {
    const playedMatches = [played('1 / 2', '3 / 4', 1)];
    const remaining = ['1', '2', '3', '4', '5']; // 5 players, 1 court
    const out = continueSchedule({
        players: remaining, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(9),
    });
    assert.ok(out.length < 100, 'must be bounded, not a runaway loop');
    const counts = playCounts(remaining, [...playedMatches, ...out]);
    assert.equal(spreadOf(Object.values(counts)), 0, 'ends with everyone equal');
});

test('continueSchedule: fewer remaining players than a court needs -> no new matches', () => {
    const playedMatches = [played('1 / 2', '3 / 4', 1)];
    const out = continueSchedule({
        players: ['1', '2', '3'], mode: 'doubles', courts: 1, playedMatches, rand: seededRand(1),
    });
    assert.deepEqual(out, []);
});

test('continueSchedule: every round seats the whole roster (cannot rest) -> no new matches', () => {
    // 8 players, 2 courts: all 8 play every round, so an imbalance can never be evened
    // out by adding rounds.  Must return [] instead of looping forever.
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
        played('1 / 2', '5 / 6', 2), // makes 1,2,5,6 ahead — unfixable with 2 courts/8 players
    ];
    const out = continueSchedule({
        players: names(8), mode: 'doubles', courts: 2, playedMatches, rand: seededRand(3),
    });
    assert.deepEqual(out, [], 'no one can rest -> cannot equalize -> no matches');
});

test('continueSchedule: a player who joins mid-game catches up until everyone is equal', () => {
    // 4 players each played 2 games; player "5" arrives partway through and is added.
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('1 / 3', '2 / 4', 2),
    ];
    const withNewcomer = ['1', '2', '3', '4', '5'];
    const out = continueSchedule({
        players: withNewcomer, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(3),
    });
    assert.ok(out.flatMap(playersOf).includes('5'), 'newcomer 5 must be brought into play');
    assert.ok(out.length < 100, 'stays bounded');
    const counts = playCounts(withNewcomer, [...playedMatches, ...out]);
    assert.equal(spreadOf(Object.values(counts)), 0, 'newcomer catches up until everyone is equal');
});

test('continueSchedule: a mid-game joiner among many players ends equal, bounded', () => {
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
    ];
    const withNewcomer = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const out = continueSchedule({
        players: withNewcomer, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(8),
    });
    assert.ok(out.flatMap(playersOf).includes('9'), 'newcomer 9 gets to play');
    assert.ok(out.length < 100, 'stays bounded');
    const counts = playCounts(withNewcomer, [...playedMatches, ...out]);
    assert.equal(spreadOf(Object.values(counts)), 0, 'everyone ends equal');
});

test('continueSchedule: singles continues until everyone is equal', () => {
    const playedSingles = [{ teams: ['1', '2'], scoreA: 21, scoreB: 10, round: 1 }];
    const remaining = ['1', '2', '3', '4'];
    const out = continueSchedule({
        players: remaining, mode: 'singles', courts: 1, playedMatches: playedSingles, rand: seededRand(4),
    });
    const counts = playCounts(remaining, [...playedSingles, ...out]);
    assert.equal(spreadOf(Object.values(counts)), 0, 'singles: everyone ends equal');
    assert.ok(Math.min(...Object.values(counts)) >= 1, 'the behind players get to play');
});
