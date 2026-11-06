// Copier ses données dans un fichier, et les récupérer depuis ce fichier.
// Les données de l'app n'existent que dans ce navigateur : ce fichier est leur seule copie de secours.

import { t } from './langues.js';
import { toutesLesDonnees } from './stockage.js';
import { validerPiece } from './validation.js';

const TYPE = 'replik-sauvegarde';
const VERSION_DU_FORMAT = 1;

const estObjet = (valeur) => typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);

export function telechargerSauvegarde() {
  const maintenant = new Date();
  const contenu = { type: TYPE, version: VERSION_DU_FORMAT, date: maintenant.toISOString(), donnees: toutesLesDonnees() };

  // Un « blob » est un fichier qui n'existe qu'en mémoire. Un lien avec l'attribut download
  // demande au navigateur de l'enregistrer plutôt que de l'ouvrir.
  const adresse = URL.createObjectURL(new Blob([JSON.stringify(contenu)], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = adresse;
  // sv-SE écrit les dates en AAAA-MM-JJ, à l'heure du téléphone. toISOString donnerait l'heure de
  // Londres : juste après minuit, le fichier porterait encore la date de la veille.
  lien.download = `replik-sauvegarde-${maintenant.toLocaleDateString('sv-SE')}.json`;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(adresse), 30000); // le temps que le téléchargement démarre
}

// Vérifie chaque donnée : ce fichier vient de l'extérieur et va remplacer tout ce qui est enregistré.
function erreurDansDonnee(cle, valeur) {
  if (cle === 'reglages') return estObjet(valeur) ? null : t('les réglages sont illisibles.');
  if (cle === 'importees') {
    const valide = Array.isArray(valeur) && valeur.every((p) => typeof p?.id === 'string' && validerPiece(p).length === 0);
    return valide ? null : t('une pièce enregistrée est illisible.');
  }
  if (cle.startsWith('selection:')) {
    return Array.isArray(valeur) && valeur.every(Number.isInteger) ? null : t('une sélection de répliques est illisible.');
  }
  if (cle.startsWith('progression:')) {
    const valide = estObjet(valeur) && Object.values(valeur).every((statut) => statut === 'su' || statut === 'a_revoir');
    return valide ? null : t('une progression est illisible.');
  }
  if (cle.startsWith('utilisation:')) {
    return Number.isFinite(valeur) ? null : t("une date d'utilisation est illisible.");
  }
  return t('donnée inconnue ({cle}).', { cle });
}

// Lit un fichier de sauvegarde. Lève une erreur au message lisible s'il ne convient pas.
export async function lireSauvegarde(fichier) {
  let contenu;
  try {
    contenu = JSON.parse(await fichier.text());
  } catch {
    throw new Error(t("ce fichier n'est pas une sauvegarde de Replik."));
  }
  if (!estObjet(contenu) || contenu.type !== TYPE || !estObjet(contenu.donnees)) {
    throw new Error(t("ce fichier n'est pas une sauvegarde de Replik."));
  }
  if (contenu.version > VERSION_DU_FORMAT) {
    throw new Error(t("cette sauvegarde vient d'une version plus récente de Replik. Mets l'app à jour."));
  }
  for (const [cle, valeur] of Object.entries(contenu.donnees)) {
    const erreur = erreurDansDonnee(cle, valeur);
    if (erreur) throw new Error(t('cette sauvegarde est abîmée : {erreur}', { erreur }));
  }
  return contenu;
}
