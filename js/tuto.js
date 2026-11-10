// Les tutos : montrer les gestes qui ne se devinent pas (appui long, glissement...).
//
// Une pastille « ? » respire au coin d'une carte. Rien ne s'impose : tant qu'on ne la touche pas,
// elle attend. Touchée, elle disparaît pour de bon sur cet écran, et un doigt fantôme fait les
// gestes sur la vraie carte, pendant qu'une légende dit ce que chacun provoque.
//
// Choix de Louis (2026-11-10), parmi huit démos : la pastille, parce qu'elle « n'est pas intrusive ».
// Elle part une fois touchée. Éteindre puis rallumer « Tutos », dans les Réglages, les remet toutes.

import { el } from './dom.js';
import { t } from './langues.js';
import { changerReglage, lireReglages } from './stockage.js';

const ARRET = Symbol('tuto arrêté');
const DOUCE = 'cubic-bezier(.4, 0, .2, 1)';
const FEUTRE = 'cubic-bezier(.22, 1, .36, 1)'; // la même que --feutre dans style.css
const SEUIL = 0.3; // comme dans gestes.js : la part de la largeur qui fait partir la carte
const ECART = 70; // de combien le doigt écarte la carte : assez pour voir l'indice, sans la faire partir

const mouvementReduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Les glyphes des gestes, dans la légende. Tous partent d'un point, le doigt : une onde autour pour
// toucher, un anneau pour l'appui long, deux flèches pour glisser. Ce sont des dessins fixes, écrits
// ici : innerHTML ne reçoit jamais rien qui vienne d'un fichier de pièce.
const GLYPHES = {
  toucher: '<svg class="glyphe-tuto" viewBox="0 0 24 24" aria-hidden="true"><circle class="trait-glyphe leger" cx="12" cy="12" r="8.5"/><circle class="point-glyphe" cx="12" cy="12" r="3.6"/></svg>',
  maintenir: '<svg class="glyphe-tuto" viewBox="0 0 24 24" aria-hidden="true"><circle class="trait-glyphe pale" cx="12" cy="12" r="8.5"/><path class="trait-glyphe" d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/><circle class="point-glyphe" cx="12" cy="12" r="3.6"/></svg>',
  glisser: '<svg class="glyphe-tuto" viewBox="0 0 24 24" aria-hidden="true"><path class="trait-glyphe" d="M6 8.5 2.5 12 6 15.5M18 8.5l3.5 3.5-3.5 3.5"/><circle class="point-glyphe" cx="12" cy="12" r="3.6"/></svg>',
};

function glyphe(geste) {
  const modele = document.createElement('template');
  modele.innerHTML = GLYPHES[geste];
  return modele.content.firstChild;
}

// Pose la pastille du tuto « nom » dans « ancre » (un élément en position: relative, qui contient
// la carte), sauf si les tutos sont éteints ou si celui-ci a déjà été vu. montrer() joue la démo.
// cote : 'droite' (le coin haut droit, d'habitude) ou 'gauche', quand un bouton occupe déjà la droite.
export function proposerTuto(nom, ancre, montrer, { cote = 'droite' } = {}) {
  const { tutos, tutosVus } = lireReglages();
  if (!tutos || tutosVus.includes(nom)) return;
  const pastille = el('button', {
    type: 'button',
    className: `pastille-tuto${cote === 'gauche' ? ' a-gauche' : ''}`,
    'aria-label': t('Voir les gestes de cette carte'),
    onclick: (evenement) => {
      evenement.stopPropagation(); // la carte qui la porte ne doit pas croire qu'on l'a touchée
      changerReglage('tutosVus', [...lireReglages().tutosVus, nom]);
      pastille.remove();
      montrer();
    },
  }, '?');
  ancre.append(pastille);
}

// Le doigt fantôme fait les gestes sur la carte, un par un, chacun avec sa légende.
// carte : la vraie carte ; cadre : l'élément où se pose le doigt (il défile donc avec la carte) :
// la carte elle-même, ou le cadre qui la contient avec ses indices de glissement ; ecran : où
// poser la légende ; fin() : appelée quand la démo est allée jusqu'au bout.
// etapes : [{ geste: 'toucher' | 'maintenir' | 'glisser', sens: 1 (droite) ou -1, titre, texte,
//   cible, agir }]. cible : ce que le doigt touche, si ce n'est pas la carte entière (un mot, un
//   numéro), ou une fonction qui le trouve au moment voulu. agir() : ce que le toucher fait pour de
//   vrai, quand c'est sans risque (déplier une carte de la liste, par exemple).
//
// Sinon, la démo ne fait rien pour de vrai : une réplique cachée le reste (la montrer gâcherait
// l'exercice), rien ne se lit, rien n'est noté. Si le vrai doigt se pose sur la carte, elle s'arrête.
export async function montrerGestes({ carte, cadre = carte, ecran, etapes, fin = null }) {
  const doigt = el('div', { className: 'doigt-tuto', 'aria-hidden': 'true' }, el('span', { className: 'doigt-point' }));
  doigt.insertAdjacentHTML('beforeend', '<svg class="doigt-anneau" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" pathLength="100"/></svg>');
  const anneau = doigt.querySelector('circle');
  const point = doigt.querySelector('.doigt-point');
  const legende = el('div', { className: 'legende-tuto', role: 'status' });
  const indiceDroite = cadre.querySelector('.indice-droite');
  const indiceGauche = cadre.querySelector('.indice-gauche');
  cadre.append(doigt);
  ecran.append(legende);
  // Une barre est collée en bas de l'écran (Réviser, l'explication d'un mot) : la légende se pose
  // juste au-dessus, pour ne pas la cacher.
  const barre = ecran.querySelector('.commandes:not([hidden])');
  if (barre) legende.style.bottom = `calc(var(--place-bas) + ${barre.offsetHeight + 12}px)`;

  // Toutes les animations de la démo, pour les défaire d'un coup à la fin.
  const animations = new Set();
  let arrete = false;
  const arreter = () => { arrete = true; };
  carte.addEventListener('pointerdown', arreter, { once: true });

  // Une animation de la démo. fill: 'forwards' garde l'état d'arrivée jusqu'au nettoyage final.
  async function animer(element, images, options) {
    if (arrete || !cadre.isConnected) throw ARRET;
    const animation = element.animate(images, { fill: 'forwards', ...options });
    animations.add(animation);
    try {
      await animation.finished;
    } catch {
      throw ARRET; // annulée
    }
    if (arrete || !cadre.isConnected) throw ARRET; // le doigt s'est posé, ou l'écran a changé
  }
  const pause = (ms) => new Promise((ok, ko) => {
    setTimeout(() => (arrete || !cadre.isConnected ? ko(ARRET) : ok()), ms);
  });

  // Le doigt se déplace d'un point à un autre du cadre.
  let x = 0;
  let y = 0;
  async function aller(nx, ny, duree = 380) {
    const de = { left: `${x}px`, top: `${y}px` };
    x = nx;
    y = ny;
    await animer(doigt, [de, { left: `${x}px`, top: `${y}px` }], { duration: duree, easing: DOUCE });
  }
  // Le milieu d'un élément, dans le repère du cadre (là où le doigt est posé).
  function milieu(element) {
    const r = element.getBoundingClientRect();
    const repere = cadre.getBoundingClientRect();
    return { x: r.left - repere.left + r.width / 2, y: r.top - repere.top + r.height / 2 };
  }
  // Le doigt va sur sa cible : en plein dessus pour un mot ou un numéro ; pour la carte entière, un
  // peu à droite du milieu, pour ne pas en cacher le texte.
  function viser(cible = carte, decalage = cible === carte ? 36 : 0) {
    const { x: cx, y: cy } = milieu(cible);
    return aller(cx + decalage, cy);
  }

  // Une onde qui s'élargit sous le doigt.
  function onde() {
    const cercle = el('span', { className: 'doigt-onde' });
    doigt.append(cercle);
    cercle.animate([{ scale: 0.6, opacity: 0.9 }, { scale: 2.1, opacity: 0 }], { duration: 560, easing: 'ease-out' })
      .finished.then(() => cercle.remove(), () => cercle.remove());
  }

  // La cible s'enfonce un peu, comme sous un vrai doigt (un mot dans une phrase, lui, ne bouge pas).
  async function toucher(cible) {
    onde();
    cible.animate([{ scale: 1 }, { scale: cible === carte ? 0.975 : 0.94 }, { scale: 1 }], { duration: 260, easing: 'ease-out' });
    await animer(point, [{ scale: 1 }, { scale: 0.78 }, { scale: 1 }], { duration: 280, easing: 'ease-out', fill: 'none' });
  }

  // Le doigt s'enfonce, l'anneau fait le tour en une demi-seconde (le temps de l'appui long), il se relève.
  async function maintenir() {
    await animer(point, [{ scale: 1 }, { scale: 0.82 }], { duration: 140 });
    await animer(anneau, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 650, easing: 'linear', fill: 'none' });
    onde();
    await animer(point, [{ scale: 0.82 }, { scale: 1 }], { duration: 200, easing: 'ease-out' });
  }

  // La carte suit le doigt comme dans gestes.js : elle penche un peu, et découvre l'indice de son côté.
  let decalage = 0;
  const pose = (ecart) => `translateX(${ecart}px) rotate(${mouvementReduit() ? 0 : ecart / 25}deg)`;
  const part = (ecart) => Math.min(Math.abs(ecart) / (carte.offsetWidth * SEUIL), 1);
  async function glisser(vers, duree) {
    const de = decalage;
    decalage = vers;
    const options = { duration: duree, easing: vers === 0 ? FEUTRE : DOUCE };
    await Promise.all([
      aller(x + (vers - de), y, duree),
      animer(carte, [{ transform: pose(de) }, { transform: pose(vers) }], options),
      animer(indiceDroite, [{ opacity: de > 0 ? part(de) : 0 }, { opacity: vers > 0 ? part(vers) : 0 }], options),
      animer(indiceGauche, [{ opacity: de < 0 ? part(de) : 0 }, { opacity: vers < 0 ? part(vers) : 0 }], options),
    ]);
  }

  // La légende change en fondu : le glyphe du geste, son nom, ce qu'il fait.
  async function dire({ geste, titre, texte }) {
    if (legende.firstChild) await animer(legende, [{ opacity: 1 }, { opacity: 0 }], { duration: 150 });
    legende.replaceChildren(glyphe(geste), el('span', {}, el('b', {}, titre), ` · ${texte}`));
    await animer(legende, [{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration: 260, easing: FEUTRE });
  }

  try {
    // Le doigt arrive un peu en dessous du milieu de la carte, puis se place.
    const depart = milieu(carte);
    x = depart.x + 50;
    y = depart.y + 50;
    Object.assign(doigt.style, { left: `${x}px`, top: `${y}px` });
    await animer(doigt, [{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }], { duration: 320, easing: FEUTRE });

    for (const etape of etapes) {
      const cible = (typeof etape.cible === 'function' ? etape.cible() : etape.cible) ?? carte;
      if (etape.geste === 'glisser') {
        await viser(carte, 0);
        await dire(etape);
        await glisser(etape.sens * ECART, 520);
        await pause(650);
        await glisser(0, 360);
        await pause(200);
      } else {
        await viser(cible);
        dire(etape).catch(() => {}); // la légende arrive pendant le geste (arrêtée, la démo s'en charge)
        await (etape.geste === 'maintenir' ? maintenir() : toucher(cible));
        etape.agir?.();
        await pause(etape.geste === 'maintenir' ? 1100 : 1500);
      }
    }

    await animer(doigt, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.8 }], { duration: 260, easing: 'ease' });
    await pause(700);
    await animer(legende, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    fin?.();
  } catch (erreur) {
    if (erreur !== ARRET) throw erreur;
  } finally {
    // Tout revient comme avant : la carte à sa place, les indices cachés, ni doigt ni légende.
    carte.removeEventListener('pointerdown', arreter);
    animations.forEach((animation) => animation.cancel());
    doigt.remove();
    legende.remove();
  }
}
