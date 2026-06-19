// sync-guard.js
// Pure, side-effect-free helpers that decide whether it is safe to persist the
// in-memory state to Firebase.  Extracted from script.js so the data-loss guard
// can be unit-tested without a browser, DOM, or live Firebase connection.
//
// Written in a tiny UMD-style wrapper so the SAME file works both as a browser
// <script> global (loaded before script.js) and as a CommonJS module (tests).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;        // Node (test suite)
    } else {
        Object.assign(root, api);    // Browser global (window/globalThis)
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // A state is "empty" when it holds no players, matches, scores or history.
    // `settings` is ignored — it always carries a default and is never user data.
    function isStateEmpty(state) {
        if (!state) return true;
        const noPlayers = !state.players || state.players.length === 0;
        const noMatches = !state.matches || state.matches.length === 0;
        const noScores = !state.scores || Object.keys(state.scores).length === 0;
        const noHistory = !state.history || Object.keys(state.history).length === 0;
        return noPlayers && noMatches && noScores && noHistory;
    }

    // Decide whether a save may proceed.  Returns true ONLY when writing is safe.
    //   isSyncing              — are we mid-apply of a remote snapshot? (avoid loop)
    //   serverSnapshotReceived — have we actually heard the true server state yet?
    //   state                  — the in-memory state about to be written
    //   allowEmpty             — did this save come from an explicit user action
    //                            that legitimately empties data (clear / remove)?
    //   serverHadData          — did the last server snapshot contain real data?
    function shouldPersist({ isSyncing, serverSnapshotReceived, state, allowEmpty, serverHadData }) {
        if (isSyncing) return false;
        // Never overwrite before we know the true server state — otherwise the
        // empty default state would wipe real data during a slow/failed first load.
        if (!serverSnapshotReceived) return false;
        // Never let an essentially-empty state wipe a non-empty server unless the
        // wipe was an explicit clear/remove action initiated by the user.
        if (!allowEmpty && isStateEmpty(state) && serverHadData) return false;
        return true;
    }

    // When a server snapshot arrives, decide whether our LOCAL cache should win
    // over it.  Local wins only when it carries edits the server has not seen
    // yet — this is what rescues data typed just before a reload (e.g. toggling
    // the browser's responsive/device mode) that had not finished syncing to
    // Firebase.  Deliberately conservative so it can never clobber another
    // device's data:
    //   localEmpty       — our cache holds no data → never push it over the server
    //   localUpdatedAt   — timestamp of our last local edit (null = no cache)
    //   serverEmpty      — the incoming snapshot holds no data
    //   serverUpdatedAt  — timestamp the server last recorded (null = legacy/none)
    function localCacheWins({ localUpdatedAt, serverUpdatedAt, serverEmpty, localEmpty }) {
        if (localEmpty) return false;              // nothing meaningful to keep
        if (localUpdatedAt == null) return false;  // cache predates timestamps → trust server
        if (serverEmpty) return true;              // server lost/never had it → restore local
        if (serverUpdatedAt == null) return false; // legacy non-empty server → don't clobber it
        return localUpdatedAt > serverUpdatedAt;   // both timestamped → newest edit wins
    }

    // Merge local edits with the very first server snapshot on a device that
    // started WITHOUT a cache.  Such a device may hold a few edits the user
    // typed while the snapshot was still in flight, but those edits are NOT
    // based on the server's data (we had never seen it).  Letting either side
    // win outright loses data, so we merge:
    //   players  — union (server order first, then locally-added names)
    //   matches/scores/history — keep local only if the user actually produced
    //                            some locally; otherwise take the server's
    //   settings — keep local when the user is clearly editing (added a player),
    //              otherwise prefer the server's
    function mergeInitialStates(local, server) {
        local = local || {};
        server = server || {};
        const serverPlayers = server.players || [];
        const localPlayers = local.players || [];
        const extra = localPlayers.filter(p => !serverPlayers.includes(p));
        const activeLocalEdit = extra.length > 0;

        const hasLocalMatches = !!(local.matches && local.matches.length);
        const hasLocalScores = !!(local.scores && Object.keys(local.scores).length);
        const hasLocalHistory = !!(local.history && Object.keys(local.history).length);

        // Per-player meta (gender/rank): union the two maps so neither side's
        // edits are lost.  When the user is actively editing locally, prefer the
        // local value for an overlapping name; otherwise prefer the server's.
        const localMeta = local.playerMeta || {};
        const serverMeta = server.playerMeta || {};
        const playerMeta = activeLocalEdit
            ? mergeMetaMaps(localMeta, serverMeta)
            : mergeMetaMaps(serverMeta, localMeta);

        return {
            players: [...serverPlayers, ...extra],
            settings: activeLocalEdit
                ? (local.settings || server.settings || { mode: 'singles', courts: 1 })
                : (server.settings || local.settings || { mode: 'singles', courts: 1 }),
            matches: hasLocalMatches ? local.matches : (server.matches || []),
            scores: hasLocalScores ? local.scores : (server.scores || {}),
            history: hasLocalHistory ? local.history : (server.history || {}),
            playerMeta
        };
    }

    // Union two {name: {gender, rank}} maps; for a shared name, `preferred` wins
    // per-field but a missing field falls back to `other`.  Kept here (rather than
    // importing player-meta.js) so sync-guard stays a single self-contained file.
    function mergeMetaMaps(preferred, other) {
        const a = preferred || {};
        const b = other || {};
        const out = {};
        new Set([...Object.keys(a), ...Object.keys(b)]).forEach(name => {
            const ea = a[name] || {};
            const eb = b[name] || {};
            const gender = ea.gender || eb.gender || null;
            const rank = ea.rank || eb.rank || null;
            if (gender || rank) out[name] = { gender, rank };
        });
        return out;
    }

    return { isStateEmpty, shouldPersist, localCacheWins, mergeInitialStates };
});
