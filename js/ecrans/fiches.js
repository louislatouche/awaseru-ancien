// Écran 4 : répétition en fiches. Le signal d'entrée est lu, ma réplique est cachée, je m'évalue.

import { cascade, definirRetour, el, hautDePage, remplacer, salve, signaler } from '../dom.js';
import {
  creerAvisEnchainement, creerAvisSansSelection, creerAvisVoix, creerBascule, creerBoutonIcone, creerChoixUnique,
  creerEcoute, creerInterrupteurs, creerReplique, creerTitreVue,
} from '../affichage.js';
import { t } from '../langues.js';
import { enchainementsDe, lignesDe, signalDe } from '../pieces.js';
import { changerStatut, lireReglages, lireSelection, lireStatuts } from '../stockage.js';
import { arreterVoix } from '../voix.js';
import { noterPosition, oublierPosition, positionAReprendre } from '../reprise.js';
import { brancherGestes } from '../gestes.js';

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

// La couleur d'un numéro selon où en est sa réplique (voir style.css).
const CLASSES_STATUT = { su: 'est-sue', a_revoir: 'est-a-revoir' };

export function afficherFiches(racine, piece) {
  const lignes = lignesDe(piece);

  function ecranDepart() {
    oublierPosition(); // pas de série en cours : rien à reprendre si l'app est relancée
    definirRetour(null); // la flèche de retour quitte alors les fiches
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
      // Ou une seule réplique, choisie par son numéro. Sa couleur rappelle où elle en est :
      // ambre si elle est à revoir, sauge si elle est sue, comme les pastilles des cartes.
      el('section', { className: 'card pile' },
        el('p', { className: 'eyebrow' }, t('Une réplique précise')),
        el('p', { className: 'legende' }, t('Touche un numéro pour travailler cette réplique seule.')),
        el('div', { className: 'grille-numeros' }, miennes.map((ligne) => el('button', {
          type: 'button',
          className: `bouton-numero ${CLASSES_STATUT[statuts[ligne.numero]] ?? ''}`,
          'aria-label': t('Réplique {n}', { n: ligne.numero }),
          onclick: () => lancer([ligne]),
        }, String(ligne.numero))))),
    );
    cascade(racine);
  }

  // reprise : la série retrouvée après une relance de l'app (voir la fin de ce fichier).
  function lancer(paquet, reprise = null) {
    const resultats = reprise?.resultats ?? { su: [], a_revoir: [] };
    let position = reprise?.position ?? 0;
    // Après une relance, le navigateur refuse de parler tant qu'on n'a rien touché :
    // la première fiche reprise ne lit donc pas son signal toute seule (Réécouter le fait).
    let lireLeSignal = !reprise;
    // Pendant la série (et sur son écran de fin), la flèche de retour ramène au choix des fiches.
    definirRetour(() => {
      arreterVoix();
      ecranDepart();
    });

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
      // Les répliques sont notées par leur numéro : c'est tout ce qu'il faut pour reconstruire la série.
      const numeros = (liste) => liste.map((l) => l.numero);
      noterPosition('fiches', {
        paquet: numeros(paquet), position, su: numeros(resultats.su), aRevoir: numeros(resultats.a_revoir),
      });
      // On cherche dans la pièce entière, pas dans le paquet : même mélangée,
      // une fiche doit montrer ce qui la précède VRAIMENT dans la pièce.
      const index = lignes.indexOf(ligne);
      const signal = signalDe(lignes, index);
      const selection = lireSelection(piece);

      // Le réglage Navigation : des boutons en bas de l'écran, ou des gestes sur la carte.
      const gestes = lireReglages().navigation === 'gestes';

      // On ne peut s'évaluer qu'après avoir vu ou entendu la réplique : d'ici là, ces deux boutons
      // sont grisés, et la carte refuse de partir.
      let evaluable = false;
      const boutonSu = creerBoutonIcone('su', t('Je savais'), 'btn', () => noter(ligne, 'su'));
      const boutonRevoir = creerBoutonIcone('revoir', t('À revoir'), 'btn btn--muted', () => noter(ligne, 'a_revoir'));
      boutonSu.disabled = true;
      boutonRevoir.disabled = true;
      const permettreNote = () => {
        evaluable = true;
        boutonSu.disabled = false;
        boutonRevoir.disabled = false;
      };

      // Le signal : sa carte elle-même est le bouton lecture. Un toucher lit ou met en pause, un appui
      // long arrête ; son filet montre où en est la lecture, et une petite icône dit son état.
      const ecouteSignal = signal ? creerEcoute(signal, { libelle: t('Réécouter') }) : null;
      const carteSignal = signal && creerReplique(signal, piece, {
        mienne: selection.has(signal.numero),
        statut: lireStatuts(piece.id)[signal.numero],
        surTouche: () => ecouteSignal.toucher(),
      });
      if (carteSignal) {
        ecouteSignal.lierCarte(carteSignal, { avecTemoin: true });
        brancherGestes(carteSignal, { maintenir: ecouteSignal.arreter });
      }

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

      // Avec les boutons, le trait du bouton ▶ montre déjà où en est la lecture. En mode Gestes, il
      // n'y a pas de bouton : c'est alors le filet de la carte qui suit la lecture de ma réplique.
      if (gestes) ecoute.lierCarte(carteMoi);

      const boutonVoir = creerBoutonIcone('voir', t('Voir'), 'btn-ghost', devoiler);

      // Mode Gestes : la carte se glisse à droite (je savais) ou à gauche (à revoir), et un appui
      // long arrête l'écoute. Les boutons ne sont alors pas affichés.
      const zoneMoi = gestes
        ? brancherGestes(carteMoi, {
          maintenir: ecoute.arreter,
          glisser: {
            droite: { icone: 'su', libelle: t('Je savais'), action: () => noter(ligne, 'su') },
            gauche: { icone: 'revoir', libelle: t('À revoir'), action: () => noter(ligne, 'a_revoir') },
            permis: () => evaluable,
            refus: () => signaler(t("Regarde ou écoute d'abord ta réplique.")),
          },
        })
        : carteMoi;

      remplacer(racine,
        el('p', { className: 'eyebrow fiche-compteur' }, t('Fiche {position} sur {total}', { position: position + 1, total: paquet.length })),
        creerAvisEnchainement(piece, ligne, enchainementsDe(lignes, index, selection)),
        el('h2', { className: 'titre-section' }, t('Ton signal')),
        carteSignal || el('p', { className: 'avis' }, t('Début de la pièce : pas de réplique avant la tienne.')),
        el('h2', { className: 'titre-section' }, t('À toi')),
        zoneMoi,
        creerInterrupteurs(piece.id),
        // Collés en bas de l'écran : on répète le téléphone à la main, sans avoir à faire défiler.
        !gestes && el('div', { className: 'commandes' },
          el('div', { className: 'boutons boutons-quatre' }, boutonVoir, ecoute.bouton, boutonSu, boutonRevoir)),
      );
      // Passer à la fiche suivante : un fondu court, comme les étapes de Faktur.
      for (const bloc of racine.children) bloc.classList.add('etape');
      hautDePage();
      // Le signal se lit tout seul, par son propre bouton : celui-ci passe donc en pause pendant la lecture.
      if (ecouteSignal && lireLeSignal) ecouteSignal.toucher();
      lireLeSignal = true;
    }

    montrerFiche();
  }

  function ecranFin(total, resultats) {
    oublierPosition(); // la série est finie : plus rien à reprendre
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

  // L'app vient-elle d'être relancée au milieu d'une série ? On la reconstruit à partir des numéros
  // notés, et on reprend à la même fiche. Sinon, l'écran de départ habituel.
  const reprise = positionAReprendre('fiches');
  const parNumero = new Map(lignes.map((ligne) => [ligne.numero, ligne]));
  const retrouver = (numeros) => (numeros ?? []).map((numero) => parNumero.get(numero)).filter(Boolean);
  const paquetRepris = retrouver(reprise?.paquet);
  if (reprise && reprise.position < paquetRepris.length) {
    lancer(paquetRepris, {
      position: reprise.position,
      resultats: { su: retrouver(reprise.su), a_revoir: retrouver(reprise.aRevoir) },
    });
  } else {
    ecranDepart();
  }
}
