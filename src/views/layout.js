const { html } = require('../html');

const LOGO = html`<span class="logo-mark" aria-hidden="true">VG</span>`;

function layout({ title, body, admin = false, nav = '', description = '' }) {
  const fullTitle = title ? `${title} · VG Cross Training` : 'VG Cross Training';
  return html`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  ${description ? html`<meta name="description" content="${description}">` : ''}
  ${admin ? html`<meta name="robots" content="noindex, nofollow">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="${admin ? 'is-admin' : ''}">
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${admin ? '/admin' : '/'}">${LOGO}<span class="brand-text">VG Cross Training${admin ? html`<small>Espace admin</small>` : ''}</span></a>
      <nav class="main-nav">${nav}</nav>
    </div>
  </header>
  <main>${body}</main>
  <footer class="site-footer">
    <div class="container footer-inner">
      <div>
        <strong>VG Cross Training</strong><br>
        Victor GEOFFROY — Coach sportif · SIRET 108 146 432 00019<br>
        Basic-Fit, 1 Av. de Saulxures, 54270 Essey-lès-Nancy
      </div>
      <div class="footer-links">
        <a href="/cgv">Conditions générales de vente</a>
        ${admin ? '' : html`<a href="/admin">Espace coach</a>`}
      </div>
    </div>
  </footer>
</body>
</html>`;
}

const publicNav = html`<a href="/#seances">Séances</a><a href="/#fonctionnement">Fonctionnement</a><a href="/cgv">CGV</a>`;

const adminNav = html`<a href="/admin">Séances</a><a href="/admin/clients">Clients</a><a href="/admin/coachs">Coachs</a><a href="/admin/parametres">Paramètres</a>
  <form method="post" action="/admin/logout" class="inline"><button class="link-btn">Déconnexion</button></form>`;

function publicPage(opts) {
  return layout({ nav: publicNav, ...opts });
}

function adminPage(opts) {
  return layout({ nav: adminNav, admin: true, ...opts });
}

function flash(message, kind = 'success') {
  if (!message) return '';
  return html`<div class="alert alert-${kind}" role="status">${message}</div>`;
}

module.exports = { layout, publicPage, adminPage, flash };
