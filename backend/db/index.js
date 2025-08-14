// backend/db/index.js
import Database from 'better-sqlite3';

// Initialize database
const db = new Database('./data.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Base schema
db.exec(`
CREATE TABLE IF NOT EXISTS node (
  id              INTEGER PRIMARY KEY,
  parent_id       INTEGER REFERENCES node(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('GIVEN','WHEN_GROUP','WHEN')),
  title           TEXT NOT NULL,
  description     TEXT,
  sort            INTEGER NOT NULL DEFAULT 0,
  explicit_status TEXT CHECK (explicit_status IN ('to do','in progress','done','cancelled')),
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_node_parent ON node(parent_id);
CREATE INDEX IF NOT EXISTS idx_node_type   ON node(type);

CREATE TABLE IF NOT EXISTS node_tag (
  node_id   INTEGER NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  tag       TEXT    NOT NULL,
  op        TEXT    NOT NULL CHECK (op IN ('add','remove')),
  PRIMARY KEY (node_id, tag, op)
);

CREATE INDEX IF NOT EXISTS idx_node_tag_node ON node_tag(node_id);
CREATE INDEX IF NOT EXISTS idx_node_tag_tag  ON node_tag(tag);
`);

// Lightweight migration for adding 'cancelled' to CHECK constraint if missing
try {
  const tbl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='node'").get();
  const sql = tbl?.sql || '';
  if (sql.includes("explicit_status IN ('to do','in progress','done')") && !sql.includes('cancelled')) {
    db.pragma('foreign_keys = OFF');
    const tx = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS node_mig (
          id              INTEGER PRIMARY KEY,
          parent_id       INTEGER REFERENCES node_mig(id) ON DELETE CASCADE,
          type            TEXT NOT NULL CHECK (type IN ('GIVEN','WHEN_GROUP','WHEN')),
          title           TEXT NOT NULL,
          description     TEXT,
          sort            INTEGER NOT NULL DEFAULT 0,
          explicit_status TEXT CHECK (explicit_status IN ('to do','in progress','done','cancelled')),
          version         INTEGER NOT NULL DEFAULT 1,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      db.exec(`
        INSERT INTO node_mig (id, parent_id, type, title, description, sort, explicit_status, version, created_at, updated_at)
        SELECT id, parent_id, type, title, description, sort, explicit_status, version, created_at, updated_at FROM node;
      `);
      db.exec('DROP TABLE node;');
      db.exec('ALTER TABLE node_mig RENAME TO node;');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_node_parent ON node(parent_id);
        CREATE INDEX IF NOT EXISTS idx_node_type   ON node(type);
      `);
    });
    tx();
  }
} finally {
  db.pragma('foreign_keys = ON');
}

// Seed data (one root GIVEN) if empty
const rowCount = db.prepare('SELECT COUNT(*) AS c FROM node').get().c;
if (rowCount === 0) {
  db.prepare(`
    INSERT INTO node (parent_id, type, title, sort, explicit_status)
    VALUES (NULL,'GIVEN','Root GIVEN',0,'to do')
  `).run();
}

export default db;
