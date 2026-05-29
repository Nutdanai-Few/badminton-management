// Tests for the remembered-names roster logic.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeName, addKnownName, removeKnownName, mergeKnownNames, filterKnownNames
} = require('./known-names.js');

// --- normalizeName ---

test('normalizeName trims whitespace', () => {
    assert.equal(normalizeName('  Aof  '), 'Aof');
});

test('normalizeName returns empty string for non-strings', () => {
    assert.equal(normalizeName(null), '');
    assert.equal(normalizeName(undefined), '');
    assert.equal(normalizeName(42), '');
});

// --- addKnownName ---

test('addKnownName adds to the front (most-recently-used first)', () => {
    assert.deepEqual(addKnownName(['B'], 'A'), ['A', 'B']);
});

test('addKnownName trims the name before storing', () => {
    assert.deepEqual(addKnownName([], '  Aof '), ['Aof']);
});

test('addKnownName ignores empty / whitespace-only names', () => {
    assert.deepEqual(addKnownName(['A'], ''), ['A']);
    assert.deepEqual(addKnownName(['A'], '   '), ['A']);
});

test('addKnownName de-duplicates case-insensitively, keeping newest casing and moving to front', () => {
    assert.deepEqual(addKnownName(['aof', 'B'], 'Aof'), ['Aof', 'B']);
});

test('addKnownName re-adding an existing name moves it to the front', () => {
    assert.deepEqual(addKnownName(['A', 'B', 'C'], 'C'), ['C', 'A', 'B']);
});

test('addKnownName does not mutate the input array', () => {
    const list = ['A'];
    addKnownName(list, 'B');
    assert.deepEqual(list, ['A']);
});

test('addKnownName tolerates a null/undefined list', () => {
    assert.deepEqual(addKnownName(null, 'A'), ['A']);
    assert.deepEqual(addKnownName(undefined, ''), []);
});

// --- removeKnownName ---

test('removeKnownName removes case-insensitively', () => {
    assert.deepEqual(removeKnownName(['Aof', 'B'], 'aof'), ['B']);
});

test('removeKnownName leaves the list unchanged when the name is absent', () => {
    assert.deepEqual(removeKnownName(['A', 'B'], 'C'), ['A', 'B']);
});

test('removeKnownName does not mutate the input and tolerates null', () => {
    const list = ['A', 'B'];
    removeKnownName(list, 'A');
    assert.deepEqual(list, ['A', 'B']);
    assert.deepEqual(removeKnownName(null, 'A'), []);
});

// --- mergeKnownNames ---

test('mergeKnownNames appends only missing names, preserving order', () => {
    assert.deepEqual(mergeKnownNames(['A', 'B'], ['B', 'C', 'D']), ['A', 'B', 'C', 'D']);
});

test('mergeKnownNames is case-insensitive when detecting duplicates', () => {
    assert.deepEqual(mergeKnownNames(['Aof'], ['aof', 'Bee']), ['Aof', 'Bee']);
});

test('mergeKnownNames skips empty/whitespace names and de-dups within the incoming list', () => {
    assert.deepEqual(mergeKnownNames([], ['A', '  ', 'a', 'B']), ['A', 'B']);
});

test('mergeKnownNames does not mutate the input and tolerates nulls', () => {
    const list = ['A'];
    mergeKnownNames(list, ['B']);
    assert.deepEqual(list, ['A']);
    assert.deepEqual(mergeKnownNames(null, null), []);
});

// --- filterKnownNames ---

test('filterKnownNames returns the whole roster (minus excluded) for an empty query', () => {
    assert.deepEqual(filterKnownNames(['A', 'B', 'C'], '', ['B']), ['A', 'C']);
});

test('filterKnownNames matches a case-insensitive substring', () => {
    assert.deepEqual(filterKnownNames(['Aof', 'Bank', 'Boom'], 'oo'), ['Boom']);
    assert.deepEqual(filterKnownNames(['Aof', 'Bank', 'Boom'], 'B'), ['Bank', 'Boom']);
});

test('filterKnownNames excludes names already in the current list (case-insensitive)', () => {
    assert.deepEqual(filterKnownNames(['Aof', 'Bank'], 'a', ['AOF']), ['Bank']);
});

test('filterKnownNames respects the limit', () => {
    assert.deepEqual(filterKnownNames(['A1', 'A2', 'A3'], 'a', [], 2), ['A1', 'A2']);
});

test('filterKnownNames handles a whitespace-only query as empty', () => {
    assert.deepEqual(filterKnownNames(['A', 'B'], '   '), ['A', 'B']);
});

test('filterKnownNames tolerates a null list', () => {
    assert.deepEqual(filterKnownNames(null, 'a'), []);
});
