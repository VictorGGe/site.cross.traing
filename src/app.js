const path = require('node:path');
const express = require('express');
const { createStore } = require('./store');
const { createAuth } = require('./auth');
const { publicRoutes } = require('./routes/public');
const { adminRoutes } = require('./routes/admin');
const { notFound } = require('./views/public');

function createApp({ config, db, mailer, payments }) {
  const store = createStore(db);
  const auth = createAuth(config);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  const pub = publicRoutes({ store, mailer, payments });

  // Webhook Stripe : corps brut nécessaire pour vérifier la signature
  app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!payments.enabled) return res.sendStatus(404);
    let event;
    try {
      event = payments.parseWebhook(req.body, req.headers['stripe-signature']);
    } catch (err) {
      return res.status(400).send(`Webhook invalide : ${err.message}`);
    }
    if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
      const s = event.data.object;
      const inscription = store.getInscription(Number(s.metadata?.inscription_id));
      if (inscription) await pub.confirmPayment(inscription, { amount: s.amount_total, id: s.id });
    }
    return res.json({ received: true });
  });

  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

  app.use('/', pub.router);
  app.use('/admin', adminRoutes({ store, auth, mailer, payments }));

  app.use((req, res) => res.status(404).send(String(notFound())));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send(String(notFound('Une erreur est survenue. Merci de réessayer.')));
  });

  return { app, store };
}

module.exports = { createApp };
