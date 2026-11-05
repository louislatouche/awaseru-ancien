// Trouver les pièces et en extraire ce dont les écrans ont besoin.

import { validerPiece } from './validation.js';
import { texteAParler } from './texte.js';
import {
  enregistrerPiecesImportees, lirePiecesImportees, lireSelection, lireStatuts,
  lireUtilisation,
} from './stockage.js';

// On garde les pièces fournies en mémoire pour ne pas les recharger à chaque écran.
let memoFournies = null;

// async/await : fetch() prend du temps et renvoie une « promesse » (un résultat à venir).
// await attend ce résultat sans bloquer le reste de la page.
async function chargerFournies() {
  if (memoFournies) return memoFournies;

  const reponse = await fetch('pieces/index.json');
  if (!reponse.ok) throw new Error('la liste des pièces est introuvable.');
  const fichiers = await reponse.json();

  const pieces = [];
  const erreurs = [];
  for (const fichier of fichiers) {
    try {
      const reponsePiece = await fetch(`pieces/${fichier}`);
      if (!reponsePiece.ok) throw new Error('fichier introuvable.');
      const piece = await reponsePiece.json();
      const problemes = validerPiece(piece);
      if (problemes.length > 0) throw new Error(problemes[0]);
      piece.id ??= fichier.replace(/\.json$/i, '');
      pieces.push(piece);
    } catch (erreur) {
      // Une pièce abîmée ne doit pas empêcher d'ouvrir les autres.
      erreurs.push(`${fichier} : ${erreur.message}`);
    }
  }
  memoFournies = { pieces, erreurs };
  return memoFournies;
}

export async function toutesLesPieces() {
  const { pieces, erreurs } = await chargerFournies();
  return {
    fournies: pieces,
    importees: lirePiecesImportees(),
    erreurs,
  };
}

export async function trouverPiece(id) {
  const { fournies, importees } = await toutesLesPieces();
  return [...fournies, ...importees].find((piece) => piece.id === id) ?? null;
}

// Les plus récemment ouvertes d'abord. Une pièce jamais ouverte vaut 0 : elle passe après, et sort()
// garde les ex æquo dans leur ordre de départ, celui de pieces/index.json.
export function trierParUtilisation(pieces) {
  return [...pieces].sort((a, b) => lireUtilisation(b.id) - lireUtilisation(a.id));
}

// Seule la pièce part : ses répliques choisies et sa progression restent enregistrées.
export function supprimerPieceImportee(id) {
  enregistrerPiecesImportees(lirePiecesImportees().filter((piece) => piece.id !== id));
}

// ---- Lecture d'une pièce ----

// Met toutes les répliques à la suite, chacune sachant à quelle scène elle appartient.
// Indispensable : la réplique précédente de la 29 (début de scène 5) est la 28 (fin de scène 4).
// Raisonner scène par scène raterait ce genre d'enchaînement.
export function lignesDe(piece) {
  // audio : le début du chemin des fichiers de cette réplique, s'ils existent.
  const dossierAudio = piece.audio ? `pieces/audio/${encodeURIComponent(piece.id)}` : null;
  return piece.scenes.flatMap((scene) => scene.repliques.map((replique) => ({
    ...replique,
    scene,
    audio: dossierAudio && `${dossierAudio}/${replique.numero}`,
  })));
}

export function roleDe(piece, idRole) {
  return piece.roles.find((role) => role.id === idRole) ?? null;
}

// Combien de mes répliques sont sues. On ne compte que les répliques encore sélectionnées :
// une réplique sue puis décochée ne doit pas donner « 8/7 sues ».
export function progressionDe(piece) {
  const statuts = lireStatuts(piece.id);
  let total = 0;
  let sues = 0;
  let aRevoir = 0;
  for (const numero of lireSelection(piece)) {
    total += 1;
    if (statuts[numero] === 'su') sues += 1;
    if (statuts[numero] === 'a_revoir') aRevoir += 1;
  }
  return { total, sues, aRevoir };
}

// Mon signal d'entrée : la dernière réplique avant la mienne où quelqu'un dit vraiment quelque chose.
// Une ligne qui n'est qu'une didascalie ne s'entend pas, elle ne peut donc pas servir de signal.
export function signalDe(lignes, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (texteAParler(lignes[i].texte)) return lignes[i];
  }
  return null; // c'est la toute première réplique de la pièce
}

// Cherche les répliques voisines qui sont aussi à moi, mais dans un autre rôle.
export function enchainementsDe(lignes, index, selection) {
  const ligne = lignes[index];
  const voisine = (position) => {
    const autre = lignes[position];
    return autre && selection.has(autre.numero) && autre.role !== ligne.role ? autre : null;
  };
  return { avant: voisine(index - 1), apres: voisine(index + 1) };
}
