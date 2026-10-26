const { html, formatDate, formatDateTime, formatHeure, formatPrix, capitalize } = require('../html');
const { publicPage, flash } = require('./layout');
const { cgvContent } = require('./cgv');

function coachName(s) {
  return s.coach_prenom ? `${s.coach_prenom} ${s.coach_nom}` : 'Coach à confirmer';
}

function seanceStatus(seance, confirmed) {
  if (seance.statut === 'annulee') return html`<span class="badge badge-danger">Annulée</span>`;
  if (seance.nb_inscrits >= seance.max_participants) return html`<span class="badge badge-dark">Complet</span>`;
  if (confirmed) return html`<span class="badge badge-success">Confirmée</span>`;
  const manque = seance.min_participants - seance.nb_inscrits;
  return html`<span class="badge badge-warning">Encore ${manque} inscrit${manque > 1 ? 's' : ''} pour confirmer</span>`;
}

function progress(seance) {
  const pct = Math.min(100, Math.round((seance.nb_inscrits / seance.min_participants) * 100));
  return html`
    <div class="progress" aria-label="${seance.nb_inscrits} inscrit(s) sur ${seance.min_participants} minimum">
      <div class="progress-bar ${pct >= 100 ? 'is-full' : ''}" style="width:${pct}%"></div>
    </div>
    <div class="progress-legend"><span>${seance.nb_inscrits} inscrit${seance.nb_inscrits > 1 ? 's' : ''}</span><span>min. ${seance.min_participants} · max. ${seance.max_participants}</span></div>`;
}

function dateBlock(iso) {
  const jour = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
  return html`<div class="date-block"><span class="date-day">${jour}</span><span class="date-month">${mois}</span></div>`;
}

function home({ seances, settings, store }) {
  const cards = seances.map((s) => {
    const confirmed = store.isConfirmed(s);
    const full = s.nb_inscrits >= s.max_participants;
    return html`
      <article class="seance-card">
        ${dateBlock(s.date)}
        <div class="seance-body">
          <div class="seance-top">
            <p class="eyebrow">${capitalize(formatDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' }))} · ${formatHeure(s.heure_debut)} – ${formatHeure(s.heure_fin)}</p>
            ${seanceStatus(s, confirmed)}
          </div>
          <h3>${s.format_titre}</h3>
          ${s.format_description ? html`<p class="muted">${s.format_description}</p>` : html`<p class="muted">Format dévoilé par le coach : chaque séance est différente.</p>`}
          <p class="seance-meta"><span>Coach : <strong>${coachName(s)}</strong></span><span>${formatPrix(s.prix_cents)} la séance</span></p>
          ${progress(s)}
        </div>
        <div class="seance-cta">
          ${full ? html`<span class="btn btn-disabled">Complet</span>` : html`<a class="btn btn-primary" href="/seance/${s.id}">S'inscrire</a>`}
        </div>
      </article>`;
  });

  return publicPage({
    title: 'Inscriptions',
    description: 'Séances de cross training collectives chaque mercredi de 17h30 à 18h30 au Basic-Fit d\'Essey-lès-Nancy.',
    body: html`
      <section class="hero">
        <div class="container hero-inner">
          <p class="hero-kicker">Basic-Fit · Essey-lès-Nancy</p>
          <h1>Cross training<br><span>tous les mercredis</span></h1>
          <p class="hero-sub">De ${formatHeure(settings.heure_debut)} à ${formatHeure(settings.heure_fin)}, en petit groupe et encadré par un coach diplômé. Un format différent à chaque séance.</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#seances">Voir les séances</a>
            <span class="hero-price">${formatPrix(Number(settings.prix_cents))} <small>/ séance</small></span>
          </div>
        </div>
      </section>

      <section id="fonctionnement" class="section">
        <div class="container">
          <h2 class="section-title">Comment ça marche</h2>
          <ol class="steps">
            <li><span class="step-num">1</span><h3>Je m'inscris</h3><p>Je choisis ma séance et je réserve ma place. Aucun paiement n'est demandé à ce stade.</p></li>
            <li><span class="step-num">2</span><h3>La séance est confirmée</h3><p>Dès que <strong>${settings.min_participants} participants</strong> sont inscrits, la séance est confirmée et je reçois un e-mail.</p></li>
            <li><span class="step-num">3</span><h3>Je paie en ligne</h3><p>Le paiement par carte bancaire s'ouvre sur ma page d'inscription, sur une page sécurisée.</p></li>
          </ol>
        </div>
      </section>

      <section id="seances" class="section section-alt">
        <div class="container">
          <h2 class="section-title">Prochaines séances</h2>
          ${cards.length ? html`<div class="seance-list">${cards}</div>`
            : html`<div class="empty">Aucune séance programmée pour le moment. Revenez bientôt !</div>`}
        </div>
      </section>`,
  });
}

function seanceForm({ seance, store, values = {}, error = null }) {
  const confirmed = store.isConfirmed(seance);
  const v = (k) => values[k] || '';
  return publicPage({
    title: `Inscription du ${formatDate(seance.date, { day: 'numeric', month: 'long' })}`,
    body: html`
      <section class="section">
        <div class="container narrow">
          <a class="back" href="/#seances">← Toutes les séances</a>
          <div class="panel seance-summary">
            ${dateBlock(seance.date)}
            <div>
              <p class="eyebrow">${capitalize(formatDate(seance.date))} · ${formatHeure(seance.heure_debut)} – ${formatHeure(seance.heure_fin)}</p>
              <h1 class="h2">${seance.format_titre}</h1>
              ${seance.format_description ? html`<p class="muted">${seance.format_description}</p>` : ''}
              <p class="seance-meta"><span>Coach : <strong>${coachName(seance)}</strong></span><span>${formatPrix(seance.prix_cents)}</span>${seanceStatus(seance, confirmed)}</p>
              ${progress(seance)}
            </div>
          </div>

          <div class="callout">
            <strong>Pas de paiement maintenant.</strong> La séance a lieu à partir de ${seance.min_participants} participants.
            Dès qu'elle est confirmée, vous recevez un e-mail avec le lien de paiement par carte.
          </div>

          ${error ? flash(error, 'error') : ''}

          <form class="panel form" method="post" action="/seance/${seance.id}/inscription" novalidate>
            <h2 class="h3">Vos coordonnées</h2>
            <div class="grid-2">
              <label>Prénom <input name="prenom" required autocomplete="given-name" value="${v('prenom')}"></label>
              <label>Nom <input name="nom" required autocomplete="family-name" value="${v('nom')}"></label>
              <label>E-mail <input type="email" name="email" required autocomplete="email" value="${v('email')}"></label>
              <label>Téléphone <input type="tel" name="telephone" required autocomplete="tel" placeholder="06 12 34 56 78" value="${v('telephone')}"></label>
              <label>Date de naissance <input type="date" name="date_naissance" autocomplete="bday" value="${v('date_naissance')}"></label>
            </div>

            <h2 class="h3">Engagements</h2>
            <label class="check"><input type="checkbox" name="aptitude_medicale" value="1" required ${values.aptitude_medicale ? 'checked' : ''}>
              <span>Je certifie être en bonne santé et apte à la pratique sportive (article 3 des CGV — avertissement médical).</span></label>
            <label class="check"><input type="checkbox" name="cgv" value="1" required ${values.cgv ? 'checked' : ''}>
              <span>J'ai lu et j'accepte les <a href="/cgv" target="_blank" rel="noopener">conditions générales de vente</a> du contrat de coaching (« lu et approuvé »).</span></label>
            <fieldset class="radio-group">
              <legend>Droit à l'image</legend>
              <label class="check"><input type="radio" name="droit_image" value="1" ${values.droit_image === '1' ? 'checked' : ''}><span>J'accepte d'apparaître sur les photos / vidéos de la séance.</span></label>
              <label class="check"><input type="radio" name="droit_image" value="0" ${values.droit_image !== '1' ? 'checked' : ''}><span>Je refuse.</span></label>
            </fieldset>

            <button class="btn btn-primary btn-lg btn-block" type="submit">Réserver ma place</button>
            <p class="fine">Vos données sont utilisées uniquement pour la gestion de vos séances (RGPD — article 9 des CGV).</p>
          </form>
        </div>
      </section>`,
  });
}

function inscriptionPage({ inscription, seance, store, paymentsEnabled, message }) {
  const confirmed = store.isConfirmed(seance);
  const past = store.isPast(seance);
  let statusBlock;

  if (inscription.statut === 'annulee') {
    statusBlock = html`<div class="status status-muted"><h2>Inscription annulée</h2><p>Votre inscription à cette séance a été annulée.</p>
      ${!past && seance.statut === 'ouverte' ? html`<a class="btn btn-secondary" href="/seance/${seance.id}">Me réinscrire</a>` : ''}</div>`;
  } else if (inscription.statut === 'payee') {
    statusBlock = html`<div class="status status-success"><h2>✓ Place réglée</h2>
      <p>Paiement de ${formatPrix(inscription.montant_cents)} reçu le ${formatDateTime(inscription.paid_at)}. À mercredi !</p></div>`;
  } else if (seance.statut === 'annulee') {
    statusBlock = html`<div class="status status-muted"><h2>Séance annulée</h2><p>Cette séance a été annulée par le coach. Aucun paiement ne vous sera demandé.</p></div>`;
  } else if (confirmed && !past) {
    statusBlock = html`<div class="status status-success">
      <h2>Séance confirmée — paiement ouvert</h2>
      <p>${seance.nb_inscrits} participants sont inscrits : la séance aura bien lieu. Réglez votre place pour la valider.</p>
      <form method="post" action="/inscription/${inscription.token}/payer">
        ${paymentsEnabled
          ? html`<button class="btn btn-primary btn-lg" type="submit">Payer ${formatPrix(seance.prix_cents)} par carte</button>
                 <p class="fine">Vous serez redirigé(e) vers une page de paiement sécurisée (Stripe). Vos données bancaires ne transitent pas par ce site.</p>`
          : html`<button class="btn btn-disabled btn-lg" type="button" disabled>Paiement en ligne bientôt disponible</button>
                 <p class="fine">Le paiement par carte n'est pas encore activé : vous pourrez régler directement auprès du coach.</p>`}
      </form></div>`;
  } else if (past) {
    statusBlock = html`<div class="status status-muted"><h2>Séance passée</h2><p>Cette séance a déjà eu lieu.</p></div>`;
  } else {
    const manque = seance.min_participants - seance.nb_inscrits;
    statusBlock = html`<div class="status status-waiting">
      <h2>En attente de confirmation</h2>
      <p>Il manque <strong>${manque} participant${manque > 1 ? 's' : ''}</strong> pour que la séance soit confirmée.
      Le paiement sera ouvert à ce moment-là et vous serez prévenu(e) par e-mail.</p>
      ${progress(seance)}
      <p class="fine">Astuce : partagez la séance à vos amis pour la confirmer plus vite → <a href="/seance/${seance.id}">lien de la séance</a></p>
    </div>`;
  }

  return publicPage({
    title: 'Mon inscription',
    body: html`
      <section class="section">
        <div class="container narrow">
          ${message ? flash(message.text, message.kind) : ''}
          <p class="eyebrow">Inscription de ${inscription.prenom} ${inscription.nom}</p>
          <h1 class="h2">${capitalize(formatDate(seance.date))}</h1>
          <p class="lead">${formatHeure(seance.heure_debut)} – ${formatHeure(seance.heure_fin)} · ${seance.format_titre} · Coach ${coachName(seance)}</p>
          ${statusBlock}
          <div class="panel">
            <dl class="details">
              <dt>E-mail</dt><dd>${inscription.email}</dd>
              <dt>Téléphone</dt><dd>${inscription.telephone}</dd>
              <dt>Inscrit(e) le</dt><dd>${formatDateTime(inscription.created_at)}</dd>
              <dt>Contrat</dt><dd><a href="/inscription/${inscription.token}/contrat" target="_blank" rel="noopener">Voir / imprimer mon contrat</a></dd>
            </dl>
            <p class="fine">Conservez cette page : son adresse est votre lien personnel d'inscription.</p>
          </div>
          ${inscription.statut === 'inscrit' && !past ? html`
            <form method="post" action="/inscription/${inscription.token}/annuler" class="cancel-form"
              onsubmit="return confirm('Annuler votre inscription à cette séance ?')">
              <button class="link-btn danger" type="submit">Annuler mon inscription</button>
            </form>` : ''}
        </div>
      </section>`,
  });
}

function paymentResult({ ok, inscription }) {
  return publicPage({
    title: ok ? 'Paiement confirmé' : 'Paiement non finalisé',
    body: html`
      <section class="section">
        <div class="container narrow center">
          <div class="status ${ok ? 'status-success' : 'status-muted'}">
            <h1 class="h2">${ok ? '✓ Merci, votre paiement est confirmé' : 'Paiement non finalisé'}</h1>
            <p>${ok ? 'Votre place est réservée. Un reçu vous a été envoyé par e-mail.' : "Aucun montant n'a été débité. Vous pouvez réessayer depuis votre page d'inscription."}</p>
          </div>
          ${inscription ? html`<a class="btn btn-secondary" href="/inscription/${inscription.token}">Retour à mon inscription</a>` : html`<a class="btn btn-secondary" href="/">Retour à l'accueil</a>`}
        </div>
      </section>`,
  });
}

function cgvPage() {
  return publicPage({
    title: 'Conditions générales de vente',
    body: html`
      <section class="section">
        <div class="container narrow">
          <p class="eyebrow">Annexe au contrat</p>
          <h1 class="h2">Conditions générales de vente</h1>
          <div class="panel cgv">${cgvContent()}</div>
        </div>
      </section>`,
  });
}

function notFound(message = "La page demandée n'existe pas.") {
  return publicPage({
    title: 'Introuvable',
    body: html`<section class="section"><div class="container narrow center"><h1 class="h2">Oups</h1><p>${message}</p><a class="btn btn-secondary" href="/">Retour à l'accueil</a></div></section>`,
  });
}

module.exports = { home, seanceForm, inscriptionPage, paymentResult, cgvPage, notFound, coachName };
