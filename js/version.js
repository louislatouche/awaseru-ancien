// La version d'Awaseru, et les mises à jour qui attendent d'être chargées.
//
// La version est celle de la copie hors ligne de l'app : le cache « awaseru-v131.4 » du service
// worker (voir sw.js), où 131 est la version du code et 4 celle des pièces de la troupe. Quand une
// mise à jour s'installe, la nouvelle copie remplace l'ancienne tout de suite, mais la page ouverte
// garde l'ancien code en mémoire tant qu'elle n'est pas rechargée. Pour savoir quel code tourne
// vraiment, on note donc la version du démarrage.

import { el } from './dom.js';
import { t } from './langues.js';

const PREFIXE = 'awaseru-v';

// Lit le nom d'une copie. Celles d'avant la séparation des deux numéros (« awaseru-v130 ») n'ont
// que celui du code : leurs pièces comptent pour 0. Le texte est celui qu'affichent les Réglages.
function lireVersion(nom) {
  const [code, pieces = 0] = nom.slice(PREFIXE.length).split('.').map(Number);
  return { code, pieces, texte: `${code}.${pieces}` };
}

// Pour trier : le code d'abord, puis les pièces. Négatif si a est plus ancienne que b.
const comparer = (a, b) => (a.code - b.code) || (a.pieces - b.pieces);

// Les versions des copies présentes sur le téléphone, de la plus ancienne à la plus récente
// (une seule d'habitude, deux pendant une installation).
async function versionsInstallees() {
  if (!('caches' in window)) return [];
  return (await caches.keys())
    .filter((nom) => nom.startsWith(PREFIXE))
    .map(lireVersion)
    .sort(comparer);
}

// Lue une seule fois, au chargement de ce fichier : la copie qui a servi le code de cette page.
// S'il y en avait deux, la page vient de la plus ancienne, celle qui était encore aux commandes.
const auDemarrage = versionsInstallees().then((versions) => versions[0] ?? null);

// La version installée la plus récente.
async function versionInstallee() {
  return (await versionsInstallees()).at(-1) ?? null;
}

// La version qui tourne. Au tout premier lancement, il n'y avait pas encore de copie :
// le code venait du site, c'est donc la version qui vient de s'installer.
export async function versionEnCours() {
  return (await auDemarrage) ?? versionInstallee();
}

// Une version plus récente est-elle installée, en attente d'un rechargement ?
export async function nouvelleVersionEnAttente() {
  const [enCours, installee] = await Promise.all([versionEnCours(), versionInstallee()]);
  return enCours !== null && installee !== null && comparer(installee, enCours) > 0;
}

// Le bandeau en bas de l'écran qui propose de recharger tout de suite (un seul à la fois).
export function proposerRechargement() {
  if (document.querySelector('.bandeau-maj')) return;
  document.body.append(el('button', {
    type: 'button',
    className: 'btn bandeau-maj',
    onclick: () => location.reload(),
  }, t('Nouvelle version prête : toucher pour recharger')));
}
