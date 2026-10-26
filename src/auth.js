const crypto = require('node:crypto');

const COOKIE = 'vg_admin';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function createAuth(config) {
  const attempts = new Map(); // limitation simple des tentatives de connexion par IP

  const auth = {
    checkPassword(req, password) {
      const ip = req.ip;
      const entry = attempts.get(ip) || { count: 0, until: 0 };
      if (entry.until > Date.now()) return { ok: false, error: 'Trop de tentatives. Réessayez dans quelques minutes.' };
      if (safeEqual(password || '', config.adminPassword)) {
        attempts.delete(ip);
        return { ok: true };
      }
      entry.count += 1;
      if (entry.count >= 5) { entry.until = Date.now() + 10 * 60 * 1000; entry.count = 0; }
      attempts.set(ip, entry);
      return { ok: false, error: 'Mot de passe incorrect.' };
    },

    login(res) {
      const expires = String(Date.now() + MAX_AGE_MS);
      res.cookie(COOKIE, `${expires}.${sign(expires, config.sessionSecret)}`, {
        httpOnly: true, sameSite: 'strict', secure: config.isProd, maxAge: MAX_AGE_MS, path: '/',
      });
    },

    logout(res) {
      res.clearCookie(COOKIE, { path: '/' });
    },

    isAdmin(req) {
      const value = readCookie(req, COOKIE);
      if (!value) return false;
      const [expires, signature] = value.split('.');
      return Boolean(signature) && safeEqual(signature, sign(expires, config.sessionSecret)) && Number(expires) > Date.now();
    },

    /** Middleware : exige une session admin et bloque les POST venant d'un autre site. */
    requireAdmin(req, res, next) {
      if (!auth.isAdmin(req)) return res.redirect('/admin/login');
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return res.status(403).send('Requête refusée.');
      }
      return next();
    },
  };
  return auth;
}

module.exports = { createAuth };
