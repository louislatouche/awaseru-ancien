// Tout ce qui est gardé sur le téléphone, dans localStorage.
//
// localStorage ne sait stocker que du texte : on convertit donc en JSON à l'écriture et à la lecture.
// Le préfixe « replik: » est nécessaire car sur GitHub Pages, tous tes projets partagent le même
// localStorage (ils sont sur le même site, tonnom.github.io).

const PREFIXE = 'replik:';

function lire(cle, valeurParDefaut) {
  try {
    const brut = localStorage.getItem(PREFIXE + cle);
    return brut === null ? valeurParDefaut : JSON.parse(brut);
  } catch {
    return valeurParDefaut; // donnée abîmée : on repart de la valeur par défaut plutôt que de planter
  }
}

function ecrire(cle, valeur) {
  localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
}

// ---- Réglages ----

const REGLAGES_PAR_DEFAUT = {
  vitesse: 0.9,
  voix: null, // null = choix automatique
  lireDidascalies: false,
  voixEnregistrees: true, // les voix par rôle des pièces fournies, plutôt que celle du téléphone
  furigana: true,
  traduction: true,
};

export function lireReglages() {
  // Le ... fusionne : les réglages enregistrés écrasent les valeurs par défaut,
  // et un réglage ajouté dans une future version aura quand même sa valeur par défaut.
  return { ...REGLAGES_PAR_DEFAUT, ...lire('reglages', {}) };
}

export function changerReglage(nom, valeur) {
  ecrire('reglages', { ...lireReglages(), [nom]: valeur });
}

// ---- Sélection : quelles répliques sont les miennes ----
//
// On ne stocke qu'une liste de numéros. La case d'un rôle n'est pas stockée : elle est déduite
// (cochée si toutes ses répliques sont choisies). Cela évite que les deux se contredisent.

export function lireSelection(piece) {
  const enregistree = lire(`selection:${piece.id}`, null);
  // null veut dire « jamais touché » : on présélectionne. Une liste vide [] est différente :
  // elle veut dire « tout décoché exprès », et il ne faut surtout pas la remplacer.
  const numeros = enregistree ?? piece.mes_repliques ?? [];
  // Après la réimportation d'une pièce corrigée, certains numéros peuvent ne plus exister.
  const existants = new Set(piece.scenes.flatMap((scene) => scene.repliques.map((r) => r.numero)));
  return new Set(numeros.filter((numero) => existants.has(numero)));
}

export function enregistrerSelection(pieceId, numeros) {
  ecrire(`selection:${pieceId}`, [...numeros]);
}

// ---- Progression : { "5": "su", "7": "a_revoir" } ----
// Une réplique absente n'a pas encore été travaillée.

export function lireStatuts(pieceId) {
  return lire(`progression:${pieceId}`, {});
}

export function changerStatut(pieceId, numero, statut) {
  ecrire(`progression:${pieceId}`, { ...lireStatuts(pieceId), [numero]: statut });
}

export function effacerProgression(pieceId) {
  localStorage.removeItem(`${PREFIXE}progression:${pieceId}`);
}

// ---- Pièces importées ----

export function lirePiecesImportees() {
  return lire('importees', []);
}

export function enregistrerPiecesImportees(pieces) {
  try {
    ecrire('importees', pieces);
  } catch {
    // localStorage a une taille limitée : setItem lève une erreur quand il est plein.
    throw new Error("le stockage du téléphone est plein pour cette app. Supprime une pièce importée puis réessaie.");
  }
}

export function effacerDonneesDePiece(pieceId) {
  effacerProgression(pieceId);
  localStorage.removeItem(`${PREFIXE}selection:${pieceId}`);
}
