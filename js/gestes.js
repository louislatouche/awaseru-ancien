// Les gestes sur ma réplique, pour le mode Gestes du réglage Navigation.
//
// Toucher la carte reste un simple « click », géré par la carte elle-même (voir creerReplique).
// Ce fichier ajoute trois gestes :
// - l'appui long : garder le doigt une demi-seconde sur la carte ;
// - le glissement : tirer la carte à droite ou à gauche, comme une carte qu'on écarte d'un paquet ;
// - le balayage du filage, tout en bas du fichier : pousser l'écran vers le haut pour la suite.
//
// Le navigateur garde le défilement vertical (touch-action: pan-y dans style.css) : un doigt qui
// part vers le haut ou le bas fait défiler l'écran, un doigt qui part sur le côté tire la carte.

import { el, icone } from './dom.js';

const SEUIL = 0.3;            // part de la largeur de la carte à dépasser pour valider un glissement
const VITESSE_LANCER = 0.6;   // pixels par milliseconde : un geste vif valide même s'il est court...
const DISTANCE_LANCER = 40;   // ... à condition d'avoir quand même parcouru 40 pixels
const DUREE_APPUI_LONG = 550; // millisecondes
const DUREE_DEPART = 200;     // millisecondes pour que la carte quitte l'écran

const mouvementReduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// carte : l'élément qui réagit au doigt.
// maintenir : appelée après un appui long (null : pas d'appui long).
// glisser : null (la carte ne glisse pas), ou { droite, gauche, permis, refus } :
//   droite et gauche : { icone, libelle, action }, ce que fait chaque sens ;
//   permis() dit si la carte peut partir maintenant ; sinon elle revient, et refus() est appelée.
//
// Renvoie l'élément à placer dans la page : la carte elle-même, ou, si elle glisse, un cadre qui
// contient la carte et, dessous, les deux indices qu'elle découvre en s'écartant.
export function brancherGestes(carte, { maintenir = null, glisser = null }) {
  let doigt = null;        // le doigt posé : son numéro et l'endroit où il s'est posé
  let sens = null;         // null tant qu'on ne sait pas, puis 'cote' (la carte suit) ou 'defile'
  let ecart = 0;           // de combien le doigt est allé à droite (positif) ou à gauche (négatif)
  let precedent = null;    // la position et l'heure du mouvement d'avant, pour mesurer la vitesse
  let vitesse = 0;
  let ignorerClic = false; // après un glissement ou un appui long, le « click » du lâcher ne compte pas
  let minuterie = null;

  // Sous la carte, de chaque côté, ce que fait le geste. Glisser à droite découvre le côté gauche.
  let indiceDroite = null;
  let indiceGauche = null;
  let cadre = carte;
  if (glisser) {
    indiceDroite = el('div', { className: 'indice-glisse indice-droite', 'aria-hidden': 'true' },
      icone(glisser.droite.icone), glisser.droite.libelle);
    indiceGauche = el('div', { className: 'indice-glisse indice-gauche', 'aria-hidden': 'true' },
      glisser.gauche.libelle, icone(glisser.gauche.icone));
    carte.classList.add('carte-glissable');
    cadre = el('div', { className: 'cadre-glisse' }, indiceDroite, indiceGauche, carte);
  }

  // La carte suit le doigt et penche un peu ; l'indice du bon côté apparaît à mesure.
  function placer(decalage) {
    const penche = mouvementReduit() ? 0 : decalage / 25;
    carte.style.transform = `translateX(${decalage}px) rotate(${penche}deg)`;
    const part = Math.min(Math.abs(decalage) / (carte.offsetWidth * SEUIL), 1);
    indiceDroite.style.opacity = decalage > 0 ? part : 0;
    indiceGauche.style.opacity = decalage < 0 ? part : 0;
  }

  // Pas assez loin, ou pas encore permis : la carte revient en souplesse à sa place.
  function revenir() {
    carte.classList.remove('en-glisse');
    carte.style.transition = 'transform .25s cubic-bezier(.22, 1, .36, 1)'; // la courbe « feutre » de style.css
    carte.style.transform = '';
    indiceDroite.style.opacity = 0;
    indiceGauche.style.opacity = 0;
    setTimeout(() => { carte.style.transition = ''; }, 250);
  }

  // Le glissement est validé : la carte sort de l'écran de son côté, puis l'action se fait.
  function partir(cote, signe) {
    navigator.vibrate?.(15);
    if (mouvementReduit()) {
      cote.action();
      return;
    }
    carte.style.transition = `transform ${DUREE_DEPART}ms ease-in, opacity ${DUREE_DEPART}ms ease-in`;
    carte.style.transform = `translateX(${signe * carte.offsetWidth * 1.2}px) rotate(${signe * 14}deg)`;
    carte.style.opacity = '0';
    setTimeout(cote.action, DUREE_DEPART);
  }

  function abandonner() {
    clearTimeout(minuterie);
    minuterie = null;
    if (sens === 'cote') revenir();
    doigt = null;
    sens = null;
  }

  carte.addEventListener('pointerdown', (evenement) => {
    // Un doigt qui se pose ouvre un nouveau toucher : ce que le précédent avait demandé d'ignorer ne
    // compte plus. (Après un glissement, le navigateur n'envoie souvent aucun « click » : sans cette
    // remise à zéro ici, le toucher suivant pouvait être avalé.)
    ignorerClic = false;
    // Un second doigt pendant le geste : on abandonne, ce n'était ni un toucher ni un glissement.
    if (doigt) {
      abandonner();
      return;
    }
    doigt = { numero: evenement.pointerId, type: evenement.pointerType, x: evenement.clientX, y: evenement.clientY };
    sens = null;
    ecart = 0;
    precedent = { ecart: 0, temps: evenement.timeStamp };
    vitesse = 0;
    if (maintenir) minuterie = setTimeout(appuiLong, DUREE_APPUI_LONG);
  });

  // L'appui long est reconnu : un petit retour sous le doigt (sur les téléphones qui vibrent), et le
  // « click » que le navigateur enverra peut-être au lâcher ne comptera pas.
  function appuiLong() {
    clearTimeout(minuterie);
    minuterie = null;
    ignorerClic = true;
    navigator.vibrate?.(20);
    maintenir();
  }

  carte.addEventListener('pointermove', (evenement) => {
    if (!doigt || evenement.pointerId !== doigt.numero) return;
    const ecartX = evenement.clientX - doigt.x;
    const ecartY = evenement.clientY - doigt.y;

    if (sens === null) {
      if (Math.hypot(ecartX, ecartY) < 10) return; // le doigt tremble à peine : c'est encore un toucher
      clearTimeout(minuterie); // il bouge : ce n'est plus un appui long...
      minuterie = null;
      ignorerClic = true;      // ... ni un toucher
      // Plus horizontal que vertical : on tire la carte. Sinon, on laisse l'écran défiler.
      sens = glisser && Math.abs(ecartX) > Math.abs(ecartY) ? 'cote' : 'defile';
      if (sens === 'cote') {
        // La carte reçoit toute la suite du geste, même si le doigt sort de son cadre.
        // (Si le doigt a déjà été retiré entre-temps, le navigateur refuse : on suit sans.)
        try {
          carte.setPointerCapture(doigt.numero);
        } catch {
          // rien à faire : la carte suivra le doigt tant qu'il reste dessus
        }
        carte.classList.add('en-glisse');
      }
    }
    if (sens !== 'cote') return;

    if (evenement.timeStamp > precedent.temps) {
      vitesse = (ecartX - precedent.ecart) / (evenement.timeStamp - precedent.temps);
    }
    precedent = { ecart: ecartX, temps: evenement.timeStamp };
    ecart = ecartX;
    // Pas encore permis (réplique ni vue ni écoutée) : la carte résiste, elle ne bouge qu'à peine.
    placer(glisser.permis() ? ecart : ecart * 0.25);
  });

  carte.addEventListener('pointerup', (evenement) => {
    if (!doigt || evenement.pointerId !== doigt.numero) return;
    clearTimeout(minuterie);
    minuterie = null;
    const surLeCote = sens === 'cote';
    doigt = null;
    sens = null;
    if (!surLeCote) return;

    carte.classList.remove('en-glisse');
    const assezLoin = Math.abs(ecart) > carte.offsetWidth * SEUIL;
    const lance = Math.abs(vitesse) > VITESSE_LANCER && Math.abs(ecart) > DISTANCE_LANCER
      && Math.sign(vitesse) === Math.sign(ecart);
    if (!assezLoin && !lance) {
      revenir();
      return;
    }
    if (!glisser.permis()) {
      revenir();
      glisser.refus?.();
      return;
    }
    partir(ecart > 0 ? glisser.droite : glisser.gauche, Math.sign(ecart));
  });

  // Le navigateur reprend le geste (le doigt est parti faire défiler l'écran) : la carte revient.
  carte.addEventListener('pointercancel', abandonner);

  // Après un glissement ou un appui long, le navigateur envoie quand même un « click » au lâcher.
  // On l'arrête ici, avant que la carte ne le prenne pour un toucher : un écouteur en phase de
  // capture passe avant le onclick de la carte elle-même.
  carte.addEventListener('click', (evenement) => {
    if (!ignorerClic) return;
    ignorerClic = false;
    evenement.stopImmediatePropagation();
  }, { capture: true });
  // Sur Android, le navigateur reconnaît lui-même l'appui long : c'est l'événement contextmenu, qui
  // ouvrirait son menu (copier, partager...). On l'en empêche, et on s'en sert : l'appui long compte
  // dès cet instant, sans attendre notre minuterie. Car un navigateur peut couper le toucher juste
  // après (pointercancel), et notre minuterie n'aurait alors jamais sonné. Le doigt doit être encore
  // posé sans avoir bougé, et la minuterie encore en attente : sinon, c'est un autre geste.
  if (maintenir) {
    carte.addEventListener('contextmenu', (evenement) => {
      evenement.preventDefault();
      if (doigt?.type === 'touch' && sens === null && minuterie) appuiLong();
    });
  }

  return cadre;
}

// ---- Le balayage vers le haut, pour le filage en mode Gestes ----
//
// En bas du journal du filage, là où se trouve la réplique en cours, pousser le journal vers le
// haut fait passer à la réplique suivante. Le doigt qui descend, lui, fait défiler l'écran
// normalement, pour relire les répliques passées. C'est le rôle de touch-action: pan-up (dans
// style.css) : le navigateur garde le défilement vers le haut (le doigt qui descend, malgré le nom)
// et nous laisse l'autre sens. Une fois remonté dans le journal, l'écran défile dans les deux sens,
// comme partout ailleurs : le geste ne reprend qu'une fois revenu en bas.
//
// Sur un écran tactile, tous les mouvements d'un doigt sont envoyés à l'élément où il s'est posé
// (la carte touchée, par exemple), puis remontent jusqu'à la zone : elle les voit donc tous.

const SEUIL_BALAYAGE = 60; // pixels à parcourir vers le haut pour valider
const AMORTI = 0.35;       // la zone suit le doigt, mais de loin : un tiers de son trajet
const MARGE_BOUT = 40;     // pixels : à moins de cette distance du bas, l'écran est « en bas du journal »
const DUREE_POURSUITE = 350; // millisecondes pour que l'écran, lancé par le doigt, atteigne la réplique suivante

// zone : l'élément qui reçoit le geste.
// suivant : appelée quand le doigt pousse la zone vers le haut, en bas du journal.
// permis() : faux si le geste ne mène nulle part (la pièce est finie) : la zone résiste alors,
//   et revient sans rien faire.
// Renvoie { amener, arreter } : amener(element) fait défiler l'écran jusqu'à l'élément, par une
// course que le doigt arrête (voir amener) ; arreter() s'appelle quand l'écran disparaît.
export function brancherBalayage(zone, { suivant, permis = () => true }) {
  let doigt = null;        // le doigt posé : son numéro et l'endroit où il s'est posé
  let sens = null;         // null tant qu'on ne sait pas, puis 'haut' (la zone suit) ou 'ignore'
  let ecart = 0;           // de combien le doigt est monté (en négatif, comme les coordonnées)
  let precedent = null;    // la position et l'heure du mouvement d'avant, pour mesurer la vitesse
  let vitesse = 0;
  let ignorerClic = false; // après un balayage, le « click » du lâcher ne compte pas
  let decalageZone = 0;    // de combien la zone suit le doigt en ce moment (négatif : vers le haut)
  let poursuite = null;    // pendant que l'écran file vers un élément : { cible, image }
  let instantane = false;  // pendant l'action d'un balayage : amener() saute sans animer (voir poursuivre)
  let glissade = null;     // l'animation qui ramène la zone quand l'écran ne peut pas défiler
  const ecran = document.getElementById('ecran'); // la zone principale de l'app, celle qui défile

  zone.classList.add('zone-balayable');

  // Remonté dans le journal ? La classe zone-remontee rend alors le défilement normal (style.css).
  // Le navigateur lit touch-action au moment où le doigt se pose : elle doit être prête avant.
  // Pendant la poursuite, l'écran file vers le bas du journal : on le compte déjà comme arrivé.
  function suivreDefilement() {
    const resteEnDessous = ecran.scrollHeight - ecran.clientHeight - ecran.scrollTop;
    zone.classList.toggle('zone-remontee', !poursuite && resteEnDessous > MARGE_BOUT);
  }
  ecran.addEventListener('scroll', suivreDefilement, { passive: true });

  function placer(decalage) {
    if (mouvementReduit()) return;
    decalageZone = decalage;
    zone.style.transform = `translateY(${decalage}px)`;
  }

  // Geste trop court, ou qui ne mène nulle part : la zone revient en souplesse à sa place, avec la
  // courbe « feutre » de style.css.
  function revenir() {
    zone.classList.remove('en-glisse');
    decalageZone = 0;
    if (!zone.style.transform) return;
    zone.style.transition = 'transform .25s cubic-bezier(.22, 1, .36, 1)';
    zone.style.transform = '';
    setTimeout(() => { zone.style.transition = ''; }, 250);
  }

  // L'écran défile jusqu'à « cible », image après image : vite au départ, comme lancé par le doigt,
  // puis en douceur. (Le défilement doux du navigateur, lui, démarre lentement.)
  // Pourquoi animer soi-même plutôt que laisser le navigateur faire un défilement doux ? Pour
  // pouvoir l'arrêter net quand un doigt se pose (voir arreterPoursuite).
  function defilerJusqua(cible) {
    if (poursuite) cancelAnimationFrame(poursuite.image); // une seule course à la fois
    const depart = ecran.scrollTop;
    const debut = performance.now();
    const image = (maintenant) => {
      const avance = Math.min(Math.max((maintenant - debut) / DUREE_POURSUITE, 0), 1);
      const courbe = 1 - (1 - avance) ** 3; // part vite, finit en douceur
      if (avance < 1) poursuite.image = requestAnimationFrame(image);
      else poursuite = null;
      ecran.scrollTo({ top: depart + (cible - depart) * courbe, behavior: 'instant' });
      if (!poursuite) suivreDefilement(); // arrivé : la position est la vraie, on la note
    };
    poursuite = { cible, image: requestAnimationFrame(image) };
  }

  // Un doigt se pose pendant que l'écran file encore : l'écran s'arrête là où il est, comme une
  // liste qu'on touche en plein élan. Surtout, rien ne bouge plus sous le doigt : un toucher
  // atteint ce que l'on visait. (Le faire sauter au bout, comme avant, déplaçait les cartes sous le
  // doigt, et le toucher tombait à côté.)
  function arreterPoursuite() {
    glissade?.finish();
    if (!poursuite) return;
    cancelAnimationFrame(poursuite.image);
    poursuite = null;
    suivreDefilement();
  }

  // Amène un élément au centre de l'écran. Le navigateur calcule la bonne position (scrollIntoView,
  // qui tient compte des barres, voir scroll-padding dans style.css), d'un coup et sans dessiner ;
  // on revient au point de départ, puis on parcourt la distance avec notre propre course.
  // Pendant l'action d'un balayage, on saute directement : c'est poursuivre() qui animera.
  function amener(element) {
    const avant = ecran.scrollTop;
    ecran.style.scrollBehavior = 'auto'; // sans le défilement doux de style.css...
    element.scrollIntoView({ block: 'center' });
    ecran.style.scrollBehavior = '';     // ... qui revient aussitôt
    if (instantane || mouvementReduit()) return;
    const cible = ecran.scrollTop;
    if (cible === avant) return;
    ecran.scrollTo({ top: avant, behavior: 'instant' });
    defilerJusqua(cible);
  }

  // Geste validé : rien ne revient en arrière, l'écran poursuit sa course vers le haut.
  //
  // Deux pièges évités ici :
  // - le rebond : si la zone revenait à sa place (vers le bas) pendant que l'écran défile jusqu'à
  //   la nouvelle réplique (vers le haut), les deux mouvements se contrarieraient ;
  // - le blocage : une zone décalée vers le bas agrandit un instant la hauteur à faire défiler, et
  //   l'app se croyait alors remontée dans le journal (voir suivreDefilement), le doigt n'y pouvait
  //   plus rien. On ne décale donc jamais la zone vers le bas : c'est l'écran lui-même qui défile.
  // 1. on fait l'action en sautant directement à la nouvelle réplique, sans défilement doux ;
  // 2. on remet l'écran là où le doigt avait laissé la zone : à la vue, rien n'a bougé ;
  // 3. on fait défiler l'écran de là jusqu'à la nouvelle réplique, en une seule course.
  function poursuivre(action) {
    zone.classList.remove('en-glisse');
    const decalage = decalageZone;
    zone.style.transition = '';
    zone.style.transform = '';
    decalageZone = 0;
    const avant = ecran.scrollTop;
    instantane = true; // l'action amène la nouvelle réplique à l'écran d'un coup (voir amener)...
    action();
    instantane = false; // ... et c'est ici que l'on anime
    if (mouvementReduit()) return;
    const cible = ecran.scrollTop;
    // Ce que le contenu doit encore monter à l'écran, depuis l'endroit où le doigt l'a laissé.
    const reste = (cible - avant) + decalage;
    if (reste > 0) {
      ecran.scrollTo({ top: cible - reste, behavior: 'instant' });
      defilerJusqua(cible);
    } else if (reste < 0) {
      // Le journal est encore trop court pour défiler : la zone, restée un peu haut, redescend
      // doucement à sa place. element.animate() : le navigateur l'anime d'un état à l'autre.
      glissade = zone.animate(
        [{ transform: `translateY(${reste}px)` }, { transform: 'none' }],
        { duration: 250, easing: 'cubic-bezier(.22, 1, .36, 1)' },
      );
    }
  }

  function abandonner() {
    if (sens === 'haut') revenir();
    doigt = null;
    sens = null;
  }

  zone.addEventListener('pointerdown', (evenement) => {
    ignorerClic = false; // un nouveau toucher : ce que le précédent demandait d'ignorer ne compte plus
    arreterPoursuite();  // l'écran s'arrête sous le doigt, même si c'est un second doigt
    // Un second doigt pendant le geste : on abandonne.
    if (doigt) {
      abandonner();
      return;
    }
    doigt = { numero: evenement.pointerId, x: evenement.clientX, y: evenement.clientY };
    sens = null;
    ecart = 0;
    precedent = { ecart: 0, temps: evenement.timeStamp };
    vitesse = 0;
  });

  zone.addEventListener('pointermove', (evenement) => {
    if (!doigt || evenement.pointerId !== doigt.numero) return;
    const ecartX = evenement.clientX - doigt.x;
    const ecartY = evenement.clientY - doigt.y;

    if (sens === null) {
      if (Math.hypot(ecartX, ecartY) < 10) return; // le doigt tremble à peine : c'est encore un toucher
      ignorerClic = true; // il bouge : ce n'est plus un toucher
      // Le doigt monte (plus qu'il ne va sur le côté) et l'écran est en bas du journal : la zone
      // suit. Sinon, c'est un défilement normal, ou rien : le navigateur s'en charge.
      const monte = ecartY < 0 && Math.abs(ecartY) > Math.abs(ecartX);
      sens = monte && !zone.classList.contains('zone-remontee') ? 'haut' : 'ignore';
      if (sens === 'haut') zone.classList.add('en-glisse');
    }
    if (sens !== 'haut') return;

    if (evenement.timeStamp > precedent.temps) {
      vitesse = (ecartY - precedent.ecart) / (evenement.timeStamp - precedent.temps);
    }
    precedent = { ecart: ecartY, temps: evenement.timeStamp };
    ecart = Math.min(ecartY, 0); // si le doigt redescend plus bas que son départ, la zone s'arrête à sa place
    // Un geste qui ne mène nulle part : la zone résiste davantage, elle ne bouge qu'à peine.
    placer(ecart * (permis() ? AMORTI : AMORTI / 4));
  });

  zone.addEventListener('pointerup', (evenement) => {
    if (!doigt || evenement.pointerId !== doigt.numero) return;
    const versLeHaut = sens === 'haut';
    doigt = null;
    sens = null;
    if (!versLeHaut) return;

    // Les écarts et la vitesse sont négatifs vers le haut : on compare donc leur opposé.
    const assezLoin = -ecart > SEUIL_BALAYAGE;
    const lance = -vitesse > VITESSE_LANCER && -ecart > DISTANCE_LANCER;
    if ((!assezLoin && !lance) || !permis()) {
      revenir();
      return;
    }
    navigator.vibrate?.(15);
    poursuivre(suivant);
  });

  // Le navigateur prend la main (le doigt est parti faire défiler l'écran) : la zone revient.
  zone.addEventListener('pointercancel', abandonner);

  // Comme pour la carte plus haut : le « click » qui suit un balayage ne doit rien déclencher. Cet
  // écouteur en phase de capture passe avant ceux des cartes, qui sont à l'intérieur de la zone.
  zone.addEventListener('click', (evenement) => {
    if (!ignorerClic) return;
    ignorerClic = false;
    evenement.stopImmediatePropagation();
  }, { capture: true });

  function arreter() {
    arreterPoursuite();
    ecran.removeEventListener('scroll', suivreDefilement);
  }

  return { amener, arreter };
}
