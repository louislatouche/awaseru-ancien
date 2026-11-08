// Écran 5 : le vocabulaire de la pièce. On lit le texte, et on touche un mot pour voir son
// explication en bas de l'écran : sa lecture en kana, sa prononciation en lettres latines, son sens
// (et son sens dans cette phrase), et les autres répliques où il revient. L'interrupteur « Mot à
// mot » écrit la traduction sous chaque mot. Et une révision en fiches, comme pour les répliques :
// le mot seul, puis sa lecture et son sens.
//
// Tout vient du fichier de la pièce : la liste « vocabulaire », et le découpage « mots » de chaque
// réplique (voir validation.js). Une pièce qui ne les a pas affiche simplement un message.

import { cascade, definirRetour, el, hautDePage, icone, remplacer, salve, signaler } from '../dom.js';
import {
  creerAvisSansSelection, creerBascule, creerBoutonIcone, creerChoixUnique, creerEcoute, creerNomRole, creerTitreScene,
  creerTitreVue,
} from '../affichage.js';
import { brancherGestes } from '../gestes.js';
import { langueActive, t, traduire } from '../langues.js';
import { lignesDe } from '../pieces.js';
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

  // Ce que l'on regarde : mes répliques ou toute la pièce, avec ou sans le mot à mot.
  let gloses = false;
  let portee = selection.size > 0 ? 'miennes' : 'tout';

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

  // Avant le premier toucher, le panneau dit comment s'en servir.
  function afficherAide() {
    remplacer(panneau, el('p', { className: 'legende aide-mot' }, t('Touche un mot pour voir son explication.')));
  }

  function effacerSurlignage() {
    for (const ancien of zone.querySelectorAll('.mot-touchable.surligne')) ancien.classList.remove('surligne', 'choisi');
  }

  function fermer() {
    effacerSurlignage();
    afficherAide();
  }

  // Amène une carte dans la partie visible de l'écran : entre l'en-tête et le panneau du bas, qui
  // en cache une partie. Elle se déplace au plus court, vers le haut ou vers le bas, et pas du tout
  // si elle se voit déjà en entier. Une carte trop haute pour tenir à l'écran montre au moins le mot
  // touché, ou à défaut son début (là où la lecture commence).
  function montrer(carte, motTouche = null) {
    const ecran = document.getElementById('ecran'); // la zone qui défile
    const MARGE = 12;
    // L'en-tête passe par-dessus le haut de cette zone : la partie visible commence sous lui.
    const entete = document.querySelector('.app-header');
    const haut = Math.max(ecran.getBoundingClientRect().top, entete?.getBoundingClientRect().bottom ?? 0) + MARGE;
    const bas = panneau.getBoundingClientRect().top - MARGE;
    const cadre = carte.getBoundingClientRect();
    let decalage = 0;
    if (cadre.height <= bas - haut || motTouche) {
      const cible = cadre.height <= bas - haut ? cadre : motTouche.getBoundingClientRect();
      if (cible.top < haut) decalage = cible.top - haut;
      else if (cible.bottom > bas) decalage = cible.bottom - bas;
    } else {
      decalage = cadre.top - haut;
    }
    if (Math.abs(decalage) < 1) return;
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
    ecran.scrollBy({ top: decalage, behavior: reduit ? 'instant' : 'smooth' });
  }

  // Un mot touché : toutes ses apparitions se surlignent (celle-ci plus fort), et le panneau donne
  // sa lecture, sa prononciation, son sens, son sens dans cette phrase, et où il revient ailleurs.
  function choisir(mot, morceau, bouton) {
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
  }

  // Une réplique du texte. Son bouton lecture la lit, la met en pause, ou l'arrête d'un appui long,
  // et son trait montre où en est la lecture : la carte n'a donc pas de filet, contrairement aux
  // fiches et au filage. Chacun de ses mots se touche.
  // Lancer sa lecture, ou la toucher (un mot ou ailleurs), l'amène dans la partie visible de l'écran.
  function creerCarteTexte(ligne) {
    const ecoute = creerEcoute(ligne, { surLecture: () => montrer(carte) });
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

  // ---- L'écran principal : le texte, dont chaque mot se touche ----

  const compteur = el('span', { className: 'pill pill--ok' });
  const boutonReviser = el('button', { type: 'button', className: 'btn' }, t('Réviser'));

  function dessinerTexte() {
    definirRetour(null);
    arreterVoix();
    apparitions = new Map();
    statuts = lireStatutsMots(piece.id);
    const lignesVues = lignesChoisies();
    const entrees = entreesDe(lignesVues);
    compteur.textContent = t(entrees.length > 1 ? '{n} mots' : '{n} mot', { n: entrees.length });
    boutonReviser.disabled = entrees.length === 0;
    boutonReviser.onclick = () => lancerRevision(entrees);

    if (portee === 'miennes' && selection.size === 0) {
      remplacer(zone, creerAvisSansSelection(piece));
      panneau.hidden = true;
      return;
    }
    panneau.hidden = false;
    // Les répliques, rangées par scène comme dans le script.
    let scene = null;
    remplacer(zone, lignesVues.flatMap((ligne) => {
      const titre = ligne.scene !== scene ? creerTitreScene(ligne.scene) : null;
      scene = ligne.scene;
      return [titre, creerCarteTexte(ligne)];
    }));
    afficherAide();
    cascade(zone);
  }

  function afficherListe() {
    remplacer(racine,
      creerTitreVue(t('Vocabulaire'), compteur),
      el('div', { className: 'chips-vocabulaire' },
        creerChoixUnique([
          { valeur: 'miennes', libelle: t('Mes répliques') },
          { valeur: 'tout', libelle: t('Toute la pièce') },
        ], portee, (choix) => { portee = choix; dessinerTexte(); }),
        // Le mot à mot : la traduction écrite sous chaque mot, pour suivre la construction de la phrase.
        el('div', { className: 'chips' }, creerBascule(t('Mot à mot'), gloses, (actif) => { gloses = actif; dessinerTexte(); }))),
      boutonReviser,
      zone,
      // Collé en bas de l'écran, comme les commandes des fiches.
      panneau);
    dessinerTexte();
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
      afficherListe();
    });

    function noter(mot, statut) {
      arreterVoix();
      changerStatutMot(piece.id, mot.id, statut);
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

      function devoiler() {
        vu = true;
        carte.classList.add('est-devoile');
        reponse.hidden = false;
        contexte.hidden = false;
        boutonVoir.disabled = true;
        boutonSu.disabled = false;
        boutonRevoir.disabled = false;
      }

      // La carte : le mot seul, sans ses furigana. Un toucher la retourne, les suivants disent le mot.
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
        el('button', { type: 'button', className: 'btn', onclick: afficherListe }, t('Revenir au vocabulaire')));
      cascade(racine);
      hautDePage();
    }

    montrerFiche();
  }

  afficherListe();
}
