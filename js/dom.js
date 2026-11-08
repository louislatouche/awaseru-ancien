// Petits outils pour fabriquer la page.

// append() et replaceChildren() natifs n'acceptent pas les listes, et écriraient « false » en toutes
// lettres. On aplatit donc d'abord, ce qui permet d'écrire : condition && el(...) ou liste.map(...).
const nettoyerEnfants = (enfants) => enfants.flat(Infinity).filter((e) => e !== null && e !== undefined && e !== false);

// el('button', { className: 'btn', onclick: f }, 'Voir') crée <button class="btn">Voir</button>.
//
// Pourquoi ne pas écrire innerHTML = '<button>...' ? Parce que innerHTML interprète son contenu
// comme du code HTML. Un fichier de pièce qui contiendrait <img onerror=...> exécuterait du code.
// Ici, append() traite les chaînes comme du simple texte : une balise s'afficherait telle quelle.
export function el(balise, proprietes = {}, ...enfants) {
  const element = document.createElement(balise);

  for (const [nom, valeur] of Object.entries(proprietes)) {
    // Si l'élément connaît cette propriété (className, onclick, checked...), on la règle directement.
    // Sinon (aria-label, data-...), on passe par un attribut HTML.
    if (nom in element) element[nom] = valeur;
    else element.setAttribute(nom, valeur);
  }

  element.append(...nettoyerEnfants(enfants));
  return element;
}

// Remplace tout le contenu d'un élément.
export function remplacer(parent, ...enfants) {
  parent.replaceChildren(...nettoyerEnfants(enfants));
}

// Les icônes, dessinées en traits sur une grille de 24 sur 24, comme celles de Faktur.
const ICONES = {
  retour: 'M15 5l-7 7 7 7',
  reglages: 'M4 7h9M19 7h1M4 17h1M11 17h9M13 5h6v4h-6zM5 15h6v4H5z',
  script: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  repliques: 'M4 5h16v11H9l-5 4zM9 10.5l2 2 4-4',
  fiches: 'M8 8h12v12H8zM4 16V4h12',
  filage: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8.5v7l6-3.5z',
  chevron: 'M6 9l6 6 6-6',
  // Les boutons de répétition (fiches et filage).
  voir: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
  lecture: 'M7.5 4.8v14.4L19 12z',
  pause: 'M7 5.5h3v13H7zM14 5.5h3v13h-3z',
  su: 'M5 12.5l4.5 4.5L19 7.5',
  revoir: 'M12 4A8 8 0 1 1 4.48 9.26M12 4l2.6-2.6M12 4l2.6 2.6',
  stop: 'M6.5 6.5h11v11h-11z',
  // Les gestes, pour le mode d'emploi : toucher, garder le doigt, glisser, pincer.
  toucher: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2',
  maintenir: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  'glisser-droite': 'M4 12h15M13 6l6 6-6 6',
  'glisser-gauche': 'M20 12H5M11 6l-6 6 6 6',
  pincer: 'M3 3l7 7M10 5v5H5M21 21l-7-7M14 19v-5h5',
  grille: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  suite: 'M5 12h12M13 8l4 4-4 4', // la flèche entre un geste et son effet
};

// Lecture, pause et stop sont remplis : à petite taille, on les reconnaît mieux que de simples contours.
const ICONES_PLEINES = new Set(['lecture', 'pause', 'stop']);

// Un dessin SVG n'est pas du HTML ordinaire : createElement ne suffit pas, il faut indiquer
// son « espace de noms », sinon le navigateur crée un élément qu'il ne sait pas dessiner.
const ESPACE_SVG = 'http://www.w3.org/2000/svg';

export function icone(nom) {
  const svg = document.createElementNS(ESPACE_SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); // le trait prend la couleur du texte autour
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true'); // décoratif : le libellé à côté dit déjà tout
  const trace = document.createElementNS(ESPACE_SVG, 'path');
  trace.setAttribute('d', ICONES[nom]);
  if (ICONES_PLEINES.has(nom)) trace.setAttribute('fill', 'currentColor');
  svg.append(trace);
  return svg;
}

// Le décollement des tuiles, repris de SessionConnect (Motion.kt) : une carte commence à plat sur
// le fond, sans ombre, puis monte de 7 pixels pendant que son ombre apparaît. C'est leur
// simultanéité qui fait lire un décollement plutôt qu'un glissement vers le haut.
//
// Seules les tuiles à l'écran jouent la vague, comme dans SessionConnect. Les autres sont déjà
// levées : aucune animation à chaque coup de pouce, et rien à calculer pour ce qu'on ne voit pas.
// À appeler une fois, quand l'écran vient de se construire.
// parRangee : combien de tuiles partent ensemble (les boutons d'une même ligne de la grille).
const TUILES = '.card, .replique, .coche-replique, .bouton-numero, .btn, .btn-ghost, .chip, .ligne-menu';

export function cascade(conteneur, parRangee = 1) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Juste avant le prochain affichage : l'écran est alors dans la page, on peut mesurer ce qui
  // est visible, et personne n'a encore vu les tuiles dans leur position finale.
  requestAnimationFrame(() => {
    const tuiles = [...conteneur.querySelectorAll(TUILES)].filter((tuile) => {
      if (tuile.parentElement.closest(TUILES)) return false; // une tuile dans une tuile suit sa carte
      const cadre = tuile.getBoundingClientRect();
      return cadre.height > 0 && cadre.top < window.innerHeight && cadre.bottom > 0;
    });

    tuiles.forEach((tuile, rang) => {
      tuile.style.setProperty('--rang', Math.min(Math.floor(rang / parRangee), 8));
      tuile.classList.add('cascade');
      // Retirer la classe à la fin évite de figer quoi que ce soit. Le test sur target ignore
      // les animations des éléments intérieurs, dont l'événement remonte jusqu'ici.
      const fin = (evenement) => {
        if (evenement.target !== tuile) return;
        tuile.classList.remove('cascade');
        tuile.style.removeProperty('--rang');
        tuile.removeEventListener('animationend', fin);
      };
      tuile.addEventListener('animationend', fin);
    });
  });
}

// L'appui long : au bout d'une demi-seconde, maintenir() est appelée, et le « click » qui suit
// le lâcher du doigt est ignoré. Un toucher ordinaire appelle toucher().
// Pendant l'appui, l'élément porte la classe en-appui : il se remplit (voir style.css).
export function brancherAppuiLong(element, { toucher, maintenir }) {
  let minuterie = null;
  let appuiLong = false;
  let doigt = null; // le doigt qui appuie : son numéro et l'endroit où il s'est posé

  function relacher() {
    clearTimeout(minuterie);
    element.classList.remove('en-appui');
    document.removeEventListener('pointerdown', surAutreDoigt);
    doigt = null;
  }

  // Un second doigt posé n'importe où, c'est un pincement : pas un appui long.
  function surAutreDoigt(evenement) {
    if (doigt && evenement.pointerId !== doigt.numero) relacher();
  }

  element.addEventListener('pointerdown', (evenement) => {
    appuiLong = false;
    doigt = { numero: evenement.pointerId, x: evenement.clientX, y: evenement.clientY };
    element.classList.add('en-appui');
    document.addEventListener('pointerdown', surAutreDoigt);
    minuterie = setTimeout(() => {
      appuiLong = true;
      relacher();
      navigator.vibrate?.(20); // un petit retour sous le doigt, sur les téléphones qui vibrent
      maintenir();
    }, 550);
  });

  // Un doigt qui glisse de plus de 10 pixels fait défiler l'écran : ce n'est pas un appui long.
  element.addEventListener('pointermove', (evenement) => {
    if (doigt && Math.hypot(evenement.clientX - doigt.x, evenement.clientY - doigt.y) > 10) relacher();
  });
  // Doigt levé trop tôt, sorti de l'élément, ou geste repris par le navigateur.
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) element.addEventListener(type, relacher);
  element.addEventListener('contextmenu', (evenement) => evenement.preventDefault()); // pas de menu Android
  element.addEventListener('click', () => {
    if (appuiLong) appuiLong = false;
    else toucher();
  });
}

// Petit rebond à la sélection d'un élément. Rejouable, même sur le même élément.
export function rebond(element) {
  element.classList.remove('rebond');
  void element.offsetWidth; // force le navigateur à constater le retrait, sinon rien ne rejoue
  element.classList.add('rebond');
  element.addEventListener('animationend', () => element.classList.remove('rebond'), { once: true });
}

// La salve de Faktur, avec des fleurs à la place de ses pièces : le 花丸, la fleur que les
// professeurs japonais dessinent sur un bon travail. La disposition est désordonnée mais fixe :
// la « spirale d'or » répartit bien les fleurs, sans jamais les aligner.
const FLEURS = Array.from({ length: 20 }, (_, i) => ({
  gauche: (6 + 88 * ((0.5 + i * 0.61803) % 1)).toFixed(1),
  delai: (((i * 0.41421) % 1) * 0.5).toFixed(2),
  derive: Math.round(30 * Math.sin(i * 1.7)),
  montee: -(20 + Math.round(28 * ((i * 0.7548) % 1))),
  taille: (0.9 + ((i * 0.324) % 1) * 0.45).toFixed(2),
}));

export function salve() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const zone = el('div', { className: 'salve', 'aria-hidden': 'true' }, FLEURS.map((fleur) => {
    const element = el('span', { className: 'fleur', lang: 'ja' }, '花');
    element.style.left = `${fleur.gauche}%`;
    element.style.animationDelay = `${fleur.delai}s`;
    element.style.setProperty('--derive', `${fleur.derive}px`);
    element.style.setProperty('--montee', `${fleur.montee}px`);
    element.style.setProperty('--taille', fleur.taille);
    return element;
  }));
  document.body.append(zone);
  setTimeout(() => zone.remove(), 2200);
}

// Le compteur de Faktur : fait monter un nombre jusqu'à sa valeur, en ralentissant à la fin.
export function compter(cible, afficher) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    afficher(cible);
    return;
  }
  const depart = performance.now();
  const image = (maintenant) => {
    const avance = Math.min(1, (maintenant - depart) / 480);
    afficher(cible * (1 - (1 - avance) ** 3));
    if (avance < 1) requestAnimationFrame(image);
  };
  requestAnimationFrame(image);
}

// ---- La flèche de retour, en haut à gauche : elle remonte d'un niveau ----
// Un écran qui a des étapes (une série de fiches, un filage lancé, la grille des numéros) dit
// comment revenir à son propre début. Sans étape en cours, la flèche mène à l'écran du dessus
// (voir remonter dans app.js). Le routeur efface ce retour à chaque changement d'écran.
let retourDansEcran = null;

export function definirRetour(fonction) {
  retourDansEcran = fonction;
}

// Appelée par la flèche : vrai si l'écran a pu revenir à son début.
export function remonterDansEcran() {
  if (!retourDansEcran) return false;
  const revenir = retourDansEcran;
  retourDansEcran = null;
  revenir();
  return true;
}

// Remonte en haut de l'écran. La zone qui défile est <main>, pas la fenêtre (voir style.css).
export function hautDePage() {
  document.getElementById('ecran').scrollTop = 0;
}

let minuteurMessage = null;

// Affiche un message quelques secondes (le « toast » du design kit : la classe show le fait apparaître).
export function signaler(texte, duree = 5000) {
  const zone = document.getElementById('message');
  zone.textContent = texte;
  zone.classList.add('show');
  // Si un message était déjà affiché, on annule sa disparition programmée.
  clearTimeout(minuteurMessage);
  minuteurMessage = setTimeout(() => zone.classList.remove('show'), duree);
}
