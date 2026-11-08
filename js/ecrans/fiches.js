// Écran 4 : répétition en fiches. Le signal d'entrée est lu, ma réplique est cachée, je m'évalue.

import { cascade, el, hautDePage, remplacer, salve } from '../dom.js';
import {
  creerAvisEnchainement, creerAvisSansSelection, creerAvisVoix, creerBascule, creerBoutonIcone, creerChoixUnique,
  creerEcoute, creerInterrupteurs, creerReplique, creerTitreVue, lireReplique,
} from '../affichage.js';
import { t } from '../langues.js';
import { enchainementsDe, lignesDe, signalDe } from '../pieces.js';
import { changerStatut, lireSelection, lireStatuts } from '../stockage.js';
import { arreterVoix } from '../voix.js';

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
      creerTitreVue(t('Fiches'), el('span', { className: 'pill pill--ok' }, t(miennes.length > 1 ? '{n} répliques' : '{n} réplique', { n: miennes.length }))),
      creerAvisVoix(piece),
      el('section', { className: 'card pile' },
        el('p', { className: 'eyebrow' }, t('Ordre')),
        creerChoixUnique([
          { valeur: false, libelle: t("Dans l'ordre") },
          { valeur: true, libelle: t('Mélangées') },
        ], false, (valeur) => { melangees = valeur; }),
        el('p', { className: 'eyebrow' }, t('Répliques')),
        el('div', { className: 'chips' },
          creerBascule(t('Seulement les À revoir ({n})', { n: aRevoir.length }), false, (actif) => { seulementARevoir = actif; }, {
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
      }, t('Commencer')),
    );
    cascade(racine);
  }

  function lancer(paquet) {
    const resultats = { su: [], a_revoir: [] };
    let position = 0;

    function noter(ligne, statut) {
      arreterVoix(); // une réplique en pause ne doit pas reprendre sur la fiche suivante
      changerStatut(piece.id, ligne.numero, statut);
      if (statut === 'su') salve();
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

      // On ne peut s'évaluer qu'après avoir vu ou entendu la réplique : d'ici là, ces deux boutons sont grisés.
      const boutonSu = creerBoutonIcone('su', t('Je savais'), 'btn', () => noter(ligne, 'su'));
      const boutonRevoir = creerBoutonIcone('revoir', t('À revoir'), 'btn btn--muted', () => noter(ligne, 'a_revoir'));
      boutonSu.disabled = true;
      boutonRevoir.disabled = true;
      const permettreNote = () => {
        boutonSu.disabled = false;
        boutonRevoir.disabled = false;
      };

      const ecoute = creerEcoute(ligne, { surLecture: permettreNote });

      function devoiler() {
        carteMoi.classList.remove('est-cachee');
        boutonVoir.disabled = true;
        permettreNote();
        carteMoi.scrollIntoView({ block: 'center' }); // la carte vient de grandir
      }

      // La carte elle-même se touche : une première fois pour la voir, ensuite pour l'écouter
      // (et la mettre en pause, comme le bouton ▶).
      const carteMoi = creerReplique(ligne, piece, {
        mienne: true,
        cachee: true,
        statut: lireStatuts(piece.id)[ligne.numero],
        surTouche: () => {
          if (carteMoi.classList.contains('est-cachee')) devoiler();
          else ecoute.toucher();
        },
      });

      const boutonVoir = creerBoutonIcone('voir', t('Voir'), 'btn-ghost', devoiler);

      remplacer(racine,
        el('p', { className: 'eyebrow fiche-compteur' }, t('Fiche {position} sur {total}', { position: position + 1, total: paquet.length })),
        creerAvisEnchainement(piece, ligne, enchainementsDe(lignes, index, selection)),
        el('div', { className: 'ligne-titre' },
          el('h2', { className: 'titre-section' }, t('Ton signal')),
          signal && el('button', { type: 'button', className: 'btn-ghost btn-petit', onclick: () => lireReplique(signal) }, t('Réécouter'))),
        signal
          ? creerReplique(signal, piece, { mienne: selection.has(signal.numero), statut: lireStatuts(piece.id)[signal.numero] })
          : el('p', { className: 'avis' }, t('Début de la pièce : pas de réplique avant la tienne.')),
        el('h2', { className: 'titre-section' }, t('À toi')),
        carteMoi,
        creerInterrupteurs(),
        // Collés en bas de l'écran : on répète le téléphone à la main, sans avoir à faire défiler.
        el('div', { className: 'commandes' },
          el('div', { className: 'boutons boutons-quatre' }, boutonVoir, ecoute.bouton, boutonSu, boutonRevoir)),
      );
      // Passer à la fiche suivante : un fondu court, comme les étapes de Faktur.
      for (const bloc of racine.children) bloc.classList.add('etape');
      hautDePage();
      if (signal) lireReplique(signal);
    }

    montrerFiche();
  }

  function ecranFin(total, resultats) {
    const nbSues = resultats.su.length;
    const nbARevoir = resultats.a_revoir.length;
    remplacer(racine,
      creerTitreVue(t('Série terminée')),
      el('section', { className: 'card' },
        el('p', {}, t('{fiches} : {sues}, {aRevoir} à revoir.', {
          fiches: t(total > 1 ? '{n} fiches' : '{n} fiche', { n: total }),
          sues: t(nbSues > 1 ? '{n} sues' : '{n} sue', { n: nbSues }),
          aRevoir: nbARevoir,
        }))),
      nbARevoir > 0 && el('button', {
        type: 'button',
        className: 'btn',
        onclick: () => lancer(resultats.a_revoir),
      }, nbARevoir > 1 ? t('Retravailler les {n} à revoir', { n: nbARevoir }) : t('Retravailler celle à revoir')),
      el('button', { type: 'button', className: 'btn-ghost', onclick: ecranDepart }, t('Revenir au choix des fiches')),
    );
    cascade(racine);
    hautDePage();
  }

  ecranDepart();
}
