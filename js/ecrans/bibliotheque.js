// Écran 1 : la liste des pièces, les plus récemment ouvertes d'abord, et la progression de chacune.
// Une ligne en bas ouvre le menu des pièces du site, comme la liste des extensions d'un navigateur.

import { cascade, compter, el, remplacer, signaler } from '../dom.js';
import { creerTitreVue } from '../affichage.js';
import { t, traduire } from '../langues.js';
import { confirmer, ouvrirFeuille } from '../modale.js';
import { creerJaponais, texteBrut } from '../texte.js';
import {
  lignesDe, progressionDe, supprimerPieceImportee, toutesLesPieces, trierParUtilisation,
} from '../pieces.js';
import { noterUtilisation } from '../stockage.js';
import { peutRetirer, piecesRetirees, retelechargerPiece, retirerPiece } from '../telechargement.js';
import { montrerGestes, proposerTuto } from '../tuto.js';

function texteProgression({ total, sues, aRevoir }) {
  if (total === 0) return t('Aucune réplique choisie');
  const base = t(sues > 1 ? '{sues}/{total} sues' : '{sues}/{total} sue', { sues, total });
  return aRevoir > 0 ? t('{base}, {aRevoir} à revoir', { base, aRevoir }) : base;
}

function creerCarte(piece, libelleSuppression, surSuppression) {
  const progression = progressionDe(piece);
  // Tant qu'aucune réplique n'est choisie, on ouvre directement l'écran pour les choisir.
  const onglet = progression.total > 0 ? 'script' : 'mes-repliques';
  const barre = el('progress', { value: 0, max: Math.max(progression.total, 1), 'aria-label': t('Répliques sues') });
  const resume = el('span', { className: 'carte-progression' }, texteProgression({ ...progression, sues: 0 }));
  compter(progression.sues, (valeur) => {
    barre.value = valeur;
    resume.textContent = texteProgression({ ...progression, sues: Math.round(valeur) });
  });
  return el('article', { className: 'card carte-piece' },
    el('a', { className: 'carte-lien', href: `#/piece/${encodeURIComponent(piece.id)}/${onglet}` },
      creerJaponais(piece.titre, 'carte-titre'),
      el('span', { className: 'carte-sous-titre' }, traduire(piece, 'titre_fr')),
      el('span', { className: 'carte-details' }, t('{lignes} répliques, {scenes} scènes', { lignes: lignesDe(piece).length, scenes: piece.scenes.length })),
      barre,
      resume),
    surSuppression && el('button', {
      type: 'button',
      className: 'action-discrete',
      onclick: surSuppression,
    }, libelleSuppression));
}

// Une pièce du menu : sa case à cocher, son nom, et où en est son téléchargement.
// Renvoie la ligne à afficher, et deux fonctions pour la piloter depuis le menu.
function creerLigneATelecharger(piece, dejaLa, surChangement) {
  const caseACocher = el('input', { type: 'checkbox', checked: dejaLa, disabled: dejaLa, onchange: surChangement });
  const etat = el('span', { className: 'role-total' }, dejaLa ? t('Téléchargée') : '');

  const ligne = el('label', { className: 'coche ligne-telechargement' },
    caseACocher,
    el('span', { className: 'coche-texte' },
      creerJaponais(piece.titre, 'role'),
      el('span', { className: 'legende' }, traduire(piece, 'titre_fr'))),
    etat);

  return {
    ligne,
    aTelecharger: () => caseACocher.checked && !caseACocher.disabled,
    // Renvoie true si tout s'est bien passé. Le résultat se voit sur la ligne : pas de message en plus.
    async telecharger() {
      caseACocher.disabled = true;
      ligne.classList.add('is-syncing'); // l'anneau du design kit : une opération réseau est en cours
      try {
        await retelechargerPiece(piece.id, (fait, total) => { etat.textContent = `${fait}/${total}`; });
        noterUtilisation(piece.id); // tu viens de la demander : elle remonte en haut de la liste
        etat.textContent = t('Téléchargée');
        return true;
      } catch {
        caseACocher.disabled = false;
        etat.textContent = '';
        return false;
      } finally {
        ligne.classList.remove('is-syncing');
      }
    },
  };
}

export async function afficherBibliotheque(racine) {
  const zoneListe = el('div', { className: 'liste-pieces' });

  // Une pièce du site : elle reste disponible, on peut la reprendre à tout moment.
  async function retirer(piece) {
    const accepte = await confirmer({
      titre: t('Supprimer du téléphone ?'),
      message: t('« {titre} » et ses voix seront retirées de ce téléphone, pas du site. Tu pourras la retélécharger en bas de cette liste, et tu retrouveras tes répliques choisies et ta progression.', { titre: texteBrut(piece.titre) }),
      oui: t('Supprimer'),
    });
    if (!accepte) return;
    await retirerPiece(piece.id);
    rafraichir();
  }

  // Une ancienne pièce importée : elle n'existe que sur ce téléphone, la supprimer est définitif.
  async function supprimerImportee(piece) {
    const accepte = await confirmer({
      titre: t('Supprimer cette pièce ?'),
      message: t('« {titre} » sera effacée de ce téléphone. Tes répliques choisies et ta progression sont conservées.', { titre: texteBrut(piece.titre) }),
      oui: t('Supprimer'),
    });
    if (!accepte) return;
    supprimerPieceImportee(piece.id);
    rafraichir();
  }

  // Le menu de téléchargement : toutes les pièces du site, comme les extensions d'un navigateur.
  // On coche celles qu'on veut, puis un seul bouton les télécharge.
  function ouvrirMenu(fournies, retirees) {
    const choix = fournies.map((piece) => creerLigneATelecharger(piece, !retirees.has(piece.id), actualiserBouton));
    let enCours = false;

    const bouton = el('button', {
      type: 'button',
      className: 'btn btn-petit',
      disabled: true,
      onclick: telechargerLesPiecesCochees,
    }, t('Télécharger'));

    function actualiserBouton() {
      bouton.disabled = enCours || !choix.some(({ aTelecharger }) => aTelecharger());
    }

    async function telechargerLesPiecesCochees() {
      enCours = true;
      actualiserBouton();
      // L'une après l'autre : le compteur reste lisible, et une coupure de réseau arrête tout proprement.
      for (const { aTelecharger, telecharger } of choix) {
        if (!aTelecharger()) continue;
        if (!(await telecharger())) {
          signaler(t('Téléchargement impossible : vérifie ta connexion.'));
          break;
        }
        rafraichir(); // la pièce revient dans la liste, derrière le menu
      }
      enCours = false;
      actualiserBouton();
    }

    // Renvoie la fonction qui referme le menu (le tuto s'en sert pour le refermer à la fin).
    return ouvrirFeuille({
      titre: t('Télécharger des pièces'),
      corps: el('div', { className: 'pile' }, choix.map(({ ligne }) => ligne)),
      actions: (fermer) => [
        el('button', { type: 'button', className: 'btn-ghost btn-petit', onclick: fermer }, t('Fermer')),
        bouton,
      ],
    });
  }

  async function rafraichir() {
    const { fournies, importees, erreurs } = await toutesLesPieces();
    const retirees = await piecesRetirees();
    const presentes = trierParUtilisation([...fournies, ...importees]).filter((piece) => !retirees.has(piece.id));

    remplacer(zoneListe,
      // On ne peut plus importer de pièce. Mais si un téléphone en garde une d'avant, elle reste
      // accessible : la faire disparaître en silence serait une mauvaise surprise.
      presentes.map((piece) => (importees.includes(piece)
        ? creerCarte(piece, t('Supprimer cette pièce'), () => supprimerImportee(piece))
        : creerCarte(piece, t('Supprimer du téléphone'), peutRetirer ? () => retirer(piece) : null))),
      erreurs.map((erreur) => el('p', { className: 'avis avis-erreur' }, t('Pièce illisible : {erreur}', { erreur }))),
      peutRetirer && el('button', {
        type: 'button',
        className: 'ligne-menu',
        onclick: () => ouvrirMenu(fournies, retirees),
      }, t('Télécharger des pièces')),
    );
    proposerTutoPieces(fournies, retirees);
  }

  // Le tuto (tuto.js), demandé par Louis le 2026-11-11 : une pastille « ? » au coin de la première
  // pièce. Ici, rien n'est caché, tout se fait avec des boutons écrits : le doigt fantôme les touche
  // un par un, et la légende dit ce que chacun fait. Ni la pièce ne s'ouvre, ni rien n'est supprimé.
  // Le menu « Télécharger des pièces », lui, s'ouvre pour de vrai (Louis voulait le voir) : le doigt
  // y montre comment cocher une pièce et la télécharger, sans rien cocher, puis le menu se referme.
  // Le doigt se pose dans la liste entière : le bouton du menu est sous les pièces.
  function proposerTutoPieces(fournies, retirees) {
    const premiere = zoneListe.querySelector('.carte-piece');
    if (!premiere) return;
    const suppression = premiere.querySelector('.action-discrete');
    const menu = zoneListe.querySelector('.ligne-menu');
    let fermerMenu = null;
    proposerTuto('pieces', premiere, () => {
      zoneListe.classList.add('ancre-tuto');
      montrerGestes({
        carte: premiere,
        cadre: zoneListe,
        ecran: racine,
        etapes: [
          { geste: 'toucher', titre: t('Toucher une pièce'), texte: t("l'ouvrir et la travailler"), cible: premiere.querySelector('.carte-lien') },
          suppression && { geste: 'toucher', titre: suppression.textContent, texte: t('la retirer, sans perdre ta progression'), cible: suppression },
          menu && {
            geste: 'toucher', titre: menu.textContent, texte: t('en ajouter, ou en retrouver une'), cible: menu,
            agir: () => { fermerMenu = ouvrirMenu(fournies, retirees); },
            quitter: true, // la suite se passe dans le menu (voir montrerLeMenu)
          },
        ].filter(Boolean),
        fin: () => { if (fermerMenu) montrerLeMenu(fermerMenu); },
        nettoyer: () => zoneListe.classList.remove('ancre-tuto'),
      });
    });
  }

  // La suite du tuto, dans le menu ouvert : cocher une pièce, puis Télécharger, pour de faux. À la
  // fin, le menu se referme : on revient à la liste, comme avant le tuto.
  function montrerLeMenu(fermerMenu) {
    const fond = [...document.querySelectorAll('.modal-overlay')].at(-1);
    const feuille = fond?.querySelector('.modal-card');
    const ligne = feuille?.querySelector('.ligne-telechargement');
    const bouton = feuille?.querySelector('.modal-actions .btn');
    if (!feuille || !ligne) return;
    feuille.classList.add('ancre-tuto');
    montrerGestes({
      carte: feuille,
      ecran: fond,
      dansUnMenu: true,
      etapes: [
        { geste: 'toucher', titre: t('Cocher une pièce'), texte: t('la choisir'), cible: ligne.querySelector('input') ?? ligne },
        bouton && { geste: 'toucher', titre: bouton.textContent, texte: t('la mettre sur ce téléphone'), cible: bouton },
      ].filter(Boolean),
      fin: fermerMenu,
      nettoyer: () => feuille.classList.remove('ancre-tuto'),
    });
  }

  await rafraichir();

  remplacer(racine, creerTitreVue(t('Mes pièces')), zoneListe);
  cascade(zoneListe);
}
