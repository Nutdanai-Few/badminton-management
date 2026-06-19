// Tests for player-meta.js — per-player gender (required) and rank (optional).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    GENDERS, RANKS,
    isValidGender, isValidRank, rankInfo,
    getMeta, setMeta, normalizePlayerMeta, playersMissingGender, mergePlayerMeta,
} = require('./player-meta.js');

test('GENDERS / RANKS shape', () => {
    assert.deepEqual(GENDERS, ['male', 'female']);
    assert.equal(RANKS.length, 4);
    RANKS.forEach(r => {
        assert.equal(typeof r.id, 'string');
        assert.equal(typeof r.label, 'string');
        assert.equal(typeof r.short, 'string');
    });
});

test('isValidGender', () => {
    assert.equal(isValidGender('male'), true);
    assert.equal(isValidGender('female'), true);
    assert.equal(isValidGender('other'), false);
    assert.equal(isValidGender(null), false);
    assert.equal(isValidGender(undefined), false);
});

test('isValidRank', () => {
    assert.equal(isValidRank('beginner'), true);
    assert.equal(isValidRank('pro'), true);
    assert.equal(isValidRank('nope'), false);
    assert.equal(isValidRank(null), false);
});

test('rankInfo returns the entry or null', () => {
    assert.equal(rankInfo('beginner').label, 'มือใหม่');
    assert.equal(rankInfo('bogus'), null);
});

test('getMeta: defaults for missing / invalid', () => {
    assert.deepEqual(getMeta({}, 'A'), { gender: null, rank: null });
    assert.deepEqual(getMeta(null, 'A'), { gender: null, rank: null });
    assert.deepEqual(getMeta({ A: { gender: 'x', rank: 'y' } }, 'A'), { gender: null, rank: null });
    assert.deepEqual(getMeta({ A: { gender: 'male', rank: 'pro' } }, 'A'), { gender: 'male', rank: 'pro' });
});

test('setMeta: applies patch without mutating input', () => {
    const meta = { A: { gender: 'male', rank: null } };
    const next = setMeta(meta, 'A', { rank: 'advanced' });
    assert.deepEqual(next.A, { gender: 'male', rank: 'advanced' });
    assert.deepEqual(meta.A, { gender: 'male', rank: null }, 'input not mutated');
});

test('setMeta: creates a new entry', () => {
    const next = setMeta({}, 'B', { gender: 'female' });
    assert.deepEqual(next.B, { gender: 'female', rank: null });
});

test('setMeta: invalid value clears the field', () => {
    const next = setMeta({ A: { gender: 'male', rank: 'pro' } }, 'A', { gender: 'nope' });
    assert.equal(next.A.gender, null);
    assert.equal(next.A.rank, 'pro', 'untouched field preserved');
});

test('setMeta: explicit null clears', () => {
    const next = setMeta({ A: { gender: 'male', rank: 'pro' } }, 'A', { rank: null });
    assert.equal(next.A.rank, null);
});

test('normalizePlayerMeta: prunes orphans and empty entries', () => {
    const meta = {
        A: { gender: 'male', rank: 'pro' },
        B: { gender: null, rank: null },   // empty → dropped
        Z: { gender: 'female' },           // not in roster → dropped
    };
    const out = normalizePlayerMeta(meta, ['A', 'B']);
    assert.deepEqual(out, { A: { gender: 'male', rank: 'pro' } });
});

test('normalizePlayerMeta: sanitises invalid fields', () => {
    const out = normalizePlayerMeta({ A: { gender: 'x', rank: 'beginner' } }, ['A']);
    assert.deepEqual(out, { A: { gender: null, rank: 'beginner' } });
});

test('playersMissingGender: lists ungendered players in roster order', () => {
    const meta = { A: { gender: 'male' }, C: { gender: 'female' } };
    assert.deepEqual(playersMissingGender(meta, ['A', 'B', 'C', 'D']), ['B', 'D']);
    assert.deepEqual(playersMissingGender(meta, ['A', 'C']), []);
});

test('mergePlayerMeta: union, preferred wins per-field, fallback fills gaps', () => {
    const preferred = { A: { gender: 'male', rank: null }, B: { gender: 'female', rank: 'pro' } };
    const other =     { A: { gender: 'female', rank: 'beginner' }, C: { gender: 'male', rank: null } };
    const out = mergePlayerMeta(preferred, other);
    // A: preferred gender wins, rank falls back to other's
    assert.deepEqual(out.A, { gender: 'male', rank: 'beginner' });
    // B: only in preferred
    assert.deepEqual(out.B, { gender: 'female', rank: 'pro' });
    // C: only in other
    assert.deepEqual(out.C, { gender: 'male', rank: null });
});

test('mergePlayerMeta: handles null inputs', () => {
    assert.deepEqual(mergePlayerMeta(null, null), {});
    assert.deepEqual(mergePlayerMeta({ A: { gender: 'male' } }, null), { A: { gender: 'male', rank: null } });
});
