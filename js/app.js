// Point d'entrée de l'app : c'est le seul script chargé par index.html, il importe tous les autres.
// Son rôle : regarder l'adresse et afficher l'écran correspondant.
//
// L'app n'a qu'une seule page HTML. L'adresse se termine par exemple par #/piece/xxx/script :
// ce qui suit le # (le « hash ») ne part jamais au serveur. On peut donc changer d'écran sans
// recharger, garder des chemins relatifs, et le bouton Retour d'Android fonctionne tout seul.

import { el, hautDePage, icone, remplacer } from './dom.js';
import { appliquerAffichage } from './affichage.js';
import { trouverPiece } from './pieces.js';
import { texteBrut } from './texte.js';
import { arreterVoix, voixPretes } from './voix.js';
import { afficherBibliotheque } from './ecrans/bibliotheque.js';
import { afficherFiches } from './ecrans/fiches.js';
import { afficherFilage } from './ecrans/filage.js';
import { afficherMesRepliques } from './ecrans/mes-repliques.js';
import { afficherReglages } from './ecrans/reglages.js';
import { afficherScript } from './ecrans/script.js';

const ONGLETS = [
  { chemin: 'script', libelle: 'Script', icone: 'script', afficher: afficherScript },
  { chemin: 'mes-repliques', libelle: 'Mes répliques', icone: 'repliques', afficher: afficherMesRepliques },
  { chemin: 'fiches', libelle: 'Fiches', icone: 'fiches', afficher: afficherFiches },
  { chemin: 'filage', libelle: 'Filage', icone: 'filage', afficher: afficherFilage },
];

const zoneBarre = document.getElementById('barre');
const zoneEcran = document.getElementById('ecran');
const zoneOnglets = document.getElementById('onglets');

// L'en-tête, comme dans Faktur : le mot-symbole, avec en dessous le nom de la pièce ouverte.
function afficherBarre(sousTitre, { retour = false, reglages = false } = {}) {
  remplacer(zoneBarre,
    retour && el('a', { className: 'icon-btn', href: '#/', 'aria-label': 'Retour aux pièces' }, icone('retour')),
    el('a', { className: 'brand', href: '#/' },
      el('strong', { className: 'wordmark' }, 'replik'),
      sousTitre && el('small', {}, sousTitre)),
    reglages && el('a', { className: 'icon-btn', href: '#/reglages', 'aria-label': 'Réglages' }, icone('reglages')),
  );
}

function afficherOnglets(piece, actif) {
  zoneOnglets.hidden = !piece;
  if (!piece) return;
  const base = `#/piece/${encodeURIComponent(piece.id)}`;
  remplacer(zoneOnglets, ONGLETS.map((onglet) => el('a', {
    className: onglet.chemin === actif ? 'tab is-active' : 'tab',
    href: `${base}/${onglet.chemin}`,
    // aria-current indique l'onglet actif aux lecteurs d'écran.
    ...(onglet.chemin === actif ? { 'aria-current': 'page' } : {}),
  }, icone(onglet.icone), el('span', {}, onglet.libelle))));
}

// Numéro de l'affichage en cours et nettoyage de l'écran précédent (minuteurs, écouteurs...).
let numeroAffichage = 0;
let nettoyer = null;

async function router() {
  const moi = ++numeroAffichage;
  arreterVoix();
  nettoyer?.();
  nettoyer = null;

  const morceaux = location.hash.replace(/^#\/?/, '').split('/');
  let afficher;
  let piece = null;
  let ongletActif = null;

  if (morceaux[0] === 'reglages') {
    afficherBarre(null, { retour: true });
    afficher = afficherReglages;
  } else if (morceaux[0] === 'piece' && morceaux[1]) {
    piece = await trouverPiece(decodeURIComponent(morceaux[1]));
    const onglet = ONGLETS.find((o) => o.chemin === morceaux[2]) ?? ONGLETS[0];
    if (piece) {
      afficherBarre(piece.titre_fr, { retour: true, reglages: true });
      afficher = onglet.afficher;
      ongletActif = onglet.chemin;
    } else {
      // Par exemple un favori vers une pièce importée qui a été supprimée depuis.
      afficherBarre('Pièce introuvable', { retour: true });
      afficher = (racine) => racine.append(el('p', { className: 'vide' }, "Cette pièce n'est plus sur ce téléphone."));
    }
  } else {
    afficherBarre(null, { reglages: true });
    afficher = afficherBibliotheque;
  }

  if (moi !== numeroAffichage) return;
  afficherOnglets(piece, ongletActif);
  document.title = piece ? `${texteBrut(piece.titre)} · Replik` : 'Replik';

  // Chaque écran se construit dans un élément neuf, placé dans la page une fois prêt.
  // Si l'utilisateur a déjà changé d'écran entre-temps (les écrans peuvent attendre le chargement
  // des pièces), le numéro aura changé et on jette ce résultat devenu inutile.
  const racine = el('div', { className: 'ecran-contenu' });
  const nettoyage = await afficher(racine, piece);
  if (moi !== numeroAffichage) {
    nettoyage?.();
    return;
  }
  nettoyer = nettoyage ?? null;
  zoneEcran.replaceChildren(racine);
  hautDePage();
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

  // S'il y a déjà un service worker aux commandes, un changement veut dire « nouvelle version ».
  // S'il n'y en a pas, c'est la toute première installation : rien à annoncer.
  const avaitUnControleur = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitUnControleur) return;
    // On ne recharge pas tout seul : cela couperait un filage en cours. L'utilisateur choisit.
    const bandeau = el('button', {
      type: 'button',
      className: 'btn bandeau-maj',
      onclick: () => location.reload(),
    }, 'Nouvelle version prête : toucher pour recharger');
    document.body.append(bandeau);
  });
}

// ---- Démarrage ----

// Sur Chrome, une lecture peut survivre à un rechargement de page : on repart du silence.
if ('speechSynthesis' in window) window.speechSynthesis.cancel();

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
    zoneEcran.replaceChildren(el('p', { className: 'vide' }, `Cet écran n'a pas pu s'afficher : ${erreur.message}`));
  });
}

window.addEventListener('hashchange', changerEcran);
changerEcran();
