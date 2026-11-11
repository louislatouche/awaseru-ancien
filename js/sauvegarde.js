// Copier ses données dans un fichier, et les récupérer depuis ce fichier.
// Les données de l'app n'existent que dans ce navigateur : ce fichier est leur seule copie de secours.

import { t } from './langues.js';
import { toutesLesDonnees } from './stockage.js';
import { validerPiece } from './validation.js';

const TYPE = 'awaseru-sauvegarde';
// Les sauvegardes faites quand l'app s'appelait encore Replik restent lisibles : leur contenu est le même.
const TYPES_LISIBLES = [TYPE, 'replik-sauvegarde'];
// Les versions du format, et ce qui a changé dans les coches des mots :
//   2 (version 101 de l'app) : communes à toutes les pièces (clé « vocabulaire »), au lieu d'être
//     rangées pièce par pièce (« vocabulaire:<id> ») ;
//   3 (version 102) : chaque mot garde aussi son palier et son jour de retour (répétition espacée).
// Une sauvegarde plus ancienne se lit toujours : stockage.js remet ses mots au format d'aujourd'hui
// après la restauration. Une app pas encore à jour, elle, refuse une sauvegarde plus récente
// qu'elle et demande de se mettre à jour.
const VERSION_DU_FORMAT = 3;

const estObjet = (valeur) => typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
const statutValide = (statut) => statut === 'su' || statut === 'a_revoir';
// Un mot à revoir : { statut: 'a_revoir' }. Un mot su : son palier (0 à 4) et son jour de retour.
const motValide = (etat) => estObjet(etat) && (etat.statut === 'a_revoir'
  || (etat.statut === 'su' && [0, 1, 2, 3, 4].includes(etat.palier) && /^\d{4}-\d{2}-\d{2}$/.test(etat.revient)));

// Fait le fichier de sauvegarde et le confie au téléphone. Renvoie ce qui s'est passé :
// 'partagee' (le menu de partage l'a envoyé où tu as choisi), 'annulee' (tu as refermé ce menu),
// ou 'telechargee' (enregistré dans les téléchargements, là où le partage n'existe pas).
export async function telechargerSauvegarde() {
  const maintenant = new Date();
  const contenu = JSON.stringify({ type: TYPE, version: VERSION_DU_FORMAT, date: maintenant.toISOString(), donnees: toutesLesDonnees() });
  // sv-SE écrit les dates en AAAA-MM-JJ, à l'heure du téléphone. toISOString donnerait l'heure de
  // Londres : juste après minuit, le fichier porterait encore la date de la veille.
  const nom = `awaseru-sauvegarde-${maintenant.toLocaleDateString('sv-SE')}`;

  // D'abord le menu de partage du téléphone (demandé par Louis le 2026-11-11), pour envoyer le
  // fichier où l'on veut : Drive, un e-mail, une messagerie... Chrome sur Android (et Brave, qui en
  // est tiré) ne laisse partager que certains types de fichiers : le texte oui, le JSON non (liste
  // « Shareable file types » de MDN, lue le 2026-11-11). La sauvegarde part donc en .txt, avec
  // exactement le même contenu ; la restauration accepte les deux. canShare dit si le téléphone
  // accepte ce fichier : sinon, on le télécharge, comme avant.
  const fichier = new File([contenu], `${nom}.txt`, { type: 'text/plain' });
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: t('Sauvegarde Awaseru') });
      return 'partagee';
    } catch (erreur) {
      if (erreur.name === 'AbortError') return 'annulee'; // le menu de partage a été refermé
      // Une autre erreur (le partage a été refusé) : on se rabat sur le téléchargement.
    }
  }

  // Un « blob » est un fichier qui n'existe qu'en mémoire. Un lien avec l'attribut download
  // demande au navigateur de l'enregistrer plutôt que de l'ouvrir.
  const adresse = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = adresse;
  lien.download = `${nom}.json`;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(adresse), 30000); // le temps que le téléchargement démarre
  return 'telechargee';
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
  // « vocabulaire » : les mots, communs à toutes les pièces. Chacun est { statut, palier, revient }
  // (voir stockage.js), ou simplement 'su' ou 'a_revoir' dans une sauvegarde en version 2.
  if (cle === 'vocabulaire') {
    const valide = estObjet(valeur) && Object.values(valeur).every((etat) => statutValide(etat) || motValide(etat));
    return valide ? null : t('une progression est illisible.');
  }
  // « vocabulaire:<id> » : les mots d'une sauvegarde en version 1, rangés pièce par pièce.
  if (cle.startsWith('progression:') || cle.startsWith('vocabulaire:')) {
    const valide = estObjet(valeur) && Object.values(valeur).every(statutValide);
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
    throw new Error(t("ce fichier n'est pas une sauvegarde d'Awaseru."));
  }
  if (!estObjet(contenu) || !TYPES_LISIBLES.includes(contenu.type) || !estObjet(contenu.donnees)) {
    throw new Error(t("ce fichier n'est pas une sauvegarde d'Awaseru."));
  }
  if (contenu.version > VERSION_DU_FORMAT) {
    throw new Error(t("cette sauvegarde vient d'une version plus récente d'Awaseru. Mets l'app à jour."));
  }
  for (const [cle, valeur] of Object.entries(contenu.donnees)) {
    const erreur = erreurDansDonnee(cle, valeur);
    if (erreur) throw new Error(t('cette sauvegarde est abîmée : {erreur}', { erreur }));
  }
  return contenu;
}
