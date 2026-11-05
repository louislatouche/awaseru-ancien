// Écran 2 : la pièce complète, scène par scène. Toucher une réplique la lit à voix haute.

import { el, remplacer } from '../dom.js';
import {
  creerAvisVoix, creerInterrupteurs, creerReplique, creerTitreScene, lireReplique,
} from '../affichage.js';
import { arreterVoix } from '../voix.js';
import { lignesDe } from '../pieces.js';
import { creerJaponais } from '../texte.js';
import { lireSelection, lireStatuts } from '../stockage.js';

export function afficherScript(racine, piece) {
  const selection = lireSelection(piece);
  const statuts = lireStatuts(piece.id);

  // La réplique en train d'être lue, pour la mettre en évidence et pouvoir l'arrêter.
  let boutonActif = null;

  function eteindre() {
    boutonActif?.classList.remove('en-lecture');
    boutonActif = null;
  }

  async function surTouche(evenement, ligne) {
    const bouton = evenement.currentTarget;
    // Toucher la réplique en cours de lecture l'arrête.
    if (bouton === boutonActif) {
      arreterVoix();
      eteindre();
      return;
    }
    eteindre();
    boutonActif = bouton;
    bouton.classList.add('en-lecture');
    await lireReplique(ligne);
    // Si on a touché une autre réplique entre-temps, boutonActif a changé : on n'y touche pas.
    if (boutonActif === bouton) eteindre();
  }

  const lignes = lignesDe(piece);

  remplacer(racine,
    el('div', { className: 'en-tete-piece' },
      creerJaponais(piece.titre, 'titre-piece'),
      el('h1', { className: 'vue-titre' }, piece.titre_fr)),
    piece.explication && el('details', { className: 'card explication' },
      el('summary', {}, 'À propos de cette pièce'),
      el('p', {}, piece.explication)),
    creerAvisVoix(),
    creerInterrupteurs(),
    piece.scenes.map((scene) => el('section', { className: 'scene' },
      creerTitreScene(scene),
      lignes.filter((ligne) => ligne.scene === scene).map((ligne) => creerReplique(ligne, piece, {
        mienne: selection.has(ligne.numero),
        statut: statuts[ligne.numero],
        surTouche: (evenement) => surTouche(evenement, ligne),
      })))),
  );
}
