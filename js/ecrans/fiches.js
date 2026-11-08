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

  // ---- La carte qui se lit passe au premier plan ----
  // Elle se soulève de 4 px et son ombre grandit, pendant que le reste de l'écran pâlit. La barre de
  // boutons, elle, reste nette : c'est elle qui pilote la lecture. À la fin, tout revient en place.
  // Des animations JavaScript plutôt que des classes CSS : elles se défont exactement comme elles se
  // sont faites (reverse), sans toucher aux transitions des cartes (l'enfoncement au toucher).
  const OMBRE_LEVEE = '0 6px 16px rgba(43, 42, 39, 0.08), 0 24px 52px rgba(43, 42, 39, 0.16)';
  const FEUTRE = 'cubic-bezier(.22, 1, .36, 1)'; // la même que --feutre dans style.css
  let enAvant = null; // la carte au premier plan, et ses animations

  function remettreEnPlace() {
    enAvant?.animations.forEach((animation) => animation.reverse()); // repart à l'envers, jusqu'à l'état normal
    enAvant = null;
  }

  function mettreEnAvant(carte, oui) {
    if (!carte) return;
    if (!oui) {
      if (enAvant?.carte === carte) remettreEnPlace(); // une autre carte a pu prendre la place entre-temps
      return;
    }
    if (enAvant?.carte === carte) return;
    remettreEnPlace();
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // En mode Gestes, ma carte est dans un cadre qui la fait glisser sous le doigt : c'est ce cadre
    // qui se soulève, pour ne pas gêner le glissement de la carte elle-même.
    const leve = carte.parentElement?.classList.contains('cadre-glisse') ? carte.parentElement : carte;
    const autres = [...racine.children].filter((bloc) => !bloc.contains(carte) && !bloc.classList.contains('commandes'));
    enAvant = {
      carte,
      animations: [
        leve.animate({ transform: 'translateY(-4px)' }, { duration: reduit ? 0 : 400, easing: FEUTRE, fill: 'forwards' }),
        carte.animate({ boxShadow: OMBRE_LEVEE }, { duration: reduit ? 0 : 400, easing: FEUTRE, fill: 'forwards' }),
        ...autres.map((bloc) => bloc.animate({ opacity: 0.4 }, { duration: reduit ? 0 : 280, easing: 'ease', fill: 'forwards' })),
      ],
    };
  }

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
    let seules = false; // mes répliques seules : sans les signaux, et déjà visibles

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
          // Pour relire ses répliques à la suite : chaque fiche ne montre plus que la mienne, déjà visible.
          creerBascule(t('Mes répliques seules'), false, (actif) => { seules = actif; }),
          creerBascule(t('Seulement les À revoir ({n})', { n: aRevoir.length }), false, (actif) => { seulementARevoir = actif; }, {
            desactive: aRevoir.length === 0,
          }))),
      // Ce bouton est indispensable : le navigateur n'accepte de parler qu'après un geste de l'utilisateur.
      el('button', {
        type: 'button',
        className: 'btn',
        onclick: () => {
          const base = seulementARevoir ? aRevoir : miennes;
          lancer(melangees ? melanger(base) : base, null, { seules });
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
          onclick: () => lancer([ligne], null, { seules }),
        }, String(ligne.numero))))),
    );
    cascade(racine);
  }

  // reprise : la série retrouvée après une relance de l'app (voir la fin de ce fichier).
  // seules : mes répliques seules, sans les signaux et déjà visibles (une relecture, toujours notée).
  function lancer(paquet, reprise = null, { seules = false } = {}) {
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
      else ecranFin(paquet.length, resultats, { seules });
    }

    function montrerFiche() {
      enAvant = null; // les cartes de la fiche précédente disparaissent avec leurs animations
      const ligne = paquet[position];
      // Les répliques sont notées par leur numéro : c'est tout ce qu'il faut pour reconstruire la série.
      const numeros = (liste) => liste.map((l) => l.numero);
      noterPosition('fiches', {
        paquet: numeros(paquet), position, su: numeros(resultats.su), aRevoir: numeros(resultats.a_revoir), seules,
      });
      // On cherche dans la pièce entière, pas dans le paquet : même mélangée,
      // une fiche doit montrer ce qui la précède VRAIMENT dans la pièce. Sauf en « mes répliques seules ».
      const index = lignes.indexOf(ligne);
      const signal = seules ? null : signalDe(lignes, index);
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

      // ---- La lecture ----
      // Avec les boutons, un seul bouton ▶, en bas, pilote la lecture en cours : celle du signal comme
      // celle de ma réplique. Il passe en pause et son trait avance quelle que soit la carte lue : le
      // signal n'a donc ni filet ni petite icône. En mode Gestes, il n'y a pas de bouton : chaque carte
      // a sa propre écoute, et c'est son filet (avec, pour le signal, une petite icône) qui suit la lecture.
      // Dans les deux cas, la carte qui se lit passe au premier plan (voir mettreEnAvant).
      const carteDe = (laLigne) => (laLigne === ligne ? carteMoi : carteSignal);
      const suivreEtat = (etat, laLigne) => mettreEnAvant(carteDe(laLigne), etat !== 'arret');
      const ecoute = creerEcoute(ligne, { surLecture: permettreNote, surEtat: suivreEtat });
      const ecouteSignal = signal && gestes ? creerEcoute(signal, { libelle: t('Réécouter'), surEtat: suivreEtat }) : null;

      // Le signal : sa carte elle-même se touche pour le lire ou le mettre en pause, et un appui long arrête.
      const carteSignal = signal && creerReplique(signal, piece, {
        mienne: selection.has(signal.numero),
        statut: lireStatuts(piece.id)[signal.numero],
        surTouche: () => (ecouteSignal ? ecouteSignal.toucher() : ecoute.toucher(signal)),
      });
      if (carteSignal) brancherGestes(carteSignal, { maintenir: () => (ecouteSignal ?? ecoute).arreter() });

      function devoiler() {
        carteMoi.classList.remove('est-cachee');
        boutonVoir.disabled = true;
        permettreNote();
        carteMoi.scrollIntoView({ block: 'center' }); // la carte vient de grandir
      }

      // La carte elle-même se touche : une première fois pour la voir, ensuite pour l'écouter
      // (et la mettre en pause, comme le bouton ▶). En « mes répliques seules », elle est visible d'emblée.
      const carteMoi = creerReplique(ligne, piece, {
        mienne: true,
        cachee: !seules,
        statut: lireStatuts(piece.id)[ligne.numero],
        surTouche: () => {
          if (carteMoi.classList.contains('est-cachee')) devoiler();
          else ecoute.toucher(ligne); // ma réplique, même si le signal était en train de se lire
        },
      });

      // Mode Gestes : les filets (et la petite icône du signal), une fois les deux cartes créées.
      if (gestes) {
        ecoute.lierCarte(carteMoi);
        if (carteSignal) ecouteSignal.lierCarte(carteSignal, { avecTemoin: true });
      }

      const boutonVoir = creerBoutonIcone('voir', t('Voir'), 'btn-ghost', devoiler);
      // Déjà visible : je peux m'évaluer tout de suite, et le bouton Voir n'a plus rien à montrer.
      if (seules) permettreNote();

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
        !seules && el('h2', { className: 'titre-section' }, t('Ton signal')),
        !seules && (carteSignal || el('p', { className: 'avis' }, t('Début de la pièce : pas de réplique avant la tienne.'))),
        el('h2', { className: 'titre-section' }, t('À toi')),
        zoneMoi,
        creerInterrupteurs(piece.id),
        // Collés en bas de l'écran : on répète le téléphone à la main, sans avoir à faire défiler.
        // En « mes répliques seules », pas de bouton Voir : trois boutons au lieu de quatre.
        !gestes && el('div', { className: 'commandes' },
          el('div', { className: `boutons ${seules ? 'boutons-trois' : 'boutons-quatre'}` },
            !seules && boutonVoir, ecoute.bouton, boutonSu, boutonRevoir)),
      );
      // Passer à la fiche suivante : un fondu court, comme les étapes de Faktur.
      for (const bloc of racine.children) bloc.classList.add('etape');
      hautDePage();
      // Le signal se lit tout seul : par le bouton ▶ du bas, qui passe en pause, ou par sa propre écoute en mode Gestes.
      if (signal && lireLeSignal) {
        if (ecouteSignal) ecouteSignal.toucher();
        else ecoute.toucher(signal);
      }
      lireLeSignal = true;
    }

    montrerFiche();
  }

  // seules : la série était en « mes répliques seules ». Retravailler les à revoir garde ce mode.
  function ecranFin(total, resultats, { seules = false } = {}) {
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
        onclick: () => lancer(resultats.a_revoir, null, { seules }),
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
    }, { seules: reprise.seules === true });
  } else {
    ecranDepart();
  }
}
