const { html, formatDate, formatDateTime, formatHeure, formatPrix, capitalize } = require('../html');
const { layout, adminPage, flash } = require('./layout');
const { coachName } = require('./public');

const STATUT_LABELS = {
  inscrit: html`<span class="badge badge-warning">À payer</span>`,
  payee: html`<span class="badge badge-success">Payé</span>`,
  annulee: html`<span class="badge badge-muted">Annulé</span>`,
};

const MOYENS = { carte: 'Carte', especes: 'Espèces', autre: 'Autre' };

function login({ error }) {
  return layout({
    title: 'Connexion',
    admin: true,
    body: html`
      <section class="section">
        <div class="container login">
          <form class="panel form" method="post" action="/admin/login">
            <h1 class="h3">Espace coach</h1>
            ${error ? flash(error, 'error') : ''}
            <label>Mot de passe <input type="password" name="password" required autofocus autocomplete="current-password"></label>
            <button class="btn btn-primary btn-block" type="submit">Se connecter</button>
          </form>
        </div>
      </section>`,
  });
}

function seanceRow(s, store) {
  const confirmed = store.isConfirmed(s);
  let statut;
  if (s.statut === 'annulee') statut = html`<span class="badge badge-danger">Annulée</span>`;
  else if (confirmed) statut = html`<span class="badge badge-success">Confirmée</span>`;
  else statut = html`<span class="badge badge-warning">En attente</span>`;
  return html`<tr>
    <td data-label="Date"><a href="/admin/seances/${s.id}"><strong>${capitalize(formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</strong></a><br><span class="muted">${formatHeure(s.heure_debut)} – ${formatHeure(s.heure_fin)}</span></td>
    <td data-label="Format">${s.format_titre}</td>
    <td data-label="Coach">${s.coach_prenom ? coachName(s) : html`<span class="badge badge-danger">À attribuer</span>`}</td>
    <td data-label="Inscrits"><strong>${s.nb_inscrits}</strong> / ${s.max_participants} <span class="muted">(min ${s.min_participants})</span></td>
    <td data-label="Payés">${s.nb_payes}</td>
    <td data-label="Statut">${statut}</td>
    <td class="actions"><a class="btn btn-sm btn-secondary" href="/admin/seances/${s.id}">Gérer</a></td>
  </tr>`;
}

function dashboard({ upcoming, past, stats, store, msg }) {
  const table = (rows) => html`
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th><th>Format</th><th>Coach</th><th>Inscrits</th><th>Payés</th><th>Statut</th><th></th></tr></thead>
      <tbody>${rows.map((s) => seanceRow(s, store))}</tbody>
    </table></div>`;

  return adminPage({
    title: 'Séances',
    body: html`
      <section class="section">
        <div class="container">
          ${flash(msg)}
          <div class="page-head">
            <h1 class="h2">Tableau de bord</h1>
            <div class="btn-row">
              <form method="post" action="/admin/seances/generer" class="inline"><button class="btn btn-secondary">Générer les mercredis à venir</button></form>
              <a class="btn btn-primary" href="/admin/seances/nouvelle">Nouvelle séance</a>
            </div>
          </div>
          <div class="stats">
            <div class="stat"><span>Séances à venir</span><strong>${stats.seancesAVenir}</strong></div>
            <div class="stat"><span>Inscriptions à venir</span><strong>${stats.inscriptionsAVenir}</strong></div>
            <div class="stat"><span>Clients</span><strong>${stats.clients}</strong></div>
            <div class="stat"><span>Total encaissé</span><strong>${formatPrix(stats.encaisseCents)}</strong></div>
          </div>
          <h2 class="h3">Séances à venir</h2>
          ${upcoming.length ? table(upcoming) : html`<div class="empty">Aucune séance à venir. Utilisez « Générer les mercredis à venir ».</div>`}
          ${past.length ? html`<details class="past"><summary>Séances passées (${past.length})</summary>${table(past)}</details>` : ''}
        </div>
      </section>`,
  });
}

function seanceFields(s, coaches) {
  return html`
    <div class="grid-3">
      <label>Date <input type="date" name="date" required value="${s.date || ''}"></label>
      <label>Début <input type="time" name="heure_debut" required value="${s.heure_debut || ''}"></label>
      <label>Fin <input type="time" name="heure_fin" required value="${s.heure_fin || ''}"></label>
    </div>
    <label>Format de la séance <input name="format_titre" required maxlength="120" value="${s.format_titre || 'Cross training'}" placeholder="Ex. : EMOM 30 min, Hyrox, circuit cardio…"></label>
    <label>Description du format <textarea name="format_description" rows="3" maxlength="1000" placeholder="Visible par les clients sur la page d'inscription">${s.format_description || ''}</textarea></label>
    <div class="grid-3">
      <label>Coach
        <select name="coach_id">
          <option value="">— À attribuer —</option>
          ${coaches.map((c) => html`<option value="${c.id}" ${Number(s.coach_id) === c.id ? 'selected' : ''}>${c.prenom} ${c.nom}${c.actif ? '' : ' (inactif)'}</option>`)}
        </select>
      </label>
      <label>Prix (€) <input type="number" name="prix" min="0" step="0.01" required value="${((s.prix_cents || 0) / 100).toFixed(2)}"></label>
      <label>Statut
        <select name="statut">
          <option value="ouverte" ${s.statut !== 'annulee' ? 'selected' : ''}>Ouverte</option>
          <option value="annulee" ${s.statut === 'annulee' ? 'selected' : ''}>Annulée</option>
        </select>
      </label>
      <label>Participants minimum <input type="number" name="min_participants" min="1" required value="${s.min_participants || 3}"></label>
      <label>Participants maximum <input type="number" name="max_participants" min="1" required value="${s.max_participants || 12}"></label>
    </div>`;
}

function seanceDetail({ seance, participants, coaches, store, msg, error }) {
  const confirmed = store.isConfirmed(seance);
  const actifs = participants.filter((p) => p.statut !== 'annulee');
  const emails = actifs.map((p) => p.email).join(', ');
  const unpaid = actifs.filter((p) => p.statut === 'inscrit').length;

  return adminPage({
    title: `Séance du ${formatDate(seance.date, { day: 'numeric', month: 'long' })}`,
    body: html`
      <section class="section">
        <div class="container">
          <a class="back" href="/admin">← Tableau de bord</a>
          ${flash(msg)}${error ? flash(error, 'error') : ''}
          <div class="page-head">
            <div>
              <p class="eyebrow">${formatHeure(seance.heure_debut)} – ${formatHeure(seance.heure_fin)} · ${seance.format_titre}</p>
              <h1 class="h2">${capitalize(formatDate(seance.date))}</h1>
            </div>
            <div>${seance.statut === 'annulee' ? html`<span class="badge badge-danger">Annulée</span>`
              : confirmed ? html`<span class="badge badge-success">Confirmée — ${seance.nb_inscrits} inscrits</span>`
              : html`<span class="badge badge-warning">En attente — ${seance.nb_inscrits}/${seance.min_participants}</span>`}</div>
          </div>

          <div class="stack">
            <form class="panel form" method="post" action="/admin/seances/${seance.id}">
              <h2 class="h3">Créneau, format et coach</h2>
              ${seanceFields(seance, coaches)}
              <button class="btn btn-primary" type="submit">Enregistrer</button>
            </form>

            <div class="panel stack-first">
              <div class="panel-head">
                <h2 class="h3">Participants (${actifs.length})</h2>
                ${confirmed && unpaid ? html`<form method="post" action="/admin/seances/${seance.id}/relancer" class="inline"><button class="btn btn-sm btn-secondary">Relancer les ${unpaid} non-payés</button></form>` : ''}
              </div>
              ${participants.length ? html`
                <div class="table-wrap"><table class="table table-compact">
                  <thead><tr><th>Client</th><th>Contact</th><th>Paiement</th><th></th></tr></thead>
                  <tbody>${participants.map((p) => html`
                    <tr class="${p.statut === 'annulee' ? 'is-cancelled' : ''}">
                      <td data-label="Client"><a href="/admin/clients/${p.client_id}"><strong>${p.prenom} ${p.nom}</strong></a><br>
                        <span class="muted">Inscrit le ${formatDateTime(p.created_at)}${p.droit_image ? '' : ' · refuse photos'}</span></td>
                      <td data-label="Contact"><a href="mailto:${p.email}">${p.email}</a><br><a href="tel:${p.telephone.replace(/\s/g, '')}">${p.telephone}</a></td>
                      <td data-label="Paiement">${STATUT_LABELS[p.statut]}${p.statut === 'payee' ? html`<br><span class="muted">${formatPrix(p.montant_cents)} · ${MOYENS[p.moyen_paiement] || ''}</span>` : ''}</td>
                      <td class="actions">
                        <a class="btn btn-sm btn-ghost" href="/inscription/${p.token}/contrat" target="_blank" rel="noopener">Contrat</a>
                        ${p.statut === 'inscrit' ? html`
                          <form method="post" action="/admin/inscriptions/${p.id}/payer" class="inline"><button class="btn btn-sm btn-ghost">Payé en espèces</button></form>
                          <form method="post" action="/admin/inscriptions/${p.id}/annuler" class="inline" onsubmit="return confirm('Annuler cette inscription ?')"><button class="btn btn-sm btn-ghost danger">Annuler</button></form>` : ''}
                        ${p.statut === 'payee' && p.moyen_paiement !== 'carte' ? html`
                          <form method="post" action="/admin/inscriptions/${p.id}/impaye" class="inline"><button class="btn btn-sm btn-ghost">Annuler le paiement</button></form>` : ''}
                      </td>
                    </tr>`)}
                  </tbody>
                </table></div>
                ${emails ? html`<label class="copy-field">E-mails des participants <input readonly value="${emails}" onclick="this.select()"></label>` : ''}`
                : html`<div class="empty">Aucun inscrit pour le moment.</div>`}
              <p class="fine">Lien public de la séance : <a href="/seance/${seance.id}" target="_blank" rel="noopener">/seance/${seance.id}</a></p>
            </div>
          </div>

          <form method="post" action="/admin/seances/${seance.id}/supprimer" class="danger-zone"
            onsubmit="return confirm('Supprimer définitivement cette séance et ses inscriptions ?')">
            <button class="link-btn danger" ${seance.nb_payes ? html`disabled title="Des paiements ont été enregistrés : annulez plutôt la séance."` : ''}>Supprimer la séance</button>
          </form>
        </div>
      </section>`,
  });
}

function newSeance({ seance, coaches, error }) {
  return adminPage({
    title: 'Nouvelle séance',
    body: html`
      <section class="section">
        <div class="container narrow">
          <a class="back" href="/admin">← Tableau de bord</a>
          <h1 class="h2">Nouvelle séance</h1>
          ${error ? flash(error, 'error') : ''}
          <form class="panel form" method="post" action="/admin/seances/nouvelle">
            ${seanceFields(seance, coaches)}
            <button class="btn btn-primary" type="submit">Créer la séance</button>
          </form>
        </div>
      </section>`,
  });
}

function clients({ clients: list, search }) {
  return adminPage({
    title: 'Clients',
    body: html`
      <section class="section">
        <div class="container">
          <div class="page-head">
            <h1 class="h2">Clients <span class="muted">(${list.length})</span></h1>
            <div class="btn-row">
              <form class="search" method="get" action="/admin/clients"><input type="search" name="q" value="${search}" placeholder="Nom, e-mail, téléphone…"><button class="btn btn-secondary">Rechercher</button></form>
              <a class="btn btn-secondary" href="/admin/clients.csv">Exporter (CSV)</a>
            </div>
          </div>
          ${list.length ? html`
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>Séances</th><th>Total payé</th><th>Client depuis</th></tr></thead>
              <tbody>${list.map((c) => html`<tr>
                <td data-label="Nom"><a href="/admin/clients/${c.id}"><strong>${c.nom.toUpperCase()} ${c.prenom}</strong></a></td>
                <td data-label="E-mail"><a href="mailto:${c.email}">${c.email}</a></td>
                <td data-label="Téléphone"><a href="tel:${c.telephone.replace(/\s/g, '')}">${c.telephone}</a></td>
                <td data-label="Séances">${c.nb_seances}</td>
                <td data-label="Total payé">${formatPrix(c.total_paye_cents)}</td>
                <td data-label="Client depuis">${formatDateTime(c.created_at)}</td>
              </tr>`)}</tbody>
            </table></div>` : html`<div class="empty">Aucun client${search ? ' ne correspond à cette recherche' : ' pour le moment'}.</div>`}
        </div>
      </section>`,
  });
}

function clientDetail({ client, inscriptions, msg, error }) {
  return adminPage({
    title: `${client.prenom} ${client.nom}`,
    body: html`
      <section class="section">
        <div class="container">
          <a class="back" href="/admin/clients">← Clients</a>
          ${flash(msg)}${error ? flash(error, 'error') : ''}
          <h1 class="h2">${client.prenom} ${client.nom}</h1>
          <div class="admin-grid">
            <form class="panel form" method="post" action="/admin/clients/${client.id}">
              <h2 class="h3">Fiche client</h2>
              <div class="grid-2">
                <label>Prénom <input name="prenom" required value="${client.prenom}"></label>
                <label>Nom <input name="nom" required value="${client.nom}"></label>
                <label>E-mail <input type="email" name="email" required value="${client.email}"></label>
                <label>Téléphone <input name="telephone" required value="${client.telephone}"></label>
                <label>Date de naissance <input type="date" name="date_naissance" value="${client.date_naissance || ''}"></label>
              </div>
              <label>Notes internes <textarea name="notes" rows="3">${client.notes || ''}</textarea></label>
              <button class="btn btn-primary" type="submit">Enregistrer</button>
            </form>
            <div class="panel">
              <h2 class="h3">Historique (${inscriptions.length})</h2>
              ${inscriptions.length ? html`<ul class="history">${inscriptions.map((i) => html`
                <li><a href="/admin/seances/${i.seance_id}">${capitalize(formatDate(i.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</a>
                  <span class="muted">${i.format_titre}</span> ${STATUT_LABELS[i.statut]}</li>`)}</ul>`
                : html`<div class="empty">Aucune inscription.</div>`}
            </div>
          </div>
          <form method="post" action="/admin/clients/${client.id}/supprimer" class="danger-zone"
            onsubmit="return confirm('Supprimer définitivement ce client et tout son historique (droit à l\\'effacement RGPD) ?')">
            <button class="link-btn danger">Supprimer le client (RGPD)</button>
          </form>
        </div>
      </section>`,
  });
}

function coaches({ coaches: list, edit, msg }) {
  const c = edit || { actif: 1 };
  return adminPage({
    title: 'Coachs',
    body: html`
      <section class="section">
        <div class="container">
          ${flash(msg)}
          <h1 class="h2">Coachs</h1>
          <div class="admin-grid">
            <div class="panel">
              <div class="table-wrap"><table class="table table-compact">
                <thead><tr><th>Coach</th><th>SIRET</th><th>Contact</th><th></th></tr></thead>
                <tbody>${list.map((co) => html`<tr class="${co.actif ? '' : 'is-cancelled'}">
                  <td data-label="Coach"><strong>${co.prenom} ${co.nom}</strong>${co.actif ? '' : html` <span class="badge badge-muted">Inactif</span>`}</td>
                  <td data-label="SIRET">${co.siret || '—'}</td>
                  <td data-label="Contact">${co.email || ''}${co.email && co.telephone ? html`<br>` : ''}${co.telephone || ''}</td>
                  <td class="actions"><a class="btn btn-sm btn-ghost" href="/admin/coachs?edit=${co.id}">Modifier</a></td>
                </tr>`)}</tbody>
              </table></div>
            </div>
            <form class="panel form" method="post" action="/admin/coachs${edit ? `/${edit.id}` : ''}">
              <h2 class="h3">${edit ? 'Modifier le coach' : 'Ajouter un coach'}</h2>
              <div class="grid-2">
                <label>Prénom <input name="prenom" required value="${c.prenom || ''}"></label>
                <label>Nom <input name="nom" required value="${c.nom || ''}"></label>
                <label>SIRET <input name="siret" value="${c.siret || ''}" inputmode="numeric"></label>
                <label>Téléphone <input name="telephone" value="${c.telephone || ''}"></label>
              </div>
              <label>E-mail <input type="email" name="email" value="${c.email || ''}"></label>
              <label class="check"><input type="checkbox" name="actif" value="1" ${c.actif ? 'checked' : ''}><span>Coach actif (proposé lors de l'attribution des séances)</span></label>
              <div class="btn-row">
                <button class="btn btn-primary" type="submit">${edit ? 'Enregistrer' : 'Ajouter'}</button>
                ${edit ? html`<a class="btn btn-ghost" href="/admin/coachs">Annuler</a>` : ''}
              </div>
            </form>
          </div>
        </div>
      </section>`,
  });
}

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function settingsPage({ settings, msg, paymentsEnabled, mailEnabled }) {
  return adminPage({
    title: 'Paramètres',
    body: html`
      <section class="section">
        <div class="container narrow">
          ${flash(msg)}
          <h1 class="h2">Paramètres</h1>
          <form class="panel form" method="post" action="/admin/parametres">
            <h2 class="h3">Créneau récurrent</h2>
            <p class="fine">Utilisé par le bouton « Générer les mercredis à venir » pour créer automatiquement les séances.</p>
            <div class="grid-3">
              <label>Jour <select name="jour_semaine">${JOURS.map((j, i) => html`<option value="${i}" ${String(i) === settings.jour_semaine ? 'selected' : ''}>${j}</option>`)}</select></label>
              <label>Début <input type="time" name="heure_debut" required value="${settings.heure_debut}"></label>
              <label>Fin <input type="time" name="heure_fin" required value="${settings.heure_fin}"></label>
              <label>À partir du <input type="date" name="date_debut" required value="${settings.date_debut}"></label>
              <label>Semaines à générer <input type="number" name="semaines_a_generer" min="1" max="52" required value="${settings.semaines_a_generer}"></label>
              <label>Prix par défaut (€) <input type="number" name="prix" min="0" step="0.01" required value="${(Number(settings.prix_cents) / 100).toFixed(2)}"></label>
              <label>Participants min. <input type="number" name="min_participants" min="1" required value="${settings.min_participants}"></label>
              <label>Participants max. <input type="number" name="max_participants" min="1" required value="${settings.max_participants}"></label>
            </div>
            <label>Lieu <input name="lieu" required value="${settings.lieu}"></label>
            <button class="btn btn-primary" type="submit">Enregistrer</button>
          </form>

          <div class="panel">
            <h2 class="h3">Intégrations</h2>
            <dl class="details">
              <dt>Paiement par carte (Stripe)</dt><dd>${paymentsEnabled ? html`<span class="badge badge-success">Activé</span>` : html`<span class="badge badge-warning">Non configuré</span> <span class="muted">— renseigner STRIPE_SECRET_KEY</span>`}</dd>
              <dt>Envoi d'e-mails (SMTP)</dt><dd>${mailEnabled ? html`<span class="badge badge-success">Activé</span>` : html`<span class="badge badge-warning">Non configuré</span> <span class="muted">— e-mails affichés dans les logs</span>`}</dd>
            </dl>
          </div>
        </div>
      </section>`,
  });
}

module.exports = { login, dashboard, seanceDetail, newSeance, clients, clientDetail, coaches, settingsPage };
