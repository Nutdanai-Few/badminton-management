// player-meta.js
// Pure, side-effect-free helpers for per-player metadata: gender (required) and
// rank/skill level (optional).  Extracted from script.js so the logic can be
// unit-tested without a browser, DOM, or live Firebase connection.
//
// Metadata is stored in a map keyed by the player's name (the immutable id used
// everywhere else — scores, matches, history):
//   { "ฟิวส์": { gender: "male", rank: "advanced" }, ... }
//
// Same tiny UMD wrapper as sync-guard.js / known-names.js so the SAME file works
// as a browser <script> global AND as a CommonJS module (tests).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;        // Node (test suite)
    } else {
        root.PlayerMeta = api;       // Browser global
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // Gender is required (no default) — a player has none until the user picks one.
    const GENDERS = ['male', 'female'];

    // Four deliberately plain skill levels (no jargon), easiest → hardest.
    // `id` is what we persist; `label`/`short` are Thai display strings.
    const RANKS = [
        { id: 'beginner',     label: 'มือใหม่', short: 'ใหม่' },
        { id: 'intermediate', label: 'มือกลาง', short: 'กลาง' },
        { id: 'advanced',     label: 'มือเก่ง', short: 'เก่ง' },
        { id: 'pro',          label: 'มือโปร', short: 'โปร' },
    ];

    function isValidGender(g) {
        return g === 'male' || g === 'female';
    }

    function isValidRank(r) {
        return RANKS.some(x => x.id === r);
    }

    // Look up the RANKS entry for an id (null/unknown → null).
    function rankInfo(r) {
        return RANKS.find(x => x.id === r) || null;
    }

    // Read one player's meta, coercing anything invalid/missing to the safe
    // defaults: gender null (= unset), rank null (= ไม่ระบุ).
    function getMeta(meta, name) {
        const m = (meta && meta[name]) || {};
        return {
            gender: isValidGender(m.gender) ? m.gender : null,
            rank: isValidRank(m.rank) ? m.rank : null,
        };
    }

    // Return a NEW meta map with `patch` (any of {gender, rank}) applied to one
    // player.  Invalid values clear that field rather than being stored.  Passing
    // gender/rank explicitly as null clears it.  Does not mutate the input.
    function setMeta(meta, name, patch) {
        const next = { ...(meta || {}) };
        const cur = getMeta(meta, name);
        const out = { gender: cur.gender, rank: cur.rank };
        if ('gender' in patch) out.gender = isValidGender(patch.gender) ? patch.gender : null;
        if ('rank' in patch)   out.rank   = isValidRank(patch.rank) ? patch.rank : null;
        next[name] = out;
        return next;
    }

    // Drop meta for anyone no longer on the roster and sanitise the rest, so the
    // map can never accumulate orphans or invalid fields.  Returns a NEW map.
    function normalizePlayerMeta(meta, players) {
        const out = {};
        (players || []).forEach(name => {
            const { gender, rank } = getMeta(meta, name);
            // Only keep an entry once it carries something, to avoid writing empty
            // {gender:null,rank:null} objects for every player.
            if (gender || rank) out[name] = { gender, rank };
        });
        return out;
    }

    // Names (in roster order) that still have no gender — gender is required, so
    // these block schedule generation.
    function playersMissingGender(meta, players) {
        return (players || []).filter(name => !getMeta(meta, name).gender);
    }

    // Merge two meta maps (used when reconciling a cacheless device's edits with
    // the first server snapshot).  Union of names; for a name present in both,
    // `preferred` wins on a per-field basis but a missing field falls back to the
    // other side so neither a locally-set gender nor a server-set rank is lost.
    function mergePlayerMeta(preferred, other) {
        const a = preferred || {};
        const b = other || {};
        const out = {};
        const names = new Set([...Object.keys(a), ...Object.keys(b)]);
        names.forEach(name => {
            const pa = getMeta(a, name);
            const pb = getMeta(b, name);
            const gender = pa.gender || pb.gender;
            const rank = pa.rank || pb.rank;
            if (gender || rank) out[name] = { gender, rank };
        });
        return out;
    }

    return {
        GENDERS, RANKS,
        isValidGender, isValidRank, rankInfo,
        getMeta, setMeta, normalizePlayerMeta, playersMissingGender, mergePlayerMeta,
    };
});
