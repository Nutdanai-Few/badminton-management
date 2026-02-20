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
    history: {}
};

// ===== Firebase Real-time Sync =====
let isSyncing = false;   // prevent save loop when receiving remote updates
let saveTimer = null;

function saveState() {
    if (isSyncing) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        dbRef.set({
            players: state.players,
            settings: state.settings,
            matches: state.matches,
            scores: state.scores,
            history: state.history
        });
    }, 300);
}

// Real-time listener — fires on initial load + every remote change
dbRef.on('value', (snapshot) => {
    isSyncing = true;
    const data = snapshot.val();
    if (data) {
        state.players = data.players || [];
        state.settings = data.settings || { mode: 'singles', courts: 1 };
        state.matches = data.matches || [];
        state.scores = data.scores || {};
        state.history = data.history || {};
    }
    renderAll();
    isSyncing = false;
});

// ===== SVG Icons =====
const ICONS = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    userPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    barChart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
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

// ===== Render: Players =====
function renderPlayers() {
    const container = document.getElementById('players-list');
    const badge = document.getElementById('player-count-badge');
    container.innerHTML = '';

    badge.textContent = state.players.length + ' คน';

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
        chip.className = 'player-chip';
        chip.style.animationDelay = (idx * 30) + 'ms';
        chip.innerHTML = `
            <span class="chip-name">${name}</span>
            <button class="chip-remove" aria-label="ลบ ${name}" data-idx="${idx}">
                ${ICONS.x}
            </button>
        `;
        container.appendChild(chip);
    });

    document.getElementById('player-name').focus();
    updateGenerateButton();
}

// Event delegation for player removal
document.getElementById('players-list').addEventListener('click', e => {
    const btn = e.target.closest('.chip-remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    const chip = btn.closest('.player-chip');
    chip.classList.add('removing');
    setTimeout(() => {
        state.players.splice(idx, 1);
        saveState();
        renderPlayers();
        updateClearButtons();
    }, 150);
});

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

    if (isDoubles && state.players.length < 4) {
        canGenerate = false;
        message = 'เพิ่มผู้เล่นอย่างน้อย 4 คนสำหรับแข่งแบบคู่';
    } else if (!isDoubles && state.players.length < 2) {
        canGenerate = false;
        message = 'เพิ่มผู้เล่นอย่างน้อย 2 คน';
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

    const maxWins = entries[0][1].wins || 1;
    const rankColors = ['var(--color-rank-1)', 'var(--color-rank-2)', 'var(--color-rank-3)'];

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

    entries.forEach(([name, stats], i) => {
        const winRate = stats.played > 0
            ? Math.round(stats.wins / stats.played * 100) : 0;
        const color = rankColors[i] || 'var(--color-border-strong)';

        const tr = document.createElement('tr');
        tr.className = 'sb-row' + (i < 3 ? ' sb-row--top' : '');
        tr.style.animationDelay = (i * 40) + 'ms';
        tr.innerHTML = `
            <td class="sb-rank"><span class="rank-dot" style="background:${color}">${i + 1}</span></td>
            <td class="sb-name">${name}</td>
            <td class="sb-num">${stats.played}</td>
            <td class="sb-num sb-wins">${stats.wins}</td>
            <td class="sb-num sb-losses">${stats.losses}</td>
            <td class="sb-bar-cell">
                <div class="sb-bar-track">
                    <div class="sb-bar-fill" style="width:${winRate}%"></div>
                </div>
                <span class="sb-rate">${winRate}%</span>
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
        li.className = 'history-entry' + (i === 0 ? ' open' : '');
        li.innerHTML = `
            <button class="history-header" type="button">
                <span>${formatThaiDate(date)}</span>
                <span class="chevron">${ICONS.chevronDown}</span>
            </button>
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

// Event delegation for history accordion
document.getElementById('history-list').addEventListener('click', e => {
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

    // Collect all unique teams from the actual matches (handles re-paired doubles)
    const allTeams = new Set();
    state.matches.forEach(m => m.teams.forEach(t => allTeams.add(t)));

    badge.style.display = '';
    badge.textContent = `${state.matches.length} คู่ · ${roundNumbers.length} รอบ`;

    let matchNum = 0;

    roundNumbers.forEach((roundNum, ri) => {
        const roundMatches = rounds[roundNum];

        // Round container
        const roundDiv = document.createElement('div');
        roundDiv.className = 'match-round';

        // Round header
        const header = document.createElement('div');
        header.className = 'round-header';

        let headerHTML = `<span class="round-label">รอบที่ ${roundNum}</span>`;

        // Find who sits out this round (due to BYE or courts constraint)
        const inRound = new Set();
        roundMatches.forEach(m => m.teams.forEach(t => inRound.add(t)));
        const sittingOut = [...allTeams].filter(p => !inRound.has(p));
        if (sittingOut.length > 0) {
            headerHTML += `<div class="round-rest-group">
                <span class="round-rest-label">พัก</span>
                ${sittingOut.map(name => `<span class="round-rest-name">${name}</span>`).join('')}
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

            // Resolve display names (for triple teams, show actual lineup)
            let teamADisplay = match.teams[0];
            let teamBDisplay = match.teams[1];
            if (match.tripleLineup) {
                const lineupStr = match.tripleLineup.join(' / ');
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
                    <span class="${winnerA ? 'team-winner' : ''}">${teamADisplay}</span>
                    <span class="vs-separator">vs</span>
                    <span class="${winnerB ? 'team-winner' : ''}">${teamBDisplay}</span>
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

// Event delegation for match save buttons
document.getElementById('matches-container').addEventListener('click', e => {
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
        // Update individual cumulative scores (undo old, apply new)
        updateScoresForMatch(match, match.scoreA, match.scoreB, a, b);
        match.scoreA = a;
        match.scoreB = b;
        saveState();

        // Flash animation
        row.classList.add('match-row--flash');
        setTimeout(() => row.classList.remove('match-row--flash'), 600);

        // Re-render after flash starts
        setTimeout(() => {
            renderMatches();
            renderScoreboard();
            saveHistorySnapshot();
            updateClearButtons();
        }, 100);
    }
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

    // Apply new result
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

// ===== Shuffle (Fisher-Yates) =====
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ===== Round-Robin (Circle Method) =====
function roundRobin(participants) {
    const n = participants.length;
    if (n < 2) return [];

    const list = [...participants];
    if (n % 2 === 1) list.push(null); // BYE = sit out

    const total = list.length;
    const numRounds = total - 1;
    const half = total / 2;

    const rotating = [];
    for (let i = 1; i < total; i++) rotating.push(i);

    const allMatches = [];

    for (let r = 0; r < numRounds; r++) {
        const pairs = [[0, rotating[rotating.length - 1]]];
        for (let i = 0; i < half - 1; i++) {
            pairs.push([rotating[i], rotating[rotating.length - 2 - i]]);
        }

        for (const [ai, bi] of pairs) {
            const a = list[ai];
            const b = list[bi];
            if (a !== null && b !== null) {
                allMatches.push({
                    teams: [a, b],
                    scoreA: null,
                    scoreB: null,
                    round: r + 1
                });
            }
        }

        rotating.unshift(rotating.pop());
    }

    return allMatches;
}

function makeSchedule() {
    // Shuffle players BEFORE forming pairs so doubles re-pairing actually happens
    const shuffledPlayers = shuffle(state.players);
    const participants = state.settings.mode === 'doubles'
        ? getParticipantsFromList(shuffledPlayers)
        : [...shuffledPlayers];
    const shuffledParticipants = shuffle(participants);
    const matches = roundRobin(shuffledParticipants);

    // Apply courts constraint: limit matches per round to the number of courts
    const maxCourts = state.settings.courts;
    const redistributed = [];
    let currentRound = 1;
    let countInRound = 0;
    matches.forEach(m => {
        if (countInRound >= maxCourts) {
            currentRound++;
            countInRound = 0;
        }
        redistributed.push({ ...m, round: currentRound });
        countInRound++;
    });

    // For doubles with a 3-player team, assign rotating lineups
    if (state.settings.mode === 'doubles') {
        const tripleTeam = participants.find(p => p.split(' / ').length === 3);
        if (tripleTeam) {
            const combos = getTripleCombos(tripleTeam);
            let comboIdx = 0;
            redistributed.forEach(m => {
                const teamIdx = m.teams.indexOf(tripleTeam);
                if (teamIdx !== -1) {
                    const combo = combos[comboIdx % combos.length];
                    m.tripleLineup = combo.playing;
                    m.tripleRest = combo.rest;
                    m.tripleTeamIdx = teamIdx;
                    comboIdx++;
                }
            });
        }
    }

    return redistributed;
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
    renderPlayers();
    renderSettings();
    renderMatches();
    renderScoreboard();
    renderHistory();
    updateGenerateButton();
    updateTabBadge();
    updateClearButtons();
}

// ===== Event: Add Player =====
document.getElementById('add-player-form').addEventListener('submit', e => {
    e.preventDefault();
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value.trim();
    if (name && !state.players.includes(name)) {
        state.players.push(name);
        nameInput.value = '';
        saveState();
        renderPlayers();
        updateClearButtons();
    }
});

// ===== Event: Generate Schedule =====
document.getElementById('generate-btn').addEventListener('click', () => {
    const participants = getParticipants();
    if (participants.length < 2) return;
    state.matches = makeSchedule();
    saveState();
    renderMatches();
    renderScoreboard();
    updateGenerateButton();
    updateTabBadge();
    updateClearButtons();
    switchTab('schedule');
});

// ===== Clear Actions =====
document.getElementById('clear-players-btn').addEventListener('click', () => {
    if (!confirm('ล้างรายชื่อผู้เล่นทั้งหมด?')) return;
    state.players = [];
    state.matches = [];
    saveState();
    renderAll();
});

document.getElementById('clear-schedule-btn').addEventListener('click', () => {
    if (!confirm('ล้างตารางการแข่งขัน?')) return;
    state.matches = [];
    saveState();
    renderAll();
});

document.getElementById('clear-scores-btn').addEventListener('click', () => {
    if (!confirm('ล้างคะแนนสะสมทั้งหมด?')) return;
    state.scores = {};
    saveState();
    renderScoreboard();
    updateClearButtons();
});

document.getElementById('clear-history-btn').addEventListener('click', () => {
    if (!confirm('ล้างประวัติอันดับรายวันทั้งหมด?')) return;
    state.history = {};
    saveState();
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
    saveState();
    renderAll();
    switchTab('settings');
});

// Show/hide clear buttons based on data
function updateClearButtons() {
    document.getElementById('clear-players-btn').style.display =
        state.players.length > 0 ? '' : 'none';
    document.getElementById('clear-schedule-btn').style.display =
        state.matches.length > 0 ? '' : 'none';

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

// Firebase onValue listener (above) handles initial data load + real-time sync
// renderAll() is called automatically when data arrives

// Restore saved tab (UI-only preference, stays in localStorage)
const savedTab = localStorage.getItem('bmActiveTab');
if (savedTab) switchTab(savedTab);
