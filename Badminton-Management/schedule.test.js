// Tests for the match-scheduling logic — the pairing/fairness rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const { shuffle, roundRobin, makeSchedule, continueSchedule, teamGender, forbiddenMatch, rankBalanceCost } = require('./schedule.js');

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

// ===== doubles: gender pairing constraint (no ช-ช vs ญ-ญ) =====

// Build a genderOf lookup from a {name: 'male'|'female'} map.
const genderLookup = map => name => map[name] || null;

// Classify a doubles team ('male'/'female'/'mixed') for assertions.
function teamGenderOf(teamStr, gmap) {
    const members = teamStr.split(' / ').map(s => s.trim());
    const genders = members.map(m => gmap[m]);
    if (genders.every(g => g === 'male')) return 'male';
    if (genders.every(g => g === 'female')) return 'female';
    return 'mixed';
}

// True if a whole schedule contains a forbidden all-male vs all-female match.
function hasForbidden(matches, gmap) {
    return matches.some(m => {
        const a = teamGenderOf(m.teams[0], gmap);
        const b = teamGenderOf(m.teams[1], gmap);
        return (a === 'male' && b === 'female') || (a === 'female' && b === 'male');
    });
}

test('teamGender: all-same vs mixed classification', () => {
    const g = genderLookup({ a: 'male', b: 'male', c: 'female', d: null });
    assert.equal(teamGender(['a', 'b'], g), 'male');
    assert.equal(teamGender(['c'], g), 'female');
    assert.equal(teamGender(['a', 'c'], g), 'mixed');
    assert.equal(teamGender(['a', 'd'], g), 'mixed', 'unknown gender -> mixed (fail-safe)');
});

test('forbiddenMatch: only all-male vs all-female is forbidden', () => {
    const g = genderLookup({ m1: 'male', m2: 'male', f1: 'female', f2: 'female' });
    assert.equal(forbiddenMatch(['m1', 'm2'], ['f1', 'f2'], g), true, 'MM vs FF forbidden');
    assert.equal(forbiddenMatch(['f1', 'f2'], ['m1', 'm2'], g), true, 'FF vs MM forbidden');
    assert.equal(forbiddenMatch(['m1', 'f1'], ['m2', 'f2'], g), false, 'mixed vs mixed ok');
    assert.equal(forbiddenMatch(['m1', 'f1'], ['m2', 'm2'], g), false, 'mixed vs MM ok');
    assert.equal(forbiddenMatch(['m1', 'm2'], ['m1', 'm2'], g), false, 'MM vs MM ok');
    assert.equal(forbiddenMatch(['f1', 'f2'], ['f1', 'f2'], g), false, 'FF vs FF ok');
});

test('doubles: never schedules an all-male vs all-female match', () => {
    // 4 males + 4 females, 1 court — the case where MM-vs-FF is most tempting.
    const males = ['m1', 'm2', 'm3', 'm4'];
    const females = ['f1', 'f2', 'f3', 'f4'];
    const players = [...males, ...females];
    const gmap = {};
    males.forEach(m => { gmap[m] = 'male'; });
    females.forEach(f => { gmap[f] = 'female'; });
    for (const seed of [1, 2, 3, 7, 13, 42, 99, 123, 256, 1000]) {
        const matches = makeSchedule({
            players, mode: 'doubles', courts: 1, genderOf: genderLookup(gmap), rand: seededRand(seed),
        });
        assert.ok(!hasForbidden(matches, gmap), `seed ${seed}: produced a forbidden ช-ช vs ญ-ญ match`);
        // Fairness must still hold.
        const counts = Object.values(playCounts(players, matches));
        assert.equal(Math.min(...counts), Math.max(...counts), `seed ${seed}: play counts must stay equal`);
    }
});

test('doubles: 2 males + 2 females on one court -> mixed vs mixed (the only legal split)', () => {
    const players = ['m1', 'm2', 'f1', 'f2'];
    const gmap = { m1: 'male', m2: 'male', f1: 'female', f2: 'female' };
    for (const seed of [1, 5, 9, 21, 77]) {
        const matches = makeSchedule({
            players, mode: 'doubles', courts: 1, genderOf: genderLookup(gmap), rand: seededRand(seed),
        });
        assert.equal(matches.length, 1, 'one round of 4 -> everyone equal -> stop');
        assert.equal(teamGenderOf(matches[0].teams[0], gmap), 'mixed');
        assert.equal(teamGenderOf(matches[0].teams[1], gmap), 'mixed');
    }
});

test('doubles: all-male roster still plays (all-male vs all-male is allowed)', () => {
    const players = ['m1', 'm2', 'm3', 'm4'];
    const gmap = { m1: 'male', m2: 'male', m3: 'male', m4: 'male' };
    const matches = makeSchedule({
        players, mode: 'doubles', courts: 1, genderOf: genderLookup(gmap), rand: seededRand(3),
    });
    assert.equal(matches.length, 1);
    assert.ok(!hasForbidden(matches, gmap), 'all-male match is not forbidden');
});

test('doubles: with mixed genders, mixed matches DO get produced (rule is not over-applied)', () => {
    // 3 males + 3 females, 1 court -> 6 rounds, plenty of matches: at least some must be
    // mixed (we are not banning everything, only MM-vs-FF).
    const players = ['m1', 'm2', 'm3', 'f1', 'f2', 'f3'];
    const gmap = { m1: 'male', m2: 'male', m3: 'male', f1: 'female', f2: 'female', f3: 'female' };
    const matches = makeSchedule({
        players, mode: 'doubles', courts: 1, genderOf: genderLookup(gmap), rand: seededRand(11),
    });
    assert.ok(!hasForbidden(matches, gmap), 'no forbidden match');
    const anyMixed = matches.some(m =>
        teamGenderOf(m.teams[0], gmap) === 'mixed' || teamGenderOf(m.teams[1], gmap) === 'mixed');
    assert.ok(anyMixed, 'mixed teams should appear, not be forbidden');
});

test('continueSchedule: mid-game re-pairing also never produces ช-ช vs ญ-ญ', () => {
    const players = ['m1', 'm2', 'm3', 'm4', 'f1', 'f2', 'f3', 'f4'];
    const gmap = {};
    ['m1', 'm2', 'm3', 'm4'].forEach(m => { gmap[m] = 'male'; });
    ['f1', 'f2', 'f3', 'f4'].forEach(f => { gmap[f] = 'female'; });
    // One round played (all mixed), then a latecomer-free continuation on uneven counts.
    const playedMatches = [played('m1 / f1', 'm2 / f2', 1)];
    const remaining = players; // m3,m4,f3,f4 are behind at 0
    for (const seed of [1, 2, 3, 7, 13, 42]) {
        const out = continueSchedule({
            players: remaining, mode: 'doubles', courts: 1, playedMatches,
            genderOf: genderLookup(gmap), rand: seededRand(seed),
        });
        assert.ok(!hasForbidden(out, gmap), `seed ${seed}: continuation produced a forbidden match`);
    }
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

test('continueSchedule: pairs the behind players up to the leader (court-usage first)', () => {
    // 1-4 played round 1 (count 1), 5-7 are behind (count 0).  Continue must run until
    // the behind players have caught up to the leader's level (1 game).  Counts may end
    // a game apart — court usage is preferred over exact equality.
    const playedMatches = [played('1 / 2', '3 / 4', 1)];
    const remaining = ['1', '2', '3', '4', '5', '6', '7'];
    const out = continueSchedule({
        players: remaining, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(3),
    });
    assert.ok(out.length >= 1, 'must produce matches so the behind players catch up');
    const counts = playCounts(remaining, [...playedMatches, ...out]);
    // The behind players (5,6,7) must have played at least once (caught up to the leader).
    ['5', '6', '7'].forEach(p => assert.ok(counts[p] >= 1, `behind player ${p} must catch up`));
    assert.ok(spreadOf(Object.values(counts)) <= 1, 'ends within one game');
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

test('continueSchedule: always terminates (no runaway)', () => {
    const playedMatches = [played('1 / 2', '3 / 4', 1)];
    const remaining = ['1', '2', '3', '4', '5']; // 5 players, 1 court
    const out = continueSchedule({
        players: remaining, mode: 'doubles', courts: 1, playedMatches, rand: seededRand(9),
    });
    assert.ok(out.length < 100, 'must be bounded, not a runaway loop');
    const counts = playCounts(remaining, [...playedMatches, ...out]);
    // The behind player (5) catches up to the leader; counts may differ by a game.
    assert.ok(counts['5'] >= 1, 'the behind player gets to play');
    assert.ok(spreadOf(Object.values(counts)) <= 1, 'ends within one game');
});

test('continueSchedule: fewer remaining players than a court needs -> no new matches', () => {
    const playedMatches = [played('1 / 2', '3 / 4', 1)];
    const out = continueSchedule({
        players: ['1', '2', '3'], mode: 'doubles', courts: 1, playedMatches, rand: seededRand(1),
    });
    assert.deepEqual(out, []);
});

test('continueSchedule: 8 players / 2 courts fills BOTH courts, allowing a one-game gap', () => {
    // 8 players exactly fill 2 courts, so nobody can rest.  Court-usage-first: rather than
    // leave a court empty to reach exact equality, BOTH courts are used — the four behind
    // catch up while the four ahead play on, ending one game apart.
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
        played('1 / 2', '5 / 6', 2), // 1,2,5,6 at 2 games; 3,4,7,8 at 1 game
    ];
    for (const seed of [1, 3, 5, 8, 13]) {
        const out = continueSchedule({
            players: names(8), mode: 'doubles', courts: 2, playedMatches, rand: seededRand(seed),
        });
        assert.equal(out.length, 2, `seed ${seed}: one round using BOTH courts (no court left empty)`);
        // The behind players (3,4,7,8) must catch up to the leader's level.
        const counts = playCounts(names(8), [...playedMatches, ...out]);
        ['3', '4', '7', '8'].forEach(p =>
            assert.equal(counts[p], 2, `seed ${seed}: behind player ${p} caught up to 2`));
        assert.ok(spreadOf(Object.values(counts)) <= 1, `seed ${seed}: ends within one game`);
    }
});

test('continueSchedule: withdrawal leaving an 8/2 imbalance fills both courts within a game', () => {
    // A player leaving mid-game must not strand the rest with an idle court.  8 players
    // remain on 2 courts (X withdrew); 1,2,5,6 are a game ahead.  Court-usage-first uses
    // BOTH courts: the four behind catch up while the four ahead play on, ending a game apart.
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
        played('1 / 5', '2 / 6', 2), // 1,2,5,6 -> 2 games; 3,4,7,8 -> 1; X never played
    ];
    const remaining = names(8); // X withdrew
    const out = continueSchedule({
        players: remaining, mode: 'doubles', courts: 2, playedMatches, rand: seededRand(4),
    });
    assert.equal(out.length, 2, 'one round using BOTH courts (no court left empty)');
    const counts = playCounts(remaining, [...playedMatches, ...out]);
    ['3', '4', '7', '8'].forEach(p =>
        assert.equal(counts[p], 2, `behind player ${p} caught up to 2`));
    assert.ok(spreadOf(Object.values(counts)) <= 1, 'ends within one game');
});

test('continueSchedule: latecomer on courts that could seat everyone is caught up to the leader', () => {
    // Someone joining mid-game must be paired until they reach the leader's level.  8 already
    // played a round (all at 1); "9" joins.  Court usage is preferred, so counts may end a
    // game apart rather than leaving a court idle.
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
    ];
    const withNewcomer = names(9);
    const out = continueSchedule({
        players: withNewcomer, mode: 'doubles', courts: 2, playedMatches, rand: seededRand(6),
    });
    assert.ok(out.flatMap(playersOf).includes('9'), 'newcomer 9 must be brought into play');
    assert.ok(out.length < 200, 'stays bounded');
    const counts = playCounts(withNewcomer, [...playedMatches, ...out]);
    assert.ok(counts['9'] >= 1, 'newcomer caught up to the leader (played at least once)');
    assert.ok(spreadOf(Object.values(counts)) <= 1, 'ends within one game');
});

test('continueSchedule: fills ALL courts every round, never leaving one idle', () => {
    // Court-usage rule: while catching up, every round opens all `courts` — a court is
    // never left empty just to keep counts equal.  9 players / 2 courts with a latecomer:
    // every round must run both courts (the 9th player rests, but no court sits idle).
    const playedMatches = [
        played('1 / 2', '3 / 4', 1),
        played('5 / 6', '7 / 8', 1),
    ];
    for (const seed of [1, 4, 6, 9, 21]) {
        const out = continueSchedule({
            players: names(9), mode: 'doubles', courts: 2, playedMatches, rand: seededRand(seed),
        });
        const perRound = {};
        out.forEach(m => { perRound[m.round] = (perRound[m.round] || 0) + 1; });
        Object.entries(perRound).forEach(([r, n]) =>
            assert.equal(n, 2, `seed ${seed}: round ${r} must use all 2 courts (none left idle)`));
        const counts = playCounts(names(9), [...playedMatches, ...out]);
        assert.ok(counts['9'] >= 1, `seed ${seed}: newcomer caught up`);
        assert.ok(spreadOf(Object.values(counts)) <= 1, `seed ${seed}: ends within one game`);
    }
});

test('continueSchedule: a player who joins mid-game catches up to the leader (court-usage first)', () => {
    // 4 players each played 2 games; player "5" arrives partway through and is added.  With a
    // single court only four can play at a time, so filling the court every round means the
    // others play on while "5" catches up — the gap can exceed one game (court usage wins).
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
    // Every round fills the court — no match has fewer than 4 players, none is left empty.
    out.forEach(m => assert.equal(playersOf(m).length, 4, 'every court is full'));
    const counts = playCounts(withNewcomer, [...playedMatches, ...out]);
    assert.ok(counts['5'] >= 2, 'newcomer caught up to the leader level (2 games)');
});

test('continueSchedule: a mid-game joiner among many players catches up, bounded', () => {
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
    assert.ok(counts['9'] >= 1, 'newcomer caught up to the leader');
    assert.ok(spreadOf(Object.values(counts)) <= 1, 'ends within one game');
});

test('REGRESSION: continueSchedule never leaves a court empty just to equalize', () => {
    // The reported issue: the old "exact equality" rule left a court idle in the final
    // catch-up round.  Now court usage comes first — across many imbalances and seeds, no
    // round may open fewer courts than it could fill with the available players.
    const scenarios = [
        // [played matches, roster, courts]
        [[played('1 / 2', '3 / 4', 1), played('5 / 6', '7 / 8', 1), played('1 / 2', '5 / 6', 2)], names(8), 2],
        [[played('1 / 2', '3 / 4', 1), played('5 / 6', '7 / 8', 1)], names(9), 2],
        [[played('1 / 2', '3 / 4', 1)], ['1', '2', '3', '4', '5', '6', '7', '8'], 2],
    ];
    for (const [playedMatches, roster, courts] of scenarios) {
        for (const seed of [1, 2, 3, 7, 13]) {
            const out = continueSchedule({
                players: roster, mode: 'doubles', courts, playedMatches, rand: seededRand(seed),
            });
            const perRound = {};
            out.forEach(m => { perRound[m.round] = (perRound[m.round] || 0) + 1; });
            // How many courts a round COULD fill given the roster size.
            const fillable = Math.min(courts, Math.floor(roster.length / 4));
            Object.entries(perRound).forEach(([r, n]) =>
                assert.equal(n, fillable,
                    `roster ${roster.length}/${courts}c seed ${seed}: round ${r} used ${n} courts, could fill ${fillable}`));
        }
    }
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

// ===== doubles: rank-balanced teams =====

// Build a rankOf lookup from a {name: rankId} map.
const rankLookup = map => name => map[name] || null;
// Numeric strength of a rank id (mirrors RANK_VALUE in schedule.js).
const RVAL = { beginner: 1, intermediate: 2, advanced: 3, pro: 4 };
// Total strength of a doubles team string under a rank map.
function teamStrength(teamStr, rmap) {
    return teamStr.split(' / ').map(s => s.trim()).reduce((s, p) => s + RVAL[rmap[p]], 0);
}
// |strengthA - strengthB| for a finished match (for assertions).
function matchGap(match, rmap) {
    return Math.abs(teamStrength(match.teams[0], rmap) - teamStrength(match.teams[1], rmap));
}

test('rankBalanceCost: strength gap of the split, 0 when any player is unranked', () => {
    const r = rankLookup({ a: 'beginner', b: 'pro', c: 'intermediate', d: 'advanced' });
    // {a,b}=1+4=5 vs {c,d}=2+3=5 -> gap 0
    assert.equal(rankBalanceCost(['a', 'b'], ['c', 'd'], r), 0);
    // {a,c}=1+2=3 vs {b,d}=4+3=7 -> gap 4
    assert.equal(rankBalanceCost(['a', 'c'], ['b', 'd'], r), 4);
    // Any unranked member -> 0 (balance has no say; fail-safe).
    const r2 = rankLookup({ a: 'beginner', b: 'pro', c: 'intermediate' /* d unranked */ });
    assert.equal(rankBalanceCost(['a', 'b'], ['c', 'd'], r2), 0, 'unranked d -> cost 0');
});

test('doubles: a ranked foursome is split into the closest-strength teams', () => {
    // Strengths 1,2,3,4. Only {1,4} vs {2,3} is perfectly balanced (5 vs 5).
    const players = ['p1', 'p2', 'p3', 'p4'];
    const rmap = { p1: 'beginner', p2: 'intermediate', p3: 'advanced', p4: 'pro' };
    for (const seed of [1, 2, 3, 7, 13, 42, 99, 256]) {
        const matches = makeSchedule({
            players, mode: 'doubles', courts: 1, rankOf: rankLookup(rmap), rand: seededRand(seed),
        });
        assert.equal(matches.length, 1);
        assert.equal(matchGap(matches[0], rmap), 0, `seed ${seed}: must pick the balanced split`);
    }
});

test('doubles: a stacked split is never chosen when a balanced one exists', () => {
    // Two pros + two beginners: {pro,beginner} vs {pro,beginner} is balanced (gap 0);
    // {pro,pro} vs {beginner,beginner} is the stacked split (gap 6) and must be avoided.
    const players = ['a1', 'a2', 'b1', 'b2'];
    const rmap = { a1: 'pro', a2: 'pro', b1: 'beginner', b2: 'beginner' };
    for (const seed of [1, 4, 9, 21, 77, 500]) {
        const matches = makeSchedule({
            players, mode: 'doubles', courts: 1, rankOf: rankLookup(rmap), rand: seededRand(seed),
        });
        assert.equal(matchGap(matches[0], rmap), 0, `seed ${seed}: stacked split must not be chosen`);
    }
});

test('doubles: an unranked player in the foursome disables balancing (fallback)', () => {
    // p4 unranked -> rankBalanceCost is 0 for every split, so the stacked split is NOT
    // avoided; scheduling still works and stays fair.
    const players = ['p1', 'p2', 'p3', 'p4'];
    const rmap = { p1: 'beginner', p2: 'intermediate', p3: 'advanced' /* p4 unranked */ };
    const matches = makeSchedule({
        players, mode: 'doubles', courts: 1, rankOf: rankLookup(rmap), rand: seededRand(3),
    });
    assert.equal(matches.length, 1, 'still schedules normally');
    const counts = Object.values(playCounts(players, matches));
    assert.equal(spreadOf(counts), 0, 'fairness preserved');
});

test('doubles: the gender constraint outranks balance (no MM-vs-FF even if best balanced)', () => {
    // m1=pro(4) m2=beginner(1) f1=advanced(3) f2=intermediate(2).
    // The perfectly balanced split {m1,m2}=5 vs {f1,f2}=5 is MM-vs-FF (forbidden);
    // gender must win, forcing a (less balanced) mixed-vs-mixed split.
    const players = ['m1', 'm2', 'f1', 'f2'];
    const gmap = { m1: 'male', m2: 'male', f1: 'female', f2: 'female' };
    const rmap = { m1: 'pro', m2: 'beginner', f1: 'advanced', f2: 'intermediate' };
    for (const seed of [1, 2, 5, 9, 33, 88]) {
        const matches = makeSchedule({
            players, mode: 'doubles', courts: 1,
            genderOf: genderLookup(gmap), rankOf: rankLookup(rmap), rand: seededRand(seed),
        });
        assert.ok(!hasForbidden(matches, gmap), `seed ${seed}: gender must override balance`);
        assert.equal(teamGenderOf(matches[0].teams[0], gmap), 'mixed');
        assert.equal(teamGenderOf(matches[0].teams[1], gmap), 'mixed');
    }
});

test('doubles: fairness (equal play counts) still holds with rankOf supplied', () => {
    const players = names(8);
    const rmap = {
        '1': 'beginner', '2': 'beginner', '3': 'intermediate', '4': 'intermediate',
        '5': 'advanced', '6': 'advanced', '7': 'pro', '8': 'pro',
    };
    for (const seed of [1, 2, 3, 7, 13, 42]) {
        const matches = makeSchedule({
            players, mode: 'doubles', courts: 2, rankOf: rankLookup(rmap), rand: seededRand(seed),
        });
        const counts = Object.values(playCounts(players, matches));
        assert.equal(spreadOf(counts), 0, `seed ${seed}: play counts must stay equal`);
    }
});

test('continueSchedule: mid-game re-pairing also balances ranked teams', () => {
    // One court has played; continue with a fresh balanced foursome 1,2,3,4.
    const players = ['p1', 'p2', 'p3', 'p4'];
    const rmap = { p1: 'beginner', p2: 'intermediate', p3: 'advanced', p4: 'pro' };
    const playedMatches = [played('p1 / p4', 'p2 / p3', 1)]; // everyone at 1 game
    // Add a latecomer set so a new ranked foursome must be paired again.
    const roster = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    Object.assign(rmap, { p5: 'beginner', p6: 'intermediate', p7: 'advanced', p8: 'pro' });
    for (const seed of [1, 2, 5, 11, 42]) {
        const out = continueSchedule({
            players: roster, mode: 'doubles', courts: 1, playedMatches,
            rankOf: rankLookup(rmap), rand: seededRand(seed),
        });
        // p5..p8 (the four behind) take the next court; their split must be balanced.
        const firstNew = out[0];
        assert.equal(matchGap(firstNew, rmap), 0, `seed ${seed}: continuation must balance`);
    }
});
