// Écran 5 : le filage. L'app lit les autres, s'arrête sur mes répliques et attend « Suivant ».
//
// C'est un petit automate : à tout moment, la variable « etat » dit où on en est.
//   depart   : choix de la scène de départ
//   lecture  : l'app lit une réplique des autres
//   a-moi    : c'est ma réplique, l'app attend
//   manuel   : pas de voix japonaise, l'app attend aussi sur les répliques des autres
//   pause    : arrêté par l'utilisateur (ou parce que l'écran s'est éteint)
//   fin      : la pièce est terminée
//
// En mode Gestes (réglage Navigation), pas de boutons Pause et Suivant : on pousse l'écran vers le
// haut pour passer à la réplique suivante, vers le bas pour revenir à la précédente, et l'on touche
// la réplique qui se lit pour la mettre en pause.

import { cascade, definirRetour, el, icone, remplacer } from '../dom.js';
import {
  audioActif, creerAvisEnchainement, creerAvisVoix, creerBoutonIcone, creerChoixUnique, creerEcoute,
  creerInterrupteurs, creerReplique, creerTitreScene, creerTitreVue, lireReplique, suivreLecture,
} from '../affichage.js';
import { t, traduire } from '../langues.js';
import { enchainementsDe, lignesDe } from '../pieces.js';
import { lireReglages, lireSelection, lireStatuts } from '../stockage.js';
import { creerJaponais, texteAParler } from '../texte.js';
import { arreterVoix, voixJaponaises, voixPretes } from '../voix.js';
import { noterPosition, oublierPosition, positionAReprendre } from '../reprise.js';
import { brancherBalayage, brancherGestes } from '../gestes.js';

const SILENCE_ENTRE_REPLIQUES = 350; // millisecondes, pour que ça respire
const DUREE_LIGNE_MUETTE = 1500;     // le temps de lire une ligne qui n'est qu'une didascalie

const attendre = (duree) => new Promise((resolve) => { setTimeout(resolve, duree); });

export function afficherFilage(racine, piece) {
  const lignes = lignesDe(piece);
  const selection = lireSelection(piece);
  // Le réglage Navigation ne peut pas changer pendant le filage : les Réglages sont un autre écran,
  // et le filage se reconstruit quand on en revient.
  const gestes = lireReglages().navigation === 'gestes';

  let etat = 'depart';
  let position = 0;
  let sansVoix = false;
  let carteCourante = null;
  let ecouteCourante = null; // l'écoute de ma réplique en cours (voir creerEcoute)
  let boutonVoir = null;
  let derniereScene = null;
  // Le « jeton » change à chaque nouvelle étape. Une tâche qui a attendu (fin de lecture, silence)
  // compare son jeton au jeton actuel : s'il a changé, c'est que l'utilisateur a appuyé sur
  // Pause ou Suivant pendant l'attente, et cette tâche doit simplement s'arrêter sans rien faire.
  let jeton = 0;
  let verrouEcran = null;
  let temoin = null; // mode Gestes : la petite icône pause / lecture sur la réplique lue (voir majTemoin)
  // Ce que chaque ligne a ajouté au journal (titre de scène, avis, carte), rangé par sa position.
  // Pour revenir en arrière, on retire ces éléments, puis on remontre la ligne d'avant.
  const traces = new Map();

  const journal = el('div', { className: 'journal' });
  const commandes = el('div', { className: 'commandes' });

  // Mode Gestes : pousser le journal vers le haut fait comme Suivant, vers le bas revient en arrière.
  if (gestes) {
    brancherBalayage(journal, {
      haut: avancer,
      bas: reculer,
      // Vers le haut, tant que la pièce n'est pas finie ; vers le bas, tant qu'il reste une ligne avant.
      permis: (sens) => (sens === 'haut' ? etat !== 'fin' : position > 0),
    });
  }

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
    majTemoin();

    // En mode Gestes, aucun bouton : voir et écouter ma réplique se font en touchant sa carte, la
    // pause en touchant la réplique qui se lit, et l'on passe d'une ligne à l'autre en poussant l'écran.
    if (!gestes) {
      if (aMoi) {
        boutonVoir = creerBoutonIcone('voir', t('Voir'), 'btn-ghost', devoiler);
        boutonVoir.disabled = !carteCourante.classList.contains('est-cachee');
        boutons.push(el('div', { className: 'boutons boutons-apparition' }, boutonVoir, ecouteCourante.bouton));
      }

      const enPause = etat === 'pause';
      boutons.push(el('div', { className: 'boutons' },
        el('button', {
          type: 'button',
          className: 'btn-ghost',
          // Pause n'a de sens que si l'app est en train de lire.
          disabled: !(etat === 'lecture' || enPause),
          onclick: enPause ? reprendre : mettreEnPause,
        }, enPause ? t('Reprendre') : t('Pause')),
        el('button', { type: 'button', className: 'btn', onclick: avancer }, t('Suivant'))));
    }

    remplacer(commandes, boutons);
    commandes.hidden = boutons.length === 0; // vide, la barre du bas n'aurait plus rien à montrer
    // Après les boutons, et pas avant : leur hauteur change, et la carte pourrait se retrouver dessous.
    carteCourante.scrollIntoView({ block: 'center' });
  }

  // Mode Gestes : sur la réplique des autres qui se lit, une petite icône dit ce que fera un toucher.
  // Pause pendant la lecture, lecture quand elle est arrêtée. Sans voix (état manuel), rien à toucher.
  function majTemoin() {
    if (!temoin) return;
    const nom = { lecture: 'pause', pause: 'lecture' }[etat];
    temoin.hidden = !nom;
    if (nom) remplacer(temoin, icone(nom));
  }

  // Ma réplique se dévoile : par le bouton Voir, ou en touchant la carte.
  function devoiler() {
    carteCourante.classList.remove('est-cachee');
    if (boutonVoir) boutonVoir.disabled = true;
    carteCourante.scrollIntoView({ block: 'center' }); // la carte vient de grandir
  }

  // ---- Le déroulement ----

  function montrerLigne(ligne) {
    const ajouts = []; // tout ce que cette ligne ajoute au journal, pour pouvoir l'en retirer
    if (ligne.scene !== derniereScene) {
      derniereScene = ligne.scene;
      ajouts.push(creerTitreScene(ligne.scene));
    }
    const mienne = selection.has(ligne.numero);
    const index = lignes.indexOf(ligne);
    const avis = mienne ? creerAvisEnchainement(piece, ligne, enchainementsDe(lignes, index, selection)) : [];
    const statut = lireStatuts(piece.id)[ligne.numero];
    // Pour ma réplique : une écoute partagée entre le bouton ▶ et la carte, que l'on peut toucher
    // pour la voir, puis pour l'écouter. Une fois passée, la carte reste dans le journal sans réagir.
    ecouteCourante = mienne ? creerEcoute(ligne) : null;
    const ecoute = ecouteCourante;
    const enCours = () => carte === carteCourante && etat === 'a-moi';

    // Ce que fait un toucher sur la carte. Ma réplique : la voir, puis l'écouter. Celle d'un autre,
    // en mode Gestes seulement : la mettre en pause, puis reprendre (avec les boutons, c'est Pause).
    let surTouche = null;
    if (mienne) {
      surTouche = () => {
        if (!enCours()) return;
        if (carte.classList.contains('est-cachee')) devoiler();
        else ecoute.toucher();
      };
    } else if (gestes) {
      surTouche = () => {
        if (carte !== carteCourante) return;
        if (etat === 'lecture') mettreEnPause();
        else if (etat === 'pause') reprendre();
      };
    }
    const carte = creerReplique(ligne, piece, { mienne, cachee: mienne, statut, surTouche });

    // Mode Gestes : il n'y a pas de bouton ▶. Quand j'écoute ma réplique, c'est donc le filet de sa
    // carte qui suit la lecture (avec les boutons, le trait du bouton le fait déjà), et un appui long
    // sur la carte arrête l'écoute.
    if (mienne && gestes) {
      ecoute.lierCarte(carte);
      brancherGestes(carte, { maintenir: () => { if (enCours()) ecoute.arreter(); } });
    }
    // Mode Gestes : la réplique d'un autre porte la petite icône pause / lecture, comme le signal des fiches.
    temoin = null;
    if (!mienne && gestes) {
      temoin = el('span', { className: 'temoin-lecture', 'aria-hidden': 'true', hidden: true });
      carte.querySelector('.replique-tete').append(temoin);
    }
    carteCourante = carte;
    carteCourante.classList.add('courante');
    ajouts.push(...avis, carte);
    traces.set(index, ajouts);
    journal.append(...ajouts);
  }

  async function jouerEtape(dejaAffichee = false) {
    jeton += 1;
    const moi = jeton;
    const ligne = lignes[position];
    if (!dejaAffichee) montrerLigne(ligne);
    noterPosition('filage', { position }); // pour reprendre ici si Android relance l'app

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
    // Pendant que l'app lit, le filet de la carte en fait le tour à mesure de la lecture.
    const finirFilet = aDire ? suivreLecture(carteCourante) : null;
    const resultat = aDire ? await lireReplique(ligne) : (await attendre(DUREE_LIGNE_MUETTE), 'fini');
    finirFilet?.();
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
    carteCourante?.classList.remove('est-cachee', 'courante', 'is-syncing');
    // Une carte touchable devient inerte : seule la réplique en cours répond au doigt.
    if (carteCourante instanceof HTMLButtonElement) carteCourante.disabled = true;
    temoin?.remove();
    temoin = null;
    position += 1;
    if (position >= lignes.length) terminer();
    else jouerEtape();
  }

  // Revenir à la ligne précédente (mode Gestes : pousser l'écran vers le bas). La ligne en cours et
  // celle d'avant quittent le journal, puis celle d'avant y revient comme neuve : cachée si c'est ma
  // réplique, relue si c'est celle d'un autre. Depuis la fin de la pièce, on revient à la dernière ligne.
  function reculer() {
    if (position === 0) return;
    jeton += 1;
    arreterVoix();
    if (!verrouEcran) garderEcranAllume();
    for (const rang of [position, position - 1]) {
      for (const element of traces.get(rang) ?? []) element.remove();
      traces.delete(rang);
    }
    position -= 1;
    // Le titre de scène revient si la ligne restée juste avant au journal était d'une autre scène
    // (ou s'il n'en reste aucune : le filage avait commencé ici).
    derniereScene = traces.has(position - 1) ? lignes[position - 1].scene : null;
    jouerEtape();
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
    oublierPosition();
    libererEcran();
    const fin = el('p', { className: 'avis fin-piece' }, t('Fin de la pièce.'));
    traces.set(position, [fin]); // en mode Gestes, on peut encore revenir à la dernière ligne
    journal.append(fin);
    remplacer(commandes, el('button', { type: 'button', className: 'btn', onclick: ecranDepart }, t('Recommencer un filage')));
    commandes.hidden = false;
    fin.scrollIntoView({ block: 'center' });
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

  // ---- Le lancement ----

  // Lance le filage à partir d'une position. repris : l'app vient d'être relancée par Android au
  // milieu d'un filage. On retrouve alors la réplique, mais à l'arrêt : le navigateur ne laisse
  // parler l'app qu'après un toucher, que Reprendre ou Suivant fourniront.
  async function demarrer(depart, { repris = false } = {}) {
    // Filage lancé : la flèche de retour ramène à son écran de départ, en coupant la voix.
    definirRetour(() => {
      arreterVoix();
      ecranDepart();
    });
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
    traces.clear();
    // En mode Gestes, le journal ne défile plus au doigt : en haut, les interrupteurs seraient
    // vite hors d'atteinte. Ils passent donc dessous, juste après la réplique en cours, comme dans les fiches.
    const interrupteurs = creerInterrupteurs(piece.id);
    remplacer(racine,
      sansVoix && creerAvisVoix(piece),
      !gestes && interrupteurs,
      journal,
      gestes && interrupteurs,
      commandes,
    );
    if (!repris) {
      garderEcranAllume();
      jouerEtape();
      return;
    }
    jeton += 1;
    const ligne = lignes[position];
    montrerLigne(ligne);
    noterPosition('filage', { position }); // une seconde relance doit retomber au même endroit
    if (selection.has(ligne.numero)) etat = 'a-moi';
    else etat = sansVoix ? 'manuel' : 'pause';
    afficherCommandes();
  }

  // ---- L'écran de départ ----

  function ecranDepart() {
    etat = 'depart';
    jeton += 1;
    oublierPosition(); // pas de filage en cours : rien à reprendre si l'app est relancée
    definirRetour(null); // la flèche de retour quitte alors le filage
    libererEcran();

    // Le départ est la position de la première réplique de la scène choisie, dans la liste à plat.
    let depart = 0;
    const legende = el('p', { className: 'legende' });
    const montrerLegende = () => {
      const { scene } = lignes[depart];
      remplacer(legende, creerJaponais(scene.titre), ' ', traduire(scene, 'titre_fr'));
    };
    montrerLegende();

    remplacer(racine,
      creerTitreVue(t('Filage')),
      creerAvisVoix(piece),
      el('section', { className: 'card pile' },
        el('p', {}, selection.size > 0
          ? t("L'app lit les répliques des autres et s'arrête sur tes {n} répliques.", { n: selection.size })
          : t("Tu n'as choisi aucune réplique : l'app lira toute la pièce.")),
        el('p', { className: 'eyebrow' }, t('Commencer à partir de')),
        creerChoixUnique(piece.scenes.map((scene, rang) => ({
          valeur: lignes.findIndex((l) => l.scene === scene),
          libelle: rang === 0 ? t('Le début') : t('Scène {n}', { n: scene.numero }),
        })), 0, (valeur) => {
          depart = valeur;
          montrerLegende();
        }),
        legende),
      // Ce toucher autorise aussi le navigateur à parler pour toute la suite du filage.
      el('button', { type: 'button', className: 'btn', onclick: () => demarrer(depart) }, t('Lancer le filage')),
    );
    cascade(racine);
  }

  // L'app vient-elle d'être relancée au milieu d'un filage ? On y revient. Sinon, l'écran de départ.
  const reprise = positionAReprendre('filage');
  if (reprise && reprise.position < lignes.length) demarrer(reprise.position, { repris: true });
  else ecranDepart();

  // Appelé par le routeur quand on quitte l'écran : on coupe tout ce qui tourne encore.
  return () => {
    jeton += 1;
    etat = 'depart';
    document.removeEventListener('visibilitychange', surVisibilite);
    libererEcran();
  };
}
