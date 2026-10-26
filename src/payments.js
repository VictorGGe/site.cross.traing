const Stripe = require('stripe');
const { formatDate, formatHeure } = require('./html');

/** Paiement par carte via Stripe Checkout (page de paiement hébergée et sécurisée). */
function createPayments(config) {
  if (!config.stripeSecretKey) return { enabled: false };
  const stripe = new Stripe(config.stripeSecretKey);

  return {
    enabled: true,

    async createCheckout(inscription, seance) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        locale: 'fr',
        customer_email: inscription.email,
        client_reference_id: String(inscription.id),
        metadata: { inscription_id: String(inscription.id), seance_id: String(seance.id) },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: seance.prix_cents,
            product_data: {
              name: `Cross training — ${formatDate(seance.date, { weekday: 'long', day: 'numeric', month: 'long' })}`,
              description: `${formatHeure(seance.heure_debut)} – ${formatHeure(seance.heure_fin)} · ${seance.format_titre}`,
            },
          },
        }],
        success_url: `${config.baseUrl}/paiement/succes?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.baseUrl}/inscription/${inscription.token}?paiement=annule`,
      });
      return { id: session.id, url: session.url };
    },

    /** Retourne { paid, inscriptionId, amount } pour une session Checkout. */
    async getCheckout(sessionId) {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      return { paid: s.payment_status === 'paid', inscriptionId: Number(s.metadata?.inscription_id), amount: s.amount_total, id: s.id };
    },

    /** Vérifie la signature d'un webhook ; retourne l'événement ou lève une erreur. */
    parseWebhook(rawBody, signature) {
      if (!config.stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET non configuré');
      return stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
    },
  };
}

module.exports = { createPayments };
