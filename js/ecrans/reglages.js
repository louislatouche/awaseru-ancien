// Écran 6 : vitesse, voix, didascalies et remise à zéro de la progression.

import { cascade, el, remplacer, signaler } from '../dom.js';
import {
  appliquerAffichage, creerAvisVoix, creerBascule, creerChoixUnique, creerTitreVue, lireReplique,
} from '../affichage.js';
import { chargerLangue, langueActive, LANGUES, t, traduire } from '../langues.js';
import { confirmer, ouvrirFeuille } from '../modale.js';
import { lireSauvegarde, telechargerSauvegarde } from '../sauvegarde.js';
import { toutesLesPieces, trierParUtilisation } from '../pieces.js';
import { texteBrut } from '../texte.js';
import { changerReglage, effacerProgression, lireReglages, remplacerToutesLesDonnees } from '../stockage.js';
import { voixJaponaises, voixPretes } from '../voix.js';

const PHRASE_ESSAI = { texte: 'むかしむかし、あるところに、[優|やさ]しいおじいさんがいました。' };

// 0.9 devient « 0,90 » en français, « 0.90 » en anglais : deux décimales, au format de la langue.
const formaterVitesse = (valeur) => Number(valeur).toLocaleString(langueActive(), { minimumFractionDigits: 2 });

// La langue : une ligne qui ouvre la liste, pour ne pas étaler vingt choix dans les Réglages.
function creerLangue() {
  const actuelle = LANGUES.find(({ code }) => code === langueActive());
  return el('section', { className: 'card ligne-remise' },
    el('h2', { className: 'titre-section' }, t('Langue')),
    el('button', {
      type: 'button',
      className: 'btn-ghost btn-petit',
      onclick: () => {
        const fermer = ouvrirFeuille({
          titre: t('Langue'),
          corps: creerChoixUnique(LANGUES.map(({ code, nom }) => ({ valeur: code, libelle: nom })), actuelle.code, async (code) => {
            changerReglage('langue', code);
            await chargerLangue();
            appliquerAffichage();
            fermer();
            // Redessine tout l'écran dans la nouvelle langue : le routeur écoute cet événement.
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }),
          actions: (fermerFeuille) => el('button', { type: 'button', className: 'btn-ghost btn-petit', onclick: fermerFeuille }, t('Fermer')),
        });
      },
    }, actuelle.nom));
}

function creerVitesse() {
  const affichage = el('output', {}, formaterVitesse(lireReglages().vitesse));
  const curseur = el('input', {
    type: 'range',
    min: '0.5',
    max: '1.2',
    step: '0.05',
    value: String(lireReglages().vitesse),
    // « input » se déclenche pendant le glissement, « change » seulement au lâcher.
    oninput: () => {
      changerReglage('vitesse', Number(curseur.value));
      affichage.textContent = formaterVitesse(curseur.value);
    },
  });
  return el('label', { className: 'champ' },
    el('span', { className: 'eyebrow champ-ligne' }, t('Vitesse de lecture'), affichage),
    curseur);
}

function creerChoixVoix() {
  const zone = el('div');

  function remplir() {
    // La voix enregistrée peut avoir disparu du téléphone : on revient alors sur « Automatique ».
    const souhaitee = lireReglages().voix;
    const existe = voixJaponaises().some((voix) => voix.voiceURI === souhaitee);
    remplacer(zone, creerChoixUnique([
      { valeur: null, libelle: t('Automatique') },
      ...voixJaponaises().map((voix) => ({
        valeur: voix.voiceURI,
        libelle: voix.localService ? voix.name : t('{nom} (réseau)', { nom: voix.name }),
      })),
    ], existe ? souhaitee : null, (valeur) => changerReglage('voix', valeur)));
  }

  remplir();
  // La liste peut arriver après l'affichage de l'écran.
  voixPretes().then(remplir);
  return el('div', { className: 'pile' }, el('p', { className: 'eyebrow' }, t('Voix du téléphone')), zone);
}

function creerVoixEnregistrees() {
  return el('div', { className: 'pile' },
    el('p', { className: 'eyebrow' }, t('Voix des pièces')),
    el('p', { className: 'legende' }, t("Chaque pièce a une voix enregistrée par rôle. Sans elles, l'app utilise la voix du téléphone, choisie ci-dessous.")),
    el('div', { className: 'chips' },
      creerBascule(t('Utiliser les voix enregistrées'), lireReglages().voixEnregistrees, (actif) => {
        changerReglage('voixEnregistrees', actif);
      })));
}

function creerDidascalies() {
  return el('div', { className: 'chips' },
    creerBascule(t('Lire aussi les didascalies'), lireReglages().lireDidascalies, (actif) => {
      changerReglage('lireDidascalies', actif);
    }));
}

function creerRemiseAZero(piece) {
  return el('div', { className: 'ligne-remise' },
    el('span', { lang: 'ja' }, texteBrut(piece.titre)),
    el('button', {
      type: 'button',
      className: 'btn-ghost btn-petit',
      onclick: async () => {
        const accepte = await confirmer({
          titre: t('Remettre à zéro ?'),
          message: t('La progression de « {titre} » sera effacée. Tes répliques choisies sont conservées.', { titre: texteBrut(piece.titre) }),
          oui: t('Remettre à zéro'),
        });
        if (!accepte) return;
        effacerProgression(piece.id);
        signaler(t('Progression remise à zéro.'));
      },
    }, t('Remettre à zéro')));
}

function creerSauvegarde() {
  const zoneErreur = el('p', { className: 'avis avis-erreur', role: 'alert', hidden: true });

  async function restaurer(fichier) {
    zoneErreur.hidden = true;
    try {
      const sauvegarde = await lireSauvegarde(fichier);
      const jour = new Date(sauvegarde.date).toLocaleDateString(langueActive());
      const accepte = await confirmer({
        titre: t('Restaurer cette sauvegarde ?'),
        message: t('Sauvegarde du {jour}. Elle remplacera tes répliques choisies, ta progression et tes réglages sur ce téléphone.', { jour }),
        oui: t('Restaurer'),
      });
      if (!accepte) return;
      remplacerToutesLesDonnees(sauvegarde.donnees);
      await chargerLangue(); // la sauvegarde peut venir d'un téléphone réglé dans une autre langue
      appliquerAffichage();
      signaler(t('Sauvegarde restaurée.'));
      // Redessine l'écran avec les réglages restaurés : le routeur écoute cet événement.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (erreur) {
      // t(erreur.message) : pour les messages de stockage.js, écrits en français (voir ce fichier).
      zoneErreur.textContent = t('Restauration impossible : {erreur}', { erreur: t(erreur.message) });
      zoneErreur.hidden = false;
      zoneErreur.scrollIntoView({ block: 'center' });
    }
  }

  // accept : sans lui, le navigateur croit que tout convient et propose aussi l'appareil photo et
  // les images. Avec lui, seuls les fichiers JSON se choisissent, et une sauvegarde en est un.
  const champFichier = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async () => {
      const fichier = champFichier.files[0];
      if (fichier) await restaurer(fichier);
      // On vide le champ : sinon, rechoisir le même fichier ne déclencherait aucun événement.
      champFichier.value = '';
    },
  });

  // Chrome sait ouvrir directement le gestionnaire de fichiers, sans menu d'applications.
  // Brave n'a pas cette fonction par défaut : on passe alors par le champ ci-dessus.
  // startIn ne joue que sur ordinateur : sur Android, c'est le gestionnaire de fichiers qui décide
  // où il s'ouvre.
  async function choisirFichier() {
    if (!('showOpenFilePicker' in window)) {
      champFichier.click();
      return;
    }
    let poignees;
    try {
      poignees = await window.showOpenFilePicker({
        startIn: 'downloads',
        types: [{ description: t('Sauvegarde Replik'), accept: { 'application/json': ['.json'] } }],
      });
    } catch (erreur) {
      // AbortError : tu as simplement refermé le sélecteur. Sinon, on essaie l'autre voie.
      if (erreur.name !== 'AbortError') champFichier.click();
      return;
    }
    await restaurer(await poignees[0].getFile());
  }

  return el('section', { className: 'card pile' },
    el('h2', { className: 'titre-section' }, t('Sauvegarde')),
    el('p', { className: 'legende' }, t('Tes répliques choisies, ta progression et tes réglages restent sur ce téléphone. Garde-en une copie dans un fichier : elle te servira si tu changes de téléphone ou si tu vides les données de Chrome.')),
    el('div', { className: 'boutons' },
      el('button', {
        type: 'button',
        className: 'btn-ghost',
        onclick: () => {
          telechargerSauvegarde();
          signaler(t('Sauvegarde enregistrée dans tes téléchargements.'));
        },
      }, t('Sauvegarder')),
      el('button', { type: 'button', className: 'btn-ghost', onclick: choisirFichier }, t('Restaurer'))),
    zoneErreur,
    champFichier);
}

// Les voix enregistrées ont des auteurs : une entrée par pièce qui en utilise.
function creerCredits(pieces) {
  const avecVoix = pieces.filter((piece) => piece.audio);
  if (avecVoix.length === 0) return null;
  return el('section', { className: 'card pile' },
    el('h2', { className: 'titre-section' }, t('Crédits')),
    avecVoix.map((piece) => el('div', { className: 'credit' },
      el('span', { lang: 'ja' }, texteBrut(piece.titre)),
      el('p', { className: 'legende' }, traduire(piece.audio, 'credit')))));
}

export async function afficherReglages(racine) {
  const { fournies, importees } = await toutesLesPieces();

  const version = el('p', { className: 'version' });
  // Le numéro du cache est le numéro de version : pratique pour vérifier qu'une mise à jour est arrivée.
  if ('caches' in window) {
    caches.keys().then((noms) => {
      const cache = noms.find((nom) => nom.startsWith('replik-v'));
      if (cache) version.textContent = t('Replik, version {n}', { n: cache.replace('replik-v', '') });
    });
  }

  remplacer(racine,
    creerTitreVue(t('Réglages')),
    creerAvisVoix(),
    creerLangue(),
    el('section', { className: 'card pile' },
      el('h2', { className: 'titre-section' }, t('Lecture')),
      creerVitesse(),
      creerVoixEnregistrees(),
      creerChoixVoix(),
      el('button', { type: 'button', className: 'btn-ghost', onclick: () => lireReplique(PHRASE_ESSAI) }, t('Essayer la voix du téléphone')),
      creerDidascalies()),
    el('section', { className: 'card pile' },
      el('h2', { className: 'titre-section' }, t('Progression')),
      trierParUtilisation([...fournies, ...importees]).map(creerRemiseAZero)),
    creerSauvegarde(),
    creerCredits(trierParUtilisation([...fournies, ...importees])),
    version,
  );
  cascade(racine);
}
