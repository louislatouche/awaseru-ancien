// La lecture à voix haute, avec l'API speechSynthesis du navigateur.
// Cette API a des particularités sur Android : les commentaires expliquent chaque précaution.

import { t } from './langues.js';
import { lireReglages } from './stockage.js';

export const aideInstallation = () => t("Aucune voix japonaise sur ce téléphone. Pour l'installer : Paramètres Android > Synthèse vocale (parfois rangée dans Accessibilité ou Gestion globale) > moteur Google > installer les données vocales > japonais. Ferme puis rouvre ensuite Replik.");

let voix = [];

export const lectureDisponible = () => 'speechSynthesis' in window;
export const voixJaponaises = () => voix;

// Selon les appareils, voice.lang s'écrit ja-JP ou ja_JP : on accepte les deux.
function releverVoix() {
  voix = window.speechSynthesis.getVoices().filter((v) => /^ja([-_]|$)/i.test(v.lang));
  return voix.length > 0;
}

let promesseVoix = null;

// La liste des voix n'est pas prête au chargement de la page : le navigateur la remplit plus tard
// et prévient par l'événement voiceschanged. Par prudence on interroge aussi toutes les 250 ms,
// pendant 5 secondes (la bibliothèque EasySpeech fait de même, cet événement n'étant pas fiable partout).
export function voixPretes() {
  promesseVoix ??= new Promise((resolve) => {
    if (!lectureDisponible()) { resolve([]); return; }
    const debut = Date.now();
    const verifier = () => {
      if (releverVoix() || Date.now() - debut >= 5000) {
        clearInterval(boucle);
        resolve(voix);
      }
    };
    const boucle = setInterval(verifier, 250);
    // Cet écouteur reste en place : si une voix arrive après les 5 secondes, la liste se met à jour.
    window.speechSynthesis.addEventListener('voiceschanged', verifier);
    verifier();
  });
  return promesseVoix;
}

function voixChoisie() {
  const souhaitee = lireReglages().voix;
  return voix.find((v) => v.voiceURI === souhaitee)
    ?? voix.find((v) => v.localService) // une voix locale fonctionne aussi hors ligne
    ?? voix[0]
    ?? null;
}

// La fonction qui termine la lecture en cours. Une seule lecture à la fois : si cette variable
// a changé, c'est que les événements qui arrivent concernent une ancienne lecture à ignorer.
let terminerEnCours = null;
// Certains navigateurs oublient un énoncé qu'aucune variable ne retient, et son événement « end »
// n'arrive alors jamais. On garde donc une référence tant que la lecture dure.
let enonceEnCours = null;
// Le fichier audio en cours de lecture, pour pouvoir l'arrêter.
let audioEnCours = null;

export function arreterVoix() {
  // D'abord couper le son : l'appel suivant efface la référence au fichier en cours.
  audioEnCours?.pause();
  audioEnCours = null;
  // On prévient AVANT cancel() : ainsi, quoi qu'il envoie ensuite (end, error, ou rien),
  // la lecture est déjà marquée « annulée » et personne ne croira qu'elle s'est finie normalement.
  // C'est ce qui empêche le filage de passer à la réplique suivante quand on appuie sur Pause.
  terminerEnCours?.('annule');
  if (lectureDisponible()) window.speechSynthesis.cancel();
}

// Lit un fichier audio. Renvoie une promesse qui donne : 'fini', 'annule' ou 'erreur:code'.
//
// Pourquoi fetch puis un « blob » plutôt que new Audio(url) ? Le lecteur audio du navigateur demande
// les fichiers par morceaux (requêtes Range), ce qui se marie mal avec les copies du service worker.
// En téléchargeant nous-mêmes le fichier entier, on obtient le même comportement en ligne et hors ligne.
export function jouerFichier(url) {
  arreterVoix();

  return new Promise((resolve) => {
    const audio = new Audio();
    let adresse = null;

    const terminer = (resultat) => {
      if (terminerEnCours !== terminer) return;
      terminerEnCours = null;
      audioEnCours = null;
      if (adresse) URL.revokeObjectURL(adresse); // libère la mémoire occupée par le fichier
      resolve(resultat);
    };
    terminerEnCours = terminer;
    audioEnCours = audio;

    audio.onended = () => terminer('fini');
    audio.onerror = () => terminer('erreur:fichier');

    fetch(url)
      .then((reponse) => {
        if (!reponse.ok) throw new Error('fichier introuvable');
        return reponse.blob();
      })
      .then((fichier) => {
        if (terminerEnCours !== terminer) return undefined; // annulée pendant le téléchargement
        adresse = URL.createObjectURL(fichier);
        audio.src = adresse;
        // À régler après src : le chargement d'une source remet la vitesse à sa valeur par défaut.
        const { vitesse } = lireReglages();
        audio.defaultPlaybackRate = vitesse;
        audio.playbackRate = vitesse;
        return audio.play();
      })
      .catch((erreur) => {
        // NotAllowedError : le navigateur veut d'abord un geste de l'utilisateur.
        terminer(erreur.name === 'NotAllowedError' ? 'erreur:not-allowed' : 'erreur:fichier');
      });
  });
}

// Met en pause le fichier audio en cours sans le perdre : reprendreVoix() repartira du même endroit.
// La voix du téléphone, elle, n'a pas de pause fiable sur Android (voir mettreEnPause dans filage.js) :
// dans ce cas, on l'arrête, et la fonction renvoie false pour prévenir que la place est perdue.
export function mettreEnPauseVoix() {
  if (audioEnCours && !audioEnCours.paused) {
    audioEnCours.pause();
    return true;
  }
  arreterVoix();
  return false;
}

// Relance le fichier mis en pause. Renvoie false s'il n'y a plus rien à reprendre.
export function reprendreVoix() {
  if (!audioEnCours) return false;
  // Si la reprise échoue, la lecture se termine en erreur, comme un fichier illisible.
  audioEnCours.play().catch(() => terminerEnCours?.('erreur:fichier'));
  return true;
}

// Où en est la lecture du fichier audio : de 0 (début) à 1 (fin).
// null quand on ne peut pas le savoir : voix du téléphone, ou fichier encore en chargement.
export function progressionVoix() {
  const duree = audioEnCours?.duration;
  if (!Number.isFinite(duree) || duree === 0) return null;
  return audioEnCours.currentTime / duree;
}

// Lit un texte. Renvoie une promesse qui donne : 'fini', 'annule', 'sans-voix' ou 'erreur:code'.
export function parler(texte) {
  arreterVoix();
  if (!texte) return Promise.resolve('fini');
  if (!lectureDisponible() || !voixChoisie()) return Promise.resolve('sans-voix');

  return new Promise((resolve) => {
    const choisie = voixChoisie();
    const vitesse = lireReglages().vitesse;
    const enonce = new SpeechSynthesisUtterance(texte);
    enonce.voice = choisie;
    enonce.lang = 'ja-JP'; // on règle aussi la langue, pas seulement la voix
    enonce.rate = vitesse;

    let garde = null;
    const terminer = (resultat) => {
      if (terminerEnCours !== terminer) return;
      terminerEnCours = null;
      enonceEnCours = null;
      clearTimeout(garde);
      resolve(resultat);
    };
    terminerEnCours = terminer;
    enonceEnCours = enonce;

    enonce.onend = () => terminer('fini');
    enonce.onerror = (evenement) => {
      const annulee = evenement.error === 'canceled' || evenement.error === 'interrupted';
      terminer(annulee ? 'annule' : `erreur:${evenement.error}`);
    };

    // Un court délai après cancel() : c'est ce que fait EasySpeech avant chaque lecture.
    setTimeout(() => {
      if (terminerEnCours !== terminer) return; // annulée entre-temps
      window.speechSynthesis.speak(enonce);

      // Garde-fou : si « end » n'arrive jamais, le filage resterait bloqué pour toujours.
      // On laisse largement le temps (0,4 s par caractère, bien plus lent qu'une vraie lecture).
      const dureeMax = (texte.length * 400) / vitesse + 5000;
      garde = setTimeout(() => {
        window.speechSynthesis.cancel();
        terminer('fini');
      }, dureeMax);
    }, 10);
  });
}

// Transforme un résultat de lecture en phrase pour l'utilisateur (ou null si tout va bien).
export function messagePourResultat(resultat) {
  if (resultat === 'sans-voix') return aideInstallation();
  if (!resultat.startsWith('erreur:')) return null;
  const code = resultat.slice('erreur:'.length);
  if (code === 'not-allowed') return t('Le navigateur a bloqué la lecture : touche à nouveau un bouton pour la lancer.');
  if (code === 'language-unavailable' || code === 'voice-unavailable') return aideInstallation();
  return t('La lecture a échoué ({code}).', { code });
}
