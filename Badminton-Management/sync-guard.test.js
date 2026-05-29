// Tests for the Firebase save guard — the logic that prevents data from being
// wiped unless the user explicitly clears it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isStateEmpty, shouldPersist, localCacheWins, mergeInitialStates } = require('./sync-guard.js');

const emptyState = () => ({ players: [], settings: { mode: 'singles', courts: 1 }, matches: [], scores: {}, history: {} });
const fullState = () => ({
    players: ['A', 'B'],
    settings: { mode: 'singles', courts: 1 },
    matches: [{ teams: ['A', 'B'], scoreA: null, scoreB: null, round: 1 }],
    scores: { A: { played: 1, wins: 1, losses: 0 } },
    history: { '2026-05-29': {} }
});

test('isStateEmpty: empty default state is empty', () => {
    assert.equal(isStateEmpty(emptyState()), true);
});

test('isStateEmpty: settings alone does not count as data', () => {
    const s = emptyState();
    s.settings = { mode: 'doubles', courts: 3 };
    assert.equal(isStateEmpty(s), true);
});

test('isStateEmpty: any of players/matches/scores/history makes it non-empty', () => {
    for (const key of ['players', 'matches']) {
        const s = emptyState();
        s[key] = ['x'];
        assert.equal(isStateEmpty(s), false, `${key} should make state non-empty`);
    }
    for (const key of ['scores', 'history']) {
        const s = emptyState();
        s[key] = { x: 1 };
        assert.equal(isStateEmpty(s), false, `${key} should make state non-empty`);
    }
});

test('isStateEmpty: null/undefined treated as empty', () => {
    assert.equal(isStateEmpty(null), true);
    assert.equal(isStateEmpty(undefined), true);
});

// --- The core regression: the "data disappears by itself" bug ---

test('REGRESSION: never write before the server snapshot has arrived', () => {
    // Slow first load: serverSnapshotReceived is still false, state is the empty
    // default.  A save here (e.g. the old 8s safety net unblocked it) would have
    // overwritten everyone's data with nothing.  It must be blocked.
    assert.equal(shouldPersist({
        isSyncing: false,
        serverSnapshotReceived: false,
        state: emptyState(),
        allowEmpty: false,
        serverHadData: true
    }), false);

    // Even with real local data, we still must not write before we know the
    // true server state.
    assert.equal(shouldPersist({
        isSyncing: false,
        serverSnapshotReceived: false,
        state: fullState(),
        allowEmpty: false,
        serverHadData: true
    }), false);
});

test('REGRESSION: an empty state must not silently wipe a non-empty server', () => {
    assert.equal(shouldPersist({
        isSyncing: false,
        serverSnapshotReceived: true,
        state: emptyState(),
        allowEmpty: false,        // not an explicit clear
        serverHadData: true
    }), false);
});

test('an explicit clear (allowEmpty) IS allowed to write an empty state', () => {
    assert.equal(shouldPersist({
        isSyncing: false,
        serverSnapshotReceived: true,
        state: emptyState(),
        allowEmpty: true,         // user clicked "clear" / removed last player
        serverHadData: true
    }), true);
});

test('normal save with real data after sync is allowed', () => {
    assert.equal(shouldPersist({
        isSyncing: false,
        serverSnapshotReceived: true,
        state: fullState(),
        allowEmpty: false,
        serverHadData: true
    }), true);
});

test('never save while applying a remote snapshot (avoids loop)', () => {
    assert.equal(shouldPersist({
        isSyncing: true,
        serverSnapshotReceived: true,
        state: fullState(),
        allowEmpty: false,
        serverHadData: true
    }), false);
});

test('empty write allowed when server was already empty (brand-new DB, first edit undone)', () => {
    // serverHadData false → the empty guard does not apply; harmless empty write.
    assert.equal(shouldPersist({
        isSyncing: false,
        serverSnapshotReceived: true,
        state: emptyState(),
        allowEmpty: false,
        serverHadData: false
    }), true);
});

// --- localCacheWins: the "data disappears when switching to responsive mode" bug ---

test('REGRESSION: local data typed before a reload is restored when the server snapshot is empty', () => {
    // Player typed, page reloaded (responsive toggle) before the Firebase write
    // landed, so the snapshot comes back empty.  The local cache must win and be
    // pushed back up instead of the UI flashing to zero players.
    assert.equal(localCacheWins({
        localUpdatedAt: 1000,
        serverUpdatedAt: null,
        serverEmpty: true,
        localEmpty: false
    }), true);
});

test('local wins when its edit is strictly newer than the server (unsynced add after existing data)', () => {
    assert.equal(localCacheWins({
        localUpdatedAt: 2000,
        serverUpdatedAt: 1000,
        serverEmpty: false,
        localEmpty: false
    }), true);
});

test('server wins when it is newer (another device updated while we were away)', () => {
    assert.equal(localCacheWins({
        localUpdatedAt: 1000,
        serverUpdatedAt: 2000,
        serverEmpty: false,
        localEmpty: false
    }), false);
});

test('equal timestamps (our own echo from Firebase) apply the server → no push loop', () => {
    assert.equal(localCacheWins({
        localUpdatedAt: 1500,
        serverUpdatedAt: 1500,
        serverEmpty: false,
        localEmpty: false
    }), false);
});

test('an empty local cache never clobbers the server', () => {
    assert.equal(localCacheWins({
        localUpdatedAt: 9999,
        serverUpdatedAt: 1,
        serverEmpty: false,
        localEmpty: true
    }), false);
});

test('a cache with no timestamp (pre-migration) trusts the server', () => {
    assert.equal(localCacheWins({
        localUpdatedAt: null,
        serverUpdatedAt: null,
        serverEmpty: true,
        localEmpty: false
    }), false);
});

test('legacy non-empty server without a timestamp is never clobbered by local', () => {
    assert.equal(localCacheWins({
        localUpdatedAt: 1000,
        serverUpdatedAt: null,
        serverEmpty: false,
        localEmpty: false
    }), false);
});

// --- mergeInitialStates: cacheless device that typed before the first sync ---

test('REGRESSION: a player typed before first sync is unioned with server players, not lost', () => {
    // Fresh device (no cache), server already has [A,B]. User types C while the
    // snapshot is in flight. The merge must keep all three — neither side wins.
    const local = { players: ['C'], settings: { mode: 'singles', courts: 1 }, matches: [], scores: {}, history: {} };
    const server = { players: ['A', 'B'], settings: { mode: 'doubles', courts: 2 }, matches: [{ teams: ['A', 'B'] }], scores: { A: { played: 1, wins: 1, losses: 0 } }, history: {} };
    const merged = mergeInitialStates(local, server);
    assert.deepEqual(merged.players, ['A', 'B', 'C']);
});

test('merge keeps server matches/scores when the user produced none locally', () => {
    const local = { players: ['C'], settings: { mode: 'singles', courts: 1 }, matches: [], scores: {}, history: {} };
    const server = { players: ['A', 'B'], settings: { mode: 'singles', courts: 1 }, matches: [{ teams: ['A', 'B'] }], scores: { A: { played: 1, wins: 1, losses: 0 } }, history: { '2026-05-29': {} } };
    const merged = mergeInitialStates(local, server);
    assert.equal(merged.matches.length, 1);
    assert.equal(Object.keys(merged.scores).length, 1);
    assert.equal(Object.keys(merged.history).length, 1);
});

test('merge does not duplicate a player that exists on both sides', () => {
    const local = { players: ['A', 'C'], settings: {}, matches: [], scores: {}, history: {} };
    const server = { players: ['A', 'B'], settings: {}, matches: [], scores: {}, history: {} };
    assert.deepEqual(mergeInitialStates(local, server).players, ['A', 'B', 'C']);
});

test('merge prefers local settings when the user is actively editing (added a player)', () => {
    const local = { players: ['C'], settings: { mode: 'doubles', courts: 3 }, matches: [], scores: {}, history: {} };
    const server = { players: ['A'], settings: { mode: 'singles', courts: 1 }, matches: [], scores: {}, history: {} };
    assert.deepEqual(mergeInitialStates(local, server).settings, { mode: 'doubles', courts: 3 });
});
