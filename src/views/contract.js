const { html, formatDate, formatDateTime, formatHeure, formatPrix } = require('../html');
const { cgvContent } = require('./cgv');

function dureeMinutes(debut, fin) {
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

/** Contrat individuel pré-rempli, au format du « Contrat de Personal Training », imprimable en A4. */
function contractPage({ inscription, seance, settings }) {
  const numero = `CT-${String(inscription.id).padStart(4, '0')}`;
  const dateContrat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short' })
    .format(new Date(`${inscription.cgv_acceptees_at.replace(' ', 'T')}Z`));
  const minutes = dureeMinutes(seance.heure_debut, seance.heure_fin);
  const field = (label, value) => html`<div class="c-field"><span class="c-label">${label}</span><span class="c-value">${value || '—'}</span></div>`;

  return html`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Contrat ${numero} · VG Cross Training</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/contract.css">
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimer / enregistrer en PDF</button></div>

  <article class="sheet">
    <header class="c-header">
      <div><p class="c-kicker">Contrat individuel</p><h1>Contrat de Personal Training</h1><p class="c-sub">Cross training collectif</p></div>
      <span class="c-logo">VG</span>
    </header>

    <div class="c-row c-ref">
      ${field('Numéro du contrat', numero)}
      ${field('Date', dateContrat)}
    </div>
    <p class="c-intro">Ce document est un contrat de Personal Training qui lie le Coach et le Client désignés ci-dessous.</p>

    <div class="c-parties">
      <section>
        <h2>Le Coach</h2>
        ${field('Nom', seance.coach_nom)}
        ${field('Prénom', seance.coach_prenom)}
        ${field('Club', settings.lieu)}
        ${field('SIRET', seance.coach_siret)}
      </section>
      <section>
        <h2>Le Client</h2>
        ${field('Nom', inscription.nom)}
        ${field('Prénom', inscription.prenom)}
        ${field('Date de naissance', inscription.date_naissance ? formatDate(inscription.date_naissance, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '')}
        ${field('E-mail', inscription.email)}
        ${field('Téléphone', inscription.telephone)}
      </section>
    </div>

    <h2 class="c-section"><span>1</span>Détails de la prestation</h2>
    <p class="c-intro">Les deux parties définissent ensemble, tel qu'énoncé ci-dessous, le nombre, la durée, la fréquence, les horaires et le prix des séances.</p>
    <div class="c-grid">
      ${field('Formule choisie', 'Cross training collectif — séance à l\'unité')}
      ${field('Séance', `${formatDate(seance.date)} · ${formatHeure(seance.heure_debut)} – ${formatHeure(seance.heure_fin)}`)}
      ${field('Nombre de séances total', '1')}
      ${field('Durée de la séance', `${minutes} min`)}
      ${field('Prix unitaire TTC / séance', formatPrix(seance.prix_cents))}
      ${field('Fréquence des paiements', 'Paiement unique, à la confirmation de la séance')}
      ${field("Durée de l'engagement", 'Sans engagement')}
      ${field('Condition de tenue', `Minimum ${seance.min_participants} participants`)}
      ${field("Droit à l'image", inscription.droit_image ? 'Accepté' : 'Refusé')}
      ${field('Aptitude médicale', inscription.aptitude_medicale ? 'Attestée par le Client' : 'Non attestée')}
    </div>
    <div class="c-total"><span>Prix total TTC du contrat</span><strong>${formatPrix(seance.prix_cents)}</strong></div>
    <p class="c-fine">TVA non applicable, article 293 B du CGI.</p>

    <div class="c-signatures">
      <div><h3>Signature du Client</h3><p>« Lu et approuvé » — accepté électroniquement le ${formatDateTime(inscription.cgv_acceptees_at)} lors de l'inscription en ligne.</p><p class="c-sign">${inscription.prenom} ${inscription.nom}</p></div>
      <div><h3>Signature du Coach</h3><p>« Lu et approuvé »</p><p class="c-sign">${seance.coach_prenom || ''} ${seance.coach_nom || ''}</p></div>
    </div>
  </article>

  <article class="sheet sheet-cgv">
    <header class="c-header"><div><p class="c-kicker">Annexe au contrat</p><h1>Conditions générales de vente</h1></div><span class="c-logo">VG</span></header>
    <div class="cgv">${cgvContent()}</div>
  </article>
</body>
</html>`;
}

module.exports = { contractPage };
