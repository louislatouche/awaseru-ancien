// La version d'Awaseru, et les mises à jour qui attendent d'être chargées.
//
// Le numéro de version est celui de la copie hors ligne de l'app : le cache « awaseru-v45 » du
// service worker (voir sw.js). Quand une mise à jour s'installe, la nouvelle copie remplace
// l'ancienne tout de suite, mais la page ouverte garde l'ancien code en mémoire tant qu'elle n'est
// pas rechargée. Pour savoir quel code tourne vraiment, on note donc la version du démarrage.

import { el } from './dom.js';
import { t } from './langues.js';

// Les numéros des copies présentes sur le téléphone (une seule d'habitude, deux pendant une installation).
async function numerosInstalles() {
  if (!('caches' in window)) return [];
  return (await caches.keys())
    .filter((nom) => nom.startsWith('awaseru-v'))
    .map((nom) => Number(nom.slice('awaseru-v'.length)));
}

// Lue une seule fois, au chargement de ce fichier : la copie qui a servi le code de cette page.
// S'il y en avait deux, la page vient de la plus ancienne, celle qui était encore aux commandes.
const auDemarrage = numerosInstalles().then((numeros) => (numeros.length ? Math.min(...numeros) : null));

// La version installée la plus récente.
async function versionInstallee() {
  const numeros = await numerosInstalles();
  return numeros.length ? Math.max(...numeros) : null;
}

// La version du code qui tourne. Au tout premier lancement, il n'y avait pas encore de copie :
// le code venait du site, c'est donc la version qui vient de s'installer.
export async function versionEnCours() {
  return (await auDemarrage) ?? versionInstallee();
}

// Une version plus récente est-elle installée, en attente d'un rechargement ?
export async function nouvelleVersionEnAttente() {
  const [enCours, installee] = await Promise.all([versionEnCours(), versionInstallee()]);
  return enCours !== null && installee !== null && installee > enCours;
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
