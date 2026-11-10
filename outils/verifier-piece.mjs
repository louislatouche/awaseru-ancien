// Vérifie un fichier de pièce avec les mêmes règles que l'app, puis fait le point sur son vocabulaire.
// Usage : node outils/verifier-piece.mjs <id>     (par exemple : node outils/verifier-piece.mjs hanasaka-jiisan)
//
// Le point sur le vocabulaire signale ce qu'un oubli laisserait passer sans erreur :
// - les répliques qui n'ont pas encore leur mot à mot ;
// - les morceaux qui contiennent du japonais mais ne renvoient à aucun mot du vocabulaire ;
// - les mots du vocabulaire qu'aucune réplique n'emploie.
// Il liste aussi les mots marqués « particule », pour vérifier d'un coup d'œil qu'il n'en manque pas,
// et les mots écrits pareil qu'un mot d'une autre pièce mais sous un autre id : le même mot doit
// garder le même id dans toutes les pièces (sa coche « Je savais » est commune), sauf homographe.

import { readdirSync, readFileSync } from 'node:fs';
import { validerPiece } from '../js/validation.js';

const id = process.argv[2];
if (!id) {
  console.error('Usage : node outils/verifier-piece.mjs <id de la pièce>');
  process.exit(1);
}

const piece = JSON.parse(readFileSync(new URL(`../pieces/${id}.json`, import.meta.url), 'utf8'));
const erreurs = validerPiece(piece);
if (erreurs.length > 0) {
  console.log(`${erreurs.length} erreur(s) :`);
  for (const erreur of erreurs) console.log(`  - ${erreur}`);
  process.exit(1);
}
console.log('Pièce valide.');

if (!piece.vocabulaire) {
  console.log('Pas de vocabulaire dans cette pièce.');
  process.exit(0);
}

// Du japonais : hiragana, katakana ou kanji (la ponctuation et les espaces n'en sont pas).
const JAPONAIS = /[ぁ-ゖァ-ヺー一-鿿々]/;
const repliques = piece.scenes.flatMap((scene) => scene.repliques);
const sansMots = repliques.filter((replique) => !replique.mots).map((replique) => replique.numero);
const employes = new Set();
const orphelins = [];

for (const replique of repliques.filter((r) => r.mots)) {
  for (const morceau of replique.mots) {
    if (morceau.v) employes.add(morceau.v);
    else if (JAPONAIS.test(morceau.t)) orphelins.push(`${replique.numero} « ${morceau.t} »`);
  }
}

const inutilises = piece.vocabulaire.filter((mot) => !employes.has(mot.id)).map((mot) => mot.id);
console.log(`Vocabulaire : ${piece.vocabulaire.length} mots, ${repliques.length - sansMots.length}/${repliques.length} répliques découpées.`);
if (sansMots.length) console.log(`  Répliques sans mot à mot : ${sansMots.join(', ')}`);
if (orphelins.length) console.log(`  Morceaux japonais sans mot du vocabulaire : ${orphelins.join(' ; ')}`);
if (inutilises.length) console.log(`  Mots du vocabulaire jamais employés : ${inutilises.join(', ')}`);
const particules = piece.vocabulaire.filter((mot) => mot.particule).map((mot) => `${mot.id} (${mot.mot})`);
console.log(`  Particules (ni listées ni révisées dans le Vocabulaire) : ${particules.length ? particules.join(', ') : 'aucune'}`);

// Les autres pièces du dossier : un mot écrit pareil chez elles, mais sous un autre id.
const dossier = new URL('../pieces/', import.meta.url);
const ailleurs = new Map(); // le mot écrit -> les « id (pièce) » qui l'emploient ailleurs
for (const fichier of readdirSync(dossier).filter((nom) => nom.endsWith('.json') && nom !== 'index.json' && nom !== `${id}.json`)) {
  const autre = JSON.parse(readFileSync(new URL(fichier, dossier), 'utf8'));
  for (const mot of autre.vocabulaire ?? []) {
    if (!ailleurs.has(mot.mot)) ailleurs.set(mot.mot, []);
    ailleurs.get(mot.mot).push({ id: mot.id, piece: fichier.replace(/\.json$/, '') });
  }
}
const differents = piece.vocabulaire.flatMap((mot) => {
  const autres = (ailleurs.get(mot.mot) ?? []).filter((autre) => autre.id !== mot.id);
  return autres.length ? [`${mot.id} (${mot.mot}) ≠ ${autres.map((autre) => `${autre.id} dans ${autre.piece}`).join(', ')}`] : [];
});
if (differents.length) console.log(`  Écrits pareil ailleurs sous un autre id (même sens ? alors reprendre l'id) : ${differents.join(' ; ')}`);
