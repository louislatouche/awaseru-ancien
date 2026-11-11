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
import { montrerGestes, proposerTuto, tutoAVoir } from '../tuto.js';

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
  // Le jeton change à chaque arrêt ou nouveau départ : une lecture en continu abandonnée
  // le voit en se réveillant, et s'arrête d'elle-même au lieu d'enchaîner.
  let jeton = 0;
  let verrouEcran = null;

  // La carte lue se distingue par son ombre, sa couleur (sauf la mienne, qui garde son ambre) et le
  // filet qui en fait le tour. Aucune icône : Louis n'en veut pas sur les cartes.
  function activer(carte) {
    eteindre();
    carteActive = carte;
    etat = 'lecture';
    carte.classList.add('en-lecture');
  }

  function eteindre() {
    carteActive?.classList.remove('en-lecture');
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
    libererEcran();
  }

  function reprendre() {
    etat = 'lecture';
    // Un fichier mis en pause repart d'où il était. Entre deux répliques, rien à relancer :
    // la boucle de lireAPartirDe voit la reprise et passe d'elle-même à la suivante.
    reprendreVoix();
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
  // La première réplique de la pièce, posée dans un cadre qui portera la pastille du tuto (plus bas) :
  // la pastille est un bouton, et un bouton ne peut pas se trouver dans la carte, qui en est un aussi.
  let cadreTuto = null;

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
        if (ligne !== lignes[0] || !tutoAVoir('script')) return carte;
        cadreTuto = el('div', { className: 'cadre-tuto' }, carte);
        return cadreTuto;
      }))),
  );
  cascade(racine);

  // Le tuto (tuto.js) : une pastille « ? » au coin de la première réplique. Le doigt fantôme la
  // touche (elle s'éclaire comme lue, sans qu'aucun son ne parte), la retouche (pause), touche la
  // suivante (la lecture repart de là), puis garde le doigt dessus (arrêt). Une vraie lecture en
  // cours se met en pause le temps de la démo (sinon elle ferait défiler l'écran, sans qu'on puisse
  // l'arrêter), et reprend à la fin ; sa carte reste éclairée, la démo n'éclaire alors rien.
  if (cadreTuto) {
    const premiere = cartes.get(lignes[0]);
    const seconde = cartes.get(lignes[1]);
    const cartesDeLaDemo = [premiere, seconde].filter(Boolean);
    const eclairer = (carte) => {
      if (carteActive) return;
      for (const autre of cartesDeLaDemo) autre.classList.toggle('en-lecture', autre === carte);
    };
    // Après la démo, même arrêtée en route (l'écran a changé) : plus aucune carte éclairée, sauf celle qui se lit vraiment.
    const eteindreLaDemo = () => {
      for (const autre of cartesDeLaDemo) if (autre !== carteActive) autre.classList.remove('en-lecture');
    };
    proposerTuto('script', cadreTuto, () => {
      const lue = carteActive;
      const misEnPause = etat === 'lecture';
      if (misEnPause) mettreEnPause();
      montrerGestes({
        carte: premiere,
        cadre: cadreTuto,
        ecran: racine,
        etapes: [
          { geste: 'toucher', titre: t('Toucher'), texte: t('écouter la réplique, puis les suivantes'), agir: () => eclairer(premiere) },
          { geste: 'toucher', titre: t('Toucher encore'), texte: t('pause, ou reprendre') },
          seconde && { geste: 'toucher', titre: t('Toucher une autre réplique'), texte: t('la lecture repart de là'), cible: seconde, agir: () => eclairer(seconde) },
          { geste: 'maintenir', titre: t('Appui long'), texte: t("arrêter l'écoute"), cible: seconde ?? premiere, agir: () => eclairer(null) },
        ].filter(Boolean),
        // La voix du téléphone ne sait pas faire de pause : elle s'est arrêtée. La lecture repart
        // alors du début de la réplique qui se lisait, comme après un toucher sur sa carte.
        fin: () => {
          if (!misEnPause) return;
          if (etat === 'pause') reprendre();
          else if (etat === 'arret') lireAPartirDe([...cartes.values()].indexOf(lue));
        },
        nettoyer: eteindreLaDemo,
      });
    });
  }

  // Appelé par le routeur quand on quitte l'écran : la lecture en continu s'arrête.
  return () => {
    arreter();
    document.removeEventListener('visibilitychange', surVisibilite);
  };
}
