// Les briques d'affichage réutilisées par plusieurs écrans.
// Les noms de classes (btn, card, chip, pill, eyebrow...) sont ceux du design kit.

import { brancherAppuiLong, el, icone, rebond, remplacer, signaler } from './dom.js';
import { langueActive, t, traduire } from './langues.js';
import { creerJaponais, texteAParler } from './texte.js';
import { changerAffichagePiece, changerReglage, lireAffichage, lireReglages } from './stockage.js';
import { roleDe } from './pieces.js';
import {
  aideInstallation, arreterVoix, jouerFichier, lectureDisponible, messagePourResultat, mettreEnPauseVoix, parler,
  progressionVoix, reprendreVoix, voixJaponaises, voixPretes,
} from './voix.js';

// La pièce affichée : ses propres choix de furigana et de traduction passent avant le choix général.
let pieceAffichee = null;

// Furigana et traduction se masquent avec une classe sur <html> : le CSS fait le reste.
// Pas besoin de reconstruire la page, et le choix s'applique à tous les écrans à la fois.
// Le routeur donne la pièce à chaque changement d'écran (null hors d'une pièce : le choix général).
export function appliquerAffichage(pieceId = pieceAffichee) {
  pieceAffichee = pieceId;
  const { furigana, traduction } = lireAffichage(pieceId);
  document.documentElement.lang = langueActive();
  document.documentElement.classList.toggle('sans-furigana', !furigana);
  document.documentElement.classList.toggle('sans-traduction', !traduction);
}

// Une chip qui s'allume et s'éteint : un interrupteur oui/non.
export function creerBascule(libelle, actif, surChangement, { desactive = false } = {}) {
  const chip = el('button', {
    type: 'button',
    className: actif ? 'chip is-selected' : 'chip',
    disabled: desactive,
    'aria-pressed': String(actif), // annonce l'état aux lecteurs d'écran
    onclick: () => {
      actif = !actif;
      chip.classList.toggle('is-selected', actif);
      chip.setAttribute('aria-pressed', String(actif));
      if (actif) rebond(chip);
      surChangement(actif);
    },
  }, libelle);
  return chip;
}

// Un groupe de chips dont une seule est choisie à la fois.
// options : une liste de { valeur, libelle }.
export function creerChoixUnique(options, valeurInitiale, surChoix) {
  const chips = options.map((option) => {
    const chip = el('button', { type: 'button', className: 'chip', onclick: () => choisir(option.valeur) }, option.libelle);
    return { chip, valeur: option.valeur };
  });

  function marquer(valeur) {
    for (const element of chips) {
      const choisie = element.valeur === valeur;
      element.chip.classList.toggle('is-selected', choisie);
      element.chip.setAttribute('aria-pressed', String(choisie));
    }
  }

  function choisir(valeur) {
    marquer(valeur);
    rebond(chips.find((element) => element.valeur === valeur).chip);
    surChoix(valeur);
  }

  marquer(valeurInitiale);
  return el('div', { className: 'chips' }, chips.map((element) => element.chip));
}

// Sur les écrans d'une pièce : ces interrupteurs ne changent que cette pièce.
// Le choix pour toutes les pièces se fait dans les Réglages.
function creerInterrupteur(libelle, nom, pieceId) {
  return creerBascule(libelle, lireAffichage(pieceId)[nom], (actif) => {
    changerAffichagePiece(pieceId, nom, actif);
    appliquerAffichage(pieceId);
  });
}

export function creerInterrupteurs(pieceId) {
  return el('div', { className: 'interrupteurs' },
    creerInterrupteur(t('Furigana'), 'furigana', pieceId),
    creerInterrupteur(t('Traduction'), 'traduction', pieceId));
}

// Le grand titre d'un écran, avec éventuellement un complément à sa droite.
export function creerTitreVue(titre, complement = null) {
  return el('div', { className: 'vue-tete' }, el('h1', { className: 'vue-titre' }, titre), complement);
}

// Cette pièce sera-t-elle lue avec ses fichiers audio, plutôt qu'avec la voix du téléphone ?
export function audioActif(piece) {
  return Boolean(piece?.audio) && lireReglages().voixEnregistrees;
}

// Lit une réplique : son fichier audio s'il existe, sinon la voix du téléphone.
// Signale un éventuel problème à l'utilisateur.
export async function lireReplique(ligne) {
  const { lireDidascalies, voixEnregistrees } = lireReglages();
  const texte = texteAParler(ligne.texte, lireDidascalies);
  let resultat = 'erreur:fichier';

  if (ligne.audio && voixEnregistrees && texte) {
    // Si la réplique a une didascalie et que le réglage la garde, il existe une seconde version.
    const avecDidascalie = texte !== texteAParler(ligne.texte, false);
    resultat = await jouerFichier(`${ligne.audio}${avecDidascalie ? '-didascalies' : ''}.mp3`);
  }
  // Pas de fichier, ou fichier illisible : la voix du téléphone prend le relais.
  if (resultat === 'erreur:fichier') resultat = await parler(texte);

  const message = messagePourResultat(resultat);
  if (message) signaler(message, 9000);
  return resultat;
}

// Le réglage Navigation demande-t-il le nom sous chaque icône ?
const avecLabels = () => lireReglages().navigation === 'icones-labels';

// Un bouton à icône. Selon le réglage Navigation, son nom s'écrit dessous, ou reste seulement
// dans aria-label (lu par les lecteurs d'écran) et dans title (affiché au survol sur ordinateur).
// mot : un nom plus court pour l'écrire sous l'icône, si le libellé complet est trop long.
export function creerBoutonIcone(nomIcone, libelle, classe, onclick, mot = libelle) {
  const ecrit = avecLabels();
  return el('button', {
    type: 'button', className: `${classe} bouton-icone${ecrit ? ' avec-label' : ''}`, title: libelle, 'aria-label': libelle, onclick,
  }, icone(nomIcone), ecrit && el('span', { className: 'label' }, mot));
}

// L'écoute d'une réplique : la mienne (bouton ▶ et carte), ou mon signal (sa carte seulement).
// Un toucher lance la lecture, le suivant la met en pause, le suivant la reprend là où elle était.
// Un appui long arrête tout et revient au début. Un trait au pied du bouton, et le filet de la
// carte, montrent où en est la lecture (avec les voix enregistrées : la voix du téléphone ne le dit pas).
//
// Renvoie { bouton, toucher, arreter, lierCarte } : le bouton à placer dans la page, et de quoi
// piloter la lecture depuis la carte (toucher, et arreter pour l'appui long).
// lierCarte(carte) : le filet de la carte suit alors la lecture (voir dessinerFilet). Seulement quand
// le bouton n'est pas à l'écran (mode Gestes, signal des fiches) : sinon son trait suffit. Avec
// { avecTemoin: true }, une petite icône lecture / pause s'affiche aussi dans son en-tête.
// surLecture est appelée à chaque lancement (les fiches s'en servent pour permettre l'évaluation).
// libelle : le nom du bouton à l'arrêt.
export function creerEcoute(ligne, { surLecture = null, libelle: libelleArret = t('Écouter ma réplique') } = {}) {
  let etat = 'arret'; // 'arret', 'lecture' ou 'pause'
  // Le jeton change à chaque arrêt voulu : la fin d'une lecture abandonnée ne touche plus au bouton.
  let jeton = 0;
  let carte = null;   // la carte liée, dont le filet suit la lecture
  let temoin = null;  // la petite icône dans l'en-tête de la carte

  const ecrit = avecLabels();
  const trait = el('span', { className: 'progression', hidden: true });
  const bouton = el('button', { type: 'button', className: `btn-ghost bouton-icone${ecrit ? ' avec-label' : ''}` });

  function majTrait() {
    const avance = progressionVoix();
    trait.hidden = etat === 'arret' || avance === null;
    trait.style.setProperty('--p', `${(avance ?? 0) * 100}%`);
    if (carte) dessinerFilet(carte, etat);
  }

  // Pendant la lecture, le trait avance à chaque image affichée par l'écran.
  function suivre() {
    majTrait();
    if (etat === 'lecture') requestAnimationFrame(suivre);
  }

  function dessiner() {
    const libelle = { arret: libelleArret, lecture: t('Pause'), pause: t('Reprendre') }[etat];
    // Sous l'icône, le mot court : « Écouter » tient dans un quart d'écran, pas la phrase entière.
    const mot = etat === 'arret' ? t('Écouter') : libelle;
    const nomIcone = etat === 'lecture' ? 'pause' : 'lecture';
    bouton.title = libelle;
    bouton.setAttribute('aria-label', libelle);
    remplacer(bouton, icone(nomIcone), ecrit && el('span', { className: 'label' }, mot), trait);
    if (temoin) remplacer(temoin, icone(nomIcone));
    majTrait();
  }

  async function lancer() {
    const moi = ++jeton;
    etat = 'lecture';
    dessiner();
    suivre();
    surLecture?.();
    // La promesse se termine à la fin de la réplique, ou si une autre lecture prend la place
    // (le signal qu'on réécoute, la fiche suivante, un changement d'écran...).
    await lireReplique(ligne);
    if (moi !== jeton) return;
    etat = 'arret';
    dessiner();
  }

  function arreter() {
    jeton += 1;
    arreterVoix();
    etat = 'arret';
    dessiner();
  }

  function toucher() {
    if (etat === 'arret') {
      lancer();
    } else if (etat === 'lecture') {
      // Avec la voix du téléphone, la pause est impossible : la lecture s'arrête, et la fin
      // de lancer() remettra le bouton au départ.
      if (mettreEnPauseVoix()) {
        etat = 'pause';
        dessiner();
      }
    } else if (reprendreVoix()) {
      etat = 'lecture';
      dessiner();
      suivre();
    } else {
      lancer(); // plus rien à reprendre : on recommence
    }
  }

  // La carte se lie après coup : elle a besoin de toucher() pour exister, et l'écoute a besoin d'elle.
  function lierCarte(nouvelleCarte, { avecTemoin = false } = {}) {
    carte = nouvelleCarte;
    if (avecTemoin) {
      temoin = el('span', { className: 'temoin-lecture', 'aria-hidden': 'true' });
      carte.querySelector('.replique-tete')?.append(temoin);
    }
    dessiner();
  }

  brancherAppuiLong(bouton, { toucher, maintenir: arreter });
  dessiner();
  return { bouton, toucher, arreter, lierCarte };
}

// ---- Le filet de lecture : un trait qui fait le tour de la carte à mesure qu'elle est lue ----

const ESPACE_SVG = 'http://www.w3.org/2000/svg';

// Le dessin posé sur la carte : une piste pâle, et par-dessus le trait qui avance. Créé au premier besoin.
function filetDe(carte) {
  let filet = carte.querySelector(':scope > .filet-lecture');
  if (filet) return filet;
  filet = document.createElementNS(ESPACE_SVG, 'svg');
  filet.setAttribute('class', 'filet-lecture');
  filet.setAttribute('aria-hidden', 'true');
  for (const classe of ['piste', 'trait-lecture']) {
    const rectangle = document.createElementNS(ESPACE_SVG, 'rect');
    rectangle.setAttribute('class', classe);
    filet.append(rectangle);
  }
  carte.append(filet);
  return filet;
}

// Met à jour le filet d'une carte selon la lecture : etat vaut 'lecture', 'pause' ou 'arret'.
// En pause, le trait reste où il en était. La voix du téléphone ne dit pas où elle en est :
// pour elle, on garde l'anneau qui tourne du design kit (is-syncing).
export function dessinerFilet(carte, etat) {
  const avance = progressionVoix();
  const connue = avance !== null;
  carte.classList.toggle('is-syncing', etat === 'lecture' && !connue);
  const visible = etat !== 'arret' && connue;
  carte.classList.toggle('avec-filet', visible);
  if (!visible) return;
  const trait = filetDe(carte).querySelector('.trait-lecture');
  // La longueur du tour de la carte, en pixels : le trait en couvre la part déjà lue,
  // le reste est un « trou » dans les pointillés (stroke-dasharray et stroke-dashoffset).
  const longueur = trait.getTotalLength();
  trait.style.strokeDasharray = `${longueur}px`;
  trait.style.strokeDashoffset = `${longueur * (1 - avance)}px`;
}

// Pour une lecture lancée directement avec lireReplique (le filage, le script) : le filet de la
// carte suit la voix image après image, jusqu'à ce qu'on appelle la fonction renvoyée.
export function suivreLecture(carte) {
  let actif = true;
  const image = () => {
    if (!actif) return;
    dessinerFilet(carte, 'lecture');
    requestAnimationFrame(image);
  };
  image();
  return () => {
    actif = false;
    dessinerFilet(carte, 'arret');
  };
}

// Un encadré qui apparaît seulement s'il n'y a vraiment aucune voix japonaise.
// Il faut attendre que la liste des voix soit chargée avant de conclure.
// Inutile pour une pièce lue avec ses fichiers audio.
export function creerAvisVoix(piece = null) {
  const avis = el('p', { className: 'avis', hidden: true });
  voixPretes().then(() => {
    if (voixJaponaises().length > 0 || audioActif(piece)) return;
    avis.textContent = lectureDisponible()
      ? aideInstallation()
      : t('Ce navigateur ne sait pas lire à voix haute. Utilise Chrome sur Android.');
    avis.hidden = false;
  });
  return avis;
}

// Le libellé d'un lien dit ce qu'on trouvera derrière : une vidéo, ou sinon un simple lien.
export function libelleLien(adresse) {
  const site = new URL(adresse).hostname.replace(/^(www|m)\./, '');
  return ['youtube.com', 'youtu.be', 'vimeo.com'].includes(site) ? t('Voir la vidéo') : t('Ouvrir le lien');
}

// Le nom d'un rôle : la version courte si elle existe, car l'espace est compté sur un téléphone.
export function creerNomRole(piece, idRole) {
  const role = roleDe(piece, idRole);
  if (!role) return el('span', { className: 'role role-vide' }, t('Sans rôle'));
  return creerJaponais(role.nom_court ?? role.nom, 'role');
}

export function creerTitreScene(scene) {
  return el('h2', { className: 'titre-scene' },
    el('span', { className: 'eyebrow' }, t('Scène {n}', { n: scene.numero })),
    creerJaponais(scene.titre, 'scene-japonais'),
    el('span', { className: 'scene-fr traduction' }, traduire(scene, 'titre_fr')));
}

// La pastille d'état. Elle est écrite en toutes lettres : la couleur seule
// ne suffit pas à tout le monde, ni en plein soleil.
const PASTILLES = {
  su: { classe: 'pill--ok', libelle: () => t('Sue') },
  a_revoir: { classe: 'pill--warn', libelle: () => t('À revoir') },
  aucun: { classe: 'pill--mute', libelle: () => t('Pas travaillée') },
};

// Une réplique complète. Avec surTouche, c'est un bouton (écran Script) ; sinon un simple bloc.
export function creerReplique(ligne, piece, { mienne = false, statut, cachee = false, surTouche = null } = {}) {
  const classes = ['replique'];
  if (mienne) classes.push('mienne');
  if (cachee) classes.push('est-cachee');

  // Le statut n'a de sens que pour mes répliques.
  const pastille = (mienne || statut) ? PASTILLES[statut ?? 'aucun'] : null;

  const role = roleDe(piece, ligne.role);
  const contenu = [
    el('span', { className: 'replique-tete' },
      el('span', { className: 'numero' }, String(ligne.numero)),
      creerNomRole(piece, ligne.role),
      role && el('span', { className: 'role-fr traduction' }, traduire(role, 'nom_fr')),
      pastille && el('span', { className: `pill statut ${pastille.classe}` }, pastille.libelle())),
    el('span', { className: 'replique-masque' }, t('À toi de dire cette réplique')),
    creerJaponais(ligne.texte, 'japonais'),
    el('span', { className: 'replique-fr traduction' }, traduire(ligne, 'fr')),
  ];

  return surTouche
    ? el('button', { type: 'button', className: classes.join(' '), onclick: surTouche }, contenu)
    : el('div', { className: classes.join(' ') }, contenu);
}

// Les avertissements quand deux de mes répliques s'enchaînent avec un changement de rôle.
export function creerAvisEnchainement(piece, ligne, { avant, apres }) {
  const avis = [];
  if (avant) {
    avis.push(el('p', { className: 'avis avis-enchainement' },
      t('Changement de rôle : tu viens de dire la {n} en ', { n: avant.numero }),
      creerNomRole(piece, avant.role),
      t(' et tu continues en '),
      creerNomRole(piece, ligne.role),
      t('.')));
  }
  if (apres) {
    avis.push(el('p', { className: 'avis avis-enchainement' },
      t('Changement de rôle : juste après, tu enchaînes avec la {n} en ', { n: apres.numero }),
      creerNomRole(piece, apres.role),
      t('.')));
  }
  return avis;
}

export function creerAvisSansSelection(piece) {
  return el('div', { className: 'vide' },
    el('p', {}, t("Tu n'as encore choisi aucune réplique pour cette pièce.")),
    el('a', { className: 'btn', href: `#/piece/${encodeURIComponent(piece.id)}/mes-repliques` }, t('Choisir mes répliques')));
}
