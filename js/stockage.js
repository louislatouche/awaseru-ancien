// Tout ce qui est gardé sur le téléphone, dans localStorage.
//
// localStorage ne sait stocker que du texte : on convertit donc en JSON à l'écriture et à la lecture.
// Le préfixe « awaseru: » est nécessaire car sur GitHub Pages, tous tes projets partagent le même
// localStorage (ils sont sur le même site, tonnom.github.io).

const PREFIXE = 'awaseru:';

// Avant de s'appeler Awaseru, l'app s'appelait Replik et rangeait tout sous « replik: ». L'adresse a
// changé (/replik/ devenue /awaseru/), mais le site reste le même, donc les données aussi : on les
// recopie une fois sous le nouveau préfixe, puis on efface les anciennes. Une donnée déjà présente
// sous le nouveau nom n'est jamais écrasée.
function reprendreLesDonneesDeReplik() {
  const ANCIEN_PREFIXE = 'replik:';
  try {
    const anciennes = Object.keys(localStorage).filter((cle) => cle.startsWith(ANCIEN_PREFIXE));
    for (const ancienne of anciennes) {
      const nouvelle = PREFIXE + ancienne.slice(ANCIEN_PREFIXE.length);
      if (localStorage.getItem(nouvelle) === null) localStorage.setItem(nouvelle, localStorage.getItem(ancienne));
      localStorage.removeItem(ancienne); // seulement une fois la copie faite : rien ne se perd en route
    }
    localStorage.removeItem('replik-reprise'); // la note de reprise ne vit que 30 minutes : inutile de la garder
  } catch {
    // stockage inaccessible (navigation privée stricte) : il n'y a rien à reprendre
  }
}
reprendreLesDonneesDeReplik(); // au chargement de ce fichier, donc avant toute lecture

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
  langue: null, // null = la langue du téléphone
  voix: null, // null = choix automatique
  lireDidascalies: false,
  voixEnregistrees: true, // les voix par rôle des pièces fournies, plutôt que celle du téléphone
  muet: false, // le bouton de l'en-tête coupe le son de toute l'app (voir changerSon dans voix.js)
  furigana: true,
  traduction: true,
  // Les commandes des fiches et du filage : 'icones', 'icones-labels' (le nom sous chaque icône)
  // ou 'gestes' (plus de barre dans les fiches : on touche et on glisse la carte).
  navigation: 'icones',
  affichagePieces: {}, // les choix de furigana et de traduction propres à une pièce (voir plus bas)
};

export function lireReglages() {
  // Le ... fusionne : les réglages enregistrés écrasent les valeurs par défaut,
  // et un réglage ajouté dans une future version aura quand même sa valeur par défaut.
  return { ...REGLAGES_PAR_DEFAUT, ...lire('reglages', {}) };
}

export function changerReglage(nom, valeur) {
  ecrire('reglages', { ...lireReglages(), [nom]: valeur });
}

// ---- Furigana et traduction : un choix général, et celui de chaque pièce ----
//
// Les Réglages donnent le choix pour toutes les pièces (furigana, traduction). Les interrupteurs
// des écrans d'une pièce le remplacent pour elle seule : son choix est rangé dans
// reglages.affichagePieces, sous l'identifiant de la pièce. Sans choix propre, la pièce suit le général.

export function lireAffichage(pieceId) {
  const reglages = lireReglages();
  const propre = (pieceId && reglages.affichagePieces?.[pieceId]) || {};
  // ?? : « sinon » pour une valeur absente (contrairement à ||, il garde false, qui est un vrai choix).
  return {
    furigana: propre.furigana ?? reglages.furigana,
    traduction: propre.traduction ?? reglages.traduction,
  };
}

export function changerAffichagePiece(pieceId, nom, valeur) {
  const pieces = { ...lireReglages().affichagePieces };
  pieces[pieceId] = { ...pieces[pieceId], [nom]: valeur };
  changerReglage('affichagePieces', pieces);
}

// ---- Sélection : quelles répliques sont les miennes ----
//
// On ne stocke qu'une liste de numéros. La case d'un rôle n'est pas stockée : elle est déduite
// (cochée si toutes ses répliques sont choisies). Cela évite que les deux se contredisent.

export function lireSelection(piece) {
  // Rien n'est présélectionné : l'app sert à toute la troupe, chacun choisit ses répliques.
  const numeros = lire(`selection:${piece.id}`, []);
  // Après la correction d'une pièce, certains numéros peuvent ne plus exister.
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

// Remettre une pièce à zéro efface les coches de ses répliques, pas celles des mots : un mot su
// l'est dans toutes les pièces (voir plus bas), il ne s'oublie pas avec l'une d'elles. Choix de
// Louis, le 2026-11-10.
export function effacerProgression(pieceId) {
  localStorage.removeItem(`${PREFIXE}progression:${pieceId}`);
}

// ---- Les mots du vocabulaire : su ou à revoir, communs à toutes les pièces ----
// Rangés par id de mot (voir « vocabulaire » dans le fichier d'une pièce) : { horu: 'su', ... }.
// Un mot su l'est partout : les pièces qui l'emploient lui donnent le même id, et lisent donc la
// même coche.

export function lireStatutsMots() {
  return lire('vocabulaire', {});
}

export function changerStatutMot(idMot, statut) {
  ecrire('vocabulaire', { ...lireStatutsMots(), [idMot]: statut });
}

// Jusqu'à la version 100, chaque pièce rangeait ses coches à part, sous « vocabulaire:<id de la
// pièce> ». On les verse une fois dans le rangement commun, puis on efface les anciennes. Cela se
// fait au chargement de ce fichier, et après la restauration d'une sauvegarde faite avant ce
// changement. Si deux pièces disaient autre chose du même mot, « à revoir » l'emporte : mieux vaut
// revoir un mot qu'on sait que d'en croire su un qu'on a oublié.
function rangerLesMotsEnCommun() {
  try {
    const anciennes = Object.keys(localStorage).filter((cle) => cle.startsWith(`${PREFIXE}vocabulaire:`));
    if (anciennes.length === 0) return;
    const communs = lireStatutsMots();
    for (const ancienne of anciennes) {
      const statuts = lire(ancienne.slice(PREFIXE.length), {}); // une donnée abîmée compte pour rien
      for (const [idMot, statut] of Object.entries(statuts)) {
        if (communs[idMot] !== 'a_revoir') communs[idMot] = statut;
      }
    }
    ecrire('vocabulaire', communs);
    // Seulement une fois le rangement commun écrit : rien ne se perd en route.
    anciennes.forEach((cle) => localStorage.removeItem(cle));
  } catch {
    // stockage inaccessible ou plein : les anciennes coches restent, on réessaiera au prochain lancement
  }
}
rangerLesMotsEnCommun(); // au chargement de ce fichier, donc avant toute lecture

// ---- Dernière utilisation : le moment où une pièce a été ouverte, en millisecondes ----
// Il sert à remonter les pièces récentes en haut de la liste. Jamais ouverte : 0.

export function lireUtilisation(pieceId) {
  return lire(`utilisation:${pieceId}`, 0);
}

export function noterUtilisation(pieceId) {
  ecrire(`utilisation:${pieceId}`, Date.now());
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

// ---- Sauvegarde : toutes nos données d'un coup, sans le préfixe ----
// (Les messages d'erreur de ce fichier sont traduits au moment de les afficher : langues.js a besoin
// de ce fichier pour lire le réglage de langue, il ne peut donc pas être importé ici.)

export function toutesLesDonnees() {
  const donnees = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const cle = localStorage.key(i);
    if (cle.startsWith(PREFIXE)) donnees[cle.slice(PREFIXE.length)] = lire(cle.slice(PREFIXE.length), null);
  }
  return donnees;
}

// Remplace tout. Si le stockage est plein en cours de route, on remet ce qu'il y avait avant :
// il ne faut surtout pas rester avec une moitié d'ancien et une moitié de nouveau.
export function remplacerToutesLesDonnees(donnees) {
  const avant = toutesLesDonnees();
  const toutEcrire = (contenu) => {
    Object.keys(toutesLesDonnees()).forEach((cle) => localStorage.removeItem(PREFIXE + cle));
    Object.entries(contenu).forEach(([cle, valeur]) => ecrire(cle, valeur));
  };
  try {
    toutEcrire(donnees);
  } catch {
    toutEcrire(avant);
    throw new Error('le stockage du téléphone est plein : rien n\'a été changé.');
  }
  // Une sauvegarde d'avant la version 101 range encore les mots pièce par pièce.
  rangerLesMotsEnCommun();
}
