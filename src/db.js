const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coaches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  prenom     TEXT NOT NULL,
  nom        TEXT NOT NULL,
  siret      TEXT,
  email      TEXT,
  telephone  TEXT,
  actif      INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  prenom         TEXT NOT NULL,
  nom            TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  telephone      TEXT NOT NULL,
  date_naissance TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seances (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  date               TEXT NOT NULL,             -- AAAA-MM-JJ
  heure_debut        TEXT NOT NULL,             -- HH:MM
  heure_fin          TEXT NOT NULL,
  format_titre       TEXT NOT NULL DEFAULT 'Cross training',
  format_description TEXT,
  coach_id           INTEGER REFERENCES coaches(id) ON DELETE SET NULL,
  min_participants   INTEGER NOT NULL DEFAULT 3,
  max_participants   INTEGER NOT NULL DEFAULT 12,
  prix_cents         INTEGER NOT NULL,
  statut             TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'annulee')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (date, heure_debut)
);

CREATE TABLE IF NOT EXISTS inscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  seance_id         INTEGER NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  client_id         INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token             TEXT NOT NULL UNIQUE,
  statut            TEXT NOT NULL DEFAULT 'inscrit' CHECK (statut IN ('inscrit', 'payee', 'annulee')),
  cgv_acceptees_at  TEXT NOT NULL,
  aptitude_medicale INTEGER NOT NULL DEFAULT 0,
  droit_image       INTEGER NOT NULL DEFAULT 0,
  montant_cents     INTEGER,
  moyen_paiement    TEXT,                       -- carte | especes | autre
  stripe_session_id TEXT,
  paid_at           TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (seance_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_inscriptions_seance ON inscriptions(seance_id);
CREATE INDEX IF NOT EXISTS idx_seances_date ON seances(date);
`;

const DEFAULT_SETTINGS = {
  // Créneau hebdomadaire : le mercredi de 17h30 à 18h30
  jour_semaine: '3',
  heure_debut: '17:30',
  heure_fin: '18:30',
  date_debut: '2026-11-04',
  min_participants: '3',
  max_participants: '12',
  prix_cents: '1500',
  semaines_a_generer: '8',
  lieu: 'Basic-Fit — 1 Av. de Saulxures, 54270 Essey-lès-Nancy',
};

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM coaches').get();
  if (n === 0) {
    db.prepare('INSERT INTO coaches (prenom, nom, siret) VALUES (?, ?, ?)')
      .run('Victor', 'GEOFFROY', '10814643200019');
  }
  return db;
}

/** Exécute fn dans une transaction (BEGIN IMMEDIATE pour éviter les surréservations). */
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
