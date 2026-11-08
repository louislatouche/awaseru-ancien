// Reprendre là où on en était quand Android relance l'app de lui-même.
//
// Sur un Galaxy Z Fold, déplier le téléphone relance Awaseru depuis Mes pièces : c'est un défaut
// reconnu par Samsung depuis Android 16. Android peut aussi fermer une app restée en arrière-plan
// s'il manque de mémoire. Pour que cela passe inaperçu, on note en continu l'écran affiché et la
// position dans cet écran (la fiche, la réplique du filage). Si l'app redémarre peu après, on y revient.
//
// La note est rangée à part, hors du préfixe « awaseru: » de stockage.js : elle ne doit pas entrer
// dans les sauvegardes, qui refusent toute donnée inconnue (voir sauvegarde.js).

const CLE = 'awaseru-reprise';
const DELAI = 30 * 60 * 1000; // passé 30 minutes, c'est un nouveau départ : l'app s'ouvre sur Mes pièces

// La note de l'écran en cours : son adresse, la position dans l'écran, et jusqu'où il a défilé.
let note = { adresse: '#/', ecran: null, defilement: 0 };

function enregistrer() {
  note.quand = Date.now();
  try {
    localStorage.setItem(CLE, JSON.stringify(note));
  } catch {
    // Stockage plein ou refusé : on perd seulement la reprise, l'app continue normalement.
  }
}

// La note laissée par le lancement précédent. Lue une seule fois, quand ce fichier se charge,
// avant que le nouvel écran ne la remplace. Trop ancienne, elle ne compte pas.
let precedente = null;
try {
  const lue = JSON.parse(localStorage.getItem(CLE));
  if (lue && Date.now() - lue.quand < DELAI) precedente = lue;
} catch {
  precedente = null; // note abîmée : on démarre normalement
}

// ---- Ce que l'app note ----

// Le routeur l'appelle à chaque changement d'écran.
export function noterAdresse(adresse) {
  note = { adresse, ecran: null, defilement: 0 };
  enregistrer();
}

// Les fiches et le filage notent leur position à chaque étape. type : 'fiches' ou 'filage'.
export function noterPosition(type, position) {
  note.ecran = { type, ...position };
  enregistrer();
}

// Revenus à leur écran de départ, ils n'ont plus de position à reprendre.
export function oublierPosition() {
  note.ecran = null;
  enregistrer();
}

// Quand la page passe en arrière-plan (autre app, écran éteint, téléphone déplié...), c'est
// peut-être la dernière occasion d'écrire : on note jusqu'où l'écran a défilé, et l'heure.
// pagehide en plus de visibilitychange : selon les cas, Android n'envoie que l'un des deux.
function noterDepart() {
  note.defilement = document.getElementById('ecran')?.scrollTop ?? 0;
  enregistrer();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) noterDepart();
});
window.addEventListener('pagehide', noterDepart);

// ---- Ce que l'app reprend au démarrage ----

// L'écran où revenir, si l'app vient d'être relancée alors qu'on était ailleurs que sur Mes pièces.
export function adresseAReprendre() {
  return precedente && precedente.adresse !== '#/' ? precedente.adresse : null;
}

// Pour l'écran qui s'affiche : sa position à reprendre, s'il y en a une pour lui.
export function positionAReprendre(type) {
  const ecran = precedente?.adresse === location.hash ? precedente.ecran : null;
  return ecran?.type === type ? ecran : null;
}

// Le routeur l'appelle une fois le premier écran affiché : il remet le défilement, puis la note
// précédente est oubliée. Les écrans suivants démarrent normalement.
export function terminerReprise(zone) {
  if (precedente?.adresse === location.hash && precedente.defilement) zone.scrollTop = precedente.defilement;
  precedente = null;
}
