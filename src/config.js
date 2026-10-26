const path = require('node:path');
const fs = require('node:fs');

// Chargement minimal d'un fichier .env (sans dépendance externe)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET)) {
  console.error('ADMIN_PASSWORD et SESSION_SECRET sont obligatoires en production.');
  process.exit(1);
}

const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  baseUrl: (process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/$/, ''),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-a-changer',
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'cross-training.db'),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mailFrom: process.env.MAIL_FROM || 'VG Cross Training <no-reply@localhost>',
  timeZone: 'Europe/Paris',
};

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[config] ADMIN_PASSWORD non défini : mot de passe admin de développement « admin ».');
}

module.exports = config;
