// Les langues de l'app.
//
// Dans le code, chaque texte reste écrit en français : t('Mes pièces'). La fonction t cherche cette
// phrase dans le dictionnaire de la langue choisie. Si elle n'y est pas, le français s'affiche :
// jamais de trou à l'écran. Pour ajouter une langue : un fichier dans langues/, une ligne dans LANGUES,
// et une ligne dans la liste du service worker.

import { lireReglages } from './stockage.js';

// Chaque langue est écrite dans sa propre langue : c'est ainsi qu'on la reconnaît.
export const LANGUES = [
  { code: 'fr', nom: 'Français' },
  { code: 'en', nom: 'English' },
  { code: 'de', nom: 'Deutsch' },
  { code: 'es', nom: 'Español' },
  { code: 'it', nom: 'Italiano' },
  { code: 'pt', nom: 'Português' },
  { code: 'nl', nom: 'Nederlands' },
  { code: 'pl', nom: 'Polski' },
  { code: 'sv', nom: 'Svenska' },
  { code: 'da', nom: 'Dansk' },
  { code: 'no', nom: 'Norsk' },
  { code: 'fi', nom: 'Suomi' },
  { code: 'cs', nom: 'Čeština' },
  { code: 'hu', nom: 'Magyar' },
  { code: 'ro', nom: 'Română' },
  { code: 'el', nom: 'Ελληνικά' },
  { code: 'uk', nom: 'Українська' },
  { code: 'ru', nom: 'Русский' },
  { code: 'ja', nom: '日本語' },
  { code: 'ko', nom: '한국어' },
];

const existe = (code) => LANGUES.some((langue) => langue.code === code);

// Le choix fait dans les Réglages. Sans choix : la langue du téléphone si on la connaît, sinon le français.
export function langueActive() {
  const choisie = lireReglages().langue;
  if (existe(choisie)) return choisie;
  const debut = (navigator.language ?? '').slice(0, 2);
  const telephone = ['nb', 'nn'].includes(debut) ? 'no' : debut; // les deux formes du norvégien
  return existe(telephone) ? telephone : 'fr';
}

// Les phrases de la langue active. Le français n'a pas de dictionnaire : c'est la langue du code.
let dictionnaire = null;

// On ne charge que la langue utile, pas les vingt : à appeler au démarrage et à chaque changement.
// import() lit un fichier au moment voulu ; le service worker les garde tous pour le hors-ligne.
export async function chargerLangue() {
  const code = langueActive();
  try {
    dictionnaire = code === 'fr' ? null : (await import(`./langues/${code}.js`)).default;
  } catch {
    dictionnaire = null; // fichier inaccessible : le français plutôt qu'une app bloquée
  }
}

// t('Fiche {position} sur {total}', { position: 2, total: 5 }) remplace aussi ce qui est entre accolades.
export function t(phrase, valeurs = {}) {
  const texte = dictionnaire?.[phrase] ?? phrase;
  return texte.replace(/\{(\w+)\}/g, (_, nom) => valeurs[nom]);
}

// Le contenu d'une pièce : en français pour le français, en anglais pour toutes les autres langues.
// fr devient en, titre_fr devient titre_en, explication devient explication_en, etc.
// S'il manque une traduction anglaise, le français vaut mieux que rien.
export function traduire(objet, champ) {
  if (langueActive() === 'fr') return objet[champ];
  let nom = `${champ}_en`;
  if (champ === 'fr') nom = 'en';
  else if (champ.endsWith('_fr')) nom = champ.replace(/fr$/, 'en');
  return objet[nom] ?? objet[champ];
}
