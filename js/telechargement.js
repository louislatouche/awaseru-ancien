// Retirer une pièce du téléphone, puis la retélécharger. Rien ne change sur le site.
//
// Les voix pèsent presque tout : 1,9 Mo pour Hanasaka Jiisan, contre 15 Ko de texte. Retirer une
// pièce efface donc ses voix de la copie locale et garde son texte, qui permet d'afficher son nom
// dans la liste même sans réseau. Tes répliques choisies et ta progression ne bougent pas.
//
// La liste des pièces retirées est dans un cache, pas dans localStorage : le service worker doit
// la lire à chaque mise à jour pour ne pas les réinstaller, et il n'a pas accès à localStorage.

const CACHE_RETIREES = 'replik-retirees'; // ne commence pas par « replik-v » : une mise à jour le garde
const FICHIER_RETIREES = 'retirees.json';

// Le cache n'existe qu'en HTTPS ou sur localhost. Ailleurs, rien n'est gardé : rien à retirer.
export const peutRetirer = 'caches' in window;

export async function piecesRetirees() {
  if (!peutRetirer) return new Set();
  const cache = await caches.open(CACHE_RETIREES);
  const reponse = await cache.match(FICHIER_RETIREES);
  return new Set(reponse ? await reponse.json() : []);
}

async function enregistrerRetirees(retirees) {
  const cache = await caches.open(CACHE_RETIREES);
  await cache.put(FICHIER_RETIREES, new Response(JSON.stringify([...retirees])));
}

// Les copies de l'app : une seule d'habitude, deux le temps d'une mise à jour.
async function copiesDeLApp() {
  const noms = await caches.keys();
  return Promise.all(noms.filter((nom) => nom.startsWith('replik-v')).map((nom) => caches.open(nom)));
}

export async function retirerPiece(id) {
  // On note d'abord : même interrompu ici, une mise à jour ne réinstallera pas les voix.
  const retirees = await piecesRetirees();
  retirees.add(id);
  await enregistrerRetirees(retirees);

  const dossier = `/pieces/audio/${encodeURIComponent(id)}/`;
  for (const copie of await copiesDeLApp()) {
    const requetes = await copie.keys();
    await Promise.all(requetes
      .filter((requete) => new URL(requete.url).pathname.includes(dossier))
      .map((requete) => copie.delete(requete)));
  }
}

// surAvancement(fait, total) est appelée après chaque fichier, pour afficher où on en est.
// Si le réseau lâche, une erreur remonte et la pièce reste notée comme retirée.
export async function retelechargerPiece(id, surAvancement) {
  const reponseListe = await fetch('pieces/audio/index.json');
  if (!reponseListe.ok) throw new Error('liste des voix introuvable.');
  const liste = await reponseListe.json();
  const fichiers = liste.filter((chemin) => chemin.startsWith(`pieces/audio/${encodeURIComponent(id)}/`));

  const copies = await copiesDeLApp();
  let fait = 0;
  for (const fichier of fichiers) {
    // cache: 'reload' : le fichier du serveur, pas une version gardée par le navigateur.
    const reponse = await fetch(new Request(fichier, { cache: 'reload' }));
    if (!reponse.ok) throw new Error(`${fichier} introuvable.`);
    // Une réponse ne se lit qu'une fois : clone() en fait une par copie.
    await Promise.all(copies.map((copie) => copie.put(fichier, reponse.clone())));
    fait += 1;
    surAvancement(fait, fichiers.length);
  }

  // Seulement maintenant : tout est là.
  const retirees = await piecesRetirees();
  retirees.delete(id);
  await enregistrerRetirees(retirees);
}
