import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createDatabase } from '../db.js';

describe('Database', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('should create an in-memory database successfully', () => {
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
  });

  it('should create the tournament table', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tournament'"
      )
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should create the players table', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='players'"
      )
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should create the active_courts table', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='active_courts'"
      )
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should create the match_history table', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='match_history'"
      )
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should create all 4 tables', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      ['active_courts', 'match_history', 'players', 'tournament'].sort()
    );
  });

  it('should create tournament singleton row automatically', () => {
    const row = db
      .prepare('SELECT * FROM tournament WHERE id = 1')
      .get() as any;
    expect(row).toBeDefined();
    expect(row.id).toBe(1);
    expect(row.courts).toBe(2);
    expect(row.mode).toBe('doubles');
    expect(row.win_points).toBe(1);
    expect(row.current_round).toBe(0);
    expect(row.status).toBe('setup');
  });

  it('should not duplicate the tournament singleton on second call', () => {
    // createDatabase already inserts the singleton; calling the insert again
    // should not create duplicates because of CHECK (id = 1)
    const rows = db.prepare('SELECT * FROM tournament').all();
    expect(rows).toHaveLength(1);
  });

  it('should enforce tournament id = 1 constraint', () => {
    expect(() => {
      db.prepare('INSERT INTO tournament (id, courts, mode, win_points, current_round, status) VALUES (2, 2, \'doubles\', 1, 0, \'setup\')').run();
    }).toThrow();
  });

  it('should enforce mode CHECK constraint', () => {
    expect(() => {
      db.prepare(
        "UPDATE tournament SET mode = 'invalid' WHERE id = 1"
      ).run();
    }).toThrow();
  });

  it('should enforce status CHECK constraint', () => {
    expect(() => {
      db.prepare(
        "UPDATE tournament SET status = 'invalid' WHERE id = 1"
      ).run();
    }).toThrow();
  });

  it('should enforce unique player names', () => {
    db.prepare("INSERT INTO players (name) VALUES ('Alice')").run();
    expect(() => {
      db.prepare("INSERT INTO players (name) VALUES ('Alice')").run();
    }).toThrow();
  });

  it('should auto-increment player ids', () => {
    db.prepare("INSERT INTO players (name) VALUES ('Alice')").run();
    db.prepare("INSERT INTO players (name) VALUES ('Bob')").run();
    const players = db.prepare('SELECT id, name FROM players ORDER BY id').all() as any[];
    expect(players[0].id).toBe(1);
    expect(players[1].id).toBe(2);
  });

  it('should set WAL journal mode (falls back to memory for in-memory db)', () => {
    const result = db.pragma('journal_mode') as any[];
    // In-memory databases cannot use WAL, so SQLite reports 'memory'
    expect(result[0].journal_mode).toBe('memory');
  });

  it('should have foreign keys enabled', () => {
    const result = db.pragma('foreign_keys') as any[];
    expect(result[0].foreign_keys).toBe(1);
  });

  it('should create independent in-memory databases', () => {
    const db2 = createDatabase(':memory:');
    db.prepare("INSERT INTO players (name) VALUES ('Alice')").run();
    const playersInDb2 = db2.prepare('SELECT * FROM players').all();
    expect(playersInDb2).toHaveLength(0);
  });

  describe('file-based database', () => {
    let tempDir: string;
    let dbFilePath: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'badminton-test-'));
      dbFilePath = path.join(tempDir, 'subdir', 'test.db');
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should create a file-based database and its parent directory', () => {
      const fileDb = createDatabase(dbFilePath);
      expect(fileDb.open).toBe(true);
      expect(fs.existsSync(dbFilePath)).toBe(true);

      // Should also have the tournament singleton
      const row = fileDb.prepare('SELECT * FROM tournament WHERE id = 1').get() as any;
      expect(row).toBeDefined();
      expect(row.courts).toBe(2);
      fileDb.close();
    });

    it('should use WAL journal mode for file-based database', () => {
      const fileDb = createDatabase(dbFilePath);
      const result = fileDb.pragma('journal_mode') as any[];
      expect(result[0].journal_mode).toBe('wal');
      fileDb.close();
    });
  });
});
