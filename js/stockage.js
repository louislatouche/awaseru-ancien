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
  labelsOnglets: true, // le nom sous chaque icône des onglets du bas (voir appliquerAffichage)
  // (Il y avait aussi « navigation » : des boutons ou des gestes pour les fiches et le filage.
  // Depuis le 2026-11-10, les gestes sont la seule navigation ; une valeur encore enregistrée sur
  // un téléphone ne sert plus à rien, et ne gêne pas.)
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
// Rangés par id de mot (voir « vocabulaire » dans le fichier d'une pièce). Un mot su l'est partout :
// les pièces qui l'emploient lui donnent le même id, et lisent donc la même coche.
//
// La répétition espacée : un mot su revient à réviser au bout d'un jour, puis de 3, 7, 14 et 30
// (et ensuite tous les 30 jours). Un mot à revoir reste à réviser, et reprend du début dès qu'on le
// sait de nouveau. Pour chaque mot, on garde donc :
//   statut  : la dernière réponse, 'su' ou 'a_revoir' ;
//   palier  : pour un mot su, la place de son délai dans DELAIS (0 pour 1 jour, 4 pour 30 jours) ;
//   revient : pour un mot su, le jour où il revient à réviser, écrit AAAA-MM-JJ.
// Exemple : { horu: { statut: 'su', palier: 1, revient: '2026-11-14' }, esa: { statut: 'a_revoir' } }
// Les jours sont ceux du calendrier, à l'heure du téléphone : un mot su à 23 h revient le lendemain
// matin, pas 24 heures plus tard.

const DELAIS = [1, 3, 7, 14, 30]; // en jours

// Le jour d'aujourd'hui, ou dans « plus » jours, écrit AAAA-MM-JJ. sv-SE écrit les dates dans cet
// ordre, à l'heure du téléphone (comme le nom des fichiers de sauvegarde). Écrites ainsi, deux dates
// se comparent comme deux mots : '2026-11-14' < '2026-11-20'.
function jour(plus = 0) {
  const date = new Date();
  date.setDate(date.getDate() + plus); // setDate passe d'un mois à l'autre tout seul
  return date.toLocaleDateString('sv-SE');
}

export function lireStatutsMots() {
  return lire('vocabulaire', {});
}

// Un mot à réviser aujourd'hui : à revoir, ou su et arrivé à son jour de retour (ou passé).
// etat : ce que lireStatutsMots donne pour ce mot (undefined pour un mot jamais révisé).
export function motAReviser(etat) {
  if (etat?.statut === 'a_revoir') return true;
  return etat?.statut === 'su' && etat.revient <= jour();
}

// Une réponse dans la révision. Un mot su monte d'un palier s'il était à réviser ; révisé plus tôt
// (depuis « Tous »), il garde son palier : savoir un mot la veille de son retour ne prouve pas
// qu'on le tiendra deux fois plus longtemps. Dans les deux cas, son jour de retour repart d'aujourd'hui.
export function changerStatutMot(idMot, statut) {
  const tous = lireStatutsMots();
  const avant = tous[idMot];
  if (statut === 'su') {
    let palier = 0; // nouveau, ou à revoir jusque-là : il repart du premier délai
    if (avant?.statut === 'su') {
      const ancien = avant.palier ?? 0;
      palier = motAReviser(avant) ? Math.min(ancien + 1, DELAIS.length - 1) : ancien;
    }
    tous[idMot] = { statut, palier, revient: jour(DELAIS[palier]) };
  } else {
    tous[idMot] = { statut };
  }
  ecrire('vocabulaire', tous);
}

// Remet les coches des mots au format d'aujourd'hui. Cela se fait au chargement de ce fichier, et
// après la restauration d'une sauvegarde, qui peut venir d'une version plus ancienne.
// 1. Jusqu'à la version 100, chaque pièce rangeait ses coches à part, sous « vocabulaire:<id de la
//    pièce> ». On les verse dans le rangement commun, puis on efface les anciennes. Si deux pièces
//    disaient autre chose du même mot, « à revoir » l'emporte : mieux vaut revoir un mot qu'on sait
//    que d'en croire su un qu'on a oublié.
// 2. Jusqu'à la version 101, une coche n'était qu'un mot : 'su' ou 'a_revoir', sans date. Un mot su
//    revient demain, comme si on venait de le savoir une première fois (choix de Louis, 2026-11-10).
function mettreLesMotsAJour() {
  try {
    const anciennes = Object.keys(localStorage).filter((cle) => cle.startsWith(`${PREFIXE}vocabulaire:`));
    const communs = lireStatutsMots();
    const statutDe = (valeur) => (typeof valeur === 'string' ? valeur : valeur?.statut);
    for (const ancienne of anciennes) {
      const statuts = lire(ancienne.slice(PREFIXE.length), {}); // une donnée abîmée compte pour rien
      for (const [idMot, statut] of Object.entries(statuts)) {
        const actuel = statutDe(communs[idMot]);
        if (!actuel || (statut === 'a_revoir' && actuel !== 'a_revoir')) communs[idMot] = statut;
      }
    }
    const sansDate = Object.keys(communs).filter((idMot) => typeof communs[idMot] === 'string');
    if (anciennes.length === 0 && sansDate.length === 0) return; // déjà à jour : rien à écrire
    for (const idMot of sansDate) {
      communs[idMot] = communs[idMot] === 'su' ? { statut: 'su', palier: 0, revient: jour(1) } : { statut: 'a_revoir' };
    }
    ecrire('vocabulaire', communs);
    // Seulement une fois le rangement commun écrit : rien ne se perd en route.
    anciennes.forEach((cle) => localStorage.removeItem(cle));
  } catch {
    // stockage inaccessible ou plein : les anciennes coches restent, on réessaiera au prochain lancement
  }
}
mettreLesMotsAJour(); // au chargement de ce fichier, donc avant toute lecture

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
  // Une sauvegarde plus ancienne range encore les mots pièce par pièce, ou sans date.
  mettreLesMotsAJour();
}
