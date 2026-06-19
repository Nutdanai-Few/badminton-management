// ===== Firebase Config =====
const firebaseConfig = {
    apiKey: "AIzaSyAMXHDU0ESCGzkMS2ijqAFQwMAagAhkj8s",
    authDomain: "badminton-management-c917a.firebaseapp.com",
    databaseURL: "https://badminton-management-c917a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "badminton-management-c917a",
    storageBucket: "badminton-management-c917a.firebasestorage.app",
    messagingSenderId: "330964219244",
    appId: "1:330964219244:web:7808a79ec41425476d6f49"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const dbRef = db.ref('badminton');

// ===== State =====
let state = {
    players: [],
    settings: { mode: 'singles', courts: 1 },
    matches: [],
    scores: {},   // {playerName: {played, wins, losses}} — persists across schedule regeneration
    history: {},
    playerMeta: {} // {playerName: {gender:'male'|'female'|null, rank:'beginner'|...|null}}
};

// ===== Firebase Real-time Sync =====
let isSyncing = false;             // prevent save loop while applying a remote snapshot
let saveTimer = null;

// `serverSnapshotReceived` is the gate that prevents data loss: it becomes true
// ONLY after we have actually heard the real state from the server (a snapshot,
// even a null one = genuinely empty DB).  Until then `state` is just the empty
// default, so writing would wipe real data on the server.  We therefore refuse
// to save until this is true.
//
// (Replaces the old `initialLoadComplete`, whose 8-second safety net flipped it
// to true while `state` was still empty — so a single tap on a slow connection
// could overwrite everyone's data with nothing.  That was the "data disappears
// by itself" bug.)
let serverSnapshotReceived = false;

// Whether the last server snapshot we saw actually contained data.  Used as a
// second guard so an empty local state can never silently wipe a non-empty
// server unless the user explicitly asked to clear/remove.
let serverHadData = false;

// Whether we hydrated from a local cache at startup, and whether the first
// server snapshot has been processed.  Together they let us safely merge — not
// clobber — edits typed on a fresh (cacheless) device before the first sync.
let startedWithCache = false;
let firstSnapshotApplied = false;

// Local recovery cache.  Firebase is the shared source of truth, but a reload
// (e.g. toggling the browser's responsive/device mode) wipes in-memory state
// before a debounced/slow Firebase write can land — losing data the user just
// typed.  We therefore mirror every change into localStorage *synchronously*
// and hydrate from it instantly on load, then reconcile with Firebase.
const LOCAL_CACHE_KEY = 'bmStateCache';

// Timestamp of our most recent local edit (ms).  null = no local edits yet.
// Compared against the server's updatedAt to decide who wins on a snapshot.
let localUpdatedAt = null;

function writeLocalCache() {
    try {
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
            players: state.players,
            settings: state.settings,
            matches: state.matches,
            scores: state.scores,
            history: state.history,
            playerMeta: state.playerMeta,
            updatedAt: localUpdatedAt
        }));
    } catch { /* storage disabled or full — Firebase remains the backstop */ }
}

function readLocalCache() {
    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

// The app renders instantly from cache (or as an empty board) and syncs with
// Firebase in the background, so the old blocking "loading data" overlay is no
// longer shown.  hideSyncOverlay stays as a harmless no-op guard in case any
// markup still carries the class.
function hideSyncOverlay() {
    const overlay = document.getElementById('sync-overlay');
    if (overlay) overlay.classList.remove('open');
}

// Copy a Firebase snapshot into local state and remember whether it had data.
function applySnapshot(data) {
    if (data) {
        state.players = data.players || [];
        state.settings = data.settings || { mode: 'singles', courts: 1 };
        state.matches = data.matches || [];
        state.scores = data.scores || {};
        state.history = data.history || {};
        // Sanitise + prune meta to the incoming roster (drops orphans/legacy gaps).
        state.playerMeta = PlayerMeta.normalizePlayerMeta(data.playerMeta || {}, state.players);
    }
    // `data` is null only for a brand-new database that has never been written;
    // in that case we keep the empty default state.
    serverHadData = !!data && !isStateEmpty(state);
}

// Persist current state to Firebase.
//   allowEmpty: pass true ONLY from explicit user actions that legitimately
//   empty the data (the clear buttons, removing the last player).  Every other
//   caller leaves it false so a stray empty state can never wipe the server.
function saveState({ allowEmpty = false } = {}) {
    // Cache locally first — synchronous and instant, so the edit survives a
    // reload even if the Firebase write below is debounced, slow, blocked by the
    // guard, or Firebase never connected.  This is the recovery copy.
    localUpdatedAt = Date.now();
    writeLocalCache();

    if (!shouldPersist({ isSyncing, serverSnapshotReceived, state, allowEmpty, serverHadData })) {
        return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        dbRef.set({
            players: state.players,
            settings: state.settings,
            matches: state.matches,
            scores: state.scores,
            history: state.history,
            playerMeta: state.playerMeta,
            updatedAt: localUpdatedAt
        });
    }, 300);
}

// Push the current local state to Firebase immediately, bypassing the debounce.
// Used when reconciliation decides the local cache holds newer, unsynced edits.
function flushLocalToFirebase() {
    clearTimeout(saveTimer);
    dbRef.set({
        players: state.players,
        settings: state.settings,
        matches: state.matches,
        scores: state.scores,
        history: state.history,
        playerMeta: state.playerMeta,
        updatedAt: localUpdatedAt
    });
}

// Handle an incoming server snapshot (initial load, real-time change, or
// visibility re-sync).  Reconciles it against our local cache so edits made
// just before a reload are not overwritten by a stale/empty server.
function handleSnapshot(data) {
    // A pending local save would write our pre-sync state on top of the data we
    // are about to apply.  Cancel it.
    clearTimeout(saveTimer);

    const serverUpdatedAt = data && data.updatedAt != null ? data.updatedAt : null;
    const serverEmpty = isStateEmpty(data || null);
    const localEmpty = isStateEmpty(state);

    // First snapshot on a cacheless device where the user already typed something
    // (and the server also has data): merge so neither side is lost.
    if (!firstSnapshotApplied && !startedWithCache && !localEmpty && !serverEmpty) {
        isSyncing = true;
        applySnapshot(mergeInitialStates(state, data));
        localUpdatedAt = Date.now();
        writeLocalCache();
        serverSnapshotReceived = true;
        firstSnapshotApplied = true;
        flushLocalToFirebase();          // push the merged result up
        renderAll();
        isSyncing = false;
        hideSyncOverlay();
        return;
    }

    if (localCacheWins({ localUpdatedAt, serverUpdatedAt, serverEmpty, localEmpty })) {
        // Our local cache has edits the server hasn't seen (typed just before a
        // reload).  Keep local state and push it up instead of being clobbered.
        serverHadData = !serverEmpty;
        serverSnapshotReceived = true;
        firstSnapshotApplied = true;
        flushLocalToFirebase();
        renderAll();
        hideSyncOverlay();
        return;
    }

    isSyncing = true;
    applySnapshot(data);
    localUpdatedAt = serverUpdatedAt;
    writeLocalCache();               // keep the cache in step with the server
    serverSnapshotReceived = true;   // we now know the true server state → saves allowed
    firstSnapshotApplied = true;
    renderAll();
    isSyncing = false;
    hideSyncOverlay();
}

// Real-time listener — fires on initial load + every remote change
dbRef.on('value', (snapshot) => {
    handleSnapshot(snapshot.val());
});

// If the tab was backgrounded/suspended, our in-memory state may be stale.
// Force a fresh re-sync from Firebase before allowing any new save.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    serverSnapshotReceived = false;  // block saves until the re-sync completes
    // Re-sync silently in the background — the current data stays on screen, so
    // there is no need to blank it out behind the loading overlay.
    dbRef.once('value')
        .then((snapshot) => handleSnapshot(snapshot.val()))
        .catch(() => {
            // Re-sync failed (offline, etc.).  Our in-memory state is still the
            // last good server data, so re-enable saves rather than locking the
            // user out — saving that unchanged data back is non-destructive.
            serverSnapshotReceived = true;
            hideSyncOverlay();
        });
});

// Safety net: if Firebase never responds (offline, blocked, etc.), hide the
// overlay after a few seconds so the user can at least view the app locally.
// Crucially this does NOT unblock saving — `serverSnapshotReceived` stays false
// until a real snapshot arrives, so the empty default state can never overwrite
// real data on the server.  Saves unlock automatically once the live listener
// above finally receives data.
setTimeout(() => {
    if (!serverSnapshotReceived) {
        hideSyncOverlay();
    }
}, 8000);

// ===== SVG Icons =====
const ICONS = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    userPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    barChart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>'
};

// ===== Empty State Helper =====
function emptyStateHTML(icon, title, hint) {
    return `
        <div class="empty-state">
            <div class="empty-icon">${icon}</div>
            <p class="empty-title">${title}</p>
            <p class="empty-hint">${hint}</p>
        </div>
    `;
}

// ===== Player gender display labels =====
const GENDER_SHORT = { male: 'ช', female: 'ญ' };
const GENDER_LABEL = { male: 'ชาย', female: 'หญิง' };

// Prefix a player name with a small gender dot (blue = male, pink = female).
// The name itself stays the default colour so it's easy to read; unset gender →
// plain name, no dot.
function nameWithGender(name) {
    const { gender } = PlayerMeta.getMeta(state.playerMeta, name);
    if (!gender) return name;
    return `<span class="gdot gdot--${gender}" title="${GENDER_LABEL[gender]}"></span>${name}`;
}

// Render a list of player names joined by " / ", each prefixed with a gender dot.
function namesWithGender(names) {
    return names.map(nameWithGender).join(' / ');
}

// ===== Render: Players =====
function renderPlayers() {
    const container = document.getElementById('players-list');
    const badge = document.getElementById('player-count-badge');
    container.innerHTML = '';

    badge.textContent = state.players.length + ' คน';
    document.getElementById('players-section')
        .classList.toggle('roster-empty', state.players.length === 0);

    if (state.players.length === 0) {
        container.innerHTML = emptyStateHTML(
            ICONS.userPlus,
            'ยังไม่มีผู้เล่น',
            'พิมพ์ชื่อด้านบนเพื่อเพิ่มผู้เล่น'
        );
        updateGenerateButton();
        return;
    }

    state.players.forEach((name, idx) => {
        const chip = document.createElement('div');
        const { gender, rank } = PlayerMeta.getMeta(state.playerMeta, name);
        chip.className = 'player-chip'
            + (gender ? ` chip--${gender}` : ' chip--nogender');
        chip.style.animationDelay = (idx * 30) + 'ms';
        const initial = (name.trim()[0] || '?').toUpperCase();

        // Gender: an inline one-tap toggle (required). Rank: a themed custom
        // dropdown (optional) — a native <select>'s open list can't be styled to
        // match the dark theme, so we render our own menu. The trigger shows the
        // short label; the menu uses full labels (it has room).
        const rankI = PlayerMeta.rankInfo(rank);
        const rankMenu = `<button type="button" class="chip-rank-opt${!rank ? ' selected' : ''}" data-idx="${idx}" data-rank="">ไม่ระบุ</button>`
            + PlayerMeta.RANKS.map(r =>
                `<button type="button" class="chip-rank-opt${rank === r.id ? ' selected' : ''}" data-idx="${idx}" data-rank="${r.id}">${r.label}</button>`
            ).join('');

        chip.innerHTML = `
            <span class="chip-avatar" aria-hidden="true">${initial}</span>
            <span class="chip-name">${name}</span>
            <div class="chip-gender-toggle" role="group" aria-label="เพศของ ${name}">
                <button type="button" class="chip-gbtn" data-idx="${idx}" data-gender="male"
                        aria-label="${GENDER_LABEL.male}" aria-pressed="${gender === 'male'}">${GENDER_SHORT.male}</button>
                <button type="button" class="chip-gbtn" data-idx="${idx}" data-gender="female"
                        aria-label="${GENDER_LABEL.female}" aria-pressed="${gender === 'female'}">${GENDER_SHORT.female}</button>
            </div>
            <div class="chip-rank${rank ? ' chip-rank--set' : ''}">
                <button type="button" class="chip-rank-btn" data-idx="${idx}"
                        aria-haspopup="true" aria-expanded="false" aria-label="ระดับมือของ ${name}">
                    <span class="chip-rank-label">${rankI ? rankI.short : 'ระดับ'}</span>
                    ${ICONS.chevronDown}
                </button>
                <div class="chip-rank-menu" role="menu">${rankMenu}</div>
            </div>
            <button type="button" class="chip-remove" data-idx="${idx}" aria-label="ลบ ${name}">
                ${ICONS.x}
            </button>
        `;
        container.appendChild(chip);
    });

    updateGenerateButton();
}

// Update one chip's gender visuals in place — no full re-render, so tapping a
// gender button never re-runs the slide-in animation or pops the mobile keyboard.
function refreshChipGender(chip, name) {
    const { gender } = PlayerMeta.getMeta(state.playerMeta, name);
    chip.classList.toggle('chip--male', gender === 'male');
    chip.classList.toggle('chip--female', gender === 'female');
    chip.classList.toggle('chip--nogender', !gender);
    chip.querySelectorAll('.chip-gbtn').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.gender === gender)));
}

// Event delegation: remove a player, or set their gender with one tap.
document.getElementById('players-list').addEventListener('click', e => {
    const removeBtn = e.target.closest('.chip-remove');
    if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.idx, 10);
        const chip = removeBtn.closest('.player-chip');
        chip.classList.add('removing');
        setTimeout(() => {
            const [removed] = state.players.splice(idx, 1);
            // Drop the removed player's meta so the map never keeps orphans.
            if (removed && state.playerMeta) delete state.playerMeta[removed];
            // Explicit removal — may empty the list, so allow an empty write.
            saveState({ allowEmpty: true });
            renderPlayers();
            updateClearButtons();
        }, 150);
        return;
    }

    const gbtn = e.target.closest('.chip-gbtn');
    if (gbtn) {
        const idx = parseInt(gbtn.dataset.idx, 10);
        const name = state.players[idx];
        state.playerMeta = PlayerMeta.setMeta(state.playerMeta, name, { gender: gbtn.dataset.gender });
        saveState();
        refreshChipGender(gbtn.closest('.player-chip'), name);
        updateGenerateButton();
        return;
    }

    // Rank dropdown: toggle the menu open, or pick an option.
    const rankBtn = e.target.closest('.chip-rank-btn');
    if (rankBtn) {
        const wrap = rankBtn.closest('.chip-rank');
        const willOpen = !wrap.classList.contains('open');
        closeRankMenus();
        wrap.classList.toggle('open', willOpen);
        rankBtn.setAttribute('aria-expanded', String(willOpen));
        return;
    }

    const rankOpt = e.target.closest('.chip-rank-opt');
    if (rankOpt) {
        const idx = parseInt(rankOpt.dataset.idx, 10);
        const name = state.players[idx];
        const rankId = rankOpt.dataset.rank || null;
        state.playerMeta = PlayerMeta.setMeta(state.playerMeta, name, { rank: rankId });
        saveState();

        // Surgically update just this chip's dropdown — no full re-render.
        const wrap = rankOpt.closest('.chip-rank');
        const info = PlayerMeta.rankInfo(rankId);
        wrap.querySelector('.chip-rank-label').textContent = info ? info.short : 'ระดับ';
        wrap.classList.toggle('chip-rank--set', !!rankId);
        wrap.querySelectorAll('.chip-rank-opt').forEach(o =>
            o.classList.toggle('selected', (o.dataset.rank || '') === (rankId || '')));
        closeRankMenus();
    }
});

// Close any open rank dropdown(s), optionally keeping one.
function closeRankMenus(except) {
    document.querySelectorAll('.chip-rank.open').forEach(el => {
        if (el === except) return;
        el.classList.remove('open');
        el.querySelector('.chip-rank-btn')?.setAttribute('aria-expanded', 'false');
    });
}

// Click anywhere outside an open rank dropdown closes it.
document.addEventListener('click', e => {
    if (!e.target.closest('.chip-rank')) closeRankMenus();
});

// ===== Roster collapse (mobile) =====
// On phones the name list gets long, so the title doubles as a tap-to-collapse
// control (CSS makes it inert on desktop).  State persists in localStorage.
const playersSection = document.getElementById('players-section');
const rosterToggleBtn = document.getElementById('roster-collapse-btn');

function setRosterCollapsed(collapsed) {
    playersSection.classList.toggle('roster-collapsed', collapsed);
    rosterToggleBtn.setAttribute('aria-expanded', String(!collapsed));
    try { localStorage.setItem('bmRosterCollapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
}

rosterToggleBtn.addEventListener('click', () =>
    setRosterCollapsed(!playersSection.classList.contains('roster-collapsed')));

setRosterCollapsed(localStorage.getItem('bmRosterCollapsed') === '1');

// ===== Render: Settings =====
function renderSettings() {
    // Mode toggle
    const radios = document.getElementsByName('mode');
    radios.forEach(r => {
        r.checked = (r.value === state.settings.mode);
    });

    // Courts stepper
    document.getElementById('courts-value').textContent = state.settings.courts;
    document.getElementById('courts-dec').disabled = state.settings.courts <= 1;
}

// Mode toggle change
document.getElementById('mode-toggle').addEventListener('change', e => {
    if (e.target.name === 'mode') {
        state.settings.mode = e.target.value;
        saveState();
        updateGenerateButton();
    }
});

// Courts stepper
document.getElementById('courts-dec').addEventListener('click', () => {
    if (state.settings.courts > 1) {
        state.settings.courts--;
        saveState();
        renderSettings();
    }
});

document.getElementById('courts-inc').addEventListener('click', () => {
    state.settings.courts++;
    saveState();
    renderSettings();
});

// ===== Generate Button =====
function updateGenerateButton() {
    const btn = document.getElementById('generate-btn');
    const isDoubles = state.settings.mode === 'doubles';
    const participants = getParticipants();
    const hasSchedule = state.matches.length > 0;

    // Doubles: min 4 players (even) or min 5 players (odd → 1 team of 2 + 1 team of 3)
    // Singles: min 2
    let canGenerate = participants.length >= 2;
    let message = '';

    // Gender is required for every player before a schedule can be made.
    const missingGender = PlayerMeta.playersMissingGender(state.playerMeta, state.players);

    if (isDoubles && state.players.length < 4) {
        canGenerate = false;
        message = 'เพิ่มผู้เล่นอย่างน้อย 4 คนสำหรับแข่งแบบคู่';
    } else if (!isDoubles && state.players.length < 2) {
        canGenerate = false;
        message = 'เพิ่มผู้เล่นอย่างน้อย 2 คน';
    } else if (missingGender.length > 0) {
        canGenerate = false;
        message = `เลือกเพศให้ครบทุกคน (เหลือ ${missingGender.length} คน)`;
    }

    btn.disabled = !canGenerate;

    if (!canGenerate) {
        btn.textContent = message;
    } else if (hasSchedule) {
        btn.textContent = 'จัดตารางใหม่ ↺';
    } else {
        btn.textContent = 'จัดตาราง →';
    }
}

// ===== Scoreboard Computation =====
// Returns individual player stats {played, wins, losses} from persisted state.scores
function computeScoreboard() {
    const defaultStats = () => ({ played: 0, wins: 0, losses: 0 });
    const board = {};
    for (const key in state.scores) {
        board[key] = { ...state.scores[key] };
    }
    // Ensure all current players appear
    state.players.forEach(p => { if (!(p in board)) board[p] = defaultStats(); });
    return board;
}

// ===== Render: Scoreboard =====
function renderScoreboard() {
    const container = document.getElementById('scoreboard-list');
    const board = computeScoreboard();
    // Sort by wins desc, then losses asc, then played desc
    const entries = Object.entries(board).sort((a, b) =>
        b[1].wins - a[1].wins || a[1].losses - b[1].losses || b[1].played - a[1].played
    );
    container.innerHTML = '';

    if (entries.length === 0 || entries.every(([, s]) => s.played === 0)) {
        container.innerHTML = emptyStateHTML(
            ICONS.barChart,
            'ยังไม่มีคะแนน',
            'บันทึกผลการแข่งขันเพื่อดูคะแนนสะสม'
        );
        return;
    }

    const table = document.createElement('table');
    table.className = 'sb-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th class="sb-th-rank">#</th>
                <th class="sb-th-name">ชื่อ</th>
                <th class="sb-th-num">แข่ง</th>
                <th class="sb-th-num">ชนะ</th>
                <th class="sb-th-num">แพ้</th>
                <th class="sb-th-bar">อัตราชนะ</th>
            </tr>
        </thead>
    `;

    const tbody = document.createElement('tbody');
    const CROWN = `<svg class="sb-crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.5 3L12 5l4.5 6L21 8l-1.7 10.2a1 1 0 0 1-1 .8H5.7a1 1 0 0 1-1-.8L3 8z"/></svg>`;

    entries.forEach(([name, stats], i) => {
        const winRate = stats.played > 0
            ? Math.round(stats.wins / stats.played * 100) : 0;
        const rank = i + 1;
        const isTop = i < 3;

        // Gender-coloured avatar with the player's initial — mirrors the roster.
        const { gender } = PlayerMeta.getMeta(state.playerMeta, name);
        const initial = (name.trim()[0] || '?').toUpperCase();
        const avatarClass = gender ? `sb-avatar--${gender}` : 'sb-avatar--none';

        // Top 3 get a metallic medal (crown on #1); everyone else a plain dot.
        const rankCell = isTop
            ? `<span class="sb-medal sb-medal--${rank}">${rank === 1 ? CROWN : ''}<span class="sb-medal-num">${rank}</span></span>`
            : `<span class="rank-dot rank-dot--plain">${rank}</span>`;

        const tr = document.createElement('tr');
        tr.className = 'sb-row' + (isTop ? ` sb-row--top sb-row--rank${rank}` : '');
        tr.style.animationDelay = (i * 40) + 'ms';
        tr.innerHTML = `
            <td class="sb-rank">${rankCell}</td>
            <td class="sb-name">
                <div class="sb-player">
                    <span class="sb-avatar ${avatarClass}" aria-hidden="true">${initial}</span>
                    <span class="sb-player-name">${name}</span>
                </div>
            </td>
            <td class="sb-num">${stats.played}</td>
            <td class="sb-num sb-wins">${stats.wins}</td>
            <td class="sb-num sb-losses">${stats.losses}</td>
            <td class="sb-bar-cell">
                <div class="sb-bar-inner">
                    <div class="sb-bar-track">
                        <div class="sb-bar-fill" style="width:${winRate}%"></div>
                    </div>
                    <span class="sb-rate">${winRate}%</span>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

// ===== Render: History =====
function formatThaiDate(dateStr) {
    try {
        return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' })
            .format(new Date(dateStr + 'T00:00:00'));
    } catch {
        return dateStr;
    }
}

function renderHistory() {
    const ul = document.getElementById('history-list');
    ul.innerHTML = '';

    const entries = Object.entries(state.history)
        .sort((a, b) => new Date(b[0]) - new Date(a[0]));

    if (entries.length === 0) {
        ul.innerHTML = emptyStateHTML(
            ICONS.clock,
            'ยังไม่มีประวัติ',
            'ประวัติจะปรากฏเมื่อบันทึกคะแนน'
        );
        return;
    }

    entries.forEach(([date, snapshot], i) => {
        // Support both old (number) and new ({played,wins,losses}) formats
        const ranked = Object.entries(snapshot)
            .map(([n, v]) => {
                if (typeof v === 'number') return [n, { played: v, wins: v, losses: 0 }];
                return [n, v];
            })
            .sort((a, b) => b[1].wins - a[1].wins || a[1].losses - b[1].losses);
        const li = document.createElement('li');
        li.className = 'history-entry';
        li.innerHTML = `
            <div class="history-entry-header">
                <button class="history-header" type="button">
                    <span>${formatThaiDate(date)}</span>
                    <span class="chevron">${ICONS.chevronDown}</span>
                </button>
                <button class="history-delete-btn" type="button" data-date="${date}" title="ลบประวัติวันนี้">${ICONS.x}</button>
            </div>
            <div class="history-body">
                <div class="history-body-inner">
                    ${ranked.map(([n, s], j) => `
                        <div class="history-row">
                            <span class="history-rank">${j + 1}</span>
                            <span class="history-name">${n}</span>
                            <span class="history-stats">${s.played} แข่ง · ${s.wins} ชนะ · ${s.losses} แพ้</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        ul.appendChild(li);
    });
}

// Event delegation for history accordion and per-day delete
document.getElementById('history-list').addEventListener('click', e => {
    const deleteBtn = e.target.closest('.history-delete-btn');
    if (deleteBtn) {
        const date = deleteBtn.dataset.date;
        if (!confirm(`ลบประวัติวันที่ ${formatThaiDate(date)}?`)) return;
        delete state.history[date];
        saveState({ allowEmpty: true });
        renderHistory();
        updateClearButtons();
        return;
    }
    const header = e.target.closest('.history-header');
    if (!header) return;
    header.closest('.history-entry').classList.toggle('open');
});

function saveHistorySnapshot() {
    const today = new Date().toISOString().slice(0, 10);
    state.history[today] = computeScoreboard();
    saveState();
    renderHistory();
}

// ===== Render: Matches (grouped by round) =====
function renderMatches() {
    const container = document.getElementById('matches-container');
    const badge = document.getElementById('match-count-badge');
    container.innerHTML = '';

    if (state.matches.length === 0) {
        badge.style.display = 'none';
        container.innerHTML = emptyStateHTML(
            ICONS.calendar,
            'ยังไม่มีตาราง',
            'เพิ่มผู้เล่นแล้วกด "จัดตาราง"'
        );
        return;
    }

    // Group matches by round
    const rounds = {};
    state.matches.forEach((match, idx) => {
        const r = match.round || 1;
        if (!rounds[r]) rounds[r] = [];
        rounds[r].push({ ...match, idx });
    });

    const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

    // Collect all unique teams from the actual matches (used for singles sitting-out)
    const allTeams = new Set();
    state.matches.forEach(m => m.teams.forEach(t => allTeams.add(t)));

    badge.style.display = '';
    badge.textContent = `${state.matches.length} คู่ · ${roundNumbers.length} รอบ`;

    // Show completion banner when all matches are scored
    if (isScheduleComplete()) {
        const banner = document.createElement('div');
        banner.className = 'schedule-complete-banner';
        banner.innerHTML = `
            <div class="schedule-complete-inner">
                <svg class="complete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 7H3a2 2 0 000 4c0 2.4 2 4 5 5M19 7h2a2 2 0 010 4c0 2.4-2 4-5 5"/>
                    <rect x="5" y="3" width="14" height="4" rx="1"/>
                    <path d="M8 21h8M12 17v4"/>
                </svg>
                <div>
                    <p class="schedule-complete-title">แข่งครบทุกคู่แล้ว!</p>
                    <p class="schedule-complete-hint">กดปุ่ม "สุ่มคู่ใหม่" เพื่อเริ่มรอบใหม่</p>
                </div>
            </div>
        `;
        container.appendChild(banner);
    }

    let matchNum = 0;

    roundNumbers.forEach((roundNum) => {
        const roundMatches = rounds[roundNum];

        // Round container
        const roundDiv = document.createElement('div');
        roundDiv.className = 'match-round';

        // Round header
        const header = document.createElement('div');
        header.className = 'round-header';

        let headerHTML = `<span class="round-label">รอบที่ ${roundNum}</span>`;

        // Find who sits out this round (due to BYE or courts constraint)
        let sittingOut;
        if (state.settings.mode === 'doubles') {
            // Doubles: team names change every round, so track individual players
            const playingInRound = new Set();
            roundMatches.forEach(m => {
                getMatchPlayers(m, 0).forEach(p => playingInRound.add(p));
                getMatchPlayers(m, 1).forEach(p => playingInRound.add(p));
            });
            sittingOut = state.players.filter(p => !playingInRound.has(p));
        } else {
            const inRound = new Set();
            roundMatches.forEach(m => m.teams.forEach(t => inRound.add(t)));
            sittingOut = [...allTeams].filter(p => !inRound.has(p));
        }
        if (sittingOut.length > 0) {
            headerHTML += `<div class="round-rest-group">
                <span class="round-rest-label">พัก</span>
                ${sittingOut.map(name => `<span class="round-rest-name">${nameWithGender(name)}</span>`).join('')}
            </div>`;
        }

        header.innerHTML = headerHTML;
        roundDiv.appendChild(header);

        // Match table for this round
        const table = document.createElement('table');
        table.className = 'match-table';
        const tbody = document.createElement('tbody');

        roundMatches.forEach((match) => {
            matchNum++;
            const saved = match.scoreA != null && match.scoreB != null;
            const winnerA = saved && match.scoreA > match.scoreB;
            const winnerB = saved && match.scoreB > match.scoreA;

            // Resolve display names (for triple teams, show actual lineup).
            // Each name carries a ช/ญ gender badge.
            let teamADisplay = namesWithGender(match.teams[0].split(' / '));
            let teamBDisplay = namesWithGender(match.teams[1].split(' / '));
            if (match.tripleLineup) {
                const lineupStr = namesWithGender(match.tripleLineup);
                const restHtml = `<span class="triple-rest">(${match.tripleRest} พัก)</span>`;
                if (match.tripleTeamIdx === 0) {
                    teamADisplay = lineupStr + ' ' + restHtml;
                } else {
                    teamBDisplay = lineupStr + ' ' + restHtml;
                }
            }

            const tr = document.createElement('tr');
            tr.className = 'match-row' + (saved ? ' match-row--saved' : '');
            tr.style.animationDelay = (matchNum * 30) + 'ms';

            tr.innerHTML = `
                <td class="match-num">${matchNum}</td>
                <td class="match-teams">
                    <button class="team-btn${winnerA ? ' team-btn--winner' : ''}" data-match="${match.idx}" data-winner="A">${teamADisplay}</button>
                    <span class="vs-separator">vs</span>
                    <button class="team-btn${winnerB ? ' team-btn--winner' : ''}" data-match="${match.idx}" data-winner="B">${teamBDisplay}</button>
                </td>
                <td class="score-cell">
                    <input class="score-input${winnerA ? ' score-input--winner' : ''}"
                           type="number" min="0"
                           value="${match.scoreA != null ? match.scoreA : ''}"
                           data-match="${match.idx}" data-side="A" />
                </td>
                <td class="score-sep">–</td>
                <td class="score-cell">
                    <input class="score-input${winnerB ? ' score-input--winner' : ''}"
                           type="number" min="0"
                           value="${match.scoreB != null ? match.scoreB : ''}"
                           data-match="${match.idx}" data-side="B" />
                </td>
                <td class="save-cell">
                    <button class="btn-clear-score" data-match="${match.idx}"
                            title="ล้างคะแนน" aria-label="ล้างคะแนน"${saved ? '' : ' hidden'}>
                        ${ICONS.reset}
                    </button>
                    <button class="btn-save${saved ? ' btn-save--saved' : ''}"
                            data-match="${match.idx}">
                        ${saved ? ICONS.check : 'บันทึก'}
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        roundDiv.appendChild(table);
        container.appendChild(roundDiv);
    });
}

// Update a single match row in-place — no full page re-render, no flicker.
function updateMatchRowDOM(row, match) {
    const saved = match.scoreA != null && match.scoreB != null;
    const winnerA = saved && match.scoreA > match.scoreB;
    const winnerB = saved && match.scoreB > match.scoreA;

    row.classList.toggle('match-row--saved', saved);

    const [btnA, btnB] = row.querySelectorAll('.team-btn');
    btnA.classList.toggle('team-btn--winner', winnerA);
    btnB.classList.toggle('team-btn--winner', winnerB);

    const inputA = row.querySelector('[data-side="A"]');
    const inputB = row.querySelector('[data-side="B"]');
    inputA.classList.toggle('score-input--winner', winnerA);
    inputB.classList.toggle('score-input--winner', winnerB);
    inputA.value = match.scoreA != null ? match.scoreA : '';
    inputB.value = match.scoreB != null ? match.scoreB : '';

    const saveBtn = row.querySelector('.btn-save');
    saveBtn.classList.toggle('btn-save--saved', saved);
    saveBtn.innerHTML = saved ? ICONS.check : 'บันทึก';

    // The clear icon is only useful once a score exists to wipe.
    const clearBtn = row.querySelector('.btn-clear-score');
    if (clearBtn) clearBtn.hidden = !saved;

    // Show or remove the completion banner without re-rendering all matches
    const container = document.getElementById('matches-container');
    const existingBanner = container.querySelector('.schedule-complete-banner');
    if (isScheduleComplete()) {
        if (!existingBanner) {
            const banner = document.createElement('div');
            banner.className = 'schedule-complete-banner';
            banner.innerHTML = `
                <div class="schedule-complete-inner">
                    <svg class="complete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 7H3a2 2 0 000 4c0 2.4 2 4 5 5M19 7h2a2 2 0 010 4c0 2.4-2 4-5 5"/>
                        <rect x="5" y="3" width="14" height="4" rx="1"/>
                        <path d="M8 21h8M12 17v4"/>
                    </svg>
                    <div>
                        <p class="schedule-complete-title">แข่งครบทุกคู่แล้ว!</p>
                        <p class="schedule-complete-hint">กดปุ่ม "สุ่มคู่ใหม่" เพื่อเริ่มรอบใหม่</p>
                    </div>
                </div>
            `;
            container.appendChild(banner);
        }
    } else {
        existingBanner?.remove();
    }
}

// Event delegation for match save buttons and quick winner select
document.getElementById('matches-container').addEventListener('click', e => {
    // Clear score: reset this match back to its "never scored" state, undoing
    // its contribution to the cumulative scoreboard.  Lets a mistaken result be
    // wiped without retyping.
    const clearBtn = e.target.closest('.btn-clear-score');
    if (clearBtn) {
        const idx = parseInt(clearBtn.dataset.match, 10);
        const match = state.matches[idx];
        const row = clearBtn.closest('tr');
        const wasSaved = match.scoreA != null && match.scoreB != null;
        if (wasSaved) {
            updateScoresForMatch(match, match.scoreA, match.scoreB, null, null);
            match.scoreA = null;
            match.scoreB = null;
            saveState();
        }
        // updateMatchRowDOM clears the inputs, restores the "บันทึก" button,
        // drops the winner highlight, and hides this clear icon.
        updateMatchRowDOM(row, match);
        if (wasSaved) {
            requestAnimationFrame(() => {
                renderScoreboard();
                saveHistorySnapshot();
                updateClearButtons();
            });
        }
        return;
    }

    // Quick winner select: click on team name to mark as winner (click again to clear)
    const teamBtn = e.target.closest('.team-btn');
    if (teamBtn) {
        const idx = parseInt(teamBtn.dataset.match, 10);
        const winner = teamBtn.dataset.winner;
        const match = state.matches[idx];

        const alreadyWinner = winner === 'A'
            ? (match.scoreA != null && match.scoreA > match.scoreB)
            : (match.scoreB != null && match.scoreB > match.scoreA);

        const newA = alreadyWinner ? null : (winner === 'A' ? 1 : 0);
        const newB = alreadyWinner ? null : (winner === 'B' ? 1 : 0);

        updateScoresForMatch(match, match.scoreA, match.scoreB, newA, newB);
        match.scoreA = newA;
        match.scoreB = newB;
        saveState();

        const row = teamBtn.closest('tr');
        updateMatchRowDOM(row, match);

        // Defer heavy DOM work so the browser paints the row update first
        requestAnimationFrame(() => {
            renderScoreboard();
            saveHistorySnapshot();
            updateClearButtons();
        });
        return;
    }

    const btn = e.target.closest('.btn-save');
    if (!btn) return;

    const idx = parseInt(btn.dataset.match, 10);
    const row = btn.closest('tr');
    const inputA = row.querySelector('[data-side="A"]');
    const inputB = row.querySelector('[data-side="B"]');
    const a = parseInt(inputA.value, 10);
    const b = parseInt(inputB.value, 10);

    if (!isNaN(a) && !isNaN(b)) {
        const match = state.matches[idx];
        updateScoresForMatch(match, match.scoreA, match.scoreB, a, b);
        match.scoreA = a;
        match.scoreB = b;
        saveState();

        updateMatchRowDOM(row, match);

        // Defer heavy DOM work so the browser paints the row update first
        requestAnimationFrame(() => {
            renderScoreboard();
            saveHistorySnapshot();
            updateClearButtons();
        });
    }
});

// When the user edits a score on an already-saved row, flip the save button
// from its ✓ "saved" state back to "บันทึก" so it's obvious the corrected score
// must be re-saved.  This makes fixing an accidental tap discoverable — the
// inputs were always editable, but the lone checkmark looked final.
document.getElementById('matches-container').addEventListener('input', e => {
    const input = e.target.closest('.score-input');
    if (!input) return;
    const row = input.closest('tr');
    const saveBtn = row.querySelector('.btn-save');
    if (saveBtn.classList.contains('btn-save--saved')) {
        saveBtn.classList.remove('btn-save--saved');
        saveBtn.textContent = 'บันทึก';
    }
    // Reveal the clear icon as soon as there's anything to wipe — including
    // values typed but not yet saved.
    const inputA = row.querySelector('[data-side="A"]');
    const inputB = row.querySelector('[data-side="B"]');
    const clearBtn = row.querySelector('.btn-clear-score');
    if (clearBtn) clearBtn.hidden = inputA.value === '' && inputB.value === '';
});

// ===== Participants Helper =====
// Singles: each player is a participant
// Doubles: pair players sequentially into teams (player[0]+[1], [2]+[3], ...)
//   If odd number: last 3 players form a triple team that rotates lineup
function getParticipantsFromList(playerList) {
    const teams = [];
    const n = playerList.length;
    const hasTriple = n >= 3 && n % 2 === 1;
    const pairEnd = hasTriple ? n - 3 : n;

    for (let i = 0; i < pairEnd; i += 2) {
        teams.push(playerList[i] + ' / ' + playerList[i + 1]);
    }
    if (hasTriple) {
        teams.push(playerList[n - 3] + ' / ' + playerList[n - 2] + ' / ' + playerList[n - 1]);
    }
    return teams;
}

function getParticipants() {
    if (state.settings.mode === 'doubles') {
        return getParticipantsFromList(state.players);
    }
    return [...state.players];
}

// Get the 3 sub-pair combinations for a triple team
function getTripleCombos(teamName) {
    const members = teamName.split(' / ');
    if (members.length !== 3) return null;
    return [
        { playing: [members[0], members[1]], rest: members[2] },
        { playing: [members[0], members[2]], rest: members[1] },
        { playing: [members[1], members[2]], rest: members[0] },
    ];
}

// ===== Individual Score Helpers =====
// Extract individual player names from a match side
function getMatchPlayers(match, teamIdx) {
    // Triple team: only the 2 actually playing members
    if (match.tripleLineup && match.tripleTeamIdx === teamIdx) {
        return [...match.tripleLineup];
    }
    // Normal: split "A / B" → ["A","B"] or "A" → ["A"]
    return match.teams[teamIdx].split(' / ').map(s => s.trim());
}

// Update cumulative individual scores when a match result is saved/changed
function updateScoresForMatch(match, oldScoreA, oldScoreB, newScoreA, newScoreB) {
    const playersA = getMatchPlayers(match, 0);
    const playersB = getMatchPlayers(match, 1);
    const defaultStats = () => ({ played: 0, wins: 0, losses: 0 });

    // Ensure all players exist in scores
    [...playersA, ...playersB].forEach(p => {
        if (!(p in state.scores)) state.scores[p] = defaultStats();
    });

    // Undo previous result (if re-saving)
    if (oldScoreA != null && oldScoreB != null) {
        playersA.forEach(p => state.scores[p].played--);
        playersB.forEach(p => state.scores[p].played--);
        if (oldScoreA > oldScoreB) {
            playersA.forEach(p => state.scores[p].wins--);
            playersB.forEach(p => state.scores[p].losses--);
        } else if (oldScoreB > oldScoreA) {
            playersB.forEach(p => state.scores[p].wins--);
            playersA.forEach(p => state.scores[p].losses--);
        }
    }

    // Apply new result (skip if clearing the score)
    if (newScoreA != null && newScoreB != null) {
        playersA.forEach(p => state.scores[p].played++);
        playersB.forEach(p => state.scores[p].played++);
        if (newScoreA > newScoreB) {
            playersA.forEach(p => state.scores[p].wins++);
            playersB.forEach(p => state.scores[p].losses++);
        } else if (newScoreB > newScoreA) {
            playersB.forEach(p => state.scores[p].wins++);
            playersA.forEach(p => state.scores[p].losses++);
        }
    }
}

// ===== Schedule Completion Check =====
function isScheduleComplete() {
    return state.matches.length > 0 &&
        state.matches.every(m => m.scoreA != null && m.scoreB != null);
}

// ===== Schedule generation =====
// The pairing/fairness logic lives in schedule.js (loaded as a global before this
// file) so it can be unit-tested without a browser.  getMatchPlayers is passed in
// so previous-schedule play counts honour the legacy "triple team" lineup.
function generateSchedule() {
    return makeSchedule({
        players: state.players,
        mode: state.settings.mode,
        courts: state.settings.courts,
        prevMatches: state.matches,
        getPlayers: getMatchPlayers,
        genderOf: genderForPairing,
        rankOf: rankForPairing
    });
}

// Gender lookup for the pairing constraint: never pair an all-male team against an
// all-female team (ช-ช vs ญ-ญ).  Returns 'male' | 'female' | null.
function genderForPairing(name) {
    return PlayerMeta.getMeta(state.playerMeta, name).gender;
}

// Rank lookup for team balancing: of the three ways to split four court players, prefer
// the one whose teams are closest in total strength.  Returns a rank id | null (unranked
// players make balance a no-op for that court).
function rankForPairing(name) {
    return PlayerMeta.getMeta(state.playerMeta, name).rank;
}

// Mid-game re-pairing: keep the matches already PLAYED (scored), drop the unplayed
// ones, and keep pairing the CURRENT roster until the behind players have caught up to
// whoever was ahead when play paused.  Court usage comes first: every round fills all
// courts, so counts may end up to a game apart rather than leaving a court idle.  Works
// whether a player LEFT (remove them first — they keep only the games they played) or
// JOINED late (add them first — they are paired until they catch up).
function continueScheduleMidGame() {
    const played = state.matches.filter(m => m.scoreA != null && m.scoreB != null);
    const newMatches = continueSchedule({
        players: state.players,
        mode: state.settings.mode,
        courts: state.settings.courts,
        playedMatches: played,
        getPlayers: getMatchPlayers,
        genderOf: genderForPairing,
        rankOf: rankForPairing
    });
    return [...played, ...newMatches];
}

// ===== Tab Navigation =====
function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // Update pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.toggle('active', page.id === 'page-' + tabName);
    });
    // Persist
    localStorage.setItem('bmActiveTab', tabName);
}

// Tab click handlers
document.querySelector('.tab-bar').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    switchTab(btn.dataset.tab);
});

// Update tab badge
function updateTabBadge() {
    const badge = document.getElementById('tab-match-badge');
    if (state.matches.length > 0) {
        badge.style.display = '';
        badge.textContent = state.matches.length;
    } else {
        badge.style.display = 'none';
    }
}

// ===== Render All =====
function renderAll() {
    seedKnownNamesFromState();
    renderPlayers();
    renderSettings();
    renderMatches();
    renderScoreboard();
    renderHistory();
    updateGenerateButton();
    updateTabBadge();
    updateClearButtons();
}

// ===== Name Suggestions (remembered roster) =====
// A device-local roster of every name ever added, shown as a dropdown so regular
// players can be re-added in a tap instead of being retyped each session. Stored
// in localStorage (separate from the Firebase-synced state) so it never touches
// the delicate save/merge guards. The pure list logic lives in known-names.js.
const KNOWN_NAMES_KEY = 'bmKnownNames';

let knownNames = readKnownNames();
let currentSuggestions = [];     // names currently shown in the dropdown (by index)
let activeSuggestion = -1;       // keyboard-highlighted index, -1 = none

function readKnownNames() {
    try {
        const raw = localStorage.getItem(KNOWN_NAMES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}

function saveKnownNames() {
    try {
        localStorage.setItem(KNOWN_NAMES_KEY, JSON.stringify(knownNames));
    } catch { /* storage disabled/full — roster is a convenience, safe to drop */ }
}

// Remember a name (most-recently-used first).
function recordKnownName(name) {
    knownNames = KnownNames.addKnownName(knownNames, name);
    saveKnownNames();
    updateRosterToggle();
}

// Pull any names already on the board (current players + anyone with a score
// history) into the roster, so suggestions work even for an existing board and
// quietly benefit from names synced in from other devices.
function seedKnownNamesFromState() {
    const names = [...state.players, ...Object.keys(state.scores || {})];
    const merged = KnownNames.mergeKnownNames(knownNames, names);
    if (merged.length !== knownNames.length) {
        knownNames = merged;
        saveKnownNames();
    }
    updateRosterToggle();
}

// Add a player by name (shared by the form, a suggestion tap, and Enter-on-
// highlighted). Returns true when the name was valid. Always records the name.
function addPlayerByName(rawName) {
    const name = KnownNames.normalizeName(rawName);
    if (!name) return false;
    if (!state.players.includes(name)) {
        state.players.push(name);
        saveState();
        renderPlayers();
        updateClearButtons();
        setRosterCollapsed(false);   // reveal the list so the new chip is visible
    }
    recordKnownName(name);
    return true;
}

// Add one or many players from a raw string. Splits on commas / newlines / etc.
// so a single submit (or a paste) can add a whole list. De-dups against the
// current roster (case-insensitive) and within the input itself. Returns
// {added, skipped} so the caller can show feedback.
function addPlayers(rawInput) {
    const names = KnownNames.splitNames(rawInput);
    if (!names.length) return { added: 0, skipped: 0 };
    const seen = new Set(state.players.map(p => p.toLowerCase()));
    let added = 0, skipped = 0;
    names.forEach(name => {
        recordKnownName(name);                 // remember every typed name
        const key = name.toLowerCase();
        if (seen.has(key)) { skipped++; return; }
        seen.add(key);
        state.players.push(name);
        added++;
    });
    if (added) {
        saveState();
        renderPlayers();
        updateClearButtons();
        setRosterCollapsed(false);   // reveal the list so new chips are visible
    }
    return { added, skipped };
}

// Transient confirmation shown in the hint line under the input, then reverts.
const ADD_HINT_DEFAULT = 'พิมพ์คั่นด้วย , หรือวางหลายชื่อพร้อมกันเพื่อเพิ่มทีละหลายคน';
let addFeedbackTimer = null;
function showAddFeedback(added, skipped) {
    const el = document.getElementById('add-feedback');
    if (!el) return;
    const parts = [];
    if (added)   parts.push(`เพิ่มแล้ว ${added} ชื่อ`);
    if (skipped) parts.push(`ข้ามชื่อซ้ำ ${skipped}`);
    el.textContent = parts.join(' · ') || ADD_HINT_DEFAULT;
    el.classList.add('feedback-active');
    clearTimeout(addFeedbackTimer);
    addFeedbackTimer = setTimeout(() => {
        el.textContent = ADD_HINT_DEFAULT;
        el.classList.remove('feedback-active');
    }, 2600);
}

const suggestionsBox = document.getElementById('name-suggestions');
const playerNameInput = document.getElementById('player-name');
const rosterToggle = document.getElementById('roster-toggle');

// Is this name already in the current player list? (case-insensitive)
function isAlreadyAdded(name) {
    const k = KnownNames.normalizeName(name).toLowerCase();
    return state.players.some(p => p.toLowerCase() === k);
}

// Show/hide the toggle chevron — it is only useful once something is remembered.
function updateRosterToggle() {
    rosterToggle.style.display = knownNames.length ? '' : 'none';
}

function renderSuggestions() {
    // Show the FULL remembered list (matching the typed filter). Names already in
    // the current list are shown but flagged "added" so the roster is never
    // mysteriously empty — they just can't be re-added.
    currentSuggestions = KnownNames.filterKnownNames(knownNames, playerNameInput.value, [], 50);
    if (currentSuggestions.length === 0) {
        closeSuggestions();
        return;
    }
    suggestionsBox.innerHTML = currentSuggestions.map((name, i) => {
        const added = isAlreadyAdded(name);
        return `
        <div class="suggestion-item${added ? ' added' : ''}" role="option" data-idx="${i}"${added ? ' aria-selected="true"' : ''}>
            ${added ? `<span class="suggestion-check" aria-label="เพิ่มแล้ว">${ICONS.check}</span>` : ''}
            <span class="suggestion-name">${name}</span>
            <button type="button" class="suggestion-remove" data-idx="${i}"
                    aria-label="ลบ ${name} ออกจากรายการที่จำไว้">${ICONS.x}</button>
        </div>`;
    }).join('');
    suggestionsBox.classList.add('open');
    rosterToggle.classList.add('open');
    playerNameInput.setAttribute('aria-expanded', 'true');
    activeSuggestion = -1;
}

function closeSuggestions() {
    suggestionsBox.classList.remove('open');
    rosterToggle.classList.remove('open');
    suggestionsBox.innerHTML = '';
    playerNameInput.setAttribute('aria-expanded', 'false');
    activeSuggestion = -1;
}

// Explicit affordance: tap the chevron to open/close the remembered list.
rosterToggle.addEventListener('click', e => {
    e.stopPropagation();
    if (suggestionsBox.classList.contains('open')) {
        closeSuggestions();
    } else {
        renderSuggestions();
        playerNameInput.focus();
    }
});

function highlightActive() {
    suggestionsBox.querySelectorAll('.suggestion-item').forEach((el, i) => {
        el.classList.toggle('active', i === activeSuggestion);
        if (i === activeSuggestion) el.scrollIntoView({ block: 'nearest' });
    });
}

// Open on a deliberate tap/click (NOT on programmatic .focus() from renderPlayers,
// which would otherwise pop the dropdown open on every render/sync).
playerNameInput.addEventListener('click', renderSuggestions);
playerNameInput.addEventListener('input', renderSuggestions);

playerNameInput.addEventListener('keydown', e => {
    const isOpen = suggestionsBox.classList.contains('open');
    if (e.key === 'Escape') {
        if (isOpen) { e.preventDefault(); closeSuggestions(); }
        return;
    }
    if (e.key === 'ArrowDown') {
        if (!isOpen) renderSuggestions();
        if (currentSuggestions.length) {
            e.preventDefault();
            activeSuggestion = (activeSuggestion + 1) % currentSuggestions.length;
            highlightActive();
        }
        return;
    }
    if (e.key === 'ArrowUp') {
        if (isOpen && currentSuggestions.length) {
            e.preventDefault();
            activeSuggestion = (activeSuggestion - 1 + currentSuggestions.length) % currentSuggestions.length;
            highlightActive();
        }
        return;
    }
    if (e.key === 'Enter' && isOpen && activeSuggestion >= 0
        && !isAlreadyAdded(currentSuggestions[activeSuggestion])) {
        // A (re-addable) suggestion is highlighted — add it instead of the typed text.
        e.preventDefault();
        addPlayerByName(currentSuggestions[activeSuggestion]);
        playerNameInput.value = '';
        renderSuggestions();
    }
});

// Tap a suggestion to add it; tap its × to forget it. Delegated.
suggestionsBox.addEventListener('click', e => {
    const removeBtn = e.target.closest('.suggestion-remove');
    if (removeBtn) {
        e.stopPropagation();
        knownNames = KnownNames.removeKnownName(knownNames, currentSuggestions[+removeBtn.dataset.idx]);
        saveKnownNames();
        updateRosterToggle();
        renderSuggestions();         // refresh, keep open
        playerNameInput.focus();
        return;
    }
    const item = e.target.closest('.suggestion-item');
    if (!item || item.classList.contains('added')) return;   // already in the list
    addPlayerByName(currentSuggestions[+item.dataset.idx]);
    playerNameInput.value = '';
    renderSuggestions();             // refresh (now flagged "added"), keep open
    playerNameInput.focus();
});

// Close when clicking anywhere outside the input + dropdown.
document.addEventListener('click', e => {
    if (!e.target.closest('.player-input-wrap')) closeSuggestions();
});

// ===== Event: Add Player(s) =====
document.getElementById('add-player-form').addEventListener('submit', e => {
    e.preventDefault();
    const { added, skipped } = addPlayers(playerNameInput.value);
    if (added || skipped) {
        playerNameInput.value = '';
        closeSuggestions();
        showAddFeedback(added, skipped);
    }
    playerNameInput.focus();
});

// Pasting a multi-name list (commas / newlines) adds them all at once instead
// of dropping a messy blob into the single-line input. A single name pastes
// normally so the autocomplete still works.
playerNameInput.addEventListener('paste', e => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (KnownNames.splitNames(text).length > 1) {
        e.preventDefault();
        const { added, skipped } = addPlayers(text);
        playerNameInput.value = '';
        closeSuggestions();
        showAddFeedback(added, skipped);
    }
});

// ===== Event: Generate Schedule =====
document.getElementById('generate-btn').addEventListener('click', () => {
    const participants = getParticipants();
    if (participants.length < 2) return;
    state.matches = generateSchedule();
    saveState();
    renderMatches();
    renderScoreboard();
    updateGenerateButton();
    updateTabBadge();
    updateClearButtons();
    switchTab('schedule');
});

// ===== Event: Reshuffle =====
document.getElementById('reshuffle-btn').addEventListener('click', () => {
    const participants = getParticipants();
    if (participants.length < 2) return;
    state.matches = generateSchedule();
    saveState();
    renderMatches();
    renderScoreboard();
    updateGenerateButton();
    updateTabBadge();
    updateClearButtons();
    switchTab('schedule');
});

// ===== Event: Continue mid-game (re-pair after someone leaves) =====
// Keeps played results, drops unplayed matches, and pairs the current roster to even
// out play counts.  Adjust the roster FIRST (remove who left / add who arrived), then
// press this.  Shared by the button on the schedule tab and the one on the settings
// tab (next to "จัดตารางใหม่"), so it's reachable right where the roster is edited.
function handleContinueMidGame() {
    const played = state.matches.filter(m => m.scoreA != null && m.scoreB != null);
    if (played.length === 0) {
        // Nothing played yet — this would just rebuild the whole schedule, which the
        // "จัดตารางใหม่"/"สุ่มคู่ใหม่" buttons already do.
        alert('ยังไม่มีคู่ที่เล่นจบ (กรอกผลแล้ว) — ใช้ปุ่ม "จัดตารางใหม่" เพื่อจับคู่ใหม่ทั้งหมด');
        return;
    }
    const unplayed = state.matches.length - played.length;
    if (!confirm(
        `จับคู่ต่อกลางคัน?\n\n` +
        `• เก็บ ${played.length} คู่ที่เล่นจบแล้วไว้\n` +
        `• ตัด ${unplayed} คู่ที่ยังไม่ได้เล่นทิ้ง\n` +
        `• จับคู่ผู้เล่นปัจจุบัน (${state.players.length} คน) ต่อ โดยใช้สนามครบทุกรอบจนคนที่ตามหลังไล่ทัน (จำนวนเกมอาจต่างกันได้ ±1)`
    )) return;

    const next = continueScheduleMidGame();
    const added = next.length - played.length;
    state.matches = next;
    saveState();
    renderMatches();
    renderScoreboard();
    updateGenerateButton();
    updateTabBadge();
    updateClearButtons();
    switchTab('schedule');

    if (added === 0) {
        // continueSchedule added nothing: either everyone is already level (the common
        // case), or there are too few players left to fill even one court.
        const seatsPerCourt = state.settings.mode === 'doubles' ? 4 : 2;
        const counts = computeScoreboard();
        const played = state.players.map(p => (counts[p] ? counts[p].played : 0));
        const equal = played.length > 0 && Math.min(...played) === Math.max(...played);
        alert(equal
            ? 'ผู้เล่นปัจจุบันแข่งเท่ากันอยู่แล้ว จึงไม่มีคู่เพิ่ม'
            : `ผู้เล่นไม่พอจะตั้งสนาม (ต้องการอย่างน้อย ${seatsPerCourt} คน) — เพิ่มผู้เล่นแล้วลองใหม่`);
    }
}

document.getElementById('continue-btn').addEventListener('click', handleContinueMidGame);
document.getElementById('continue-settings-btn').addEventListener('click', handleContinueMidGame);

// ===== Clear Actions =====
document.getElementById('clear-players-btn').addEventListener('click', () => {
    if (!confirm('ล้างรายชื่อผู้เล่นทั้งหมด?')) return;
    state.players = [];
    state.matches = [];
    state.playerMeta = {};
    saveState({ allowEmpty: true });
    renderAll();
});

document.getElementById('clear-schedule-btn').addEventListener('click', () => {
    if (!confirm('ล้างตารางการแข่งขัน?')) return;
    state.matches = [];
    saveState({ allowEmpty: true });
    renderAll();
});

document.getElementById('clear-scores-btn').addEventListener('click', () => {
    if (!confirm('ล้างคะแนนสะสมทั้งหมด?')) return;
    state.scores = {};
    saveState({ allowEmpty: true });
    renderScoreboard();
    updateClearButtons();
});

document.getElementById('clear-history-btn').addEventListener('click', () => {
    if (!confirm('ล้างประวัติอันดับรายวันทั้งหมด?')) return;
    state.history = {};
    saveState({ allowEmpty: true });
    renderHistory();
    updateClearButtons();
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (!confirm('ล้างข้อมูลทั้งหมด? (รายชื่อ, ตาราง, คะแนน, ประวัติ)')) return;
    state.players = [];
    state.settings = { mode: 'singles', courts: 1 };
    state.matches = [];
    state.scores = {};
    state.history = {};
    state.playerMeta = {};
    saveState({ allowEmpty: true });
    renderAll();
    switchTab('settings');
});

// Show/hide clear buttons based on data
function updateClearButtons() {
    document.getElementById('clear-players-btn').style.display =
        state.players.length > 0 ? '' : 'none';
    document.getElementById('clear-schedule-btn').style.display =
        state.matches.length > 0 ? '' : 'none';
    document.getElementById('reshuffle-btn').style.display =
        state.matches.length > 0 ? '' : 'none';
    // Mid-game re-pair only makes sense once at least one match has been played.
    // Surfaced both on the schedule tab and on the settings tab (where the roster is
    // edited), so it's reachable right after adding/removing a player.
    const hasPlayed = state.matches.some(m => m.scoreA != null && m.scoreB != null);
    document.getElementById('continue-btn').style.display =
        hasPlayed ? '' : 'none';
    document.getElementById('continue-settings-btn').style.display =
        hasPlayed ? '' : 'none';
    document.getElementById('continue-hint').style.display =
        hasPlayed ? '' : 'none';

    const hasScores = Object.keys(state.scores).some(k => state.scores[k].played > 0);
    document.getElementById('clear-scores-btn').style.display =
        hasScores ? '' : 'none';
    document.getElementById('clear-history-btn').style.display =
        Object.keys(state.history).length > 0 ? '' : 'none';
}

// ===== QR Code Modal =====
let qrInstance = null;

function openQRModal() {
    const overlay = document.getElementById('qr-overlay');
    const qrContainer = document.getElementById('qr-code');
    const urlInput = document.getElementById('qr-url-input');
    const currentURL = window.location.href;

    urlInput.value = currentURL;

    // Clear previous QR code
    qrContainer.innerHTML = '';
    qrInstance = new QRCode(qrContainer, {
        text: currentURL,
        width: 200,
        height: 200,
        colorDark: '#1A1D23',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.M
    });

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeQRModal() {
    const overlay = document.getElementById('qr-overlay');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
}

document.getElementById('qr-btn').addEventListener('click', openQRModal);
document.getElementById('qr-close-btn').addEventListener('click', closeQRModal);

// Close on overlay click (outside modal)
document.getElementById('qr-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeQRModal();
});

// Close on Escape key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeQRModal();
});

// Copy URL button
document.getElementById('qr-copy-btn').addEventListener('click', () => {
    const urlInput = document.getElementById('qr-url-input');
    const btn = document.getElementById('qr-copy-btn');
    navigator.clipboard.writeText(urlInput.value).then(() => {
        btn.textContent = 'คัดลอกแล้ว!';
        btn.classList.add('qr-copy-btn--done');
        setTimeout(() => {
            btn.textContent = 'คัดลอก';
            btn.classList.remove('qr-copy-btn--done');
        }, 2000);
    });
});

// ===== Theme Toggle =====
let currentThemeMode = 'system';

function applyTheme(mode) {
    currentThemeMode = mode;
    localStorage.setItem('bmTheme', mode);

    if (mode === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', mode);
    }

    // Update active button
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === mode);
    });
}

// Theme toggle click handlers
document.getElementById('theme-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.theme-btn');
    if (!btn) return;
    applyTheme(btn.dataset.theme);
});

// Listen for OS theme changes (for system mode)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentThemeMode === 'system') applyTheme('system');
});

// ===== Initial Load =====
// Apply saved theme (before content renders to avoid flash)
applyTheme(localStorage.getItem('bmTheme') || 'system');

// Hydrate instantly from the local cache so a reload (e.g. toggling responsive
// mode) never flashes empty and edits made before the last sync are not lost.
// Saves stay blocked until a real server snapshot arrives; handleSnapshot then
// reconciles this cache with Firebase and pushes up anything newer.
const cachedState = readLocalCache();
if (cachedState) {
    startedWithCache = true;
    applySnapshot(cachedState);
    localUpdatedAt = cachedState.updatedAt != null ? cachedState.updatedAt : null;
    renderAll();
    // We already have data on screen — don't block it behind the loading
    // overlay while Firebase reconciles in the background.  The overlay is only
    // meaningful for a genuine first-ever load with nothing cached.
    hideSyncOverlay();
}

// Firebase onValue listener (above) handles initial data load + real-time sync
// renderAll() is called automatically when data arrives

// Restore saved tab (UI-only preference, stays in localStorage)
const savedTab = localStorage.getItem('bmActiveTab');
if (savedTab) switchTab(savedTab);
