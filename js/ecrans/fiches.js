// Écran 4 : répétition en fiches. Le signal d'entrée est lu, ma réplique est cachée, je m'évalue.

import { el, hautDePage, remplacer } from '../dom.js';
import {
  creerAvisEnchainement, creerAvisSansSelection, creerAvisVoix, creerBascule, creerChoixUnique,
  creerInterrupteurs, creerReplique, creerTitreVue, lireReplique,
} from '../affichage.js';
import { enchainementsDe, lignesDe, signalDe } from '../pieces.js';
import { changerStatut, lireSelection, lireStatuts } from '../stockage.js';

// Mélange de Fisher-Yates : la méthode classique pour que chaque ordre ait la même chance.
// (Le célèbre tri par Math.random() - 0.5 est, lui, biaisé.)
function melanger(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

export function afficherFiches(racine, piece) {
  const lignes = lignesDe(piece);

  function ecranDepart() {
    const selection = lireSelection(piece);
    const statuts = lireStatuts(piece.id);
    const miennes = lignes.filter((l) => selection.has(l.numero));
    const aRevoir = miennes.filter((l) => statuts[l.numero] === 'a_revoir');

    if (miennes.length === 0) {
      remplacer(racine, creerAvisSansSelection(piece));
      return;
    }

    let melangees = false;
    let seulementARevoir = false;

    remplacer(racine,
      creerTitreVue('Fiches', el('span', { className: 'pill pill--ok' }, `${miennes.length} ${miennes.length > 1 ? 'répliques' : 'réplique'}`)),
      creerAvisVoix(),
      el('section', { className: 'card pile' },
        el('p', { className: 'eyebrow' }, 'Ordre'),
        creerChoixUnique([
          { valeur: false, libelle: "Dans l'ordre" },
          { valeur: true, libelle: 'Mélangées' },
        ], false, (valeur) => { melangees = valeur; }),
        el('p', { className: 'eyebrow' }, 'Répliques'),
        el('div', { className: 'chips' },
          creerBascule(`Seulement les À revoir (${aRevoir.length})`, false, (actif) => { seulementARevoir = actif; }, {
            desactive: aRevoir.length === 0,
          }))),
      // Ce bouton est indispensable : le navigateur n'accepte de parler qu'après un geste de l'utilisateur.
      el('button', {
        type: 'button',
        className: 'btn',
        onclick: () => {
          const base = seulementARevoir ? aRevoir : miennes;
          lancer(melangees ? melanger(base) : base);
        },
      }, 'Commencer'),
    );
  }

  function lancer(paquet) {
    const resultats = { su: [], a_revoir: [] };
    let position = 0;

    function noter(ligne, statut) {
      changerStatut(piece.id, ligne.numero, statut);
      resultats[statut].push(ligne);
      position += 1;
      if (position < paquet.length) montrerFiche();
      else ecranFin(paquet.length, resultats);
    }

    function montrerFiche() {
      const ligne = paquet[position];
      // On cherche dans la pièce entière, pas dans le paquet : même mélangée,
      // une fiche doit montrer ce qui la précède VRAIMENT dans la pièce.
      const index = lignes.indexOf(ligne);
      const signal = signalDe(lignes, index);
      const selection = lireSelection(piece);

      const carteMoi = creerReplique(ligne, piece, {
        mienne: true, cachee: true, statut: lireStatuts(piece.id)[ligne.numero],
      });

      // On ne peut s'évaluer qu'après avoir vu ou entendu la réplique.
      const boutonsNote = el('div', { className: 'boutons', hidden: true },
        el('button', { type: 'button', className: 'btn', onclick: () => noter(ligne, 'su') }, 'Je savais'),
        el('button', { type: 'button', className: 'btn btn--muted', onclick: () => noter(ligne, 'a_revoir') }, 'À revoir'));

      const boutonVoir = el('button', {
        type: 'button',
        className: 'btn-ghost',
        onclick: () => {
          carteMoi.classList.remove('est-cachee');
          boutonVoir.disabled = true;
          boutonsNote.hidden = false;
          carteMoi.scrollIntoView({ block: 'center' }); // la carte vient de grandir
        },
      }, 'Voir');

      remplacer(racine,
        el('p', { className: 'eyebrow fiche-compteur' }, `Fiche ${position + 1} sur ${paquet.length}`),
        creerAvisEnchainement(piece, ligne, enchainementsDe(lignes, index, selection)),
        el('div', { className: 'ligne-titre' },
          el('h2', { className: 'titre-section' }, 'Ton signal'),
          signal && el('button', { type: 'button', className: 'btn-ghost btn-petit', onclick: () => lireReplique(signal) }, 'Réécouter')),
        signal
          ? creerReplique(signal, piece, { mienne: selection.has(signal.numero), statut: lireStatuts(piece.id)[signal.numero] })
          : el('p', { className: 'avis' }, 'Début de la pièce : pas de réplique avant la tienne.'),
        el('h2', { className: 'titre-section' }, 'À toi'),
        carteMoi,
        creerInterrupteurs(),
        // Collés en bas de l'écran : on répète le téléphone à la main, sans avoir à faire défiler.
        el('div', { className: 'commandes' },
          el('div', { className: 'boutons' },
            boutonVoir,
            el('button', {
              type: 'button',
              className: 'btn-ghost',
              onclick: () => {
                boutonsNote.hidden = false;
                lireReplique(ligne);
              },
            }, 'Écouter ma réplique')),
          boutonsNote),
      );
      hautDePage();
      if (signal) lireReplique(signal);
    }

    montrerFiche();
  }

  function ecranFin(total, resultats) {
    const nbSues = resultats.su.length;
    const nbARevoir = resultats.a_revoir.length;
    remplacer(racine,
      creerTitreVue('Série terminée'),
      el('section', { className: 'card' },
        el('p', {}, `${total} ${total > 1 ? 'fiches' : 'fiche'} : ${nbSues} ${nbSues > 1 ? 'sues' : 'sue'}, ${nbARevoir} à revoir.`)),
      nbARevoir > 0 && el('button', {
        type: 'button',
        className: 'btn',
        onclick: () => lancer(resultats.a_revoir),
      }, nbARevoir > 1 ? `Retravailler les ${nbARevoir} à revoir` : 'Retravailler celle à revoir'),
      el('button', { type: 'button', className: 'btn-ghost', onclick: ecranDepart }, 'Revenir au choix des fiches'),
    );
    hautDePage();
  }

  ecranDepart();
}
