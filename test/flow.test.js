const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { todayParis, addDays, weekday } = require('../src/store');

const config = {
  isProd: false, baseUrl: 'http://test.local', adminPassword: 'secret', sessionSecret: 'test-secret',
  smtp: {}, mailFrom: 'test@test',
};

function setup({ paid = true } = {}) {
  const sent = [];
  const mailer = {
    enabled: false,
    inscriptionRecue: async (i) => sent.push(['inscription', i.email]),
    seanceConfirmee: async (i) => sent.push(['confirmee', i.email]),
    paiementRecu: async (i) => sent.push(['paiement', i.email]),
  };
  const payments = {
    enabled: true,
    created: [],
    async createCheckout(inscription) {
      this.created.push(inscription.id);
      return { id: `cs_${inscription.id}`, url: `https://checkout.stripe.test/${inscription.id}` };
    },
    async getCheckout(id) {
      return { paid, inscriptionId: Number(id.slice(3)), amount: 1500, id };
    },
  };
  const db = openDb(':memory:');
  const { app, store } = createApp({ config, db, mailer, payments });
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, store, sent, payments, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

const form = (data) => ({
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(data).toString(),
});

const client = (n) => ({
  prenom: `Client${n}`, nom: 'Test', email: `client${n}@example.com`, telephone: '06 12 34 56 7' + n,
  aptitude_medicale: '1', cgv: '1', droit_image: '0',
});

function futureSeance(store) {
  return store.createSeance({
    date: addDays(todayParis(), 14), heure_debut: '17:30', heure_fin: '18:30', format_titre: 'EMOM',
    coach_id: 1, min_participants: 3, max_participants: 4, prix_cents: 1500,
  });
}

test('les séances hebdomadaires sont générées le bon jour, sans doublon', async () => {
  const { server, store } = await setup();
  store.setSettings({ date_debut: todayParis() });
  const created = store.generateSeances(4);
  assert.equal(created, 4);
  assert.equal(store.generateSeances(4), 0);
  for (const s of store.listUpcomingSeances()) {
    assert.equal(weekday(s.date), 3);
    assert.equal(s.heure_debut, '17:30');
    assert.equal(s.heure_fin, '18:30');
    assert.equal(s.coach_nom, 'GEOFFROY');
  }
  server.close();
});

test('paiement bloqué avant 3 inscrits, puis ouvert et validé', async () => {
  const { server, store, sent, payments, base } = await setup();
  const id = futureSeance(store);

  // Inscription incomplète refusée
  let res = await fetch(`${base}/seance/${id}/inscription`, form({ ...client(1), cgv: '' }));
  assert.equal(res.status, 400);

  const tokens = [];
  for (const n of [1, 2]) {
    res = await fetch(`${base}/seance/${id}/inscription`, form(client(n)));
    assert.equal(res.status, 303);
    tokens.push(res.headers.get('location').split('/')[2].split('?')[0]);
  }

  // Seulement 2 inscrits : la page indique l'attente et le paiement est refusé
  let page = await (await fetch(`${base}/inscription/${tokens[0]}`)).text();
  assert.match(page, /En attente de confirmation/);
  res = await fetch(`${base}/inscription/${tokens[0]}/payer`, form({}));
  assert.equal(res.headers.get('location'), `/inscription/${tokens[0]}`);
  assert.equal(payments.created.length, 0);

  // Doublon refusé
  res = await fetch(`${base}/seance/${id}/inscription`, form(client(1)));
  assert.equal(res.status, 409);

  // 3e inscrit : séance confirmée, les deux premiers sont prévenus
  res = await fetch(`${base}/seance/${id}/inscription`, form(client(3)));
  assert.equal(res.status, 303);
  assert.deepEqual(sent.filter(([k]) => k === 'confirmee').map(([, e]) => e).sort(), ['client1@example.com', 'client2@example.com']);

  page = await (await fetch(`${base}/inscription/${tokens[0]}`)).text();
  assert.match(page, /paiement ouvert/);

  res = await fetch(`${base}/inscription/${tokens[0]}/payer`, form({}));
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /^https:\/\/checkout\.stripe\.test\//);

  const inscription = store.getInscriptionByToken(tokens[0]);
  res = await fetch(`${base}/paiement/succes?session_id=cs_${inscription.id}`);
  assert.match(await res.text(), /paiement est confirmé/);
  assert.equal(store.getInscriptionByToken(tokens[0]).statut, 'payee');
  assert.equal(store.getSeance(id).nb_payes, 1);

  // Contrat pré-rempli
  page = await (await fetch(`${base}/inscription/${tokens[0]}/contrat`)).text();
  assert.match(page, /Client1/);
  assert.match(page, /10814643200019/);
  assert.match(page, /Droit à l&#39;image<\/span><span class="c-value">Refusé/);

  // Capacité max (4) : le 5e est refusé
  await fetch(`${base}/seance/${id}/inscription`, form(client(4)));
  res = await fetch(`${base}/seance/${id}/inscription`, form(client(5)));
  assert.equal(res.status, 409);
  server.close();
});

test('espace admin protégé, attribution du coach et fichier clients', async () => {
  const { server, store, base } = await setup();
  const id = futureSeance(store);

  let res = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(res.headers.get('location'), '/admin/login');

  res = await fetch(`${base}/admin/login`, form({ password: 'mauvais' }));
  assert.equal(res.status, 401);

  res = await fetch(`${base}/admin/login`, form({ password: 'secret' }));
  assert.equal(res.status, 303);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const auth = (opts = {}) => ({ ...opts, headers: { ...(opts.headers || {}), cookie } });

  res = await fetch(`${base}/admin/coachs`, auth(form({ prenom: 'Léa', nom: 'MARTIN', siret: '123', actif: '1' })));
  assert.equal(res.status, 303);
  const lea = store.listCoaches().find((c) => c.nom === 'MARTIN');

  res = await fetch(`${base}/admin/seances/${id}`, auth(form({
    date: store.getSeance(id).date, heure_debut: '17:30', heure_fin: '18:30', format_titre: 'Hyrox',
    format_description: 'Ateliers', coach_id: String(lea.id), prix: '15', min_participants: '3', max_participants: '12', statut: 'ouverte',
  })));
  assert.equal(res.status, 303);
  assert.equal(store.getSeance(id).coach_prenom, 'Léa');
  assert.equal(store.getSeance(id).format_titre, 'Hyrox');

  await fetch(`${base}/seance/${id}/inscription`, form({ ...client(1), nom: '=HYPERLINK("x")' }));
  res = await fetch(`${base}/admin/clients.csv`, auth());
  const csv = await res.text();
  assert.match(csv, /client1@example\.com/);
  assert.match(csv, /"'=HYPERLINK/);

  const page = await (await fetch(`${base}/admin/seances/${id}`, auth())).text();
  assert.match(page, /client1@example\.com/);
  assert.match(page, /06 12 34 56 71/);
  server.close();
});
