// Pure logic for the "remembered player names" roster.
//
// This module holds NO DOM and NO storage — it only transforms plain arrays of
// names so it can be unit-tested in Node (mirrors schedule.js / sync-guard.js).
// script.js owns the localStorage persistence and the dropdown rendering.
//
// Conventions:
//   - Names are compared case-insensitively (so "Aof" and "aof" are the same
//     player) but the most-recently-used casing is preserved for display.
//   - The list is ordered most-recently-used first.

function normalizeName(name) {
    return typeof name === 'string' ? name.trim() : '';
}

// Lower-cased key used for de-duplication / comparison.
function keyOf(name) {
    return normalizeName(name).toLowerCase();
}

// Add a name to the front of the roster (most-recently-used first).
// De-duplicates case-insensitively, keeping the newest casing. Empty/whitespace
// names are ignored. Returns a NEW array (does not mutate the input).
function addKnownName(list, name) {
    const clean = normalizeName(name);
    if (!clean) return Array.isArray(list) ? [...list] : [];
    const k = keyOf(clean);
    const rest = (list || []).filter(n => keyOf(n) !== k);
    return [clean, ...rest];
}

// Remove a name from the roster (case-insensitive). Returns a NEW array.
function removeKnownName(list, name) {
    const k = keyOf(name);
    return (list || []).filter(n => keyOf(n) !== k);
}

// Append any names not already present (case-insensitive), preserving the
// existing order and the incoming order of new names. Used to seed the roster
// from names that already exist on the board. Returns a NEW array.
function mergeKnownNames(list, names) {
    const result = Array.isArray(list) ? [...list] : [];
    const seen = new Set(result.map(keyOf));
    (names || []).forEach(name => {
        const clean = normalizeName(name);
        const k = keyOf(clean);
        if (clean && !seen.has(k)) {
            seen.add(k);
            result.push(clean);
        }
    });
    return result;
}

// Build the suggestion list for the dropdown.
//   - query:   what the user has typed (case-insensitive substring match).
//   - exclude: names already in the current player list — never suggested.
//   - limit:   optional cap on how many suggestions to return.
// An empty query returns the whole roster (minus excluded). Returns a NEW array.
function filterKnownNames(list, query, exclude = [], limit = Infinity) {
    const q = keyOf(query);
    const excluded = new Set((exclude || []).map(keyOf));
    const out = [];
    for (const name of list || []) {
        const k = keyOf(name);
        if (excluded.has(k)) continue;
        if (q && !k.includes(q)) continue;
        out.push(name);
        if (out.length >= limit) break;
    }
    return out;
}

// Split a raw string into individual names so organizers can add many at once —
// by typing a comma-separated list or pasting names copied from a chat/notes.
// Separators: comma (ASCII , Thai ， ideographic 、), semicolon, newline, tab.
// Spaces are NOT separators (names legitimately contain them). Each piece is
// trimmed; empties are dropped. Returns a NEW array (possibly empty).
function splitNames(raw) {
    if (typeof raw !== 'string') return [];
    return raw
        .split(/[\n\r,;\t、，]+/)
        .map(normalizeName)
        .filter(Boolean);
}

// Dual export: CommonJS for tests, window global for the browser.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeName, addKnownName, removeKnownName, mergeKnownNames, filterKnownNames, splitNames };
}
if (typeof window !== 'undefined') {
    window.KnownNames = { normalizeName, addKnownName, removeKnownName, mergeKnownNames, filterKnownNames, splitNames };
}
