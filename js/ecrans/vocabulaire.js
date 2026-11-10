// Écran 5 : le vocabulaire de la pièce, de deux façons.
// - Le texte : on lit les répliques, et on touche un mot pour voir son explication en bas de l'écran :
//   sa lecture en kana, sa prononciation en lettres latines, son sens (et son sens dans cette
//   phrase), et les autres répliques où il revient. L'interrupteur « Mot à mot » écrit la traduction
//   sous chaque mot.
// - La liste : une carte par mot, qu'un toucher fait entendre. Sous chaque mot, les numéros des
//   répliques où il revient ; un numéro touché déplie la carte sur cette réplique, le mot surligné.
//   Un filtre (Tous, À revoir, Nouveaux) choisit les mots montrés.
// Et une révision en fiches, comme pour les répliques : le mot seul, puis sa lecture et son sens.
// Elle se lance depuis la liste, en bas, et reprend exactement les mots que la liste montre.
//
// Tout vient du fichier de la pièce : la liste « vocabulaire », et le découpage « mots » de chaque
// réplique (voir validation.js). Une pièce qui ne les a pas affiche simplement un message.

import { cascade, definirRetour, el, hautDePage, icone, remplacer, salve, signaler } from '../dom.js';
import {
  creerAvisSansSelection, creerBascule, creerBoutonIcone, creerChoixTexte, creerEcoute, creerNomRole, creerTitreScene,
  creerTitreVue,
} from '../affichage.js';
import { brancherGestes } from '../gestes.js';
import { langueActive, t, traduire } from '../langues.js';
import { lignesDe } from '../pieces.js';
import { noterPosition, positionAReprendre } from '../reprise.js';
import { changerStatutMot, lireReglages, lireSelection, lireStatutsMots } from '../stockage.js';
import { ajouterAvecFurigana, creerJaponais, enRomaji, lectureEnKana } from '../texte.js';
import { arreterVoix, messagePourResultat, parler } from '../voix.js';

// Mélange de Fisher-Yates, comme dans les fiches : chaque ordre a la même chance.
function melanger(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

export function afficherVocabulaire(racine, piece) {
  const lignes = lignesDe(piece);
  const selection = lireSelection(piece);
  const parId = new Map((piece.vocabulaire ?? []).map((mot) => [mot.id, mot]));

  if (parId.size === 0) {
    remplacer(racine, creerTitreVue(t('Vocabulaire')), el('p', { className: 'vide' }, t("Cette pièce n'a pas encore de vocabulaire.")));
    return;
  }

  // Ce que l'on regarde : mes répliques ou toute la pièce, en texte ou en liste, avec ou sans le mot
  // à mot, et dans la liste, quels mots (le filtre). Si Android vient de relancer l'app (en dépliant
  // le Fold, voir reprise.js), on reprend les mêmes choix : sans eux, l'écran rouvrirait en texte, et
  // sa position de défilement ne voudrait plus rien dire.
  const reprise = positionAReprendre('vocabulaire');
  let gloses = reprise?.gloses ?? false;
  let portee = reprise?.portee ?? (selection.size > 0 ? 'miennes' : 'tout');
  let vue = reprise?.vue ?? 'texte';
  let filtre = reprise?.filtre ?? 'tous'; // 'tous', 'a-revoir' ou 'nouveaux'
  const noterChoix = () => noterPosition('vocabulaire', { vue, portee, gloses, filtre });

  const lignesChoisies = () => (portee === 'miennes' ? lignes.filter((ligne) => selection.has(ligne.numero)) : lignes);

  // Les mots employés dans ces répliques, dans leur ordre d'apparition, avec les répliques où ils sont.
  function entreesDe(lignesVues) {
    const occurrences = new Map(); // id du mot -> les répliques qui l'emploient
    for (const ligne of lignesVues) {
      for (const morceau of ligne.mots ?? []) {
        if (!morceau.v || !parId.has(morceau.v)) continue;
        if (!occurrences.has(morceau.v)) occurrences.set(morceau.v, []);
        const ou = occurrences.get(morceau.v);
        if (ou.at(-1) !== ligne) ou.push(ligne);
      }
    }
    return [...occurrences].map(([id, ou]) => ({ mot: parId.get(id), ou }));
  }

  // ---- Les briques ----

  // Dire du japonais avec la voix du téléphone : il n'existe pas d'enregistrement mot par mot.
  // On lui donne la lecture en kana, que les moteurs prononcent sans hésiter.
  async function dire(japonais) {
    const message = messagePourResultat(await parler(lectureEnKana(japonais)));
    if (message) signaler(message, 9000);
  }

  // Un mot du vocabulaire, à sa forme du dictionnaire (好きな).
  const direMot = (mot) => dire(mot.mot);

  // Un mot touché dans le texte : son explication s'affiche en bas, et on l'entend tel qu'il est
  // écrit dans la réplique (好きだった), pas à sa forme du dictionnaire.
  function toucherMot(mot, morceau, bouton) {
    choisir(mot, morceau, bouton);
    dire(morceau.t);
  }

  // Les mots du texte affiché : pour chacun, ses apparitions (le bouton, la réplique, le morceau),
  // pour les surligner toutes et passer de l'une à l'autre. Refait à chaque affichage du texte.
  let apparitions = new Map();

  // Un morceau de réplique : le japonais (avec furigana), et en mot à mot sa traduction dessous.
  // interactif : un mot du vocabulaire devient un bouton, qui affiche son explication en bas.
  function creerMorceau(morceau, ligne, { gloses, surligne, didascalie, interactif }) {
    const japonais = el('span', { className: 'morceau-ja' });
    ajouterAvecFurigana(japonais, morceau.t);
    const mot = morceau.v ? parId.get(morceau.v) : null;
    const classes = ['morceau', gloses && 'avec-glose', surligne && 'surligne', didascalie && 'didascalie'].filter(Boolean).join(' ');
    // La traduction du mot tel qu'il est employé ici ; à défaut, celle du vocabulaire.
    const glose = gloses && mot && el('span', { className: 'glose', lang: langueActive() }, traduire(morceau, 'fr') ?? traduire(mot, 'fr'));
    if (!interactif || !mot) return el('span', { className: classes }, japonais, glose);

    // Un simple <span> qui se touche, plutôt qu'un <button> : un bouton réserverait la largeur de ses
    // furigana et creuserait des espaces dans la phrase. role et tabIndex le rendent utilisable au
    // clavier et par les lecteurs d'écran, comme un vrai bouton.
    const bouton = el('span', {
      className: `${classes} mot-touchable`,
      role: 'button',
      tabIndex: 0,
      onclick: () => toucherMot(mot, morceau, bouton),
      onkeydown: (evenement) => {
        if (evenement.key === 'Enter' || evenement.key === ' ') {
          evenement.preventDefault();
          toucherMot(mot, morceau, bouton);
        }
      },
    }, japonais, glose);
    if (!apparitions.has(mot.id)) apparitions.set(mot.id, []);
    apparitions.get(mot.id).push({ bouton, ligne, morceau });
    return bouton;
  }

  // Une réplique dessinée mot par mot. surligner : l'id d'un mot à mettre en évidence.
  // gloses : le mot à mot, chaque mot avec sa traduction dessous. interactif : les mots se touchent.
  function creerPhrase(ligne, { surligner = null, gloses = false, interactif = false } = {}) {
    if (!ligne.mots) return creerJaponais(ligne.texte, 'japonais japonais-petit'); // réplique pas encore découpée
    const phrase = el('span', { className: gloses ? 'mot-a-mot' : 'japonais japonais-petit', lang: 'ja' });
    let dansDidascalie = false;
    for (const morceau of ligne.mots) {
      // Un retour à la ligne peut se trouver dans un morceau : on coupe là.
      morceau.t.split('\n').forEach((partie, rang) => {
        if (rang > 0) phrase.append(gloses ? el('span', { className: 'saut' }) : el('br'));
        if (!partie) return;
        if (partie.includes('（')) dansDidascalie = true;
        phrase.append(creerMorceau({ ...morceau, t: partie }, ligne, {
          gloses, interactif, surligne: surligner !== null && morceau.v === surligner, didascalie: dansDidascalie,
        }));
        if (partie.includes('）')) dansDidascalie = false;
      });
    }
    return phrase;
  }

  // L'en-tête d'une réplique : son numéro, son rôle, sa scène.
  const enTete = (ligne) => el('span', { className: 'replique-tete' },
    el('span', { className: 'numero' }, String(ligne.numero)),
    creerNomRole(piece, ligne.role),
    el('span', { className: 'role-fr' }, t('Scène {n}', { n: ligne.scene.numero })));

  // Le contexte d'un mot : la réplique où il apparaît, le mot surligné, et la traduction de la phrase.
  const creerContexte = (mot, ligne) => el('div', { className: 'contexte' },
    enTete(ligne),
    creerPhrase(ligne, { surligner: mot.id }),
    el('span', { className: 'replique-fr traduction' }, traduire(ligne, 'fr')));

  // Su ou à revoir : une petite icône, comprise dans toutes les langues.
  function creerPastilleMot(statut) {
    if (statut === 'su') return el('span', { className: 'pastille-mot su', 'aria-label': t('Je savais') }, icone('su'));
    if (statut === 'a_revoir') return el('span', { className: 'pastille-mot a-revoir', 'aria-label': t('À revoir') }, icone('revoir'));
    return null;
  }

  // Lecture en kana, puis en lettres latines : やさしい · yasashii
  const creerLecture = (mot) => {
    const lecture = lectureEnKana(mot.mot);
    return el('div', { className: 'mot-lecture' }, el('b', { lang: 'ja' }, lecture), ` · ${enRomaji(lecture)}`);
  };

  // ---- Le panneau en bas de l'écran : l'explication du mot touché ----

  const zone = el('div', { className: 'pile-vocabulaire' });
  const panneau = el('div', { className: 'commandes panneau-mot', 'aria-live': 'polite' });
  let statuts = {};

  // ---- Quand l'explication n'est plus utile ----
  // Elle sert le temps de regarder un mot. Faire défiler le texte, ou lancer la lecture d'une
  // réplique, c'est reprendre la lecture : elle se ferme d'elle-même. Toucher un autre mot la remplace.
  const ecran = document.getElementById('ecran'); // la zone qui défile
  const SEUIL = 40; // en pixels : un doigt qui bouge un peu en touchant un mot ne ferme rien
  let motOuvert = false;
  let repere = 0; // la position du défilement quand l'explication s'est ouverte
  // Quand l'app fait défiler l'écran elle-même (voir montrer), ce n'est pas une reprise de la lecture.
  let defilementDeLApp = false;
  let minuterieDefilement = null;

  function finirDefilementDeLApp() {
    clearTimeout(minuterieDefilement);
    defilementDeLApp = false;
    repere = ecran.scrollTop; // le point de départ devient la position où l'app a amené l'écran
  }

  // Le panneau peut défiler lui-même s'il est long : ses défilements à lui ne comptent pas, car
  // l'événement scroll ne remonte pas d'un élément à ceux qui le contiennent.
  const arret = new AbortController(); // retire ces écouteurs quand on quitte l'écran
  ecran.addEventListener('scroll', () => {
    if (motOuvert && !defilementDeLApp && Math.abs(ecran.scrollTop - repere) > SEUIL) fermer();
  }, { passive: true, signal: arret.signal });
  ecran.addEventListener('scrollend', () => {
    if (defilementDeLApp) finirDefilementDeLApp();
  }, { signal: arret.signal });

  // Avant le premier toucher, le panneau dit comment s'en servir.
  function afficherAide() {
    motOuvert = false;
    remplacer(panneau, el('p', { className: 'legende aide-mot' }, t('Touche un mot pour voir son explication.')));
  }

  function effacerSurlignage() {
    for (const ancien of zone.querySelectorAll('.mot-touchable.surligne')) ancien.classList.remove('surligne', 'choisi');
  }

  // La fermeture de l'explication, en deux temps, avec les mouvements du reste de l'app (style.css) :
  // 1. l'explication s'efface en glissant de 8 px vers le bas : l'inverse de l'arrivée d'une fiche
  //    (wizfade), à la vitesse du changement d'écran (fondu, 180 ms) ;
  // 2. le panneau redescend en douceur jusqu'à la hauteur de la ligne d'aide, avec la courbe
  //    « feutre » de SessionConnect, pendant que cette ligne arrive comme une fiche (wizfade).
  const FEUTRE = 'cubic-bezier(.22, 1, .36, 1)'; // la même que --feutre dans style.css
  let fermeture = []; // les animations en cours : un mot touché entre-temps les arrête

  function arreterFermeture() {
    fermeture.forEach((animation) => animation.cancel());
    fermeture = [];
  }

  async function fermer() {
    arreterFermeture();
    motOuvert = false; // tout de suite : un défilement pendant l'animation ne relance rien
    effacerSurlignage();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      afficherAide();
      return;
    }

    // 1. L'explication s'efface. Le fond du panneau, lui, reste : seul son contenu bouge.
    fermeture = [...panneau.children].map((enfant) => enfant.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }],
      { duration: 180, easing: 'ease-in', fill: 'forwards' }));
    try {
      await Promise.all(fermeture.map((animation) => animation.finished));
    } catch {
      return; // annulée : un autre mot a été touché, son explication a déjà pris la place
    }

    // 2. La ligne d'aide prend la place, et le panneau passe en douceur de l'ancienne hauteur à la nouvelle.
    const hauteurAvant = panneau.getBoundingClientRect().height;
    afficherAide();
    const hauteurApres = panneau.getBoundingClientRect().height;
    fermeture = [
      panneau.animate([{ height: `${hauteurAvant}px` }, { height: `${hauteurApres}px` }], { duration: 280, easing: FEUTRE }),
      panneau.firstElementChild.animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 250, delay: 60, easing: 'ease', fill: 'backwards' }),
    ];
    Promise.all(fermeture.map((animation) => animation.finished)).then(() => { fermeture = []; }, () => {});
  }

  // Amène une carte dans la partie visible de l'écran : entre l'en-tête et ce qui est collé en bas
  // (le panneau du mot dans le texte, Réviser dans la liste), qui en cache une partie. Elle se déplace
  // au plus court, vers le haut ou vers le bas, et pas du tout si elle se voit déjà en entier. Une
  // carte trop haute pour tenir à l'écran montre au moins le mot touché, ou à défaut son début (là
  // où la lecture commence).
  function montrer(carte, motTouche = null) {
    const MARGE = 12;
    // L'en-tête passe par-dessus le haut de cette zone : la partie visible commence sous lui.
    const entete = document.querySelector('.app-header');
    const haut = Math.max(ecran.getBoundingClientRect().top, entete?.getBoundingClientRect().bottom ?? 0) + MARGE;
    // Un élément caché n'a pas de position : on mesure celui des deux qui se montre.
    const bas = (panneau.hidden ? barreReviser : panneau).getBoundingClientRect().top - MARGE;
    const cadre = carte.getBoundingClientRect();
    let decalage = 0;
    if (cadre.height <= bas - haut || motTouche) {
      const cible = cadre.height <= bas - haut ? cadre : motTouche.getBoundingClientRect();
      if (cible.top < haut) decalage = cible.top - haut;
      else if (cible.bottom > bas) decalage = cible.bottom - bas;
    } else {
      decalage = cadre.top - haut;
    }
    // Là où l'écran arrivera : il ne peut pas défiler au-delà du haut ni du bas de la page.
    const arrivee = Math.min(Math.max(ecran.scrollTop + decalage, 0), ecran.scrollHeight - ecran.clientHeight);
    if (Math.abs(arrivee - ecran.scrollTop) < 1) return;
    // Ce défilement-là ne ferme pas l'explication. Il se termine par l'événement scrollend ; au cas
    // où il manquerait, la minuterie rend la main au bout de deux secondes.
    defilementDeLApp = true;
    clearTimeout(minuterieDefilement);
    minuterieDefilement = setTimeout(finirDefilementDeLApp, 2000);
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    ecran.scrollBy({ top: decalage, behavior: reduit ? 'instant' : 'smooth' });
  }

  // Un mot touché : toutes ses apparitions se surlignent (celle-ci plus fort), et le panneau donne
  // sa lecture, sa prononciation, son sens, son sens dans cette phrase, et où il revient ailleurs.
  function choisir(mot, morceau, bouton) {
    arreterFermeture(); // si l'explication d'avant était en train de se fermer
    effacerSurlignage();
    const toutes = apparitions.get(mot.id) ?? [];
    for (const { bouton: autre } of toutes) autre.classList.add('surligne');
    bouton.classList.add('choisi');

    // Les autres répliques où le mot revient, une fois chacune : un toucher y mène.
    const ligneIci = toutes.find((apparition) => apparition.bouton === bouton)?.ligne;
    const parLigne = new Map();
    for (const apparition of toutes) {
      if (apparition.ligne !== ligneIci && !parLigne.has(apparition.ligne)) parLigne.set(apparition.ligne, apparition);
    }
    const ailleurs = [...parLigne.values()];

    const sens = traduire(mot, 'fr');
    const sensIci = traduire(morceau, 'fr');
    remplacer(panneau,
      el('div', { className: 'mot-tete' },
        creerJaponais(mot.mot, 'mot-japonais'),
        creerPastilleMot(statuts[mot.id]),
        creerBoutonIcone('lecture', t('Écouter'), 'btn-ghost bouton-mot', () => direMot(mot)),
        creerBoutonIcone('fermer', t('Fermer'), 'btn-ghost bouton-mot', fermer)),
      creerLecture(mot),
      el('div', { className: 'mot-sens' }, sens),
      sensIci && sensIci !== sens && el('div', { className: 'mot-ici' }, t('Ici : {sens}', { sens: sensIci })),
      ailleurs.length > 0 && el('div', { className: 'apparitions' },
        el('span', { className: 'legende' }, ailleurs.length === 1
          ? t('Et dans une autre réplique')
          : t('Et dans {n} autres répliques', { n: ailleurs.length })),
        ailleurs.map((apparition) => el('button', {
          type: 'button',
          className: 'chip',
          onclick: () => {
            choisir(mot, apparition.morceau, apparition.bouton);
            // Après choisir : le panneau vient de changer de hauteur, la partie visible aussi.
            montrer(apparition.bouton.closest('.carte-texte'), apparition.bouton);
          },
        }, String(apparition.ligne.numero)))));
    motOuvert = true;
    repere = ecran.scrollTop;
  }

  // Une réplique du texte. Son bouton lecture la lit, la met en pause, ou l'arrête d'un appui long,
  // et son trait montre où en est la lecture : la carte n'a donc pas de filet, contrairement aux
  // fiches et au filage. Chacun de ses mots se touche.
  // Lancer sa lecture, ou la toucher (un mot ou ailleurs), l'amène dans la partie visible de l'écran.
  // Lancer sa lecture ferme aussi l'explication du mot : on écoute la réplique, plus le mot.
  function creerCarteTexte(ligne) {
    const ecoute = creerEcoute(ligne, {
      surLecture: () => {
        // montrer mesure le panneau encore ouvert : la carte se cale au-dessus, puis le panneau
        // redescend sous elle, et elle reste visible.
        if (motOuvert) fermer();
        montrer(carte);
      },
    });
    ecoute.bouton.classList.add('bouton-ligne');
    const carte = el('div', {
      className: `replique carte-texte${selection.has(ligne.numero) ? ' mienne' : ''}`,
      // Après le mot touché (le clic remonte du mot vers la carte) : le panneau a déjà sa nouvelle
      // hauteur. Le bouton lecture s'en occupe lui-même, et seulement quand une lecture démarre :
      // une pause, ou un appui long pour arrêter, ne font pas bouger la carte.
      onclick: (evenement) => {
        if (evenement.target.closest('button')) return;
        montrer(carte, evenement.target.closest('.mot-touchable'));
      },
    },
      el('div', { className: 'carte-texte-tete' }, enTete(ligne), ecoute.bouton),
      creerPhrase(ligne, { gloses, interactif: true }),
      el('span', { className: 'replique-fr traduction' }, traduire(ligne, 'fr')));
    return carte;
  }

  // ---- La liste : une carte par mot ----

  // Le dépliage d'une carte, choisi par Louis parmi quatre démos (variante B, le 2026-11-10) : le
  // bloc gris de la réplique s'étire avec la carte en 0,38 s, et son texte arrive en fondu à mi-course.
  // La courbe démarre et freine en douceur : la courbe « feutre », qui part très vite, rendait
  // l'apparition trop brusque.
  const DOUCE = 'cubic-bezier(.4, 0, .2, 1)';
  // Le bloc replié à plat : sans hauteur ni marges. Il s'étire de là jusqu'à sa taille naturelle.
  const PLAT = { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px' };

  // La forme d'un bloc à cet instant (sa hauteur et ses marges), même au milieu d'un mouvement.
  function formeDu(bloc) {
    const style = getComputedStyle(bloc);
    return {
      height: `${bloc.getBoundingClientRect().height}px`,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      marginTop: style.marginTop,
    };
  }

  // Une seule carte dépliée à la fois : déplier une carte replie celle qui l'était. C'est elle,
  // s'il y en a une ; remis à zéro à chaque affichage de la liste.
  let carteDepliee = null;

  // Un mot de la liste. Un toucher sur la carte le fait entendre. Dessous, les numéros des répliques
  // où il revient : un numéro touché déplie la carte sur cette réplique (le mot surligné, puis la
  // traduction de la phrase), sans quitter la liste. Le même numéro la replie ; un autre la remplace.
  function creerCarteMot({ mot, ou }) {
    let ouverte = null; // la réplique dépliée, s'il y en a une
    let contexte = null; // son bloc gris, sous les numéros (il reste là le temps de se replier)
    let ligneDuBloc = null; // la réplique écrite dans ce bloc
    let tour = 0; // chaque toucher prend la main : un mouvement plus ancien s'arrête là où il en est
    // Ce que les autres cartes savent de celle-ci : comment la replier quand l'une d'elles se déplie.
    const cetteCarte = { replier: () => allerA(null, { seule: true }) };

    const numeros = ou.map((ligne) => el('button', {
      type: 'button',
      className: 'chip chip-numero',
      'aria-label': t('Réplique {n}', { n: ligne.numero }),
      'aria-pressed': 'false', // pour un lecteur d'écran : enfoncé quand sa réplique est dépliée
      onclick: () => deplier(ligne),
    }, String(ligne.numero)));

    const texteDuBloc = () => [...contexte.children];
    const opaciteDuTexte = () => Number(getComputedStyle(contexte.firstElementChild).opacity);

    // Arrête net ce qui bouge dans le bloc, et le garde dans la forme où il était.
    function figer(forme) {
      contexte.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      Object.assign(contexte.style, forme);
    }

    // Le bloc s'étire de la forme « depart » jusqu'à sa taille naturelle, et la carte grandit avec
    // lui. Pendant ce temps, il cache ce qui dépasse : la réplique se découvre de haut en bas. Son
    // texte arrive en fondu à mi-course, ou repart d'où il en était (opacite) s'il était en train de partir.
    function etirer(depart, opacite, { duree = 380, delaiTexte = 150 } = {}) {
      carte.style.overflowAnchor = ''; // rouverte pendant qu'elle se repliait seule (voir allerA)
      contexte.removeAttribute('style');
      const arrivee = formeDu(contexte);
      // Une carte en bas de l'écran se déplierait sous Réviser : l'écran remonte juste assez pour la
      // montrer, en même temps qu'elle s'ouvre. Si elle est trop haute pour tenir, c'est le mot
      // surligné qui se voit. montrer mesure la carte avant le mouvement, à sa taille d'arrivée.
      montrer(carte, contexte.querySelector('.surligne') ?? contexte);
      const bloc = contexte;
      bloc.classList.add('en-mouvement');
      bloc.animate([depart, arrivee], { duration: duree, easing: DOUCE })
        .finished.then(() => bloc.classList.remove('en-mouvement'), () => {}); // annulé : un autre toucher a pris la suite
      for (const partie of texteDuBloc()) {
        partie.animate([{ opacity: opacite }, { opacity: 1 }],
          { duration: 280, delay: opacite > 0 ? 0 : delaiTexte, easing: 'ease', fill: 'backwards' });
      }
    }

    // Un numéro touché : sa réplique se déplie, ou se replie si c'était déjà elle. La carte dépliée
    // jusque-là, s'il y en a une autre, se replie d'elle-même.
    function deplier(ligne) {
      const cible = ouverte === ligne ? null : ligne;
      const autre = cible && carteDepliee && carteDepliee !== cetteCarte ? carteDepliee : null;
      carteDepliee = cible ? cetteCarte : null;
      if (autre) {
        const avant = carte.getBoundingClientRect().top;
        autre.replier();
        // Sans animation, l'autre carte se replie d'un coup : si elle était plus haut, tout ce qui
        // suit remonterait, dont celle-ci, sous le doigt. On recale l'écran d'autant, aussitôt.
        // (Avec animation, elle n'a pas encore bougé : c'est le navigateur qui s'en charge, voir allerA.)
        const ecart = carte.getBoundingClientRect().top - avant;
        if (Math.abs(ecart) >= 1) ecran.scrollBy({ top: ecart, behavior: 'instant' });
      }
      allerA(cible);
    }

    // Amène la carte à montrer la réplique « cible », ou à se replier si cible est null.
    // seule : repliée parce qu'une autre carte se déplie, et non par un toucher sur celle-ci.
    async function allerA(cible, { seule = false } = {}) {
      const ceTour = ++tour;
      ouverte = cible;
      // Le numéro de la réplique dépliée reste coloré : c'est lui qu'on touche pour la replier.
      numeros.forEach((bouton, rang) => {
        bouton.classList.toggle('is-selected', ou[rang] === ouverte);
        bouton.setAttribute('aria-pressed', String(ou[rang] === ouverte));
      });

      // Le téléphone demande de réduire les animations : la carte change d'un coup.
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        contexte?.remove();
        contexte = ouverte && creerContexte(mot, ouverte);
        ligneDuBloc = ouverte;
        if (contexte) {
          carte.append(contexte);
          montrer(carte, contexte.querySelector('.surligne') ?? contexte);
        }
        return;
      }

      // 1. La carte était fermée : le bloc naît à plat et s'étire.
      if (!contexte) {
        contexte = creerContexte(mot, ouverte);
        ligneDuBloc = ouverte;
        carte.append(contexte);
        etirer(PLAT, 0);
        return;
      }

      // Le bloc est là, ouvert ou en plein mouvement : tout repart de la forme qu'il a maintenant.
      const depart = formeDu(contexte);
      const opacite = opaciteDuTexte();
      figer(depart);

      // 2. Replier : le texte s'efface, pendant que le bloc se resserre jusqu'à disparaître.
      if (!ouverte) {
        // Repliée seule, parce qu'une autre carte se déplie : si celle-ci est plus haut dans la liste,
        // en rétrécissant elle ferait remonter tout ce qui suit, dont la carte qu'on vient de toucher.
        // Le navigateur sait garder en place ce qu'on regarde quand le contenu change plus haut (le
        // « scroll anchoring » de CSS) : il choisit un élément visible comme repère et recale l'écran
        // pour que ce repère ne bouge pas. overflow-anchor: none lui interdit de prendre cette
        // carte-ci comme repère : il prend la suivante, et l'écran suit le repli image par image.
        if (seule) carte.style.overflowAnchor = 'none';
        const bloc = contexte;
        bloc.classList.add('en-mouvement');
        for (const partie of texteDuBloc()) {
          partie.animate([{ opacity: opacite }, { opacity: 0 }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
        }
        try {
          await bloc.animate([depart, PLAT], { duration: 300, easing: DOUCE, fill: 'forwards' }).finished;
        } catch {
          return; // annulé : un numéro touché entre-temps rouvre la carte
        }
        if (ceTour !== tour) return;
        bloc.remove();
        contexte = null;
        ligneDuBloc = null;
        carte.style.overflowAnchor = '';
        return;
      }

      // 3. Une autre réplique : l'ancien texte s'efface vite, puis le bloc prend la hauteur de la
      // nouvelle, qui arrive en fondu. Le fond gris, lui, reste en place.
      if (ligneDuBloc !== ouverte) {
        if (opacite > 0) {
          const effacement = texteDuBloc().map((partie) => partie.animate([{ opacity: opacite }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' }));
          try {
            await Promise.all(effacement.map((animation) => animation.finished));
          } catch {
            return; // annulé : un autre toucher a pris la suite
          }
          if (ceTour !== tour) return;
        }
        const nouveau = creerContexte(mot, ouverte);
        Object.assign(nouveau.style, depart); // il prend la place de l'ancien, à la même taille
        contexte.replaceWith(nouveau);
        contexte = nouveau;
        ligneDuBloc = ouverte;
        etirer(depart, 0, { duree: 340, delaiTexte: 40 });
        return;
      }

      // 4. La même réplique, rouverte pendant qu'elle se repliait : elle repart d'où elle en est.
      etirer(depart, opacite);
    }

    const carte = el('div', {
      className: 'replique carte-mot',
      // Un numéro est un bouton à part : le toucher déplie la carte, sans faire parler le mot.
      onclick: (evenement) => {
        if (!evenement.target.closest('button')) direMot(mot);
      },
    },
      // Le mot avec ses furigana (ils donnent déjà la lecture en kana) et sa prononciation, puis son
      // statut à droite. Sur un écran étroit, la prononciation passe sous le mot plutôt que de le couper.
      el('span', { className: 'mot-tete' },
        el('span', { className: 'mot-nom' },
          creerJaponais(mot.mot, 'mot-japonais'),
          el('span', { className: 'mot-romaji' }, enRomaji(lectureEnKana(mot.mot)))),
        creerPastilleMot(statuts[mot.id])),
      el('span', { className: 'mot-sens' }, traduire(mot, 'fr')),
      el('span', { className: 'numeros-mot' }, numeros));
    return carte;
  }

  // ---- L'écran principal : le texte ou la liste ----

  // Les commandes, redessinées à chaque affichage : Texte ou Liste à droite du titre, puis mes
  // répliques ou toute la pièce, puis le mot à mot (pour le texte) ou le filtre (pour la liste).
  const coinTitre = el('div');
  const choixPortee = el('div');
  const rangeeMotAMot = el('div', { className: 'chips' });
  const rangeeFiltre = el('div');
  // En bas de la liste, collé comme les commandes des fiches : Réviser, avec le nombre de mots.
  const barreReviser = el('div', { className: 'commandes' });

  // Les mots de chaque filtre. Ce que la liste montre, c'est ce que l'on révise.
  const parFiltre = (entrees) => ({
    tous: entrees,
    'a-revoir': entrees.filter(({ mot }) => statuts[mot.id] === 'a_revoir'),
    nouveaux: entrees.filter(({ mot }) => !statuts[mot.id]), // jamais révisés
  });

  function dessinerCommandes(series) {
    remplacer(coinTitre, creerChoixTexte([
      { valeur: 'texte', libelle: t('Texte') },
      { valeur: 'liste', libelle: t('Liste') },
    ], vue, (valeur) => { vue = valeur; dessinerContenu(); }));
    remplacer(choixPortee, creerChoixTexte([
      { valeur: 'miennes', libelle: t('Mes répliques') },
      { valeur: 'tout', libelle: t('La pièce') },
    ], portee, (valeur) => { portee = valeur; dessinerContenu(); }));
    // Le mot à mot : la traduction écrite sous chaque mot, pour suivre la construction de la phrase.
    rangeeMotAMot.hidden = vue !== 'texte';
    remplacer(rangeeMotAMot, creerBascule(t('Mot à mot'), gloses, (actif) => { gloses = actif; dessinerContenu(); }));
    // Le filtre, avec le nombre de mots de chacun. Un filtre sans aucun mot ne se choisit pas.
    rangeeFiltre.hidden = vue !== 'liste';
    remplacer(rangeeFiltre, creerChoixTexte([
      { valeur: 'tous', libelle: t('Tous'), nombre: series.tous.length },
      { valeur: 'a-revoir', libelle: t('À revoir'), nombre: series['a-revoir'].length, desactive: series['a-revoir'].length === 0 },
      { valeur: 'nouveaux', libelle: t('Nouveaux'), nombre: series.nouveaux.length, desactive: series.nouveaux.length === 0 },
    ], filtre, (valeur) => { filtre = valeur; dessinerContenu(); }));
  }

  function dessinerContenu() {
    arreterFermeture();
    definirRetour(null);
    arreterVoix();
    apparitions = new Map();
    statuts = lireStatutsMots(); // communs à toutes les pièces : un mot su l'est partout
    const lignesVues = lignesChoisies();
    const series = parFiltre(entreesDe(lignesVues));
    // Le filtre choisi n'a plus de mots (tous les « À revoir » sont devenus sus) : retour à Tous.
    if (series[filtre].length === 0) filtre = 'tous';
    const vues = series[filtre];
    noterChoix();
    dessinerCommandes(series);

    if (portee === 'miennes' && selection.size === 0) {
      remplacer(zone, creerAvisSansSelection(piece));
      panneau.hidden = true;
      barreReviser.hidden = true;
      return;
    }
    if (vue === 'liste') {
      // Pas de panneau d'explication : chaque carte montre déjà tout. À sa place, Réviser.
      panneau.hidden = true;
      barreReviser.hidden = false;
      remplacer(barreReviser, el('button', {
        type: 'button',
        className: 'btn',
        disabled: vues.length === 0,
        onclick: () => lancerRevision(vues),
      }, t('Réviser ({n})', { n: vues.length })));
      carteDepliee = null; // les cartes sont refaites, toutes repliées
      remplacer(zone, vues.map(creerCarteMot));
    } else {
      panneau.hidden = false;
      barreReviser.hidden = true;
      // Les répliques, rangées par scène comme dans le script.
      let scene = null;
      remplacer(zone, lignesVues.flatMap((ligne) => {
        const titre = ligne.scene !== scene ? creerTitreScene(ligne.scene) : null;
        scene = ligne.scene;
        return [titre, creerCarteTexte(ligne)];
      }));
      afficherAide();
    }
    cascade(zone);
  }

  function afficherPrincipal() {
    remplacer(racine,
      creerTitreVue(t('Vocabulaire'), coinTitre),
      el('div', { className: 'chips-vocabulaire' }, choixPortee, rangeeMotAMot, rangeeFiltre),
      zone,
      // Collés en bas de l'écran, comme les commandes des fiches : l'explication du mot touché
      // (dans le texte) ou Réviser (dans la liste). Un seul des deux se montre à la fois.
      panneau,
      barreReviser);
    dessinerContenu();
    hautDePage();
  }

  // ---- La révision : une série de fiches de mots ----

  function lancerRevision(entrees) {
    const paquet = melanger(entrees);
    const resultats = { su: 0, a_revoir: 0 };
    let position = 0;
    // Pendant la série, la flèche de retour ramène à la liste des mots.
    definirRetour(() => {
      arreterVoix();
      afficherPrincipal();
    });

    function noter(mot, statut) {
      arreterVoix();
      changerStatutMot(mot.id, statut);
      if (statut === 'su') salve();
      resultats[statut] += 1;
      position += 1;
      if (position < paquet.length) montrerFiche();
      else ecranFin();
    }

    function montrerFiche() {
      const { mot, ou } = paquet[position];
      const gestes = lireReglages().navigation === 'gestes';
      let vu = false;

      const boutonSu = creerBoutonIcone('su', t('Je savais'), 'btn', () => noter(mot, 'su'));
      const boutonRevoir = creerBoutonIcone('revoir', t('À revoir'), 'btn btn--muted', () => noter(mot, 'a_revoir'));
      boutonSu.disabled = true;
      boutonRevoir.disabled = true;

      // La réponse : la lecture, le sens et la réplique d'origine, cachés jusqu'au premier toucher.
      const reponse = el('div', { className: 'reponse-mot', hidden: true },
        creerLecture(mot),
        el('div', { className: 'mot-sens' }, traduire(mot, 'fr')));
      const contexte = creerContexte(mot, ou[0]);
      contexte.hidden = true;

      // Voir la réponse, c'est aussi l'entendre : le mot est dit dès qu'il se retourne, sans second toucher.
      function devoiler() {
        vu = true;
        carte.classList.add('est-devoile');
        reponse.hidden = false;
        contexte.hidden = false;
        boutonVoir.disabled = true;
        boutonSu.disabled = false;
        boutonRevoir.disabled = false;
        direMot(mot);
      }

      // La carte : le mot seul, sans ses furigana. Un toucher la retourne et dit le mot, les suivants le redisent.
      const carte = el('button', {
        type: 'button',
        className: 'grand-mot',
        onclick: () => (vu ? direMot(mot) : devoiler()),
      }, creerJaponais(mot.mot, 'mot-japonais'), el('span', { className: 'grand-mot-masque' }, t('Touche pour voir')), reponse);

      const boutonVoir = creerBoutonIcone('voir', t('Voir'), 'btn-ghost', devoiler);
      const boutonEcouter = creerBoutonIcone('lecture', t('Écouter'), 'btn-ghost', () => direMot(mot));

      // Mode Gestes : la carte se glisse à droite (je savais) ou à gauche (à revoir), comme les fiches.
      const zoneCarte = gestes
        ? brancherGestes(carte, {
          glisser: {
            droite: { icone: 'su', libelle: t('Je savais'), action: () => noter(mot, 'su') },
            gauche: { icone: 'revoir', libelle: t('À revoir'), action: () => noter(mot, 'a_revoir') },
            permis: () => vu,
            refus: () => devoiler(),
          },
        })
        : carte;

      remplacer(racine,
        el('p', { className: 'eyebrow fiche-compteur' }, t('Mot {position} sur {total}', { position: position + 1, total: paquet.length })),
        zoneCarte,
        contexte,
        !gestes && el('div', { className: 'commandes' },
          el('div', { className: 'boutons boutons-quatre' }, boutonVoir, boutonEcouter, boutonSu, boutonRevoir)));
      for (const bloc of racine.children) bloc.classList.add('etape');
      hautDePage();
    }

    function ecranFin() {
      remplacer(racine,
        creerTitreVue(t('Série terminée')),
        el('section', { className: 'card bilan-mots' },
          el('span', { className: 'pastille-mot su' }, icone('su')), String(resultats.su),
          el('span', { className: 'pastille-mot a-revoir' }, icone('revoir')), String(resultats.a_revoir)),
        el('button', { type: 'button', className: 'btn', onclick: afficherPrincipal }, t('Revenir au vocabulaire')));
      cascade(racine);
      hautDePage();
    }

    montrerFiche();
  }

  afficherPrincipal();

  // En quittant l'écran : la zone qui défile reste, ses écouteurs pour ce Vocabulaire-ci partent.
  return () => {
    arret.abort();
    clearTimeout(minuterieDefilement);
  };
}
