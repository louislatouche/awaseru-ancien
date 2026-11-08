// Le mode d'emploi, ouvert depuis les Réglages : chaque écran montre ses gestes en petites scènes
// animées. Presque aucun texte, pour que la troupe le comprenne dans toutes les langues de l'app :
// seuls les noms des écrans et des boutons, déjà traduits ailleurs.
//
// Chaque scène est un faux écran miniature (.demo). Un doigt (.doigt) y fait le geste, et les
// éléments réagissent. Tout bouge en CSS (css/mode-emploi.css) : ce fichier ne fait que construire.
// Sous chaque scène, une ligne de pictogrammes : le geste, une flèche, ce qu'il fait.

import { cascade, el, icone, remplacer } from '../dom.js';
import { creerTitreVue } from '../affichage.js';
import { t } from '../langues.js';
import { lireReglages } from '../stockage.js';

// ---- Les petites pièces des scènes ----

// Des traits gris à la place du texte : la scène se lit dans toutes les langues.
const traits = (...largeurs) => largeurs.map((largeur) => el('span', { className: 'trait', style: `width: ${largeur}%` }));

// Une réplique en miniature : un numéro, puis quelques lignes.
function miniCarte(classe = '', numero = '', largeurs = [90, 70]) {
  return el('div', { className: `mini-carte ${classe}` },
    el('span', { className: 'mini-numero' }, numero),
    traits(...largeurs));
}

// Ma réplique cachée en miniature. L'invitation et le texte sont posés l'un sur l'autre :
// les animations font apparaître l'un ou l'autre.
function miniCarteCachee(classe = '') {
  return el('div', { className: `mini-carte mienne mini-cachee ${classe}` },
    el('span', { className: 'mini-masque' }, t('À toi de dire cette réplique')),
    el('span', { className: 'mini-texte' }, traits(85, 60)));
}

// Les icônes lecture et pause posées l'une sur l'autre, pour passer de l'une à l'autre.
const pileLecture = () => el('span', { className: 'pile-icones' },
  el('span', { className: 'icone-lecture' }, icone('lecture')),
  el('span', { className: 'icone-pause' }, icone('pause')));

const doigt = (classe = '') => el('span', { className: `doigt ${classe}`, 'aria-hidden': 'true' });

// La ligne de pictogrammes sous une scène : [geste, effet], [geste, effet]...
function legende(paires) {
  return el('div', { className: 'legende-gestes', 'aria-hidden': 'true' },
    paires.map(([geste, effet]) => el('span', { className: 'paire' }, icone(geste), icone('suite'), icone(effet))));
}

function scene(classe, contenu, paires = []) {
  return el('figure', { className: 'scene-demo' },
    el('div', { className: `demo ${classe}`, 'aria-hidden': 'true' }, contenu),
    paires.length > 0 && legende(paires));
}

// Une section par écran, titrée comme son onglet.
function section(nomIcone, titre, ...scenes) {
  return el('section', { className: 'card pile' },
    el('h2', { className: 'titre-section titre-avec-icone' }, icone(nomIcone), titre),
    scenes);
}

// ---- Les scènes ----

// Script : toucher une réplique la fait lire.
function sceneScript() {
  return scene('demo-script', [miniCarte('', '1'), miniCarte('carte-lue', '2'), doigt()], [['toucher', 'lecture']]);
}

// Mes répliques : toucher la case choisit la réplique.
function sceneChoix() {
  return scene('demo-choix', [
    el('div', { className: 'mini-ligne' },
      el('span', { className: 'mini-case' }, icone('su')),
      el('span', { className: 'mini-lignes' }, traits(80, 55))),
    doigt(),
  ], [['toucher', 'su']]);
}

// Mes répliques : pincer montre la grille des numéros ; garder le doigt sur un numéro ramène à sa réplique.
function scenePincer() {
  const numeros = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => el('span', { className: `mini-numero-grille${n === 6 ? ' vise' : ''}` }, String(n)));
  return scene('demo-pincer', [
    el('div', { className: 'mini-texte-pincer' }, miniCarte('', '5'), miniCarte('reperee-demo', '6'), miniCarte('', '7')),
    el('div', { className: 'mini-grille' }, numeros),
    doigt('doigt-a'), doigt('doigt-b'), doigt('doigt-c'),
  ], [['pincer', 'grille'], ['maintenir', 'repliques']]);
}

// Le bouton lecture (celui de ta réplique et celui du signal) : pause, reprise, et arrêt.
function sceneLecture() {
  return scene('demo-lecture', [
    el('span', { className: 'mini-bouton-lecture' }, pileLecture(), el('span', { className: 'mini-progression' }, el('i'))),
    doigt(),
  ], [['toucher', 'pause'], ['toucher', 'lecture'], ['maintenir', 'stop']]);
}

// Fiches en mode Gestes : toucher pour voir, puis pour écouter.
function sceneToucherCarte() {
  return scene('demo-toucher-carte', [miniCarteCachee(), doigt()], [['toucher', 'voir'], ['toucher', 'lecture']]);
}

// Fiches en mode Gestes : glisser à droite (je savais), à gauche (à revoir).
function sceneGlisser() {
  return scene('demo-glisser', [
    el('div', { className: 'cadre-glisse-demo' },
      el('div', { className: 'indice-glisse indice-droite' }, icone('su'), t('Je savais')),
      el('div', { className: 'indice-glisse indice-gauche' }, t('À revoir'), icone('revoir')),
      el('div', { className: 'mini-carte mienne carte-glisse-demo' }, traits(85, 60))),
    doigt(),
  ], [['glisser-droite', 'su'], ['glisser-gauche', 'revoir']]);
}

// Fiches avec boutons : voir, écouter, puis s'évaluer. Les boutons ont le style choisi dans les Réglages.
function sceneBoutons(avecLabels) {
  const bouton = (nomIcone, classe, label) => el('span', { className: `${classe} bouton-icone${avecLabels ? ' avec-label' : ''}` },
    icone(nomIcone), avecLabels && el('span', { className: 'label' }, label));
  const lecture = el('span', { className: `btn-ghost bouton-icone${avecLabels ? ' avec-label' : ''}` },
    pileLecture(), avecLabels && el('span', { className: 'label' }, t('Écouter')));
  return scene('demo-boutons', [
    miniCarteCachee('carte-boutons'),
    el('div', { className: 'boutons boutons-quatre mini-barre' },
      bouton('voir', 'btn-ghost', t('Voir')), lecture,
      bouton('su', 'btn', t('Je savais')), bouton('revoir', 'btn btn--muted', t('À revoir'))),
    doigt(),
  ]);
}

// Filage : l'app lit les répliques des autres, s'arrête sur la tienne, et attend Suivant.
function sceneFilage() {
  return scene('demo-filage', [
    el('div', { className: 'mini-journal' },
      miniCarte('filage-1', '1', [85]), miniCarte('filage-2', '2', [70]), miniCarteCachee('filage-3')),
    el('div', { className: 'mini-commandes' },
      el('span', { className: 'btn-ghost' }, t('Pause')), el('span', { className: 'btn bouton-suivant-demo' }, t('Suivant'))),
    doigt(),
  ]);
}

export function afficherModeEmploi(racine) {
  const { navigation } = lireReglages();
  const fiches = navigation === 'gestes'
    ? [sceneToucherCarte(), sceneGlisser(), sceneLecture()]
    : [sceneBoutons(navigation === 'icones-labels'), sceneLecture()];

  remplacer(racine,
    creerTitreVue(t("Mode d'emploi")),
    section('script', t('Script'), sceneScript()),
    section('repliques', t('Mes répliques'), sceneChoix(), scenePincer()),
    section('fiches', t('Fiches'), ...fiches),
    section('filage', t('Filage'), sceneFilage()));
  cascade(racine);
}
