// Les briques d'affichage réutilisées par plusieurs écrans.
// Les noms de classes (btn, card, chip, pill, eyebrow...) sont ceux du design kit.

import { el, signaler } from './dom.js';
import { creerJaponais, texteAParler } from './texte.js';
import { changerReglage, lireReglages } from './stockage.js';
import { roleDe } from './pieces.js';
import {
  AIDE_INSTALLATION, lectureDisponible, messagePourResultat, parler, voixJaponaises, voixPretes,
} from './voix.js';

// Furigana et traduction se masquent avec une classe sur <html> : le CSS fait le reste.
// Pas besoin de reconstruire la page, et le choix s'applique à tous les écrans à la fois.
export function appliquerAffichage() {
  const { furigana, traduction } = lireReglages();
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
    surChoix(valeur);
  }

  marquer(valeurInitiale);
  return el('div', { className: 'chips' }, chips.map((element) => element.chip));
}

function creerInterrupteur(libelle, nomReglage) {
  return creerBascule(libelle, lireReglages()[nomReglage], (actif) => {
    changerReglage(nomReglage, actif);
    appliquerAffichage();
  });
}

export function creerInterrupteurs() {
  return el('div', { className: 'interrupteurs' },
    creerInterrupteur('Furigana', 'furigana'),
    creerInterrupteur('Traduction', 'traduction'));
}

// Le grand titre d'un écran, avec éventuellement un complément à sa droite.
export function creerTitreVue(titre, complement = null) {
  return el('div', { className: 'vue-tete' }, el('h1', { className: 'vue-titre' }, titre), complement);
}

// Lit une réplique en appliquant les réglages, et signale un éventuel problème.
export async function lireReplique(ligne) {
  const texte = texteAParler(ligne.texte, lireReglages().lireDidascalies);
  const resultat = await parler(texte);
  const message = messagePourResultat(resultat);
  if (message) signaler(message, 9000);
  return resultat;
}

// Un encadré qui apparaît seulement s'il n'y a vraiment aucune voix japonaise.
// Il faut attendre que la liste des voix soit chargée avant de conclure.
export function creerAvisVoix() {
  const avis = el('p', { className: 'avis', hidden: true });
  voixPretes().then(() => {
    if (voixJaponaises().length > 0) return;
    avis.textContent = lectureDisponible()
      ? AIDE_INSTALLATION
      : 'Ce navigateur ne sait pas lire à voix haute. Utilise Chrome sur Android.';
    avis.hidden = false;
  });
  return avis;
}

// Le nom d'un rôle : la version courte si elle existe, car l'espace est compté sur un téléphone.
export function creerNomRole(piece, idRole) {
  const role = roleDe(piece, idRole);
  if (!role) return el('span', { className: 'role role-vide' }, 'Sans rôle');
  return creerJaponais(role.nom_court ?? role.nom, 'role');
}

export function creerTitreScene(scene) {
  return el('h2', { className: 'titre-scene' },
    el('span', { className: 'eyebrow' }, `Scène ${scene.numero}`),
    creerJaponais(scene.titre, 'scene-japonais'),
    el('span', { className: 'scene-fr traduction' }, scene.titre_fr));
}

// La pastille d'état. Elle est écrite en toutes lettres : la couleur seule
// ne suffit pas à tout le monde, ni en plein soleil.
const PASTILLES = {
  su: { classe: 'pill--ok', libelle: 'Sue' },
  a_revoir: { classe: 'pill--warn', libelle: 'À revoir' },
  aucun: { classe: 'pill--mute', libelle: 'Pas travaillée' },
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
      role && el('span', { className: 'role-fr traduction' }, role.nom_fr),
      pastille && el('span', { className: `pill statut ${pastille.classe}` }, pastille.libelle)),
    el('span', { className: 'replique-masque' }, 'À toi de dire cette réplique'),
    creerJaponais(ligne.texte, 'japonais'),
    el('span', { className: 'replique-fr traduction' }, ligne.fr),
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
      `Changement de rôle : tu viens de dire la ${avant.numero} en `,
      creerNomRole(piece, avant.role),
      ' et tu continues en ',
      creerNomRole(piece, ligne.role),
      '.'));
  }
  if (apres) {
    avis.push(el('p', { className: 'avis avis-enchainement' },
      `Changement de rôle : juste après, tu enchaînes avec la ${apres.numero} en `,
      creerNomRole(piece, apres.role),
      '.'));
  }
  return avis;
}

export function creerAvisSansSelection(piece) {
  return el('div', { className: 'vide' },
    el('p', {}, "Tu n'as encore choisi aucune réplique pour cette pièce."),
    el('a', { className: 'btn', href: `#/piece/${encodeURIComponent(piece.id)}/mes-repliques` }, 'Choisir mes répliques'));
}
