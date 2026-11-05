// Écran 6 : vitesse, voix, didascalies et remise à zéro de la progression.

import { el, remplacer, signaler } from '../dom.js';
import {
  creerAvisVoix, creerBascule, creerChoixUnique, creerTitreVue, lireReplique,
} from '../affichage.js';
import { confirmer } from '../modale.js';
import { toutesLesPieces } from '../pieces.js';
import { texteBrut } from '../texte.js';
import { changerReglage, effacerProgression, lireReglages } from '../stockage.js';
import { voixJaponaises, voixPretes } from '../voix.js';

const PHRASE_ESSAI = { texte: 'むかしむかし、あるところに、[優|やさ]しいおじいさんがいました。' };

// 0.9 devient « 0,90 » : format français, deux décimales.
const formaterVitesse = (valeur) => Number(valeur).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

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
    el('span', { className: 'eyebrow champ-ligne' }, 'Vitesse de lecture', affichage),
    curseur);
}

function creerChoixVoix() {
  const zone = el('div');

  function remplir() {
    // La voix enregistrée peut avoir disparu du téléphone : on revient alors sur « Automatique ».
    const souhaitee = lireReglages().voix;
    const existe = voixJaponaises().some((voix) => voix.voiceURI === souhaitee);
    remplacer(zone, creerChoixUnique([
      { valeur: null, libelle: 'Automatique' },
      ...voixJaponaises().map((voix) => ({
        valeur: voix.voiceURI,
        libelle: `${voix.name}${voix.localService ? '' : ' (réseau)'}`,
      })),
    ], existe ? souhaitee : null, (valeur) => changerReglage('voix', valeur)));
  }

  remplir();
  // La liste peut arriver après l'affichage de l'écran.
  voixPretes().then(remplir);
  return el('div', { className: 'pile' }, el('p', { className: 'eyebrow' }, 'Voix du téléphone'), zone);
}

function creerVoixEnregistrees() {
  return el('div', { className: 'pile' },
    el('p', { className: 'eyebrow' }, 'Voix des pièces'),
    el('p', { className: 'legende' }, 'Les pièces fournies ont une voix enregistrée par rôle. Les pièces importées utilisent toujours la voix du téléphone.'),
    el('div', { className: 'chips' },
      creerBascule('Utiliser les voix enregistrées', lireReglages().voixEnregistrees, (actif) => {
        changerReglage('voixEnregistrees', actif);
      })));
}

function creerDidascalies() {
  return el('div', { className: 'chips' },
    creerBascule('Lire aussi les didascalies', lireReglages().lireDidascalies, (actif) => {
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
          titre: 'Remettre à zéro ?',
          message: `La progression de « ${texteBrut(piece.titre)} » sera effacée. Tes répliques choisies sont conservées.`,
          oui: 'Remettre à zéro',
        });
        if (!accepte) return;
        effacerProgression(piece.id);
        signaler('Progression remise à zéro.');
      },
    }, 'Remettre à zéro'));
}

export async function afficherReglages(racine) {
  const { fournies, importees } = await toutesLesPieces();

  const version = el('p', { className: 'version' });
  // Le numéro du cache est le numéro de version : pratique pour vérifier qu'une mise à jour est arrivée.
  if ('caches' in window) {
    caches.keys().then((noms) => {
      const cache = noms.find((nom) => nom.startsWith('replik-'));
      if (cache) version.textContent = `Replik, version ${cache.replace('replik-v', '')}`;
    });
  }

  remplacer(racine,
    creerTitreVue('Réglages'),
    creerAvisVoix(),
    el('section', { className: 'card pile' },
      el('h2', { className: 'titre-section' }, 'Lecture'),
      creerVitesse(),
      creerVoixEnregistrees(),
      creerChoixVoix(),
      el('button', { type: 'button', className: 'btn-ghost', onclick: () => lireReplique(PHRASE_ESSAI) }, 'Essayer la voix du téléphone'),
      creerDidascalies()),
    el('section', { className: 'card pile' },
      el('h2', { className: 'titre-section' }, 'Progression'),
      [...fournies, ...importees].map(creerRemiseAZero)),
    version,
  );
}
