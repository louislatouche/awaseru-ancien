// Petits outils pour fabriquer la page.

// append() et replaceChildren() natifs n'acceptent pas les listes, et écriraient « false » en toutes
// lettres. On aplatit donc d'abord, ce qui permet d'écrire : condition && el(...) ou liste.map(...).
const nettoyerEnfants = (enfants) => enfants.flat(Infinity).filter((e) => e !== null && e !== undefined && e !== false);

// el('button', { className: 'btn', onclick: f }, 'Voir') crée <button class="btn">Voir</button>.
//
// Pourquoi ne pas écrire innerHTML = '<button>...' ? Parce que innerHTML interprète son contenu
// comme du code HTML. Une pièce importée qui contiendrait <img onerror=...> exécuterait du code.
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
};

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
  svg.append(trace);
  return svg;
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
