// Écran 5 : le filage. L'app lit les autres, s'arrête sur mes répliques et attend « Suivant ».
//
// C'est un petit automate : à tout moment, la variable « etat » dit où on en est.
//   depart   : choix de la scène de départ
//   lecture  : l'app lit une réplique des autres
//   a-moi    : c'est ma réplique, l'app attend
//   manuel   : pas de voix japonaise, l'app attend aussi sur les répliques des autres
//   pause    : arrêté par l'utilisateur (ou parce que l'écran s'est éteint)
//   fin      : la pièce est terminée

import { el, remplacer } from '../dom.js';
import {
  audioActif, creerAvisEnchainement, creerAvisVoix, creerChoixUnique, creerInterrupteurs, creerReplique,
  creerTitreScene, creerTitreVue, lireReplique,
} from '../affichage.js';
import { enchainementsDe, lignesDe } from '../pieces.js';
import { lireReglages, lireSelection, lireStatuts } from '../stockage.js';
import { creerJaponais, texteAParler } from '../texte.js';
import { arreterVoix, voixJaponaises, voixPretes } from '../voix.js';

const SILENCE_ENTRE_REPLIQUES = 350; // millisecondes, pour que ça respire
const DUREE_LIGNE_MUETTE = 1500;     // le temps de lire une ligne qui n'est qu'une didascalie

const attendre = (duree) => new Promise((resolve) => { setTimeout(resolve, duree); });

export function afficherFilage(racine, piece) {
  const lignes = lignesDe(piece);
  const selection = lireSelection(piece);

  let etat = 'depart';
  let position = 0;
  let sansVoix = false;
  let carteCourante = null;
  let derniereScene = null;
  // Le « jeton » change à chaque nouvelle étape. Une tâche qui a attendu (fin de lecture, silence)
  // compare son jeton au jeton actuel : s'il a changé, c'est que l'utilisateur a appuyé sur
  // Pause ou Suivant pendant l'attente, et cette tâche doit simplement s'arrêter sans rien faire.
  let jeton = 0;
  let verrouEcran = null;

  const journal = el('div', { className: 'journal' });
  const commandes = el('div', { className: 'commandes' });

  // ---- Garder l'écran allumé : sans cela, le téléphone se verrouille pendant qu'il lit. ----

  async function garderEcranAllume() {
    try {
      const verrou = await navigator.wakeLock?.request('screen');
      // Si le filage s'est arrêté pendant cette attente, on rend le verrou tout de suite.
      if (etat === 'depart' || etat === 'fin' || etat === 'pause') verrou?.release();
      else verrouEcran = verrou;
    } catch {
      verrouEcran = null; // refusé (batterie faible...) : le filage marche quand même
    }
  }

  function libererEcran() {
    verrouEcran?.release();
    verrouEcran = null;
  }

  // ---- Les boutons, selon l'état ----

  function afficherCommandes() {
    const aMoi = etat === 'a-moi';
    const boutons = [];

    if (aMoi) {
      const voir = el('button', {
        type: 'button',
        className: 'btn-ghost',
        onclick: () => {
          carteCourante.classList.remove('est-cachee');
          voir.disabled = true;
          carteCourante.scrollIntoView({ block: 'center' }); // la carte vient de grandir
        },
      }, 'Voir');
      voir.disabled = !carteCourante.classList.contains('est-cachee');
      boutons.push(el('div', { className: 'boutons' },
        voir,
        el('button', { type: 'button', className: 'btn-ghost', onclick: () => lireReplique(lignes[position]) }, 'Écouter ma réplique')));
    }

    const enPause = etat === 'pause';
    boutons.push(el('div', { className: 'boutons' },
      el('button', {
        type: 'button',
        className: 'btn-ghost',
        // Pause n'a de sens que si l'app est en train de lire.
        disabled: !(etat === 'lecture' || enPause),
        onclick: enPause ? reprendre : mettreEnPause,
      }, enPause ? 'Reprendre' : 'Pause'),
      el('button', { type: 'button', className: 'btn', onclick: avancer }, 'Suivant')));

    remplacer(commandes, boutons);
    // Après les boutons, et pas avant : leur hauteur change, et la carte pourrait se retrouver dessous.
    carteCourante.scrollIntoView({ block: 'center' });
  }

  // ---- Le déroulement ----

  function montrerLigne(ligne) {
    if (ligne.scene !== derniereScene) {
      derniereScene = ligne.scene;
      journal.append(creerTitreScene(ligne.scene));
    }
    const mienne = selection.has(ligne.numero);
    const index = lignes.indexOf(ligne);
    const avis = mienne ? creerAvisEnchainement(piece, ligne, enchainementsDe(lignes, index, selection)) : [];
    const statut = lireStatuts(piece.id)[ligne.numero];
    carteCourante = creerReplique(ligne, piece, { mienne, cachee: mienne, statut });
    journal.append(...avis, carteCourante);
    carteCourante.classList.add('courante');
  }

  async function jouerEtape(dejaAffichee = false) {
    jeton += 1;
    const moi = jeton;
    const ligne = lignes[position];
    if (!dejaAffichee) montrerLigne(ligne);

    if (selection.has(ligne.numero)) {
      etat = 'a-moi';
      afficherCommandes();
      return;
    }
    if (sansVoix) {
      etat = 'manuel';
      afficherCommandes();
      return;
    }

    etat = 'lecture';
    afficherCommandes();

    // texteAParler vide : la ligne n'est qu'une didascalie, on laisse le temps de la lire.
    const aDire = texteAParler(ligne.texte, lireReglages().lireDidascalies);
    const resultat = aDire ? await lireReplique(ligne) : (await attendre(DUREE_LIGNE_MUETTE), 'fini');
    if (moi !== jeton) return;

    if (resultat === 'fini') {
      await attendre(SILENCE_ENTRE_REPLIQUES);
      if (moi === jeton) avancer();
    } else {
      // Erreur de lecture (lireReplique l'a déjà signalée) : on s'arrête sans perdre sa place.
      etat = 'pause';
      afficherCommandes();
    }
  }

  function avancer() {
    jeton += 1;
    arreterVoix();
    if (!verrouEcran) garderEcranAllume(); // « Suivant » peut être touché pendant une pause
    carteCourante?.classList.remove('est-cachee', 'courante');
    position += 1;
    if (position >= lignes.length) terminer();
    else jouerEtape();
  }

  // Sur Android, speechSynthesis.pause() coupe la voix sans jamais prévenir qu'elle a fini
  // (c'est documenté dans le code d'EasySpeech). On annule donc vraiment la lecture,
  // et « Reprendre » relit la réplique depuis son début.
  function mettreEnPause() {
    jeton += 1;
    arreterVoix();
    libererEcran();
    etat = 'pause';
    afficherCommandes();
  }

  function reprendre() {
    garderEcranAllume();
    jouerEtape(true);
  }

  function terminer() {
    etat = 'fin';
    libererEcran();
    journal.append(el('p', { className: 'avis fin-piece' }, 'Fin de la pièce.'));
    remplacer(commandes, el('button', { type: 'button', className: 'btn', onclick: ecranDepart }, 'Recommencer un filage'));
    journal.lastChild.scrollIntoView({ block: 'center' });
  }

  // Si l'utilisateur quitte l'app ou éteint l'écran, on se met en pause plutôt que de continuer
  // dans le vide. Le verrou d'écran, lui, est relâché tout seul quand la page est masquée :
  // il faut le redemander au retour.
  function surVisibilite() {
    if (document.hidden) {
      if (etat === 'lecture') mettreEnPause();
      else arreterVoix();
    } else if (etat === 'a-moi' || etat === 'manuel') {
      garderEcranAllume();
    }
  }
  document.addEventListener('visibilitychange', surVisibilite);

  // ---- L'écran de départ ----

  function ecranDepart() {
    etat = 'depart';
    jeton += 1;
    libererEcran();

    // Le départ est la position de la première réplique de la scène choisie, dans la liste à plat.
    let depart = 0;
    const legende = el('p', { className: 'legende' });
    const montrerLegende = () => {
      const { scene } = lignes[depart];
      remplacer(legende, creerJaponais(scene.titre), ' ', scene.titre_fr);
    };
    montrerLegende();

    remplacer(racine,
      creerTitreVue('Filage'),
      creerAvisVoix(piece),
      el('section', { className: 'card pile' },
        el('p', {}, selection.size > 0
          ? `L'app lit les répliques des autres et s'arrête sur tes ${selection.size} répliques.`
          : "Tu n'as choisi aucune réplique : l'app lira toute la pièce."),
        el('p', { className: 'eyebrow' }, 'Commencer à partir de'),
        creerChoixUnique(piece.scenes.map((scene, rang) => ({
          valeur: lignes.findIndex((l) => l.scene === scene),
          libelle: rang === 0 ? 'Le début' : `Scène ${scene.numero}`,
        })), 0, (valeur) => {
          depart = valeur;
          montrerLegende();
        }),
        legende),
      // Ce toucher autorise aussi le navigateur à parler pour toute la suite du filage.
      el('button', {
        type: 'button',
        className: 'btn',
        onclick: async () => {
          if (audioActif(piece)) {
            sansVoix = false;
          } else {
            await voixPretes();
            sansVoix = voixJaponaises().length === 0;
          }
          position = depart;
          derniereScene = null;
          carteCourante = null;
          remplacer(journal);
          remplacer(racine,
            sansVoix && creerAvisVoix(piece),
            creerInterrupteurs(),
            journal,
            commandes,
          );
          garderEcranAllume();
          jouerEtape();
        },
      }, 'Lancer le filage'),
    );
  }

  ecranDepart();

  // Appelé par le routeur quand on quitte l'écran : on coupe tout ce qui tourne encore.
  return () => {
    jeton += 1;
    etat = 'depart';
    document.removeEventListener('visibilitychange', surVisibilite);
    libererEcran();
  };
}
