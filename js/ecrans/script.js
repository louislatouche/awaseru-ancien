// Écran 2 : la pièce complète, scène par scène. Toucher une réplique lance la lecture à voix haute :
// celle-ci, puis toutes les suivantes, l'une après l'autre, jusqu'à la fin de la pièce.
// Toucher la réplique lue la met en pause, puis la reprend ; garder le doigt sur une carte arrête tout.

import { cascade, el, icone, remplacer } from '../dom.js';
import {
  creerAvisVoix, creerInterrupteurs, creerReplique, creerTitreScene, libelleLien, lireReplique, suivreLecture,
} from '../affichage.js';
import { t, traduire } from '../langues.js';
import { arreterVoix, mettreEnPauseVoix, reprendreVoix } from '../voix.js';
import { brancherGestes } from '../gestes.js';
import { lignesDe } from '../pieces.js';
import { creerJaponais, texteAParler } from '../texte.js';
import { lireReglages, lireSelection, lireStatuts } from '../stockage.js';

// Les mêmes respirations que le filage : un court silence entre deux répliques, et le temps de lire
// une ligne qui n'est qu'une didascalie quand on ne les fait pas lire à voix haute.
const SILENCE_ENTRE_REPLIQUES = 350; // millisecondes
const DUREE_LIGNE_MUETTE = 1500;

const attendre = (duree) => new Promise((resolve) => { setTimeout(resolve, duree); });

export function afficherScript(racine, piece) {
  const selection = lireSelection(piece);
  const statuts = lireStatuts(piece.id);
  const lignes = lignesDe(piece);
  const cartes = new Map(); // chaque réplique -> sa carte, pour avancer de carte en carte

  // La carte en train d'être lue, pour la mettre en évidence et pouvoir la piloter.
  let carteActive = null;
  let etat = 'arret'; // 'arret', 'lecture' ou 'pause'
  let temoin = null;  // la petite icône lecture / pause dans l'en-tête de la carte lue
  // Le jeton change à chaque arrêt ou nouveau départ : une lecture en continu abandonnée
  // le voit en se réveillant, et s'arrête d'elle-même au lieu d'enchaîner.
  let jeton = 0;
  let verrouEcran = null;

  // L'icône montre ce que fera le prochain toucher : ⏸ pendant la lecture, ▶ pendant la pause.
  function dessinerTemoin() {
    if (temoin) remplacer(temoin, icone(etat === 'lecture' ? 'pause' : 'lecture'));
  }

  function activer(carte) {
    eteindre();
    carteActive = carte;
    etat = 'lecture';
    carte.classList.add('en-lecture');
    temoin = el('span', { className: 'temoin-lecture', 'aria-hidden': 'true' });
    carte.querySelector('.replique-tete')?.append(temoin);
    dessinerTemoin();
  }

  function eteindre() {
    carteActive?.classList.remove('en-lecture');
    temoin?.remove();
    temoin = null;
    carteActive = null;
    etat = 'arret';
  }

  // Garder l'écran allumé pendant la lecture : sinon le téléphone se verrouille au bout d'une
  // minute, et la lecture s'arrête avec lui. Refusé (batterie faible...) : on lit quand même.
  async function garderEcranAllume() {
    try {
      const verrou = await navigator.wakeLock?.request('screen');
      if (carteActive) verrouEcran = verrou;
      else verrou?.release(); // la lecture s'est arrêtée pendant l'attente
    } catch {
      verrouEcran = null;
    }
  }

  function libererEcran() {
    verrouEcran?.release();
    verrouEcran = null;
  }

  function arreter() {
    jeton += 1;
    arreterVoix();
    eteindre();
    libererEcran();
  }

  // Lit la réplique de rang « depart », puis les suivantes, jusqu'à la fin ou jusqu'à un arrêt.
  async function lireAPartirDe(depart) {
    const moi = ++jeton;
    for (let rang = depart; rang < lignes.length; rang += 1) {
      const ligne = lignes[rang];
      const carte = cartes.get(ligne);
      activer(carte);
      if (rang === depart) garderEcranAllume();
      // L'écran suit la lecture (la première carte, on vient de la toucher : elle est déjà visible).
      else carte.scrollIntoView({ block: 'center' });

      let resultat = 'fini';
      if (texteAParler(ligne.texte, lireReglages().lireDidascalies)) {
        // Le filet de la carte en fait le tour à mesure de la lecture.
        const finirFilet = suivreLecture(carte);
        resultat = await lireReplique(ligne);
        finirFilet();
      } else {
        await attendre(DUREE_LIGNE_MUETTE);
      }
      if (moi !== jeton) return; // arrêtée, ou une autre réplique a été touchée entre-temps
      if (resultat !== 'fini') break; // lecture impossible (lireReplique l'a déjà signalé)
      await attendre(SILENCE_ENTRE_REPLIQUES);
      // Mise en pause entre deux répliques : on attend la reprise avant de passer à la suivante.
      while (etat === 'pause' && moi === jeton) await attendre(150);
      if (moi !== jeton) return;
    }
    eteindre();
    libererEcran();
  }

  // Pause : avec les voix enregistrées, la réplique garde sa place. La voix du téléphone, elle,
  // ne sait pas faire de pause sur Android : la lecture s'arrête, et un nouveau toucher repart
  // du début de la réplique.
  function mettreEnPause() {
    mettreEnPauseVoix();
    etat = 'pause';
    dessinerTemoin();
    libererEcran();
  }

  function reprendre() {
    etat = 'lecture';
    // Un fichier mis en pause repart d'où il était. Entre deux répliques, rien à relancer :
    // la boucle de lireAPartirDe voit la reprise et passe d'elle-même à la suivante.
    reprendreVoix();
    dessinerTemoin();
    garderEcranAllume();
  }

  function surTouche(evenement, ligne) {
    // Une autre réplique que celle en cours : la lecture repart de celle-là.
    if (evenement.currentTarget !== carteActive) lireAPartirDe(lignes.indexOf(ligne));
    // La réplique en cours : pause, puis reprise, comme le bouton lecture des fiches.
    else if (etat === 'lecture') mettreEnPause();
    else reprendre();
  }

  // Quitter l'app ou éteindre l'écran met la lecture en pause, comme le filage :
  // elle ne doit pas continuer dans une poche, mais on doit pouvoir la reprendre.
  function surVisibilite() {
    if (document.hidden && etat === 'lecture') mettreEnPause();
  }
  document.addEventListener('visibilitychange', surVisibilite);

  const rolesAvecLien = piece.roles.filter((role) => role.lien);

  // L'accordéon du design kit : son corps s'ouvre en glissant, ce qu'un simple <details> ne fait pas.
  const apropos = el('div', { className: 'card acc-card' },
    el('button', {
      type: 'button',
      className: 'acc-header',
      'aria-expanded': 'false',
      onclick: (evenement) => {
        const ouvert = apropos.classList.toggle('is-open');
        evenement.currentTarget.setAttribute('aria-expanded', String(ouvert));
      },
    }, el('span', { className: 'acc-title' }, t('À propos de cette pièce')), el('span', { className: 'acc-chevron' }, icone('chevron'))),
    el('div', { className: 'acc-collapse' },
      el('div', { className: 'acc-inner' },
        el('div', { className: 'acc-pad' },
          piece.explication && el('p', {}, traduire(piece, 'explication')),
          rolesAvecLien.map((role) => el('div', { className: 'lien-role' },
            el('span', { className: 'coche-texte' },
              creerJaponais(role.nom, 'role'),
              el('span', { className: 'role-fr' }, traduire(role, 'nom_fr'))),
            // noopener empêche la page ouverte d'agir sur notre app.
            el('a', { className: 'btn-ghost btn-petit', href: role.lien, target: '_blank', rel: 'noopener noreferrer' }, libelleLien(role.lien))))))));

  remplacer(racine,
    el('div', { className: 'en-tete-piece' },
      creerJaponais(piece.titre, 'titre-piece'),
      el('h1', { className: 'vue-titre' }, traduire(piece, 'titre_fr'))),
    (piece.explication || rolesAvecLien.length > 0) && apropos,
    creerAvisVoix(piece),
    creerInterrupteurs(piece.id),
    piece.scenes.map((scene) => el('section', { className: 'scene' },
      creerTitreScene(scene),
      lignes.filter((ligne) => ligne.scene === scene).map((ligne) => {
        const carte = creerReplique(ligne, piece, {
          mienne: selection.has(ligne.numero),
          statut: statuts[ligne.numero],
          surTouche: (evenement) => surTouche(evenement, ligne),
        });
        // Garder le doigt sur une carte arrête toute la lecture, comme sur le bouton lecture.
        brancherGestes(carte, { maintenir: () => { if (carteActive) arreter(); } });
        cartes.set(ligne, carte);
        return carte;
      }))),
  );
  cascade(racine);

  // Appelé par le routeur quand on quitte l'écran : la lecture en continu s'arrête.
  return () => {
    arreter();
    document.removeEventListener('visibilitychange', surVisibilite);
  };
}
