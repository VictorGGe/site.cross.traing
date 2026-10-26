const express = require('express');
const views = require('../views/admin');
const { formatDateTime } = require('../html');

const MESSAGES = {
  enregistre: 'Modifications enregistrées.',
  cree: 'Séance créée.',
  supprime: 'Élément supprimé.',
  paye: 'Paiement enregistré.',
  annule: 'Inscription annulée.',
  relance: 'E-mails de relance envoyés.',
};

function parseSeance(body) {
  const data = {
    date: String(body.date || ''),
    heure_debut: String(body.heure_debut || ''),
    heure_fin: String(body.heure_fin || ''),
    format_titre: String(body.format_titre || '').trim().slice(0, 120),
    format_description: String(body.format_description || '').trim().slice(0, 1000),
    coach_id: body.coach_id ? Number(body.coach_id) : null,
    min_participants: Math.max(1, parseInt(body.min_participants, 10) || 1),
    max_participants: Math.max(1, parseInt(body.max_participants, 10) || 1),
    prix_cents: Math.round(Math.max(0, parseFloat(String(body.prix).replace(',', '.')) || 0) * 100),
    statut: body.statut === 'annulee' ? 'annulee' : 'ouverte',
  };
  let error = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) error = 'Date invalide.';
  else if (!/^\d{2}:\d{2}$/.test(data.heure_debut) || !/^\d{2}:\d{2}$/.test(data.heure_fin) || data.heure_fin <= data.heure_debut) error = 'Horaires invalides.';
  else if (data.max_participants < data.min_participants) error = 'Le maximum doit être supérieur ou égal au minimum.';
  return { data, error };
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise les formules (injection CSV) et échappe les guillemets
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function adminRoutes({ store, auth, mailer, payments }) {
  const router = express.Router();
  const send = (res, page) => res.send(String(page));
  const msg = (req) => MESSAGES[req.query.ok] || null;

  router.get('/login', (req, res) => (auth.isAdmin(req) ? res.redirect('/admin') : send(res, views.login({}))));

  router.post('/login', (req, res) => {
    const result = auth.checkPassword(req, req.body.password);
    if (!result.ok) return res.status(401).send(String(views.login({ error: result.error })));
    auth.login(res);
    return res.redirect(303, '/admin');
  });

  router.use(auth.requireAdmin);

  router.post('/logout', (req, res) => {
    auth.logout(res);
    res.redirect(303, '/admin/login');
  });

  // ---------- Séances ----------
  router.get('/', (req, res) => send(res, views.dashboard({
    upcoming: store.listUpcomingSeances({ includeCancelled: true }),
    past: store.listPastSeances(),
    stats: store.stats(),
    store,
    msg: req.query.generees !== undefined ? `${req.query.generees} séance(s) ajoutée(s).` : msg(req),
  })));

  router.post('/seances/generer', (req, res) => {
    const n = store.generateSeances();
    res.redirect(303, `/admin?generees=${n}`);
  });

  router.get('/seances/nouvelle', (req, res) => {
    const s = store.getSettings();
    send(res, views.newSeance({
      seance: { heure_debut: s.heure_debut, heure_fin: s.heure_fin, min_participants: s.min_participants, max_participants: s.max_participants, prix_cents: Number(s.prix_cents) },
      coaches: store.listCoaches({ activeOnly: true }),
    }));
  });

  router.post('/seances/nouvelle', (req, res) => {
    const { data, error } = parseSeance(req.body);
    if (error) return res.status(400).send(String(views.newSeance({ seance: data, coaches: store.listCoaches({ activeOnly: true }), error })));
    try {
      const id = store.createSeance(data);
      return res.redirect(303, `/admin/seances/${id}?ok=cree`);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) {
        return res.status(409).send(String(views.newSeance({ seance: data, coaches: store.listCoaches(), error: 'Une séance existe déjà à cette date et cette heure.' })));
      }
      throw err;
    }
  });

  function renderSeance(req, res, extra = {}) {
    const seance = store.getSeance(req.params.id);
    if (!seance) return res.status(404).send('Séance introuvable');
    return send(res, views.seanceDetail({
      seance,
      participants: store.listParticipants(seance.id, { includeCancelled: true }),
      coaches: store.listCoaches(),
      store,
      msg: msg(req),
      ...extra,
    }));
  }

  router.get('/seances/:id', (req, res) => renderSeance(req, res));

  router.post('/seances/:id', (req, res) => {
    const { data, error } = parseSeance(req.body);
    if (error) return renderSeance(req, res.status(400), { error });
    try {
      store.updateSeance(req.params.id, data);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return renderSeance(req, res, { error: 'Une autre séance existe déjà à cette date et cette heure.' });
      throw err;
    }
    return res.redirect(303, `/admin/seances/${req.params.id}?ok=enregistre`);
  });

  router.post('/seances/:id/relancer', async (req, res) => {
    const seance = store.getSeance(req.params.id);
    if (seance && store.isConfirmed(seance)) {
      for (const p of store.listParticipants(seance.id)) {
        if (p.statut === 'inscrit') await mailer.seanceConfirmee(p, seance);
      }
    }
    res.redirect(303, `/admin/seances/${req.params.id}?ok=relance`);
  });

  router.post('/seances/:id/supprimer', (req, res) => {
    const seance = store.getSeance(req.params.id);
    if (seance && seance.nb_payes === 0) store.deleteSeance(seance.id);
    res.redirect(303, '/admin?ok=supprime');
  });

  // ---------- Inscriptions ----------
  router.post('/inscriptions/:id/payer', (req, res) => {
    const i = store.getInscription(req.params.id);
    if (!i) return res.status(404).send('Inscription introuvable');
    const seance = store.getSeance(i.seance_id);
    store.markPaid(i.id, { moyen: 'especes', montantCents: seance.prix_cents });
    return res.redirect(303, `/admin/seances/${i.seance_id}?ok=paye`);
  });

  router.post('/inscriptions/:id/impaye', (req, res) => {
    const i = store.getInscription(req.params.id);
    if (!i) return res.status(404).send('Inscription introuvable');
    store.markUnpaid(i.id);
    return res.redirect(303, `/admin/seances/${i.seance_id}?ok=enregistre`);
  });

  router.post('/inscriptions/:id/annuler', (req, res) => {
    const i = store.getInscription(req.params.id);
    if (!i) return res.status(404).send('Inscription introuvable');
    store.cancelInscription(i.id);
    return res.redirect(303, `/admin/seances/${i.seance_id}?ok=annule`);
  });

  // ---------- Clients ----------
  router.get('/clients', (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q : '';
    send(res, views.clients({ clients: store.listClients(search), search }));
  });

  router.get('/clients.csv', (req, res) => {
    const header = ['Nom', 'Prénom', 'E-mail', 'Téléphone', 'Date de naissance', 'Séances', 'Total payé (€)', 'Client depuis'];
    const rows = store.listClients().map((c) => [
      c.nom, c.prenom, c.email, c.telephone, c.date_naissance, c.nb_seances, (c.total_paye_cents / 100).toFixed(2).replace('.', ','), formatDateTime(c.created_at),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clients-cross-training.csv"');
    res.send(`﻿${csv}`);
  });

  router.get('/clients/:id', (req, res) => {
    const client = store.getClient(req.params.id);
    if (!client) return res.status(404).send('Client introuvable');
    return send(res, views.clientDetail({ client, inscriptions: store.listClientInscriptions(client.id), msg: msg(req) }));
  });

  router.post('/clients/:id', (req, res) => {
    const client = store.getClient(req.params.id);
    if (!client) return res.status(404).send('Client introuvable');
    const b = req.body;
    const data = {
      prenom: String(b.prenom || '').trim(), nom: String(b.nom || '').trim(), email: String(b.email || '').trim().toLowerCase(),
      telephone: String(b.telephone || '').trim(), date_naissance: b.date_naissance || null, notes: String(b.notes || '').trim(),
    };
    const fail = (error) => res.status(400).send(String(views.clientDetail({ client: { ...client, ...data }, inscriptions: store.listClientInscriptions(client.id), error })));
    if (!data.prenom || !data.nom || !data.email || !data.telephone) return fail('Prénom, nom, e-mail et téléphone sont obligatoires.');
    try {
      store.updateClient(client.id, data);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return fail('Un autre client utilise déjà cet e-mail.');
      throw err;
    }
    return res.redirect(303, `/admin/clients/${client.id}?ok=enregistre`);
  });

  router.post('/clients/:id/supprimer', (req, res) => {
    store.deleteClient(req.params.id);
    res.redirect(303, '/admin/clients');
  });

  // ---------- Coachs ----------
  router.get('/coachs', (req, res) => {
    const edit = req.query.edit ? store.getCoach(req.query.edit) : null;
    send(res, views.coaches({ coaches: store.listCoaches(), edit, msg: msg(req) }));
  });

  const saveCoach = (req, res) => {
    const b = req.body;
    if (!String(b.prenom || '').trim() || !String(b.nom || '').trim()) return res.redirect(303, '/admin/coachs');
    store.saveCoach(req.params.id || null, {
      prenom: String(b.prenom).trim(), nom: String(b.nom).trim(), siret: String(b.siret || '').replace(/\s/g, ''),
      email: String(b.email || '').trim(), telephone: String(b.telephone || '').trim(), actif: b.actif === '1',
    });
    return res.redirect(303, '/admin/coachs?ok=enregistre');
  };
  router.post('/coachs', saveCoach);
  router.post('/coachs/:id', saveCoach);

  // ---------- Paramètres ----------
  router.get('/parametres', (req, res) => send(res, views.settingsPage({
    settings: store.getSettings(), msg: msg(req), paymentsEnabled: payments.enabled, mailEnabled: mailer.enabled,
  })));

  router.post('/parametres', (req, res) => {
    const b = req.body;
    const time = (v, d) => (/^\d{2}:\d{2}$/.test(v) ? v : d);
    const current = store.getSettings();
    store.setSettings({
      jour_semaine: String(Math.min(6, Math.max(0, parseInt(b.jour_semaine, 10) || 0))),
      heure_debut: time(b.heure_debut, current.heure_debut),
      heure_fin: time(b.heure_fin, current.heure_fin),
      date_debut: /^\d{4}-\d{2}-\d{2}$/.test(b.date_debut) ? b.date_debut : current.date_debut,
      semaines_a_generer: Math.min(52, Math.max(1, parseInt(b.semaines_a_generer, 10) || 8)),
      prix_cents: Math.round(Math.max(0, parseFloat(String(b.prix).replace(',', '.')) || 0) * 100),
      min_participants: Math.max(1, parseInt(b.min_participants, 10) || 3),
      max_participants: Math.max(1, parseInt(b.max_participants, 10) || 12),
      lieu: String(b.lieu || current.lieu).trim(),
    });
    res.redirect(303, '/admin/parametres?ok=enregistre');
  });

  return router;
}

module.exports = { adminRoutes, parseSeance };
