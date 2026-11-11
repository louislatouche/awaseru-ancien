// Écran 5 : le filage. L'app lit les autres, s'arrête sur mes répliques et attend que je passe à la suite.
//
// C'est un petit automate : à tout moment, la variable « etat » dit où on en est.
//   depart   : choix de la scène de départ
//   lecture  : l'app lit une réplique des autres
//   a-moi    : c'est ma réplique, l'app attend
//   manuel   : pas de voix japonaise, l'app attend aussi sur les répliques des autres
//   pause    : arrêté par l'utilisateur (ou parce que l'écran s'est éteint)
//   fin      : la pièce est terminée
//   complet  : le filage complet (voir plus bas), qui a sa propre lecture en continu
//
// Tout se fait au doigt, sans boutons Pause et Suivant : on pousse l'écran vers le haut pour passer
// à la réplique suivante, et l'on touche la réplique qui se lit pour la mettre en pause. Le doigt qui
// descend fait simplement défiler l'écran, pour relire les répliques passées.
//
// Le filage complet, lui, affiche toutes les répliques d'un coup et les lit toutes à la suite, les
// miennes comprises, sans s'arrêter : pour suivre le texte pendant que les voix jouent.

import { cascade, definirRetour, el, hautDePage, remplacer } from '../dom.js';
import {
  audioActif, creerAvisEnchainement, creerAvisVoix, creerChoixUnique, creerEcoute,
  creerInterrupteurs, creerReplique, creerTitreScene, creerTitreVue, lireReplique, suivreLecture,
} from '../affichage.js';
import { t, traduire } from '../langues.js';
import { enchainementsDe, lignesDe } from '../pieces.js';
import { lireReglages, lireSelection, lireStatuts } from '../stockage.js';
import { creerJaponais, texteAParler } from '../texte.js';
import { arreterVoix, mettreEnPauseVoix, reprendreVoix, voixJaponaises, voixPretes } from '../voix.js';
import { noterPosition, oublierPosition, positionAReprendre } from '../reprise.js';
import { brancherBalayage, brancherGestes } from '../gestes.js';
import { montrerGestes, proposerTuto, tutoAVoir } from '../tuto.js';

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
  let ecouteCourante = null; // l'écoute de ma réplique en cours (voir creerEcoute)
  let derniereScene = null;
  // Le « jeton » change à chaque nouvelle étape. Une tâche qui a attendu (fin de lecture, silence)
  // compare son jeton au jeton actuel : s'il a changé, c'est que l'utilisateur a mis en pause ou
  // est passé à la suite pendant l'attente, et cette tâche doit simplement s'arrêter sans rien faire.
  let jeton = 0;
  let verrouEcran = null;
  let pauseFichier = false; // vrai quand la pause garde un fichier audio arrêté là où il en était

  const journal = el('div', { className: 'journal' });
  const commandes = el('div', { className: 'commandes' });

  // Tout se fait au doigt : les gestes sont la seule navigation (depuis le 2026-11-10, à la demande
  // de Louis). Pousser le journal vers le haut passe à la réplique suivante, tant que la pièce n'est
  // pas finie.
  const balayage = brancherBalayage(journal, { suivant: avancer, permis: () => etat !== 'fin' });

  // Amène une carte au centre de l'écran, par la course du balayage, qu'un doigt arrête net : les
  // cartes ne bougent alors jamais sous un toucher.
  function amenerAuCentre(element) {
    balayage.amener(element);
  }

  // ---- Garder l'écran allumé : sans cela, le téléphone se verrouille pendant qu'il lit. ----

  async function garderEcranAllume() {
    try {
      const verrou = await navigator.wakeLock?.request('screen');
      // Si le filage s'est arrêté pendant cette attente, on rend le verrou tout de suite.
      const arrete = etat === 'depart' || etat === 'fin' || etat === 'pause'
        || (etat === 'complet' && lectureComplete !== 'lecture');
      if (arrete) verrou?.release();
      else verrouEcran = verrou;
    } catch {
      verrouEcran = null; // refusé (batterie faible...) : le filage marche quand même
    }
  }

  function libererEcran() {
    verrouEcran?.release();
    verrouEcran = null;
  }

  // ---- Après chaque étape ----

  // Pendant le filage, la barre du bas est vide et cachée : voir et écouter ma réplique se font en
  // touchant sa carte, la pause en touchant la réplique qui se lit, et l'on passe d'une ligne à
  // l'autre en poussant l'écran. Elle ne sert qu'à la fin, pour « Recommencer » (voir terminer).
  // recentrer : ramener l'écran sur la réplique en cours. Sauf quand on vient de toucher une réplique
  // passée, plus haut dans le journal : l'écran doit alors rester où il est (voir relire).
  function afficherCommandes({ recentrer = true } = {}) {
    remplacer(commandes);
    commandes.hidden = true;
    if (recentrer) amenerAuCentre(carteCourante);
  }

  // Ma réplique se dévoile quand je touche sa carte. Elle se lit aussitôt, pour que je compare ce
  // que j'ai dit à ce qu'il fallait dire. Le filage, lui, ne repart pas tout seul : il attend
  // toujours le geste vers le haut.
  function devoiler() {
    carteCourante.classList.remove('est-cachee');
    amenerAuCentre(carteCourante); // la carte vient de grandir
    ecouteCourante.ecouter(); // sauf si je l'écoutais déjà, cachée, avec le bouton ▶
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
    // Pour ma réplique : une écoute que l'on déclenche en touchant la carte, pour la voir, puis pour
    // l'écouter. Une fois passée, la toucher la relit (voir relire).
    ecouteCourante = mienne ? creerEcoute(ligne) : null;
    const ecoute = ecouteCourante;
    const enCours = () => carte === carteCourante && etat === 'a-moi';

    // Ce que fait un toucher sur la carte. Ma réplique : la voir, puis l'écouter. Celle d'un autre :
    // la mettre en pause, puis reprendre. Une carte passée, la mienne comme celle d'un autre, se relit.
    let surTouche = null;
    if (mienne) {
      surTouche = () => {
        if (carte !== carteCourante) {
          relire(ligne, carte);
          return;
        }
        if (!enCours()) return;
        if (carte.classList.contains('est-cachee')) devoiler();
        else ecoute.toucher();
      };
    } else {
      surTouche = () => {
        if (carte !== carteCourante) relire(ligne, carte);
        else if (etat === 'lecture') mettreEnPause();
        else if (etat === 'pause') reprendre();
      };
    }
    const carte = creerReplique(ligne, piece, { mienne, cachee: mienne, statut, surTouche });

    // Il n'y a pas de bouton ▶ : quand j'écoute ma réplique, c'est le filet de sa carte qui suit la
    // lecture. Sur toute carte, un appui long arrête ce qu'elle lit : une réplique passée qui se
    // relit, mon écoute en cours, ou la réplique d'un autre que l'app lit (le filage reste alors en pause).
    if (mienne) ecoute.lierCarte(carte);
    brancherGestes(carte, {
      maintenir: () => {
        if (relue === carte) arreterVoix(); // la fin de relire éteint la carte
        else if (enCours()) ecoute.arreter();
        else if (carte === carteCourante && (etat === 'lecture' || etat === 'pause')) arreterLecture();
      },
    });
    carteCourante = carte;
    carteCourante.classList.add('courante');
    // Le tuto (tuto.js), tant qu'il n'a pas été vu : une pastille « ? » au coin de ma réplique quand
    // vient mon tour. La carte est un bouton : la pastille se pose dans un cadre autour d'elle.
    const tuto = mienne && tutoAVoir('filage');
    const place = tuto ? el('div', { className: 'cadre-tuto' }, carte) : carte;
    journal.append(...avis, place);
    if (tuto) proposerTutoFilage(ligne, carte, place);
  }

  // Le tuto du filage, sur ma réplique en attente. Le doigt fantôme la touche (la voir, l'entendre),
  // la retouche (pause), garde le doigt dessus (arrêt), pousse le journal vers le haut (la suite), et
  // touche la réplique d'avant (la relire). Rien ne se fait pour de vrai : ma réplique reste cachée,
  // le filage n'avance pas. Pendant le balayage, la réplique suivante se devine sous la mienne
  // (variante B, choisie par Louis le 2026-11-11) ; la réplique relue s'éclaire, sans son.
  function proposerTutoFilage(ligne, carte, cadre) {
    const suivante = lignes[lignes.indexOf(ligne) + 1];
    proposerTuto('filage', cadre, () => {
      const passee = [...journal.querySelectorAll('.replique')].filter((autre) => autre !== carte).at(-1);
      const aMoi = (autre) => selection.has(autre.numero);
      montrerGestes({
        carte,
        cadre,
        ecran: racine,
        etapes: [
          { geste: 'toucher', titre: t('Toucher'), texte: t("voir ta réplique, et l'entendre") },
          { geste: 'toucher', titre: t('Toucher encore'), texte: t('pause, ou reprendre') },
          { geste: 'maintenir', titre: t('Appui long'), texte: t("arrêter l'écoute") },
          {
            geste: 'balayer', titre: t('Balayer vers le haut'), texte: t('réplique suivante'), journal,
            apercu: () => suivante && creerReplique(suivante, piece, { mienne: aMoi(suivante), cachee: aMoi(suivante) }),
          },
          passee && {
            geste: 'toucher', titre: t('Toucher une réplique passée'), texte: t('la relire'), cible: passee,
            agir: () => passee.classList.add('en-lecture'),
          },
        ].filter(Boolean),
        // La réplique relue par la démo s'éteint, sauf si elle se relit vraiment entre-temps.
        nettoyer: () => { if (passee && passee !== relue) passee.classList.remove('en-lecture'); },
      });
    });
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
    pauseFichier = false;
    arreterVoix();
    if (!verrouEcran) garderEcranAllume(); // on peut passer à la suite pendant une pause
    // La carte passée reste touchable : la toucher la relit (voir relire).
    carteCourante?.classList.remove('est-cachee', 'courante', 'is-syncing');
    // Une pastille de tuto pas touchée ne reste pas sur une réplique passée : elle reviendra sur ma
    // prochaine réplique, là où ses gestes s'appliquent.
    journal.querySelector('.pastille-tuto')?.remove();
    position += 1;
    if (position >= lignes.length) terminer();
    else jouerEtape();
  }

  // Pause (un toucher sur la réplique qui se lit) : avec les voix enregistrées, le fichier audio s'arrête
  // là où il en est, et la reprise repart de là. La tâche de jouerEtape, qui attend la fin de la
  // lecture, attend simplement plus longtemps. La voix du téléphone, elle, ne sait pas faire de pause
  // sur Android : speechSynthesis.pause() coupe la voix sans jamais prévenir qu'elle a fini (c'est
  // documenté dans le code d'EasySpeech). Pour elle, comme pour une didascalie ou le silence entre
  // deux répliques, la pause est donc un arrêt : la réplique repartira de son début.
  // recentrer : voir afficherCommandes.
  function mettreEnPause({ recentrer = true } = {}) {
    if (etat === 'lecture' && mettreEnPauseVoix()) {
      pauseFichier = true;
      libererEcran();
      etat = 'pause';
      afficherCommandes({ recentrer });
      return;
    }
    arreterLecture({ recentrer });
  }

  // Arrêt (un appui long) : la lecture s'annule pour de bon, même si elle était en pause. Le filage
  // attend ; un toucher (ou Reprendre) relira la réplique depuis son début.
  function arreterLecture({ recentrer = true } = {}) {
    jeton += 1; // la tâche qui attendait la fin de la lecture s'arrête d'elle-même (voir jouerEtape)
    pauseFichier = false;
    arreterVoix();
    libererEcran();
    etat = 'pause';
    afficherCommandes({ recentrer });
  }

  // ---- Relire une réplique passée ----
  //
  // Toucher une réplique déjà passée, plus haut dans le journal, la relit sans bouger l'écran. Ce qui
  // se lisait s'interrompt : la réplique en cours, si l'app la lisait ou l'avait mise en pause,
  // s'arrête (un toucher sur elle la reprendra, depuis son début), et mon écoute s'arrête aussi.
  // Le filage n'avance pas tout seul ensuite. Toucher la réplique passée pendant qu'elle se relit
  // l'arrête.
  let relue = null; // la carte passée qui se relit en ce moment

  async function relire(ligne, carte) {
    if (relue === carte) {
      arreterVoix(); // la lecture se termine : la fin de relire, plus bas, éteint la carte
      return;
    }
    // Sans voix, ou une ligne qui n'est qu'une didascalie : il n'y a rien à faire entendre.
    if (sansVoix || !texteAParler(ligne.texte, lireReglages().lireDidascalies)) return;
    // La réplique en cours s'arrête, même si elle était en pause : il n'y a qu'un lecteur audio, et
    // la relecture va le prendre. Un toucher sur elle la reprendra donc depuis son début.
    if (etat === 'lecture' || pauseFichier) arreterLecture({ recentrer: false });
    ecouteCourante?.arreter();
    relue = carte;
    carte.classList.add('en-lecture');
    journal.classList.add('en-relecture'); // la réplique en cours, interrompue, cède sa couleur (style.css)
    const finirFilet = suivreLecture(carte);
    // La promesse se termine à la fin de la réplique, ou dès qu'une autre lecture prend la place
    // (une autre réplique touchée, la reprise du filage, le geste vers le haut, un arrêt...).
    await lireReplique(ligne);
    finirFilet();
    carte.classList.remove('en-lecture');
    if (relue === carte) {
      relue = null;
      journal.classList.remove('en-relecture');
    }
  }

  function reprendre() {
    garderEcranAllume();
    // Un fichier en pause repart d'où il était ; la tâche de jouerEtape verra sa fin et enchaînera.
    if (pauseFichier && reprendreVoix()) {
      pauseFichier = false;
      etat = 'lecture';
      afficherCommandes();
      return;
    }
    // Sinon (arrêt, voix du téléphone, fichier perdu entre-temps) : la réplique repart de son début.
    pauseFichier = false;
    jouerEtape(true);
  }

  function terminer() {
    etat = 'fin';
    // Plus de réplique en cours : la dernière devient une réplique passée comme les autres, et la
    // toucher la relit.
    carteCourante = null;
    oublierPosition();
    libererEcran();
    const fin = el('p', { className: 'avis fin-piece' }, t('Fin de la pièce.'));
    journal.append(fin);
    remplacer(commandes, el('button', { type: 'button', className: 'btn', onclick: ecranDepart }, t('Recommencer un filage')));
    commandes.hidden = false;
    amenerAuCentre(fin);
  }

  // Si l'utilisateur quitte l'app ou éteint l'écran, on se met en pause plutôt que de continuer
  // dans le vide. Le verrou d'écran, lui, est relâché tout seul quand la page est masquée :
  // il faut le redemander au retour.
  function surVisibilite() {
    // Filage complet : comme dans le Script, une simple pause, que l'on reprend en touchant la carte.
    if (etat === 'complet') {
      if (document.hidden && lectureComplete === 'lecture') pauseComplete();
      return;
    }
    if (document.hidden) {
      if (etat === 'lecture') mettreEnPause();
      else if (!pauseFichier) arreterVoix(); // un fichier en pause garde sa place pour la reprise
    } else if (etat === 'a-moi' || etat === 'manuel') {
      garderEcranAllume();
    }
  }
  document.addEventListener('visibilitychange', surVisibilite);

  // ---- Le lancement ----

  // Lance le filage à partir d'une position. repris : l'app vient d'être relancée par Android au
  // milieu d'un filage. On retrouve alors la réplique, mais à l'arrêt : le navigateur ne laisse
  // parler l'app qu'après un toucher, que la carte touchée ou le geste vers le haut fourniront.
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
    journal.classList.remove('en-relecture');
    // Pas d'interrupteurs Furigana et Traduction ici : ils se règlent avant, sur l'écran de départ.
    remplacer(racine,
      sansVoix && creerAvisVoix(piece),
      journal,
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

  // ---- Le filage complet ----
  //
  // Toutes les répliques sont affichées d'un coup, à partir de la scène choisie, et l'app les lit
  // toutes à la suite, les miennes comprises, sans s'arrêter dessus. Mes répliques restent visibles,
  // dans leur ambre. On le pilote comme la lecture en continu du Script : toucher la réplique lue la
  // met en pause, puis la reprend ; toucher une autre réplique fait repartir la lecture de celle-là ;
  // garder le doigt sur une carte arrête tout.
  let lectureComplete = 'arret'; // 'arret', 'lecture' ou 'pause'
  let carteLue = null;           // la carte que le filage complet est en train de lire
  let suiteComplete = [];        // les répliques affichées, de la scène choisie jusqu'à la fin
  const cartesCompletes = new Map(); // chaque réplique -> sa carte

  // repris : l'app vient d'être relancée par Android. Le texte revient, mais à l'arrêt : le
  // navigateur ne laisse parler l'app qu'après un toucher (toucher une carte relance la lecture).
  function filageComplet(depart, { repris = false } = {}) {
    etat = 'complet';
    jeton += 1;
    lectureComplete = 'arret';
    carteLue = null;
    definirRetour(ecranDepart); // la flèche de retour ramène à l'écran de départ, en coupant la voix
    noterPosition('filage', { position: depart, complet: true });

    const statuts = lireStatuts(piece.id);
    suiteComplete = lignes.slice(depart);
    cartesCompletes.clear();
    cadreTutoComplet = null; // refait plus bas, si le tuto n'a pas encore été vu
    // Seulement les scènes qui ont des répliques dans la suite : celles d'avant le départ n'y sont pas.
    const scenes = piece.scenes.filter((scene) => suiteComplete.some((ligne) => ligne.scene === scene));
    remplacer(racine, scenes.map((scene) => el('section', { className: 'scene' },
      creerTitreScene(scene),
      suiteComplete.filter((ligne) => ligne.scene === scene).map((ligne) => {
        const carte = creerReplique(ligne, piece, {
          mienne: selection.has(ligne.numero),
          statut: statuts[ligne.numero],
          surTouche: (evenement) => toucherComplet(evenement, ligne),
        });
        brancherGestes(carte, { maintenir: () => { if (carteLue) arreterComplet(); } });
        cartesCompletes.set(ligne, carte);
        // La première carte porte la pastille du tuto, dans un cadre (la carte est un bouton).
        if (ligne !== suiteComplete[0] || !tutoAVoir('filage-complet')) return carte;
        cadreTutoComplet = el('div', { className: 'cadre-tuto' }, carte);
        return cadreTutoComplet;
      }))));
    if (cadreTutoComplet) proposerTutoComplet(cadreTutoComplet);
    if (repris) return; // le routeur remet lui-même l'écran là où il en était
    hautDePage(); // le bouton touché était plus bas : le texte, lui, commence en haut
    cascade(racine);
    lireEnContinu(0);
  }

  // Le tuto du filage complet, comme celui du Script : sur la carte qui se lit (sinon la première) et
  // la suivante. La lecture se met en pause pendant la démo (c'est ce que montre le premier toucher),
  // et reprend à la fin, pour que la démo finisse là où elle a commencé.
  let cadreTutoComplet = null;
  function proposerTutoComplet(cadre) {
    proposerTuto('filage-complet', cadre, () => {
      const cartes = [...cartesCompletes.values()];
      const lue = carteLue ?? cartes[0];
      const suivante = cartes[cartes.indexOf(lue) + 1];
      const misEnPause = lectureComplete === 'lecture';
      if (misEnPause) pauseComplete();
      racine.classList.add('ancre-tuto'); // le doigt se pose dans l'écran entier : la carte lue peut être loin
      montrerGestes({
        carte: lue,
        cadre: racine,
        ecran: racine,
        etapes: [
          { geste: 'toucher', titre: t('Toucher'), texte: t('pause, ou reprendre') },
          suivante && { geste: 'toucher', titre: t('Toucher une autre réplique'), texte: t('la lecture repart de là'), cible: suivante },
          { geste: 'maintenir', titre: t('Appui long'), texte: t("arrêter l'écoute") },
        ].filter(Boolean),
        fin: () => { if (misEnPause && lectureComplete === 'pause') repriseComplete(); },
        nettoyer: () => racine.classList.remove('ancre-tuto'),
      });
    });
  }

  // La carte lue se distingue par sa couleur (sauf la mienne, qui garde son ambre) et par le filet
  // qui en fait le tour à mesure de la lecture.
  function allumer(carte) {
    eteindre();
    carteLue = carte;
    lectureComplete = 'lecture';
    carte.classList.add('en-lecture');
  }

  function eteindre() {
    carteLue?.classList.remove('en-lecture');
    carteLue = null;
    lectureComplete = 'arret';
  }

  // Lit la réplique de rang « debut » dans la suite, puis les suivantes, jusqu'à la fin ou un arrêt.
  async function lireEnContinu(debut) {
    jeton += 1;
    const moi = jeton;
    for (let rang = debut; rang < suiteComplete.length; rang += 1) {
      const ligne = suiteComplete[rang];
      const carte = cartesCompletes.get(ligne);
      allumer(carte);
      // L'écran suit la lecture. Sauf pour la première carte : on vient de la toucher, ou c'est la
      // première du texte, elle est déjà visible.
      if (rang === debut) garderEcranAllume();
      else carte.scrollIntoView({ block: 'center' });

      let resultat = 'fini';
      if (texteAParler(ligne.texte, lireReglages().lireDidascalies)) {
        const finirFilet = suivreLecture(carte);
        resultat = await lireReplique(ligne);
        finirFilet();
      } else {
        await attendre(DUREE_LIGNE_MUETTE); // une ligne qui n'est qu'une didascalie : le temps de la lire
      }
      if (moi !== jeton) return; // arrêtée, ou une autre réplique a été touchée entre-temps
      if (resultat !== 'fini') break; // lecture impossible (lireReplique l'a déjà signalé)
      await attendre(SILENCE_ENTRE_REPLIQUES);
      // Mise en pause entre deux répliques : on attend la reprise avant de passer à la suivante.
      while (lectureComplete === 'pause' && moi === jeton) await attendre(150);
      if (moi !== jeton) return;
    }
    eteindre();
    libererEcran();
  }

  // Pause : avec les voix enregistrées, la réplique garde sa place. La voix du téléphone, elle,
  // ne sait pas faire de pause sur Android : la lecture s'arrête, et un nouveau toucher repart
  // du début de la réplique.
  function pauseComplete() {
    mettreEnPauseVoix();
    lectureComplete = 'pause';
    libererEcran();
  }

  function repriseComplete() {
    lectureComplete = 'lecture';
    // Un fichier mis en pause repart d'où il était. Entre deux répliques, rien à relancer :
    // la boucle de lireEnContinu voit la reprise et passe d'elle-même à la suivante.
    reprendreVoix();
    garderEcranAllume();
  }

  function arreterComplet() {
    jeton += 1;
    arreterVoix();
    eteindre();
    libererEcran();
  }

  function toucherComplet(evenement, ligne) {
    if (evenement.currentTarget !== carteLue) lireEnContinu(suiteComplete.indexOf(ligne));
    else if (lectureComplete === 'lecture') pauseComplete();
    else repriseComplete();
  }

  // ---- L'écran de départ ----

  function ecranDepart() {
    etat = 'depart';
    jeton += 1;
    pauseFichier = false;
    arreterVoix(); // par exemple une réplique passée qu'on relisait, quand on touche « Recommencer »
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
      // Furigana et Traduction se choisissent ici, juste avant de lancer : pendant le filage, l'écran
      // ne montre que les répliques.
      creerInterrupteurs(piece.id),
      // Ce toucher autorise aussi le navigateur à parler pour toute la suite du filage.
      el('button', { type: 'button', className: 'btn', onclick: () => demarrer(depart) }, t('Lancer le filage')),
      el('button', { type: 'button', className: 'btn-ghost', onclick: () => filageComplet(depart) }, t('Lancer le filage complet')),
    );
    cascade(racine);
  }

  // L'app vient-elle d'être relancée au milieu d'un filage, normal ou complet ? On y revient.
  // Sinon, l'écran de départ.
  const reprise = positionAReprendre('filage');
  if (reprise && reprise.position < lignes.length) {
    if (reprise.complet) filageComplet(reprise.position, { repris: true });
    else demarrer(reprise.position, { repris: true });
  } else {
    ecranDepart();
  }

  // Appelé par le routeur quand on quitte l'écran : on coupe tout ce qui tourne encore.
  return () => {
    jeton += 1;
    etat = 'depart';
    document.removeEventListener('visibilitychange', surVisibilite);
    balayage.arreter();
    libererEcran();
  };
}
