// Vérifie qu'un fichier de pièce est bien formé AVANT de l'accepter.
// Mieux vaut un message clair au chargement qu'un plantage plus tard au milieu d'une répétition.

import { erreurDeBalisage } from './texte.js';

const FORMAT_CONNU = 1;

const estObjet = (valeur) => typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
const estTexteRempli = (valeur) => typeof valeur === 'string' && valeur.trim() !== '';

// Un lien en "javascript:..." exécuterait du code au toucher. On n'accepte que le web normal.
function estLienWeb(valeur) {
  try {
    return ['http:', 'https:'].includes(new URL(valeur).protocol);
  } catch {
    return false; // new URL() lève une erreur si ce n'est pas une adresse
  }
}

// Renvoie la liste des problèmes trouvés : une liste vide veut dire que la pièce est valide.
export function validerPiece(piece) {
  if (!estObjet(piece)) return ['le fichier ne contient pas une pièce (il faudrait un objet JSON { ... }).'];

  const erreurs = [];

  const exigerJaponais = (valeur, lieu) => {
    if (!estTexteRempli(valeur)) {
      erreurs.push(`${lieu} : texte manquant.`);
      return;
    }
    const probleme = erreurDeBalisage(valeur);
    if (probleme) erreurs.push(`${lieu} : ${probleme}.`);
  };

  const exigerFrancais = (valeur, lieu) => {
    if (!estTexteRempli(valeur)) erreurs.push(`${lieu} : texte manquant.`);
  };

  if (piece.format !== undefined && piece.format !== FORMAT_CONNU) {
    erreurs.push(`format ${piece.format} inconnu (Awaseru connaît le format ${FORMAT_CONNU}).`);
  }
  if (piece.id !== undefined && !estTexteRempli(piece.id)) erreurs.push('« id » doit être un texte non vide.');

  exigerJaponais(piece.titre, '« titre »');
  exigerFrancais(piece.titre_fr, '« titre_fr »');
  if (typeof piece.explication !== 'string') erreurs.push('« explication » doit être un texte.');

  // Les rôles. Un Set est une collection sans doublon, très rapide pour « est-ce que ça existe ? ».
  const idsRoles = new Set();
  if (!Array.isArray(piece.roles)) {
    erreurs.push('« roles » doit être une liste.');
  } else {
    piece.roles.forEach((role, position) => {
      const lieu = `rôle n° ${position + 1}`;
      if (!estObjet(role)) { erreurs.push(`${lieu} : ce n'est pas un objet.`); return; }
      if (!estTexteRempli(role.id)) erreurs.push(`${lieu} : « id » manquant.`);
      else if (idsRoles.has(role.id)) erreurs.push(`${lieu} : l'id « ${role.id} » est utilisé deux fois.`);
      else idsRoles.add(role.id);
      exigerJaponais(role.nom, `${lieu}, « nom »`);
      exigerFrancais(role.nom_fr, `${lieu}, « nom_fr »`);
      if (role.nom_court !== undefined) exigerJaponais(role.nom_court, `${lieu}, « nom_court »`);
      if (role.note !== undefined && typeof role.note !== 'string') erreurs.push(`${lieu} : « note » doit être un texte.`);
      if (role.lien !== undefined && !estLienWeb(role.lien)) erreurs.push(`${lieu} : « lien » n'est pas une adresse http ou https.`);
    });
  }

  // Le vocabulaire (facultatif) : les mots de la pièce, chacun avec un id court, le mot en japonais
  // (furigana compris) et sa traduction. Les répliques y renvoient par cet id (voir « mots » plus bas).
  // « particule »: true (facultatif) range le mot avec les particules (に, を, は...), que la liste
  // du Vocabulaire ne montre pas et ne fait pas réviser.
  const idsMots = new Set();
  if (piece.vocabulaire !== undefined) {
    if (!Array.isArray(piece.vocabulaire)) {
      erreurs.push('« vocabulaire » doit être une liste.');
    } else {
      piece.vocabulaire.forEach((mot, position) => {
        const lieu = `vocabulaire, mot n° ${position + 1}`;
        if (!estObjet(mot)) { erreurs.push(`${lieu} : ce n'est pas un objet.`); return; }
        if (!estTexteRempli(mot.id)) erreurs.push(`${lieu} : « id » manquant.`);
        else if (idsMots.has(mot.id)) erreurs.push(`${lieu} : l'id « ${mot.id} » est utilisé deux fois.`);
        else idsMots.add(mot.id);
        exigerJaponais(mot.mot, `${lieu}, « mot »`);
        exigerFrancais(mot.fr, `${lieu}, « fr »`);
        if (mot.en !== undefined && typeof mot.en !== 'string') erreurs.push(`${lieu} : « en » doit être un texte.`);
        if (mot.particule !== undefined && typeof mot.particule !== 'boolean') erreurs.push(`${lieu} : « particule » doit valoir true ou false.`);
      });
    }
  }

  // Le mot à mot d'une réplique (facultatif) : une liste de morceaux { t, v, fr, en }. Mis bout à
  // bout, les « t » redonnent exactement le texte de la réplique. « v » renvoie au vocabulaire ;
  // « fr » et « en » traduisent le mot tel qu'il est employé ici (sinon on prend celle du vocabulaire).
  const verifierMots = (replique, lieu) => {
    if (!Array.isArray(replique.mots)) { erreurs.push(`${lieu} : « mots » doit être une liste.`); return; }
    if (!replique.mots.every((morceau) => estObjet(morceau) && typeof morceau.t === 'string')) {
      erreurs.push(`${lieu} : chaque morceau de « mots » doit avoir un texte « t ».`);
      return;
    }
    if (replique.mots.map((morceau) => morceau.t).join('') !== replique.texte) {
      erreurs.push(`${lieu} : les « mots » mis bout à bout ne redonnent pas le texte de la réplique.`);
    }
    for (const morceau of replique.mots) {
      if (morceau.v !== undefined && !idsMots.has(morceau.v)) erreurs.push(`${lieu} : le mot « ${morceau.v} » n'existe pas dans « vocabulaire ».`);
    }
  };

  // Les scènes et leurs répliques. Les numéros servent de clé pour la progression et la sélection,
  // ils doivent donc être uniques dans TOUTE la pièce, pas seulement dans une scène.
  const numeros = new Set();
  if (!Array.isArray(piece.scenes) || piece.scenes.length === 0) {
    erreurs.push('« scenes » doit être une liste non vide.');
  } else {
    piece.scenes.forEach((scene, position) => {
      const lieuScene = `scène n° ${position + 1}`;
      if (!estObjet(scene)) { erreurs.push(`${lieuScene} : ce n'est pas un objet.`); return; }
      if (typeof scene.numero !== 'number') erreurs.push(`${lieuScene} : « numero » manquant.`);
      exigerJaponais(scene.titre, `${lieuScene}, « titre »`);
      exigerFrancais(scene.titre_fr, `${lieuScene}, « titre_fr »`);
      if (!Array.isArray(scene.repliques)) { erreurs.push(`${lieuScene} : « repliques » doit être une liste.`); return; }

      scene.repliques.forEach((replique, rang) => {
        const lieu = `${lieuScene}, réplique ${estObjet(replique) && replique.numero !== undefined ? replique.numero : `à la position ${rang + 1}`}`;
        if (!estObjet(replique)) { erreurs.push(`${lieu} : ce n'est pas un objet.`); return; }
        if (!Number.isInteger(replique.numero)) erreurs.push(`${lieu} : « numero » doit être un nombre entier.`);
        else if (numeros.has(replique.numero)) erreurs.push(`${lieu} : ce numéro est utilisé deux fois.`);
        else numeros.add(replique.numero);
        // null est permis (réplique sans rôle), mais la clé doit exister et l'id être connu.
        if (replique.role !== null && !idsRoles.has(replique.role)) erreurs.push(`${lieu} : le rôle « ${replique.role} » n'existe pas dans « roles ».`);
        exigerJaponais(replique.texte, `${lieu}, « texte »`);
        if (typeof replique.fr !== 'string') erreurs.push(`${lieu} : « fr » doit être un texte.`);
        if (replique.mots !== undefined) verifierMots(replique, lieu);
      });
    });
    if (numeros.size === 0) erreurs.push('la pièce ne contient aucune réplique.');
  }

  if (piece.audio !== undefined && !(estObjet(piece.audio) && typeof piece.audio.credit === 'string')) {
    erreurs.push('« audio » doit être un objet avec un texte « credit ».');
  }

  return erreurs;
}
