// Écran 5 : le vocabulaire de la pièce. Deux façons de le regarder :
// - Mots : chaque mot avec sa lecture en kana, sa prononciation en lettres latines, sa traduction,
//   et la réplique où il apparaît (le mot y est surligné) ;
// - Phrases : chaque réplique en mot à mot, la traduction écrite sous chaque mot.
// Et une révision en fiches, comme pour les répliques : le mot seul, puis sa lecture et son sens.
//
// Tout vient du fichier de la pièce : la liste « vocabulaire », et le découpage « mots » de chaque
// réplique (voir validation.js). Une pièce qui ne les a pas affiche simplement un message.

import { cascade, definirRetour, el, hautDePage, icone, remplacer, salve, signaler } from '../dom.js';
import {
  creerAvisSansSelection, creerBoutonIcone, creerChoixUnique, creerEcoute, creerNomRole, creerTitreScene, creerTitreVue,
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

  // Ce que l'on regarde : les mots ou les phrases, de mes répliques ou de toute la pièce.
  let vue = 'mots';
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

  // Dire un mot avec la voix du téléphone : il n'existe pas d'enregistrement mot par mot.
  // On lui donne la lecture en kana, que les moteurs prononcent sans hésiter.
  async function direMot(mot) {
    const message = messagePourResultat(await parler(lectureEnKana(mot.mot)));
    if (message) signaler(message, 9000);
  }

  // Un morceau de réplique : le japonais (avec furigana), et en mot à mot sa traduction dessous.
  function creerMorceau(morceau, { gloses, surligne, didascalie }) {
    const japonais = el('span', { className: 'morceau-ja' });
    ajouterAvecFurigana(japonais, morceau.t);
    const classes = ['morceau', gloses && 'avec-glose', surligne && 'surligne', didascalie && 'didascalie'].filter(Boolean).join(' ');
    if (!gloses) return el('span', { className: classes }, japonais);
    // La traduction du mot tel qu'il est employé ici ; à défaut, celle du vocabulaire.
    const mot = morceau.v ? parId.get(morceau.v) : null;
    const glose = mot ? (traduire(morceau, 'fr') ?? traduire(mot, 'fr')) : '';
    return el('span', { className: classes }, japonais, glose && el('span', { className: 'glose', lang: langueActive() }, glose));
  }

  // Une réplique dessinée mot par mot. surligner : l'id d'un mot à mettre en évidence.
  // gloses : le mot à mot, chaque mot avec sa traduction dessous.
  function creerPhrase(ligne, { surligner = null, gloses = false } = {}) {
    if (!ligne.mots) return creerJaponais(ligne.texte, 'japonais japonais-petit'); // réplique pas encore découpée
    const phrase = el('span', { className: gloses ? 'mot-a-mot' : 'japonais japonais-petit', lang: 'ja' });
    let dansDidascalie = false;
    for (const morceau of ligne.mots) {
      // Un retour à la ligne peut se trouver dans un morceau : on coupe là.
      morceau.t.split('\n').forEach((partie, rang) => {
        if (rang > 0) phrase.append(gloses ? el('span', { className: 'saut' }) : el('br'));
        if (!partie) return;
        if (partie.includes('（')) dansDidascalie = true;
        phrase.append(creerMorceau({ ...morceau, t: partie }, {
          gloses, surligne: surligner !== null && morceau.v === surligner, didascalie: dansDidascalie,
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

  function creerCarteMot({ mot, ou }, statuts) {
    const autres = el('div', { className: 'autres-contextes', hidden: true }, ou.slice(1).map((ligne) => creerContexte(mot, ligne)));
    const restant = ou.length - 1;
    return el('article', { className: 'carte-mot' },
      el('div', { className: 'mot-tete' },
        creerJaponais(mot.mot, 'mot-japonais'),
        creerPastilleMot(statuts[mot.id]),
        creerBoutonIcone('lecture', t('Écouter'), 'btn-ghost bouton-mot', () => direMot(mot))),
      creerLecture(mot),
      el('div', { className: 'mot-sens' }, traduire(mot, 'fr')),
      creerContexte(mot, ou[0]),
      // Les autres répliques qui l'emploient, à déplier : voir le mot dans plusieurs phrases aide à le retenir.
      restant > 0 && el('button', {
        type: 'button',
        className: 'action-discrete autres-contextes-bouton',
        onclick: () => { autres.hidden = !autres.hidden; },
      }, restant === 1 ? t('Et dans une autre réplique') : t('Et dans {n} autres répliques', { n: restant })),
      autres);
  }

  // Une réplique en mot à mot. Comme ailleurs, la toucher la lit ou la met en pause, et garder le
  // doigt dessus l'arrête ; son filet montre où en est la lecture.
  function creerCartePhrase(ligne) {
    const ecoute = creerEcoute(ligne);
    const carte = el('button', {
      type: 'button',
      className: `replique carte-phrase${selection.has(ligne.numero) ? ' mienne' : ''}`,
      onclick: () => ecoute.toucher(),
    }, enTete(ligne), creerPhrase(ligne, { gloses: true }), el('span', { className: 'replique-fr traduction' }, traduire(ligne, 'fr')));
    ecoute.lierCarte(carte, { avecTemoin: true });
    brancherGestes(carte, { maintenir: ecoute.arreter });
    return carte;
  }

  // ---- L'écran principal : le choix, puis la liste ----

  const zone = el('div', { className: 'pile-vocabulaire' });
  const compteur = el('span', { className: 'pill pill--ok' });

  function dessinerListe() {
    definirRetour(null);
    arreterVoix();
    const lignesVues = lignesChoisies();
    const entrees = entreesDe(lignesVues);
    compteur.textContent = t(entrees.length > 1 ? '{n} mots' : '{n} mot', { n: entrees.length });

    if (portee === 'miennes' && selection.size === 0) {
      remplacer(zone, creerAvisSansSelection(piece));
      return;
    }

    if (vue === 'mots') {
      const statuts = lireStatutsMots(piece.id);
      remplacer(zone,
        el('button', { type: 'button', className: 'btn', disabled: entrees.length === 0, onclick: () => lancerRevision(entrees) }, t('Réviser')),
        entrees.map((entree) => creerCarteMot(entree, statuts)));
    } else {
      // Les phrases, rangées par scène comme dans le script.
      let scene = null;
      remplacer(zone, lignesVues.flatMap((ligne) => {
        const titre = ligne.scene !== scene ? creerTitreScene(ligne.scene) : null;
        scene = ligne.scene;
        return [titre, creerCartePhrase(ligne)];
      }));
    }
    cascade(zone);
  }

  function afficherListe() {
    remplacer(racine,
      creerTitreVue(t('Vocabulaire'), compteur),
      el('div', { className: 'chips-vocabulaire' },
        creerChoixUnique([
          { valeur: 'mots', libelle: t('Mots') },
          { valeur: 'phrases', libelle: t('Phrases') },
        ], vue, (choix) => { vue = choix; dessinerListe(); }),
        creerChoixUnique([
          { valeur: 'miennes', libelle: t('Mes répliques') },
          { valeur: 'tout', libelle: t('Toute la pièce') },
        ], portee, (choix) => { portee = choix; dessinerListe(); })),
      zone);
    dessinerListe();
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
