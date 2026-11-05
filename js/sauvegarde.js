// Copier ses données dans un fichier, et les récupérer depuis ce fichier.
// Les données de l'app n'existent que dans ce navigateur : ce fichier est leur seule copie de secours.

import { toutesLesDonnees } from './stockage.js';
import { validerPiece } from './validation.js';

const TYPE = 'replik-sauvegarde';
const VERSION_DU_FORMAT = 1;

const estObjet = (valeur) => typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);

export function telechargerSauvegarde() {
  const maintenant = new Date().toISOString();
  const contenu = { type: TYPE, version: VERSION_DU_FORMAT, date: maintenant, donnees: toutesLesDonnees() };

  // Un « blob » est un fichier qui n'existe qu'en mémoire. Un lien avec l'attribut download
  // demande au navigateur de l'enregistrer plutôt que de l'ouvrir.
  const adresse = URL.createObjectURL(new Blob([JSON.stringify(contenu)], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = adresse;
  lien.download = `replik-sauvegarde-${maintenant.slice(0, 10)}.json`;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(adresse), 30000); // le temps que le téléchargement démarre
}

// Vérifie chaque donnée : ce fichier vient de l'extérieur et va remplacer tout ce qui est enregistré.
function erreurDansDonnee(cle, valeur) {
  if (cle === 'reglages') return estObjet(valeur) ? null : 'les réglages sont illisibles.';
  if (cle === 'importees') {
    const valide = Array.isArray(valeur) && valeur.every((p) => typeof p?.id === 'string' && validerPiece(p).length === 0);
    return valide ? null : 'une pièce enregistrée est illisible.';
  }
  if (cle.startsWith('selection:')) {
    return Array.isArray(valeur) && valeur.every(Number.isInteger) ? null : 'une sélection de répliques est illisible.';
  }
  if (cle.startsWith('progression:')) {
    const valide = estObjet(valeur) && Object.values(valeur).every((statut) => statut === 'su' || statut === 'a_revoir');
    return valide ? null : 'une progression est illisible.';
  }
  return `donnée inconnue (${cle}).`;
}

// Lit un fichier de sauvegarde. Lève une erreur au message lisible s'il ne convient pas.
export async function lireSauvegarde(fichier) {
  let contenu;
  try {
    contenu = JSON.parse(await fichier.text());
  } catch {
    throw new Error("ce fichier n'est pas une sauvegarde de Replik.");
  }
  if (!estObjet(contenu) || contenu.type !== TYPE || !estObjet(contenu.donnees)) {
    throw new Error("ce fichier n'est pas une sauvegarde de Replik.");
  }
  if (contenu.version > VERSION_DU_FORMAT) {
    throw new Error('cette sauvegarde vient d\'une version plus récente de Replik. Mets l\'app à jour.');
  }
  for (const [cle, valeur] of Object.entries(contenu.donnees)) {
    const erreur = erreurDansDonnee(cle, valeur);
    if (erreur) throw new Error(`cette sauvegarde est abîmée : ${erreur}`);
  }
  return contenu;
}
