const config = require('./src/config');
const { openDb } = require('./src/db');
const { createMailer } = require('./src/mail');
const { createPayments } = require('./src/payments');
const { createApp } = require('./src/app');

const db = openDb(config.databasePath);
const { app, store } = createApp({ config, db, mailer: createMailer(config), payments: createPayments(config) });

// Crée automatiquement les séances hebdomadaires à venir (sans dupliquer celles qui existent)
function planifier() {
  const created = store.generateSeances();
  if (created) console.log(`[séances] ${created} séance(s) ajoutée(s) au planning.`);
}
planifier();
setInterval(planifier, 12 * 60 * 60 * 1000).unref();

app.listen(config.port, () => {
  console.log(`VG Cross Training en ligne sur ${config.baseUrl}`);
  if (!config.stripeSecretKey) console.warn('[paiement] STRIPE_SECRET_KEY absent : le paiement par carte est désactivé.');
});
