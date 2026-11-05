// Fabrique les fichiers audio d'une pièce avec AivisSpeech.
// Ce script tourne sur ton ordinateur, avec Node : il ne fait pas partie de l'app.
//
// Il faut que le moteur AivisSpeech soit lancé et que ffmpeg soit installé. Puis :
//   node outils/generer-audio.mjs hanasaka-jiisan        toute la pièce
//   node outils/generer-audio.mjs hanasaka-jiisan 12 31  seulement ces répliques
//
// Le choix des voix est dans pieces/audio/<id>/voix.json.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { furiganaDe, texteAvecKanji } from '../js/texte.js';

const MOTEUR = 'http://127.0.0.1:10101';
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

async function appeler(chemin, options) {
  let reponse;
  try {
    reponse = await fetch(MOTEUR + chemin, options);
  } catch {
    throw new Error(`Le moteur AivisSpeech ne répond pas sur ${MOTEUR}. Lance-le, puis recommence.`);
  }
  if (!reponse.ok) throw new Error(`${chemin} : erreur ${reponse.status} ${await reponse.text()}`);
  return reponse;
}

// ---- Les voix ----

// Installe depuis AivisHub les voix qui manquent, puis renvoie le numéro de style à donner au moteur.
async function preparerVoix(config) {
  let modeles = await (await appeler('/aivm_models')).json();

  for (const { modele, nom } of Object.values(config.roles)) {
    if (modeles[modele]) continue;
    console.log(`Installation de la voix ${nom} (environ 240 Mo)...`);
    const formulaire = new FormData();
    formulaire.append('url', `https://api.aivis-project.com/v1/aivm-models/${modele}/download?model_type=AIVMX`);
    await appeler('/aivm_models/install', { method: 'POST', body: formulaire });
    modeles = await (await appeler('/aivm_models')).json();
  }

  return (choix) => {
    const styles = modeles[choix.modele].speakers.flatMap((s) => s.speaker.styles);
    const style = styles.find((s) => s.name === choix.style);
    if (!style) throw new Error(`La voix ${choix.nom} n'a pas de style « ${choix.style} » : ${styles.map((s) => s.name).join(', ')}`);
    return style.id;
  };
}

// ---- Le contrôle des lectures ----

const versKatakana = (kana) => kana.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// Le moteur écrit les voyelles longues comme on les prononce : しょう devient ショオ, れい devient レエ.
const normaliser = (kana) => versKatakana(kana)
  .replace(/([オコソトノホモヨロゴゾドボポ]|ョ)ウ/g, '$1オ')
  .replace(/([エケセテネヘメレゲゼデベペ])イ/g, '$1エ');

// Quels furigana ne retrouve-t-on pas, dans l'ordre, dans ce que le moteur va prononcer ?
function lecturesFausses(ligne, garderDidascalies, requete) {
  const prononce = requete.accent_phrases.flatMap((g) => g.moras.map((m) => m.text)).join('');
  const fautes = [];
  let curseur = 0;
  for (const { kanji, lecture } of furiganaDe(ligne.texte, garderDidascalies)) {
    // On cherche d'abord tel quel : la normalisation peut fausser la rencontre de deux mots
    // (で + いじわる donnerait デエジワル). Elle ne change pas la longueur : le curseur reste valable.
    const attendu = versKatakana(lecture);
    let position = prononce.indexOf(attendu, curseur);
    if (position === -1) position = normaliser(prononce).indexOf(normaliser(lecture), curseur);
    if (position === -1) fautes.push(kanji);
    else curseur = position + attendu.length;
  }
  return fautes;
}

// Demande au moteur comment il lirait le texte. Tant qu'un kanji est mal lu, on le remplace
// par sa lecture et on redemande. Le rapport garde la trace de ces remplacements.
async function analyser(ligne, garderDidascalies, style) {
  const enKana = new Set();
  for (let essai = 0; essai < 3; essai += 1) {
    const texte = texteAvecKanji(ligne.texte, garderDidascalies, enKana);
    if (!texte) return null;
    const parametres = new URLSearchParams({ text: texte, speaker: style });
    const requete = await (await appeler(`/audio_query?${parametres}`, { method: 'POST' })).json();
    const fautes = lecturesFausses(ligne, garderDidascalies, requete);
    if (fautes.length === 0) return { requete, enKana, douteux: [] };
    if (fautes.every((kanji) => enKana.has(kanji))) return { requete, enKana, douteux: fautes };
    fautes.forEach((kanji) => enKana.add(kanji));
  }
  return null;
}

// ---- La fabrication d'un fichier ----

async function fabriquer(requete, style, sortie) {
  const reponse = await appeler(`/synthesis?speaker=${style}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requete),
  });
  const wav = Buffer.from(await reponse.arrayBuffer());
  // loudnorm met toutes les voix au même volume ; mono à 64 kb/s suffit pour de la parole.
  const resultat = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', 'pipe:0',
    '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '1', '-b:a', '64k', sortie,
  ], { input: wav });
  if (resultat.status !== 0) throw new Error(`ffmpeg : ${resultat.stderr ?? resultat.error}`);
}

// ---- Le programme ----

const [id, ...numerosDemandes] = process.argv.slice(2);
if (!id) {
  console.error('Usage : node outils/generer-audio.mjs <id-de-la-piece> [numéros de répliques]');
  process.exit(1);
}

const dossier = join(RACINE, 'pieces', 'audio', id);
const piece = JSON.parse(readFileSync(join(RACINE, 'pieces', `${id}.json`), 'utf8'));
const config = JSON.parse(readFileSync(join(dossier, 'voix.json'), 'utf8'));
const styleDe = await preparerVoix(config);

mkdirSync(dossier, { recursive: true });
const rapport = [];

for (const ligne of piece.scenes.flatMap((scene) => scene.repliques)) {
  if (numerosDemandes.length > 0 && !numerosDemandes.includes(String(ligne.numero))) continue;

  const choix = config.roles[ligne.role ?? config.sans_role];
  // Une réplique peut demander un autre style que celui du rôle (par exemple plus triste).
  const style = styleDe({ ...choix, ...config.repliques?.[ligne.numero] });

  const version = await analyser(ligne, false, style);
  if (!version) {
    rapport.push(`${ligne.numero} : rien à dire, pas de fichier`);
  } else {
    await fabriquer(version.requete, style, join(dossier, `${ligne.numero}.mp3`));
    const remarque = version.enKana.size > 0 ? `  lu en kana : ${[...version.enKana].join(', ')}` : '';
    const doute = version.douteux.length > 0 ? `  À VÉRIFIER : ${version.douteux.join(', ')}` : '';
    rapport.push(`${ligne.numero} : ${choix.nom}${remarque}${doute}`);
  }

  // La seconde version, avec la didascalie, seulement si le texte contient une parenthèse.
  if (ligne.texte.includes('（')) {
    const avec = await analyser(ligne, true, style);
    if (avec) await fabriquer(avec.requete, style, join(dossier, `${ligne.numero}-didascalies.mp3`));
  }
}

console.log(rapport.join('\n'));

// La liste de tous les fichiers audio, que le service worker lit pour les garder hors ligne.
const racineAudio = join(RACINE, 'pieces', 'audio');
const fichiers = readdirSync(racineAudio, { withFileTypes: true })
  .filter((entree) => entree.isDirectory())
  .flatMap((entree) => readdirSync(join(racineAudio, entree.name))
    .filter((nom) => nom.endsWith('.mp3'))
    .map((nom) => `pieces/audio/${entree.name}/${nom}`))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
writeFileSync(join(racineAudio, 'index.json'), `${JSON.stringify(fichiers, null, 2)}\n`);
console.log(`${fichiers.length} fichiers audio dans pieces/audio/index.json`);
