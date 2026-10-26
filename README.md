# VG Cross Training — site d'inscription

Site d'inscription aux séances de **cross training collectives** du mercredi (17h30 – 18h30, Basic-Fit Essey-lès-Nancy), avec paiement par carte et espace admin.

## Fonctionnement

1. **Inscription gratuite** : le client choisit une séance et donne ses coordonnées (prénom, nom, e-mail, téléphone, date de naissance). Il accepte les CGV du contrat (« lu et approuvé »), atteste de son aptitude médicale et fait son choix sur le droit à l'image.
2. **Minimum de 3 participants** : tant que le minimum n'est pas atteint, **le paiement est bloqué**. Le client suit son inscription via un lien personnel.
3. **Séance confirmée** : dès le 3ᵉ inscrit, tous les inscrits reçoivent un e-mail. Le bouton **« Payer par carte »** les mène à une page de paiement sécurisée (Stripe Checkout), où ils renseignent leur carte.
4. **Contrat** : chaque inscription génère un contrat individuel pré-rempli (coach, client, prestation, CGV en annexe), imprimable ou exportable en PDF.

## Espace admin (`/admin`)

- **Séances** : génération automatique des mercredis à venir, création manuelle, et pour chaque créneau : **format du jour**, **coach attribué**, prix, minimum et maximum de participants, annulation.
- **Participants** : e-mail, téléphone, statut de paiement, contrat, « payé en espèces », annulation, relance par e-mail des non-payés.
- **Clients** : base de données des clients (e-mail, téléphone, historique, total payé), recherche, export CSV, suppression (RGPD).
- **Coachs** : nom, prénom, SIRET, contact, actif ou inactif.
- **Paramètres** : jour, horaires, date de début, prix par défaut, participants min. et max., lieu.

## Installation

Il faut **Node.js 22.13 ou plus récent** (la base SQLite intégrée à Node est utilisée, sans serveur de base de données à installer).

```bash
npm install
cp .env.example .env   # puis compléter les valeurs
npm start              # http://localhost:3000
npm test               # tests du parcours complet
```

La base de données est créée automatiquement dans `data/cross-training.db`. Pensez à la sauvegarder régulièrement.

## Configuration (`.env`)

| Variable | Rôle |
|---|---|
| `ADMIN_PASSWORD` | Mot de passe de l'espace admin (**obligatoire en production**) |
| `SESSION_SECRET` | Longue chaîne aléatoire pour signer la session admin (**obligatoire en production**) |
| `BASE_URL` | Adresse publique du site (liens des e-mails et retours de paiement) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe : active le paiement par carte |
| `STRIPE_WEBHOOK_SECRET` | Optionnel, recommandé : confirme le paiement même si le client ferme la page |
| `SMTP_*`, `MAIL_FROM` | Envoi des e-mails. Sans SMTP, les e-mails sont affichés dans les logs |

### Activer le paiement par carte (Stripe)

1. Créez un compte sur [stripe.com](https://stripe.com) et récupérez la clé secrète (`sk_test_…` pour tester, `sk_live_…` en production).
2. Renseignez `STRIPE_SECRET_KEY` dans `.env`.
3. Optionnel : dans Stripe, rubrique *Développeurs → Webhooks*, ajoutez l'endpoint `https://votre-site/webhook/stripe` avec l'événement `checkout.session.completed`, puis copiez le secret dans `STRIPE_WEBHOOK_SECRET`.

Les numéros de carte sont saisis uniquement sur la page Stripe : ils ne passent jamais par ce site.

En test, utilisez la carte `4242 4242 4242 4242`, avec n'importe quelle date future et n'importe quel cryptogramme.

## Mise en production

Hébergez le site sur un service Node.js avec un **disque persistant** pour `data/` (Render, Railway, Fly.io, un VPS…). Définissez `NODE_ENV=production` et servez le site en HTTPS.
