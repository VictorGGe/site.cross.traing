const nodemailer = require('nodemailer');
const { formatDate, formatHeure, formatPrix, escape } = require('./html');

function createMailer(config) {
  const enabled = Boolean(config.smtp.host);
  const transport = enabled
    ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
    : null;

  async function send({ to, subject, text, htmlBody }) {
    if (!transport) {
      console.log(`[mail] (SMTP non configuré) À : ${to}\n  Sujet : ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
      return;
    }
    try {
      await transport.sendMail({ from: config.mailFrom, to, subject, text, html: htmlBody });
    } catch (err) {
      console.error(`[mail] Échec d'envoi à ${to} :`, err.message);
    }
  }

  function wrap(title, paragraphs, cta) {
    const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escape(p)}</p>`).join('');
    const button = cta
      ? `<p style="margin:24px 0"><a href="${escape(cta.url)}" style="background:#ff5a1f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${escape(cta.label)}</a></p>`
      : '';
    return `<div style="font-family:Inter,Arial,sans-serif;background:#f4f5f7;padding:24px">
      <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
        <div style="background:#0f172a;color:#fff;padding:18px 24px;font-weight:700;letter-spacing:.04em">VG CROSS TRAINING</div>
        <div style="padding:24px;color:#111827"><h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>${body}${button}</div>
        <div style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px">Basic-Fit · 1 Av. de Saulxures, 54270 Essey-lès-Nancy</div>
      </div></div>`;
  }

  const quand = (s) => `${formatDate(s.date)} de ${formatHeure(s.heure_debut)} à ${formatHeure(s.heure_fin)}`;
  const lien = (i) => `${config.baseUrl}/inscription/${i.token}`;

  return {
    enabled,

    inscriptionRecue(inscription, seance) {
      const manque = Math.max(0, seance.min_participants - seance.nb_inscrits);
      const paras = [
        `Bonjour ${inscription.prenom},`,
        `Votre place pour la séance de cross training du ${quand(seance)} est réservée.`,
        manque > 0
          ? `La séance sera confirmée dès ${seance.min_participants} participants (il en manque ${manque}). Aucun paiement n'est demandé pour l'instant : vous recevrez un e-mail avec le lien de paiement dès la confirmation.`
          : 'La séance est déjà confirmée : vous pouvez régler votre place dès maintenant.',
        'Conservez ce lien, il vous permet de suivre votre inscription et de payer :',
      ];
      return send({
        to: inscription.email,
        subject: `Inscription enregistrée — cross training du ${formatDate(seance.date, { day: 'numeric', month: 'long' })}`,
        text: `${paras.join('\n\n')}\n${lien(inscription)}`,
        htmlBody: wrap('Inscription enregistrée', paras, { url: lien(inscription), label: 'Suivre mon inscription' }),
      });
    },

    seanceConfirmee(inscription, seance) {
      const paras = [
        `Bonjour ${inscription.prenom},`,
        `Bonne nouvelle : la séance du ${quand(seance)} est confirmée !`,
        `Pour valider votre place, réglez ${formatPrix(seance.prix_cents)} par carte bancaire depuis votre page d'inscription.`,
      ];
      return send({
        to: inscription.email,
        subject: `Séance confirmée — paiement ouvert (${formatDate(seance.date, { day: 'numeric', month: 'long' })})`,
        text: `${paras.join('\n\n')}\n\n${lien(inscription)}`,
        htmlBody: wrap('Votre séance est confirmée', paras, { url: lien(inscription), label: `Payer ${formatPrix(seance.prix_cents)}` }),
      });
    },

    paiementRecu(inscription, seance) {
      const paras = [
        `Bonjour ${inscription.prenom},`,
        `Nous avons bien reçu votre paiement de ${formatPrix(inscription.montant_cents)} pour la séance du ${quand(seance)}.`,
        'Pensez à venir en tenue de sport, avec une bouteille d\'eau et une serviette. À très vite !',
      ];
      return send({
        to: inscription.email,
        subject: `Paiement reçu — cross training du ${formatDate(seance.date, { day: 'numeric', month: 'long' })}`,
        text: paras.join('\n\n'),
        htmlBody: wrap('Paiement reçu', paras, { url: lien(inscription), label: 'Voir mon inscription' }),
      });
    },
  };
}

module.exports = { createMailer };
