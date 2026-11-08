// Le service worker : un petit script qui se place entre l'app et le réseau, et qui continue
// d'exister quand la page est fermée. Il garde une copie de tous les fichiers de l'app et les
// sert depuis cette copie (« cache-first »). C'est ce qui permet de fonctionner hors ligne.

// >>> À AUGMENTER à chaque modification de l'app, y compris pour une nouvelle pièce. <<<
// Le navigateur ne détecte une mise à jour que si ce fichier-ci change d'au moins un octet.
// Sans cela, le téléphone continuerait de servir l'ancienne copie, indéfiniment.
const VERSION = 68;

// Sur GitHub Pages, tous tes projets partagent le même site, donc le même espace de caches.
// Le préfixe nous permet de ne jamais toucher à ceux des autres.
const PREFIXE = 'awaseru-v';
const CACHE = `${PREFIXE}${VERSION}`;

// Tous les fichiers de l'app. Les chemins sont relatifs à l'emplacement de sw.js.
const FICHIERS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/polices.css',
  'css/style.css',
  'design-kit/tokens.css',
  'design-kit/base.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/affichage.js',
  'js/app.js',
  'js/dom.js',
  'js/gestes.js',
  'js/langues.js',
  'js/langues/en.js',
  'js/langues/de.js',
  'js/langues/es.js',
  'js/langues/it.js',
  'js/langues/pt.js',
  'js/langues/nl.js',
  'js/langues/pl.js',
  'js/langues/sv.js',
  'js/langues/da.js',
  'js/langues/no.js',
  'js/langues/fi.js',
  'js/langues/cs.js',
  'js/langues/hu.js',
  'js/langues/ro.js',
  'js/langues/el.js',
  'js/langues/uk.js',
  'js/langues/ru.js',
  'js/langues/ja.js',
  'js/langues/ko.js',
  'js/modale.js',
  'js/pieces.js',
  'js/pincement.js',
  'js/reprise.js',
  'js/sauvegarde.js',
  'js/stockage.js',
  'js/telechargement.js',
  'js/texte.js',
  'js/validation.js',
  'js/version.js',
  'js/voix.js',
  'js/ecrans/bibliotheque.js',
  'js/ecrans/fiches.js',
  'js/ecrans/filage.js',
  'js/ecrans/mes-repliques.js',
  'js/ecrans/reglages.js',
  'js/ecrans/script.js',
  'js/ecrans/vocabulaire.js',
  'pieces/index.json',
  'polices/fraunces.woff2',
  'polices/karla.woff2',
  'polices/poppins-bold.ttf',
];

// cache: 'reload' force à prendre le fichier sur le serveur. Sans cela, on pourrait mettre en
// cache une ancienne version encore gardée par le navigateur (GitHub Pages autorise 10 minutes).
const requeteFraiche = (url) => new Request(url, { cache: 'reload' });

// Installation : on copie tout. Si un seul fichier manque, addAll échoue et l'installation est
// annulée : l'ancienne version reste en place, plutôt qu'une version à moitié copiée.
self.addEventListener('install', (evenement) => {
  evenement.waitUntil((async () => {
    // La liste des pièces est lue dans pieces/index.json : pas besoin de la tenir à jour ici.
    const reponse = await fetch(requeteFraiche('pieces/index.json'));
    const pieces = await reponse.json();
    // De même pour l'audio : outils/generer-audio.mjs tient à jour cette liste de fichiers.
    const reponseAudio = await fetch(requeteFraiche('pieces/audio/index.json'));
    const audio = await reponseAudio.json();
    // Sauf les voix des pièces retirées de ce téléphone : une mise à jour ne doit pas les ramener
    // (voir js/telechargement.js). Un chemin s'écrit pieces/audio/<id de la pièce>/<fichier>.
    const notees = await (await caches.open('awaseru-retirees')).match('retirees.json');
    const retirees = new Set(notees ? await notees.json() : []);

    const cache = await caches.open(CACHE);
    await cache.addAll([
      ...FICHIERS,
      'pieces/audio/index.json',
      ...pieces.map((fichier) => `pieces/${fichier}`),
      ...audio.filter((chemin) => !retirees.has(decodeURIComponent(chemin.split('/')[2]))),
    ].map(requeteFraiche));

    // On prend la place de l'ancienne version sans attendre que toutes les pages soient fermées.
    // C'est sans risque ici : la page charge tout son code au démarrage, elle ne redemandera pas
    // d'ancien fichier. Elle affichera un bandeau pour proposer de recharger (voir app.js).
    await self.skipWaiting();
  })());
});

// Activation : on supprime les anciennes copies d'Awaseru, et seulement celles-là. Ainsi que tout
// ce qui reste du temps où l'app s'appelait Replik (caches « replik-… ») : l'adresse /replik/
// n'existe plus, ces copies ne serviraient plus à rien.
self.addEventListener('activate', (evenement) => {
  evenement.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms
      .filter((nom) => (nom.startsWith(PREFIXE) && nom !== CACHE) || nom.startsWith('replik-'))
      .map((nom) => caches.delete(nom)));
    // Prend tout de suite le contrôle de la page déjà ouverte lors de la toute première visite.
    await self.clients.claim();
  })());
});

// Chaque requête passe par ici : d'abord la copie locale, sinon le réseau.
self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  // On ne s'occupe que des lectures de nos propres fichiers.
  if (requete.method !== 'GET' || new URL(requete.url).origin !== self.location.origin) return;

  evenement.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const copie = await cache.match(requete);
    if (copie) return copie;
    // Une ouverture de page inconnue (adresse avec des paramètres...) mène à l'app elle-même.
    if (requete.mode === 'navigate') {
      const accueil = await cache.match('index.html');
      if (accueil) return accueil;
    }
    return fetch(requete);
  })());
});
