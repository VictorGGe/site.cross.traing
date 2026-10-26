const { html } = require('../html');

// Texte repris de l'annexe « Conditions générales de vente » du contrat de Personal Training.
const PREAMBULE = "Le Coach fournit un service individualisé de contenu d'entraînement sportif et, le cas échéant, d'accompagnement nutritionnel. L'utilisation de ce service implique l'adhésion totale aux présentes conditions générales de vente : le Client déclare en avoir pris connaissance et les avoir acceptées, expressément et sans réserve, au jour de son inscription.";

const ARTICLES = [
  { titre: 'Objet', paras: [
    "Les présentes conditions générales de vente définissent les conditions dans lesquelles le Client peut accéder et utiliser les prestations proposées par le Coach. Aucune dérogation aux présentes ne pourra être admise. Elles constituent l'intégralité des engagements entre les parties et annulent tout accord oral ou écrit antérieur relatif à leur objet. Le Client reconnaît qu'aucune signature manuscrite n'est requise pour leur acceptation, et engage sa responsabilité dès la signature du contrat.",
  ] },
  { titre: "Condition de souscription à une formule", paras: [
    "Lors de la souscription d'une formule, le Client s'engage à prendre connaissance des présentes conditions et à fournir des informations exactes et conformes à la réalité. La souscription n'est effective qu'à la signature du présent contrat par les deux parties. Un mineur ne peut souscrire qu'avec l'autorisation écrite préalable de son représentant légal, que le Coach peut demander à tout moment et vérifier.",
  ] },
  { titre: 'Avertissement médical', paras: [
    "Il appartient au Client de s'assurer qu'il est en bonne santé et physiquement apte à pratiquer les entraînements proposés, au besoin en consultant un médecin avant de débuter le programme. Le Client reconnaît avoir passé une visite médicale préalable à son inscription, l'autorisant à pratiquer les exercices proposés par le Coach dans le cadre du programme souscrit.",
  ] },
  { titre: 'Contenu des services, fonctionnalités et tarifs', sous: [
    { titre: 'Contenu des services', texte: "Le Coach propose plusieurs formules, avec un engagement possible sur 1, 3, 6 ou 12 mois — le nombre de séances par semaine est défini avec le Client. Le suivi comprend un coaching individualisé et, selon la formule, un bilan initial et un accompagnement diététique. Les séances de cross training collectif sont proposées à l'unité ; une séance n'a lieu que si le nombre minimum de participants est atteint." },
    { titre: 'Fonctionnalités', texte: 'Les séances se déroulent au sein du club.' },
    { titre: 'Tarif des programmes', texte: "Les tarifs sont indiqués en euros, toutes taxes comprises (TTC). TVA non applicable, article 293 B et/ou 261-4-4b du Code Général des Impôts. Le paiement d'une séance collective n'est ouvert qu'une fois la séance confirmée ; si la séance est annulée par le Coach, la somme versée est intégralement remboursée." },
  ] },
  { titre: 'Résiliation et remboursement', sous: [
    { titre: 'Résiliation pour inaptitude sportive définitive', texte: "Si, pour des raisons de santé, le Client est définitivement empêché de poursuivre le programme souscrit, cette inaptitude entraîne la résiliation du contrat. La résiliation prend effet à réception par le Coach d'un courrier recommandé avec accusé de réception, accompagné de deux justificatifs attestant de cette inaptitude. Le remboursement au prorata de la durée restante intervient sous 30 jours, par chèque ou virement." },
    { titre: 'Résiliation pour convenance personnelle', texte: 'Le Client est informé qu\'il ne pourra prétendre, dans ce cadre, à aucun remboursement pour la période restant à courir.' },
  ] },
  { titre: 'Assiduité et discipline', paras: [
    "Le Client s'engage à être ponctuel. Toute absence non prévenue au moins 24h avant le début d'une séance sera comptabilisée comme réalisée. L'horaire convenu correspond au début du cours : un retard du Client ne pourra être rattrapé. En cas de retard du Coach, la séance sera prolongée d'autant ou rattrapée sur la séance suivante, selon la disponibilité du Client. Une tenue adaptée à la pratique sportive est requise.",
  ] },
  { titre: "Droit à l'image", paras: [
    "Les conditions d'utilisation du droit à l'image, ainsi que leur acceptation ou leur refus par le Client, sont précisées dans le contrat (choix effectué lors de l'inscription).",
  ] },
  { titre: 'Responsabilité', paras: [
    'Le Client garantit le Coach contre toute action ou réclamation engagée à son encontre du fait de l\'utilisation des formules dans des conditions non conformes aux présentes conditions générales de vente.',
  ] },
  { titre: 'Vie privée', paras: [
    'Le Coach s\'engage à protéger la vie privée de ses clients conformément à la réglementation en vigueur et au secret professionnel. Conformément au RGPD, le Client dispose d\'un droit de consultation, de modification et d\'effacement de ses données personnelles auprès du Coach, responsable de leur traitement.',
  ] },
];

function cgvContent() {
  return html`
    <p class="cgv-preambule"><strong>Préambule —</strong> ${PREAMBULE}</p>
    ${ARTICLES.map((a, i) => html`
      <section class="cgv-article">
        <h3><span class="cgv-num">${i + 1}</span>${a.titre}</h3>
        ${(a.paras || []).map((p) => html`<p>${p}</p>`)}
        ${(a.sous || []).map((s) => html`<h4>${s.titre}</h4><p>${s.texte}</p>`)}
      </section>`)}`;
}

module.exports = { cgvContent };
