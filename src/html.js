/** Petit moteur de gabarits : interpolations échappées par défaut, raw() pour du HTML de confiance. */
class Raw {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const raw = (value) => new Raw(String(value));

function escape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escape(value);
}

function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

// ---------- Formatage ----------
const TZ = 'Europe/Paris';

function formatDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}

function formatDateTime(sqliteUtc) {
  if (!sqliteUtc) return '';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(`${sqliteUtc.replace(' ', 'T')}Z`));
}

function formatHeure(hhmm) {
  return hhmm.replace(':', 'h');
}

function formatPrix(cents) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { html, raw, escape, formatDate, formatDateTime, formatHeure, formatPrix, capitalize };
