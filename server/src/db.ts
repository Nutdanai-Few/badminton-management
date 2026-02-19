import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tournament (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  courts INTEGER NOT NULL DEFAULT 2,
  mode TEXT NOT NULL DEFAULT 'doubles' CHECK (mode IN ('singles', 'doubles')),
  win_points INTEGER NOT NULL DEFAULT 1,
  current_round INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'playing')),
  player_queue TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS active_courts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  court_number INTEGER NOT NULL,
  team_a_player_ids TEXT NOT NULL,
  team_b_player_ids TEXT NOT NULL,
  score_a INTEGER,
  score_b INTEGER,
  round_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS match_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_number INTEGER NOT NULL,
  court_number INTEGER NOT NULL,
  team_a_names TEXT NOT NULL,
  team_b_names TEXT NOT NULL,
  score_a INTEGER NOT NULL,
  score_b INTEGER NOT NULL,
  winner TEXT NOT NULL CHECK (winner IN ('a', 'b')),
  played_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function createDatabase(dbPath?: string): Database.Database {
  let db: Database.Database;

  if (dbPath === ':memory:') {
    db = new Database(':memory:');
  } else {
    const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'badminton.db');
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(resolvedPath);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  // Ensure tournament singleton row exists
  const row = db.prepare('SELECT id FROM tournament WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT INTO tournament (id) VALUES (1)').run();
  }

  return db;
}
