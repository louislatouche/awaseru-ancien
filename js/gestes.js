// Les gestes sur ma réplique, pour le mode Gestes du réglage Navigation.
//
// Toucher la carte reste un simple « click », géré par la carte elle-même (voir creerReplique).
// Ce fichier ajoute deux gestes :
// - l'appui long : garder le doigt une demi-seconde sur la carte ;
// - le glissement : tirer la carte à droite ou à gauche, comme une carte qu'on écarte d'un paquet.
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
    if (sens === 'cote') revenir();
    doigt = null;
    sens = null;
  }

  carte.addEventListener('pointerdown', (evenement) => {
    // Un second doigt pendant le geste : on abandonne, ce n'était ni un toucher ni un glissement.
    if (doigt) {
      abandonner();
      return;
    }
    doigt = { numero: evenement.pointerId, x: evenement.clientX, y: evenement.clientY };
    sens = null;
    ecart = 0;
    precedent = { ecart: 0, temps: evenement.timeStamp };
    vitesse = 0;
    ignorerClic = false;
    if (maintenir) {
      minuterie = setTimeout(() => {
        ignorerClic = true;
        navigator.vibrate?.(20); // un petit retour sous le doigt, sur les téléphones qui vibrent
        maintenir();
      }, DUREE_APPUI_LONG);
    }
  });

  carte.addEventListener('pointermove', (evenement) => {
    if (!doigt || evenement.pointerId !== doigt.numero) return;
    const ecartX = evenement.clientX - doigt.x;
    const ecartY = evenement.clientY - doigt.y;

    if (sens === null) {
      if (Math.hypot(ecartX, ecartY) < 10) return; // le doigt tremble à peine : c'est encore un toucher
      clearTimeout(minuterie); // il bouge : ce n'est plus un appui long...
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
  if (maintenir) carte.addEventListener('contextmenu', (evenement) => evenement.preventDefault()); // pas de menu Android

  return cadre;
}
