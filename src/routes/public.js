const express = require('express');
const views = require('../views/public');
const { contractPage } = require('../views/contract');
const { InscriptionError } = require('../store');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateInscription(body) {
  const clean = (v, max = 80) => String(v || '').trim().slice(0, max);
  const values = {
    prenom: clean(body.prenom),
    nom: clean(body.nom),
    email: clean(body.email, 160).toLowerCase(),
    telephone: clean(body.telephone, 30),
    date_naissance: /^\d{4}-\d{2}-\d{2}$/.test(body.date_naissance || '') ? body.date_naissance : '',
    aptitude_medicale: body.aptitude_medicale === '1',
    cgv: body.cgv === '1',
    droit_image: body.droit_image === '1' ? '1' : '0',
  };
  let error = null;
  if (!values.prenom || !values.nom) error = 'Merci d\'indiquer votre prénom et votre nom.';
  else if (!EMAIL_RE.test(values.email)) error = 'Merci d\'indiquer une adresse e-mail valide.';
  else if (values.telephone.replace(/\D/g, '').length < 10) error = 'Merci d\'indiquer un numéro de téléphone valide.';
  else if (!values.aptitude_medicale) error = 'Vous devez attester de votre aptitude à la pratique sportive.';
  else if (!values.cgv) error = 'Vous devez accepter les conditions générales de vente.';
  return { values, error };
}

function publicRoutes({ store, mailer, payments }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.send(String(views.home({ seances: store.listUpcomingSeances(), settings: store.getSettings(), store })));
  });

  router.get('/cgv', (req, res) => res.send(String(views.cgvPage())));

  router.get('/seance/:id', (req, res) => {
    const seance = store.getSeance(req.params.id);
    if (!seance || seance.statut !== 'ouverte' || store.isPast(seance)) {
      return res.status(404).send(String(views.notFound("Cette séance n'est pas (ou plus) ouverte aux inscriptions.")));
    }
    return res.send(String(views.seanceForm({ seance, store })));
  });

  router.post('/seance/:id/inscription', async (req, res) => {
    const seance = store.getSeance(req.params.id);
    if (!seance) return res.status(404).send(String(views.notFound()));

    const { values, error } = validateInscription(req.body);
    if (error) return res.status(400).send(String(views.seanceForm({ seance, store, values, error })));

    let result;
    try {
      result = store.register(seance.id, values);
    } catch (err) {
      if (err instanceof InscriptionError) {
        return res.status(409).send(String(views.seanceForm({ seance: store.getSeance(seance.id), store, values, error: err.message })));
      }
      throw err;
    }

    const updated = store.getSeance(seance.id);
    await mailer.inscriptionRecue(result.inscription, updated);
    if (result.justConfirmed) {
      // Le minimum vient d'être atteint : on prévient les autres inscrits que le paiement est ouvert.
      for (const p of store.listParticipants(seance.id)) {
        if (p.id !== result.inscription.id && p.statut === 'inscrit') await mailer.seanceConfirmee(p, updated);
      }
    }
    return res.redirect(303, `/inscription/${result.inscription.token}?nouveau=1`);
  });

  router.get('/inscription/:token', (req, res) => {
    const inscription = store.getInscriptionByToken(req.params.token);
    if (!inscription) return res.status(404).send(String(views.notFound('Inscription introuvable.')));
    const seance = store.getSeance(inscription.seance_id);
    let message = null;
    if (req.query.nouveau) message = { text: 'Votre inscription est enregistrée. Un e-mail de confirmation vous a été envoyé.', kind: 'success' };
    if (req.query.paiement === 'annule') message = { text: "Paiement annulé : aucun montant n'a été débité.", kind: 'info' };
    if (req.query.erreur) message = { text: 'Le paiement n\'a pas pu être lancé. Réessayez dans un instant.', kind: 'error' };
    return res.send(String(views.inscriptionPage({ inscription, seance, store, paymentsEnabled: payments.enabled, message })));
  });

  router.get('/inscription/:token/contrat', (req, res) => {
    const inscription = store.getInscriptionByToken(req.params.token);
    if (!inscription) return res.status(404).send(String(views.notFound('Contrat introuvable.')));
    const seance = store.getSeance(inscription.seance_id);
    return res.send(String(contractPage({ inscription, seance, settings: store.getSettings() })));
  });

  router.post('/inscription/:token/annuler', (req, res) => {
    const inscription = store.getInscriptionByToken(req.params.token);
    if (!inscription) return res.status(404).send(String(views.notFound('Inscription introuvable.')));
    store.cancelInscription(inscription.id);
    return res.redirect(303, `/inscription/${inscription.token}`);
  });

  router.post('/inscription/:token/payer', async (req, res) => {
    const inscription = store.getInscriptionByToken(req.params.token);
    if (!inscription) return res.status(404).send(String(views.notFound('Inscription introuvable.')));
    const seance = store.getSeance(inscription.seance_id);
    const back = `/inscription/${inscription.token}`;
    // Le paiement n'est possible qu'une fois la séance confirmée (minimum de participants atteint).
    if (!payments.enabled || inscription.statut !== 'inscrit' || !store.isConfirmed(seance) || store.isPast(seance)) {
      return res.redirect(303, back);
    }
    try {
      const checkout = await payments.createCheckout(inscription, seance);
      store.setStripeSession(inscription.id, checkout.id);
      return res.redirect(303, checkout.url);
    } catch (err) {
      console.error('[paiement] Création de la session Stripe impossible :', err.message);
      return res.redirect(303, `${back}?erreur=1`);
    }
  });

  router.get('/paiement/succes', async (req, res) => {
    if (!payments.enabled || typeof req.query.session_id !== 'string') return res.redirect('/');
    try {
      const checkout = await payments.getCheckout(req.query.session_id);
      const inscription = store.getInscription(checkout.inscriptionId);
      if (!inscription) return res.status(404).send(String(views.notFound('Inscription introuvable.')));
      if (checkout.paid) await confirmPayment(inscription, checkout);
      return res.send(String(views.paymentResult({ ok: checkout.paid, inscription })));
    } catch (err) {
      console.error('[paiement] Vérification impossible :', err.message);
      return res.status(502).send(String(views.paymentResult({ ok: false, inscription: null })));
    }
  });

  async function confirmPayment(inscription, checkout) {
    if (store.markPaid(inscription.id, { moyen: 'carte', montantCents: checkout.amount, stripeSessionId: checkout.id })) {
      await mailer.paiementRecu(store.getInscription(inscription.id), store.getSeance(inscription.seance_id));
    }
  }

  return { router, confirmPayment };
}

module.exports = { publicRoutes, validateInscription };
