// Point d'entrée de l'app : c'est le seul script chargé par index.html, il importe tous les autres.
// Son rôle : regarder l'adresse et afficher l'écran correspondant.
//
// L'app n'a qu'une seule page HTML. L'adresse se termine par exemple par #/piece/xxx/script :
// ce qui suit le # (le « hash ») ne part jamais au serveur. On peut donc changer d'écran sans
// recharger, garder des chemins relatifs, et le bouton Retour d'Android fonctionne tout seul.

import { el, hautDePage, icone, oublierRetour, remonterDansEcran, remplacer } from './dom.js';
import { chargerLangue, langueActive, t, traduire } from './langues.js';
import { noterUtilisation } from './stockage.js';
import { piecesRetirees } from './telechargement.js';
import { appliquerAffichage } from './affichage.js';
import { trouverPiece } from './pieces.js';
import { texteBrut } from './texte.js';
import { arreterVoix, voixPretes } from './voix.js';
import { adresseAReprendre, noterAdresse, terminerReprise } from './reprise.js';
import { proposerRechargement } from './version.js';
import { afficherBibliotheque } from './ecrans/bibliotheque.js';
import { afficherFiches } from './ecrans/fiches.js';
import { afficherFilage } from './ecrans/filage.js';
import { afficherMesRepliques } from './ecrans/mes-repliques.js';
import { afficherReglages } from './ecrans/reglages.js';
import { afficherScript } from './ecrans/script.js';
import { afficherVocabulaire } from './ecrans/vocabulaire.js';

const ONGLETS = [
  { chemin: 'script', libelle: () => t('Script'), icone: 'script', afficher: afficherScript },
  { chemin: 'mes-repliques', libelle: () => t('Mes répliques'), icone: 'repliques', afficher: afficherMesRepliques },
  { chemin: 'fiches', libelle: () => t('Fiches'), icone: 'fiches', afficher: afficherFiches },
  { chemin: 'filage', libelle: () => t('Filage'), icone: 'filage', afficher: afficherFilage },
  { chemin: 'vocabulaire', libelle: () => t('Vocabulaire'), icone: 'vocabulaire', afficher: afficherVocabulaire },
];

const zoneBarre = document.getElementById('barre');
const zoneEcran = document.getElementById('ecran');
const zoneOnglets = document.getElementById('onglets');

// ---- Remonter d'un niveau ----

// Le chemin parcouru dans l'app : la liste des adresses visitées, la dernière étant l'écran affiché.
// Revenir à l'avant-dernière (par la flèche ou par le bouton Retour d'Android), c'est reculer :
// on la retire au lieu d'en ajouter une.
const parcours = [];

function noterParcours(adresse) {
  if (parcours.at(-2) === adresse) parcours.pop();
  else if (parcours.at(-1) !== adresse) parcours.push(adresse);
}

// La flèche en haut à gauche. D'abord à l'intérieur de l'écran (une série de fiches revient au choix
// des fiches, un filage lancé à son départ), sinon vers l'écran du dessus. Si l'on arrive justement
// de lui, on recule dans l'historique : le bouton Retour d'Android reste d'accord avec la flèche.
function remonter(dessus) {
  if (remonterDansEcran()) return;
  if (parcours.at(-2) === dessus) history.back();
  else location.hash = dessus;
}

// L'en-tête, comme dans Faktur : le mot-symbole, avec en dessous le nom de la pièce ouverte.
// retour : l'adresse de l'écran du dessus, où ramène la flèche (rien : pas de flèche).
function afficherBarre(sousTitre, { retour = null, reglages = false } = {}) {
  remplacer(zoneBarre,
    retour && el('button', {
      type: 'button',
      className: 'icon-btn',
      'aria-label': t('Retour'),
      onclick: () => remonter(retour),
    }, icone('retour')),
    el('a', { className: 'brand', href: '#/' },
      el('strong', { className: 'wordmark' }, 'replik'),
      sousTitre && el('small', {}, sousTitre)),
    reglages && el('a', { className: 'icon-btn', href: '#/reglages', 'aria-label': t('Réglages') }, icone('reglages')),
  );
}

let baseOnglets = null;

function afficherOnglets(piece, actif) {
  zoneOnglets.hidden = !piece;
  if (!piece) return;
  const base = `#/piece/${encodeURIComponent(piece.id)}`;
  // On garde les mêmes éléments d'un écran à l'autre : sans cela, la couleur et le léger
  // soulèvement de l'onglet actif sauteraient au lieu de s'animer. Sauf si la langue change.
  const version = `${base}/${langueActive()}`;
  if (version !== baseOnglets) {
    baseOnglets = version;
    zoneOnglets.setAttribute('aria-label', t('Sections de la pièce'));
    remplacer(zoneOnglets, ONGLETS.map((onglet) => el('a', {
      className: 'tab',
      href: `${base}/${onglet.chemin}`,
    }, icone(onglet.icone), el('span', {}, onglet.libelle()))));
  }
  ONGLETS.forEach((onglet, rang) => {
    const lien = zoneOnglets.children[rang];
    lien.classList.toggle('is-active', onglet.chemin === actif);
    // aria-current indique l'onglet actif aux lecteurs d'écran.
    if (onglet.chemin === actif) lien.setAttribute('aria-current', 'page');
    else lien.removeAttribute('aria-current');
  });
}

// Numéro de l'affichage en cours et nettoyage de l'écran précédent (minuteurs, écouteurs...).
let numeroAffichage = 0;
let nettoyer = null;

async function router() {
  const moi = ++numeroAffichage;
  arreterVoix();
  nettoyer?.();
  nettoyer = null;
  const adresse = location.hash || '#/';
  noterAdresse(adresse); // pour revenir ici si Android relance l'app (voir reprise.js)
  noterParcours(adresse);
  oublierRetour(); // le nouvel écran dira lui-même s'il a des étapes

  // Si le chargement traîne (premier lancement, réseau lent), on l'annonce avec le reflet de Faktur.
  const attente = setTimeout(() => {
    if (moi !== numeroAffichage) return;
    zoneEcran.replaceChildren(el('div', { className: 'ecran-contenu' },
      el('div', { className: 'card vide chargement' }, el('p', {}, t('Chargement...')))));
  }, 150);

  const morceaux = location.hash.replace(/^#\/?/, '').split('/');
  let afficher;
  let piece = null;
  let ongletActif = null;

  if (morceaux[0] === 'reglages') {
    // Les Réglages s'ouvrent de partout : la flèche ramène à l'écran d'où l'on vient.
    afficherBarre(null, { retour: parcours.at(-2) ?? '#/' });
    afficher = afficherReglages;
  } else if (morceaux[0] === 'piece' && morceaux[1]) {
    piece = await trouverPiece(decodeURIComponent(morceaux[1]));
    if (piece && (await piecesRetirees()).has(piece.id)) piece = null; // par exemple un vieux favori
    const onglet = ONGLETS.find((o) => o.chemin === morceaux[2]) ?? ONGLETS[0];
    if (piece) {
      noterUtilisation(piece.id); // pour la remonter en haut de la liste des pièces
      afficherBarre(traduire(piece, 'titre_fr'), { retour: '#/', reglages: true });
      afficher = onglet.afficher;
      ongletActif = onglet.chemin;
    } else {
      // Par exemple un favori vers une pièce retirée depuis.
      afficherBarre(t('Pièce introuvable'), { retour: '#/' });
      afficher = (racine) => racine.append(el('p', { className: 'vide' }, t("Cette pièce n'est plus sur ce téléphone.")));
    }
  } else {
    afficherBarre(null, { reglages: true });
    afficher = afficherBibliotheque;
  }

  if (moi !== numeroAffichage) {
    clearTimeout(attente);
    return;
  }
  afficherOnglets(piece, ongletActif);
  appliquerAffichage(piece?.id ?? null); // furigana et traduction : le choix de cette pièce, ou le général
  document.title = piece ? `${texteBrut(piece.titre)} · Replik` : 'Replik';

  // Chaque écran se construit dans un élément neuf, placé dans la page une fois prêt.
  // Si l'utilisateur a déjà changé d'écran entre-temps (les écrans peuvent attendre le chargement
  // des pièces), le numéro aura changé et on jette ce résultat devenu inutile.
  const racine = el('div', { className: 'ecran-contenu' });
  const nettoyage = await afficher(racine, piece);
  clearTimeout(attente);
  if (moi !== numeroAffichage) {
    nettoyage?.();
    return;
  }
  nettoyer = nettoyage ?? null;
  zoneEcran.replaceChildren(racine);
  hautDePage();
  terminerReprise(zoneEcran); // après une relance, redescend là où on en était
  zoneEcran.focus({ preventScroll: true }); // pour que les lecteurs d'écran annoncent le nouvel écran
}

// ---- Service worker : ce qui permet le hors-ligne ----

function enregistrerServiceWorker() {
  // Absent en HTTP simple (par exemple le test sur le Wi-Fi) : l'app marche, mais sans hors-ligne.
  if (!('serviceWorker' in navigator)) return;

  // Chemin relatif : le service worker contrôlera uniquement ce dossier et ses sous-dossiers.
  navigator.serviceWorker.register('sw.js').catch((erreur) => {
    console.warn("Service worker non enregistré :", erreur);
  });

  // Une nouvelle version s'est installée pendant que la page tournait : son code attend un rechargement.
  let versionPrete = false;

  // Le navigateur ne cherche une nouvelle version qu'au démarrage de l'app. Or Android garde souvent
  // l'app en arrière-plan : quand on y revient, il la réveille sans la recharger, et ne vérifie rien.
  // On lui demande donc de vérifier à chaque retour dans l'app, en arrière-plan, sans rien bloquer.
  // Au plus une fois par minute : basculer entre deux apps ne doit pas multiplier les requêtes.
  let derniereVerification = Date.now(); // le démarrage vient de vérifier
  document.addEventListener('visibilitychange', async () => {
    // En quittant l'app, si une nouvelle version attend, on recharge maintenant, sans que cela se
    // voie : au retour, le nouveau code est là, et reprise.js remet à la même fiche ou réplique.
    if (document.hidden) {
      if (versionPrete) location.reload();
      return;
    }
    if (Date.now() - derniereVerification < 60_000) return;
    derniereVerification = Date.now();
    const inscription = await navigator.serviceWorker.getRegistration();
    inscription?.update().catch(() => {}); // hors ligne : on réessaiera au prochain retour
  });

  // S'il y a déjà un service worker aux commandes, un changement veut dire « nouvelle version ».
  // S'il n'y en a pas, c'est la toute première installation : rien à annoncer.
  const avaitUnControleur = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitUnControleur) return;
    versionPrete = true;
    // App en arrière-plan : on recharge tout de suite. Sinon on ne coupe rien (un filage, une fiche) :
    // un bandeau propose de recharger, et à défaut l'app le fera quand on la quittera.
    if (document.hidden) location.reload();
    else proposerRechargement();
  });
}

// ---- Démarrage ----

// Sur Chrome, une lecture peut survivre à un rechargement de page : on repart du silence.
if ('speechSynthesis' in window) window.speechSynthesis.cancel();

await chargerLangue(); // avant tout affichage : le premier écran est déjà dans la bonne langue
appliquerAffichage();
voixPretes();
enregistrerServiceWorker();
// Demande au navigateur de ne pas effacer nos données si le téléphone manque de place.
// Il peut accepter ou refuser ; dans les deux cas, l'app fonctionne.
navigator.storage?.persist?.();

// Une erreur imprévue s'affiche à l'écran : sinon, sur un téléphone, on ne verrait qu'une page vide.
function changerEcran() {
  router().catch((erreur) => {
    console.error(erreur);
    zoneEcran.replaceChildren(el('p', { className: 'vide' }, t("Cet écran n'a pas pu s'afficher : {erreur}", { erreur: erreur.message })));
  });
}

// Android vient-il de relancer l'app (Fold déplié, mémoire manquante) ? Elle s'ouvre alors sur
// Mes pièces : on la remet sur l'écran quitté. On écrit l'historique comme si on y était allé
// depuis Mes pièces, pour que le bouton Retour d'Android y ramène au lieu de fermer l'app.
// replaceState et pushState changent l'adresse sans déclencher hashchange : le premier affichage
// est directement le bon.
const adresseQuittee = adresseAReprendre();
if (adresseQuittee && (location.hash === '' || location.hash === '#/')) {
  history.replaceState(null, '', '#/');
  history.pushState(null, '', adresseQuittee);
  parcours.push('#/'); // le parcours aussi : la flèche de retour pourra reculer jusqu'à Mes pièces
}

window.addEventListener('hashchange', changerEcran);
changerEcran();
