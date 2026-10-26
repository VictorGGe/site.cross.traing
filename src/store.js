const crypto = require('node:crypto');
const { transaction } = require('./db');

const TZ = 'Europe/Paris';

/** Date du jour (AAAA-MM-JJ) dans le fuseau de Paris. */
function todayParis(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Heure courante (HH:MM) dans le fuseau de Paris. */
function nowTimeParis(now = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekday(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

class InscriptionError extends Error {}

function createStore(db) {
  const SEANCE_SELECT = `
    SELECT s.*,
           c.prenom AS coach_prenom, c.nom AS coach_nom, c.siret AS coach_siret,
           (SELECT COUNT(*) FROM inscriptions i WHERE i.seance_id = s.id AND i.statut != 'annulee') AS nb_inscrits,
           (SELECT COUNT(*) FROM inscriptions i WHERE i.seance_id = s.id AND i.statut = 'payee') AS nb_payes
    FROM seances s
    LEFT JOIN coaches c ON c.id = s.coach_id`;

  const store = {
    // ---------- Paramètres ----------
    getSettings() {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },

    setSettings(values) {
      const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(values)) stmt.run(k, String(v));
    },

    // ---------- Séances ----------
    /** Crée les séances hebdomadaires manquantes pour les N prochaines semaines. */
    generateSeances(weeks) {
      const s = store.getSettings();
      const nbWeeks = Number(weeks || s.semaines_a_generer) || 8;
      const jour = Number(s.jour_semaine);
      let date = s.date_debut > todayParis() ? s.date_debut : todayParis();
      while (weekday(date) !== jour) date = addDays(date, 1);

      const insert = db.prepare(`INSERT OR IGNORE INTO seances
        (date, heure_debut, heure_fin, min_participants, max_participants, prix_cents, coach_id)
        VALUES (?, ?, ?, ?, ?, ?, (SELECT id FROM coaches WHERE actif = 1 ORDER BY id LIMIT 1))`);
      let created = 0;
      for (let w = 0; w < nbWeeks; w++) {
        const r = insert.run(date, s.heure_debut, s.heure_fin, Number(s.min_participants), Number(s.max_participants), Number(s.prix_cents));
        created += Number(r.changes);
        date = addDays(date, 7);
      }
      return created;
    },

    listUpcomingSeances({ includeCancelled = false } = {}) {
      const where = includeCancelled ? '' : "AND s.statut = 'ouverte'";
      return db.prepare(`${SEANCE_SELECT} WHERE s.date >= ? ${where} ORDER BY s.date, s.heure_debut`).all(todayParis());
    },

    listPastSeances(limit = 50) {
      return db.prepare(`${SEANCE_SELECT} WHERE s.date < ? ORDER BY s.date DESC, s.heure_debut DESC LIMIT ?`).all(todayParis(), limit);
    },

    getSeance(id) {
      return db.prepare(`${SEANCE_SELECT} WHERE s.id = ?`).get(Number(id)) || null;
    },

    createSeance(data) {
      const r = db.prepare(`INSERT INTO seances
        (date, heure_debut, heure_fin, format_titre, format_description, coach_id, min_participants, max_participants, prix_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        data.date, data.heure_debut, data.heure_fin, data.format_titre || 'Cross training', data.format_description || null,
        data.coach_id || null, data.min_participants, data.max_participants, data.prix_cents,
      );
      return Number(r.lastInsertRowid);
    },

    updateSeance(id, data) {
      db.prepare(`UPDATE seances SET date = ?, heure_debut = ?, heure_fin = ?, format_titre = ?, format_description = ?,
        coach_id = ?, min_participants = ?, max_participants = ?, prix_cents = ?, statut = ? WHERE id = ?`).run(
        data.date, data.heure_debut, data.heure_fin, data.format_titre || 'Cross training', data.format_description || null,
        data.coach_id || null, data.min_participants, data.max_participants, data.prix_cents, data.statut, Number(id),
      );
    },

    deleteSeance(id) {
      db.prepare('DELETE FROM seances WHERE id = ?').run(Number(id));
    },

    /** La séance a-t-elle atteint son minimum de participants ? */
    isConfirmed(seance) {
      return seance.statut === 'ouverte' && seance.nb_inscrits >= seance.min_participants;
    },

    isPast(seance) {
      const today = todayParis();
      return seance.date < today || (seance.date === today && seance.heure_debut <= nowTimeParis());
    },

    // ---------- Inscriptions ----------
    /**
     * Inscrit un client à une séance. Retourne { inscription, justConfirmed }.
     * justConfirmed = true si cette inscription fait atteindre le minimum de participants.
     */
    register(seanceId, form) {
      return transaction(db, () => {
        const seance = store.getSeance(seanceId);
        if (!seance || seance.statut !== 'ouverte') throw new InscriptionError("Cette séance n'est pas ouverte aux inscriptions.");
        if (store.isPast(seance)) throw new InscriptionError('Cette séance est déjà passée.');
        if (seance.nb_inscrits >= seance.max_participants) throw new InscriptionError('Cette séance est complète.');

        let client = db.prepare('SELECT * FROM clients WHERE email = ?').get(form.email);
        if (client) {
          db.prepare(`UPDATE clients SET prenom = ?, nom = ?, telephone = ?, date_naissance = COALESCE(?, date_naissance),
            updated_at = datetime('now') WHERE id = ?`).run(form.prenom, form.nom, form.telephone, form.date_naissance || null, client.id);
        } else {
          const r = db.prepare('INSERT INTO clients (prenom, nom, email, telephone, date_naissance) VALUES (?, ?, ?, ?, ?)')
            .run(form.prenom, form.nom, form.email, form.telephone, form.date_naissance || null);
          client = { id: Number(r.lastInsertRowid) };
        }

        const existing = db.prepare('SELECT * FROM inscriptions WHERE seance_id = ? AND client_id = ?').get(seance.id, client.id);
        const token = crypto.randomBytes(24).toString('base64url');
        if (existing && existing.statut !== 'annulee') {
          throw new InscriptionError('Vous êtes déjà inscrit(e) à cette séance. Retrouvez votre lien d\'inscription dans l\'e-mail de confirmation.');
        }
        if (existing) {
          db.prepare(`UPDATE inscriptions SET statut = 'inscrit', token = ?, cgv_acceptees_at = datetime('now'),
            aptitude_medicale = ?, droit_image = ?, created_at = datetime('now') WHERE id = ?`)
            .run(token, form.aptitude_medicale ? 1 : 0, form.droit_image === '1' ? 1 : 0, existing.id);
        } else {
          db.prepare(`INSERT INTO inscriptions (seance_id, client_id, token, cgv_acceptees_at, aptitude_medicale, droit_image)
            VALUES (?, ?, ?, datetime('now'), ?, ?)`)
            .run(seance.id, client.id, token, form.aptitude_medicale ? 1 : 0, form.droit_image === '1' ? 1 : 0);
        }

        const after = seance.nb_inscrits + 1;
        return {
          inscription: store.getInscriptionByToken(token),
          justConfirmed: seance.nb_inscrits < seance.min_participants && after >= seance.min_participants,
        };
      });
    },

    getInscriptionByToken(token) {
      if (!token || typeof token !== 'string') return null;
      return db.prepare(`SELECT i.*, cl.prenom, cl.nom, cl.email, cl.telephone, cl.date_naissance
        FROM inscriptions i JOIN clients cl ON cl.id = i.client_id WHERE i.token = ?`).get(token) || null;
    },

    getInscription(id) {
      return db.prepare(`SELECT i.*, cl.prenom, cl.nom, cl.email, cl.telephone, cl.date_naissance
        FROM inscriptions i JOIN clients cl ON cl.id = i.client_id WHERE i.id = ?`).get(Number(id)) || null;
    },

    listParticipants(seanceId, { includeCancelled = false } = {}) {
      const where = includeCancelled ? '' : "AND i.statut != 'annulee'";
      return db.prepare(`SELECT i.*, cl.prenom, cl.nom, cl.email, cl.telephone
        FROM inscriptions i JOIN clients cl ON cl.id = i.client_id
        WHERE i.seance_id = ? ${where} ORDER BY i.created_at, i.id`).all(Number(seanceId));
    },

    cancelInscription(id) {
      const r = db.prepare("UPDATE inscriptions SET statut = 'annulee' WHERE id = ? AND statut = 'inscrit'").run(Number(id));
      return Number(r.changes) > 0;
    },

    markPaid(id, { moyen, montantCents, stripeSessionId = null }) {
      const r = db.prepare(`UPDATE inscriptions SET statut = 'payee', moyen_paiement = ?, montant_cents = ?,
        stripe_session_id = COALESCE(?, stripe_session_id), paid_at = datetime('now')
        WHERE id = ? AND statut = 'inscrit'`).run(moyen, montantCents, stripeSessionId, Number(id));
      return Number(r.changes) > 0;
    },

    markUnpaid(id) {
      db.prepare(`UPDATE inscriptions SET statut = 'inscrit', moyen_paiement = NULL, montant_cents = NULL, paid_at = NULL
        WHERE id = ? AND statut = 'payee' AND moyen_paiement != 'carte'`).run(Number(id));
    },

    setStripeSession(id, stripeSessionId) {
      db.prepare('UPDATE inscriptions SET stripe_session_id = ? WHERE id = ?').run(stripeSessionId, Number(id));
    },

    // ---------- Clients ----------
    listClients(search = '') {
      const q = `%${search.trim()}%`;
      return db.prepare(`SELECT cl.*,
          (SELECT COUNT(*) FROM inscriptions i WHERE i.client_id = cl.id AND i.statut != 'annulee') AS nb_seances,
          (SELECT COALESCE(SUM(i.montant_cents), 0) FROM inscriptions i WHERE i.client_id = cl.id AND i.statut = 'payee') AS total_paye_cents
        FROM clients cl
        WHERE (cl.nom LIKE ? OR cl.prenom LIKE ? OR cl.email LIKE ? OR cl.telephone LIKE ?)
        ORDER BY cl.nom COLLATE NOCASE, cl.prenom COLLATE NOCASE`).all(q, q, q, q);
    },

    getClient(id) {
      return db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(id)) || null;
    },

    listClientInscriptions(clientId) {
      return db.prepare(`SELECT i.*, s.date, s.heure_debut, s.heure_fin, s.format_titre
        FROM inscriptions i JOIN seances s ON s.id = i.seance_id
        WHERE i.client_id = ? ORDER BY s.date DESC`).all(Number(clientId));
    },

    updateClient(id, data) {
      db.prepare(`UPDATE clients SET prenom = ?, nom = ?, email = ?, telephone = ?, date_naissance = ?, notes = ?,
        updated_at = datetime('now') WHERE id = ?`).run(
        data.prenom, data.nom, data.email, data.telephone, data.date_naissance || null, data.notes || null, Number(id),
      );
    },

    deleteClient(id) {
      db.prepare('DELETE FROM clients WHERE id = ?').run(Number(id));
    },

    // ---------- Coachs ----------
    listCoaches({ activeOnly = false } = {}) {
      return db.prepare(`SELECT * FROM coaches ${activeOnly ? 'WHERE actif = 1' : ''} ORDER BY actif DESC, nom, prenom`).all();
    },

    getCoach(id) {
      return db.prepare('SELECT * FROM coaches WHERE id = ?').get(Number(id)) || null;
    },

    saveCoach(id, data) {
      const values = [data.prenom, data.nom, data.siret || null, data.email || null, data.telephone || null, data.actif ? 1 : 0];
      if (id) {
        db.prepare('UPDATE coaches SET prenom = ?, nom = ?, siret = ?, email = ?, telephone = ?, actif = ? WHERE id = ?').run(...values, Number(id));
        return Number(id);
      }
      return Number(db.prepare('INSERT INTO coaches (prenom, nom, siret, email, telephone, actif) VALUES (?, ?, ?, ?, ?, ?)').run(...values).lastInsertRowid);
    },

    // ---------- Tableau de bord ----------
    stats() {
      const today = todayParis();
      return {
        clients: db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,
        seancesAVenir: db.prepare("SELECT COUNT(*) AS n FROM seances WHERE date >= ? AND statut = 'ouverte'").get(today).n,
        inscriptionsAVenir: db.prepare(`SELECT COUNT(*) AS n FROM inscriptions i JOIN seances s ON s.id = i.seance_id
          WHERE s.date >= ? AND i.statut != 'annulee'`).get(today).n,
        encaisseCents: db.prepare("SELECT COALESCE(SUM(montant_cents), 0) AS n FROM inscriptions WHERE statut = 'payee'").get().n,
      };
    },
  };
  return store;
}

module.exports = { createStore, InscriptionError, todayParis, addDays, weekday };
