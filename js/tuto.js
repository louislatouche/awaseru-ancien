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
import { ECARTEMENT, RAPPROCHEMENT } from './pincement.js';
import { AMORTI } from './gestes.js';
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
  // Pincer : deux points en diagonale, des flèches qui vont vers le milieu ; écarter : vers les coins.
  pincer: '<svg class="glyphe-tuto" viewBox="0 0 24 24" aria-hidden="true"><circle class="point-glyphe" cx="5.5" cy="18.5" r="2.8"/><circle class="point-glyphe" cx="18.5" cy="5.5" r="2.8"/><path class="trait-glyphe" d="M9 15l3-3M15 9l-3 3M12 12h-3.2M12 12v3.2M12 12h3.2M12 12V8.8"/></svg>',
  ecarter: '<svg class="glyphe-tuto" viewBox="0 0 24 24" aria-hidden="true"><circle class="point-glyphe" cx="9" cy="15" r="2.8"/><circle class="point-glyphe" cx="15" cy="9" r="2.8"/><path class="trait-glyphe" d="M6.5 17.5l-3 3M20.5 3.5l-3 3M3.5 20.5h3.2M3.5 20.5v-3.2M20.5 3.5h-3.2M20.5 3.5v3.2"/></svg>',
  // Balayer vers le haut : le point du doigt, et une flèche qui monte.
  balayer: '<svg class="glyphe-tuto" viewBox="0 0 24 24" aria-hidden="true"><path class="trait-glyphe" d="M12 13V3.5M8.5 7 12 3.5 15.5 7"/><circle class="point-glyphe" cx="12" cy="17.5" r="3.6"/></svg>',
};

function glyphe(geste) {
  const modele = document.createElement('template');
  modele.innerHTML = GLYPHES[geste];
  return modele.content.firstChild;
}

// La pastille du tuto « nom » doit-elle être proposée ? Oui si les tutos sont allumés et qu'il n'a
// pas encore été vu. Un écran s'en sert pour ne préparer la place de la pastille qu'au besoin.
export function tutoAVoir(nom) {
  const { tutos, tutosVus } = lireReglages();
  return tutos && !tutosVus.includes(nom);
}

// Pose la pastille du tuto « nom » dans « ancre » (un élément en position: relative, qui contient
// la carte), sauf si les tutos sont éteints ou si celui-ci a déjà été vu. montrer() joue la démo.
// cote : 'droite' (le coin haut droit, d'habitude) ou 'gauche', quand un bouton occupe déjà la droite.
// libelle : ce que dit la pastille à un lecteur d'écran (« les gestes de cet écran », pour un geste
// qui se fait sur tout l'écran, comme le pincement).
export function proposerTuto(nom, ancre, montrer, { cote = 'droite', libelle = t('Voir les gestes de cette carte') } = {}) {
  if (!tutoAVoir(nom)) return;
  ancre.classList.add('ancre-tuto'); // position: relative, pour que la pastille se pose à son coin
  const pastille = el('button', {
    type: 'button',
    className: `pastille-tuto${cote === 'gauche' ? ' a-gauche' : ''}`,
    'aria-label': libelle,
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
// poser la légende ; fin() : appelée quand la démo est allée jusqu'au bout, pour défaire ce qu'elle
// a fait pour de vrai (replier une carte, revenir à la grille) : une démo finit là où elle a commencé.
// etapes : [{ geste: 'toucher' | 'maintenir' | 'glisser' | 'pincer' | 'ecarter', sens: 1 (droite)
//   ou -1, titre, texte, cible, agir, suivre, relacher }]. cible : ce que le doigt touche, si ce
//   n'est pas la carte entière (un mot, un numéro), ou une fonction qui le trouve au moment voulu.
//   agir() : ce que le geste fait pour de vrai, quand c'est sans risque (déplier une carte de la
//   liste, passer à la grille...). Pour pincer et écarter, deux doigts au milieu de l'écran :
//   suivre(rapport) fait suivre l'écran à leur écart, relacher() le remet en place. Pour balayer
//   (le filage) : journal, l'élément qui suit le doigt, et apercu(), la carte de la réplique
//   suivante qui se devine pendant le geste (ou rien).
// zoneArret : là où le vrai doigt arrête la démo (la carte, d'habitude ; tout l'écran, pour un pincement).
// nettoyer() : appelée dans tous les cas, même si la démo s'arrête en route, pour retirer ce qu'elle
// a seulement montré (une carte éclairée comme lue, dans le Script).
//
// Sinon, la démo ne fait rien pour de vrai : une réplique cachée le reste (la montrer gâcherait
// l'exercice), rien ne se lit, rien n'est noté. Si le vrai doigt se pose sur la carte, elle s'arrête.
export async function montrerGestes({ carte, cadre = carte, ecran, etapes, fin = null, nettoyer = null, zoneArret = carte }) {
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
  zoneArret.addEventListener('pointerdown', arreter, { once: true });

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
  async function viser(cible = carte, decalage = cible === carte ? 36 : 0) {
    await rendreVisible(cible);
    const { x: cx, y: cy } = milieu(cible);
    return aller(cx + decalage, cy);
  }

  // Le doigt ne doit jamais passer sous la légende, ni sous ce qui couvre le haut de l'écran (l'en-tête,
  // le titre collé de Mes répliques) : si l'endroit à toucher est trop bas ou trop haut, l'écran
  // défile d'abord en douceur pour l'amener entre les deux. La légende se pose déjà au-dessus de la
  // barre du bas (Réviser, l'explication d'un mot) : la dépasser, c'est donc éviter la barre aussi.
  // Signalé par Louis le 2026-11-11 : dans le Script, la bulle passait sous le texte.
  // (À la fin de la démo, l'écran revient de toute façon là où il était.)
  async function rendreVisible(cible) {
    if (!zoneQuiDefile) return;
    const r = cible.getBoundingClientRect();
    const y = r.top + r.height / 2; // là où le doigt se pose
    const bandeauxDuHaut = [document.querySelector('.app-header'), ecran.querySelector('.tete-collante')].filter(Boolean);
    const haut = Math.max(0, ...bandeauxDuHaut.map((bandeau) => bandeau.getBoundingClientRect().bottom)) + 44;
    // Le haut de la légende, avec de quoi la loger sur deux lignes, et la place du doigt (44 px).
    const bas = window.innerHeight - parseFloat(getComputedStyle(legende).bottom) - 72 - 44;
    const ecart = y > bas ? y - bas : (y < haut ? y - haut : 0);
    if (Math.abs(ecart) < 4) return;
    // Le doigt est posé dans la page : il défilerait avec elle, et passerait sous l'en-tête ou sous
    // la légende. Il s'efface donc le temps du défilement, puis réapparaît près de sa nouvelle cible.
    if (doigtVisible) await animer(doigt, [{ opacity: 1 }, { opacity: 0 }], { duration: 150 });
    zoneQuiDefile.scrollBy({ top: ecart, behavior: 'smooth' });
    await pause(420);
    if (doigtVisible) {
      const pres = milieu(cible);
      await aller(pres.x + 44, pres.y - 24, 1);
      await animer(doigt, [{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }], { duration: 260, easing: FEUTRE });
    }
  }

  // Une onde qui s'élargit sous le doigt.
  function onde() {
    const cercle = el('span', { className: 'doigt-onde' });
    doigt.append(cercle);
    cercle.animate([{ scale: 0.6, opacity: 0.9 }, { scale: 2.1, opacity: 0 }], { duration: 560, easing: 'ease-out' })
      .finished.then(() => cercle.remove(), () => cercle.remove());
  }

  // La cible s'enfonce un peu, comme sous un vrai doigt : à peine pour une carte, un peu plus pour un
  // petit bouton comme un numéro (un mot dans une phrase, lui, ne bouge pas).
  async function toucher(cible) {
    onde();
    cible.animate([{ scale: 1 }, { scale: cible.offsetWidth > 120 ? 0.975 : 0.94 }, { scale: 1 }], { duration: 260, easing: 'ease-out' });
    await animer(point, [{ scale: 1 }, { scale: 0.78 }, { scale: 1 }], { duration: 280, easing: 'ease-out', fill: 'none' });
  }

  // Le doigt s'enfonce, l'anneau fait le tour en une demi-seconde (le temps de l'appui long), il se
  // relève. Un numéro de la grille se remplit en même temps, comme sous le vrai doigt (en-appui).
  async function maintenir(cible) {
    await animer(point, [{ scale: 1 }, { scale: 0.82 }], { duration: 140 });
    if (cible !== carte) cible.classList.add('en-appui');
    try {
      await animer(anneau, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 650, easing: 'linear', fill: 'none' });
    } finally {
      cible.classList.remove('en-appui');
    }
    onde();
    await animer(point, [{ scale: 0.82 }, { scale: 1 }], { duration: 200, easing: 'ease-out' });
  }

  // Balayer vers le haut (le filage) : le doigt part un peu sous le milieu de la carte et monte de
  // 100 px ; le journal le suit de loin, comme sous le vrai doigt (AMORTI, dans gestes.js). La carte
  // de la réplique suivante, s'il y en a une, se devine sous la mienne pendant le geste (variante B,
  // choisie par Louis le 2026-11-11). Puis le doigt se lève et tout retombe : le filage n'avance pas.
  const apercusDeLaDemo = new Set();
  async function balayer(etape) {
    const { journal } = etape;
    const montee = 100;
    const depart = milieu(carte);
    await aller(depart.x, depart.y + 30, 300);
    const apercu = etape.apercu?.() ?? null;
    if (apercu) {
      apercu.classList.add('apercu-tuto');
      apercu.setAttribute('aria-hidden', 'true');
      apercu.style.opacity = '0';
      journal.append(apercu);
      apercusDeLaDemo.add(apercu);
    }
    const monte = { duration: 560, easing: DOUCE };
    const haut = `translateY(${-montee * AMORTI}px)`;
    // Le doigt est posé dans la carte, qui monte avec le journal : il ne fait lui-même que le reste du trajet.
    await Promise.all([
      aller(depart.x, depart.y + 30 - montee * (1 - AMORTI), 560),
      animer(journal, [{ transform: 'translateY(0)' }, { transform: haut }], monte),
      apercu && animer(apercu, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 0.55, transform: 'translateY(0)' }], monte),
    ]);
    await pause(450);
    await animer(doigt, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    doigtVisible = false;
    const retombe = { duration: 300, easing: FEUTRE };
    await Promise.all([
      animer(journal, [{ transform: haut }, { transform: 'translateY(0)' }], retombe),
      apercu && animer(apercu, [{ opacity: 0.55, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(24px)' }], retombe),
    ]);
    apercu?.remove();
    apercusDeLaDemo.delete(apercu);
    await animer(doigt, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    doigtVisible = true;
  }

  // Pincer ou écarter : deux doigts, en diagonale autour du milieu de l'écran, se rapprochent ou
  // s'éloignent. L'écran suit leur écart image par image, comme sous de vrais doigts (suivre). Dès
  // que l'écart franchit le même seuil que pour les vrais doigts (pincement.js), l'écran revient en
  // place (relacher) et le geste agit pour de vrai (agir : la grille, ou le texte). Les doigts
  // finissent leur mouvement, l'écran ne les suit plus.
  const doigtsDuPincement = new Set();
  let pincementEnCours = null; // si la démo s'arrête au milieu, l'écran doit quand même revenir
  async function pincer(etape) {
    const pince = etape.geste === 'pincer';
    const [de, a] = pince ? [110, 40] : [40, 110];
    let franchi = false;
    const agirUneFois = () => {
      if (franchi) return;
      franchi = true;
      pincementEnCours = null;
      etape.relacher?.();
      etape.agir?.();
    };
    const visible = document.getElementById('ecran').getBoundingClientRect();
    const centre = { x: visible.left + visible.width / 2, y: visible.top + visible.height / 2 };
    const doigts = [1, -1].map((signe) => {
      const unDoigt = el('div', { className: 'doigt-tuto doigt-fixe', 'aria-hidden': 'true' }, el('span', { className: 'doigt-point' }));
      unDoigt.signe = signe;
      ecran.append(unDoigt);
      doigtsDuPincement.add(unDoigt);
      return unDoigt;
    });
    const placer = (distance) => {
      const pas = distance / Math.SQRT2;
      for (const unDoigt of doigts) {
        unDoigt.style.left = `${centre.x + unDoigt.signe * pas}px`;
        unDoigt.style.top = `${centre.y - unDoigt.signe * pas}px`;
      }
    };
    placer(de);
    await Promise.all(doigts.map((unDoigt) => animer(unDoigt, [{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }], { duration: 320, easing: FEUTRE })));
    await pause(150);
    pincementEnCours = etape;
    await new Promise((ok, ko) => {
      const debut = performance.now();
      const image = (maintenant) => {
        if (arrete || !cadre.isConnected) {
          ko(ARRET);
          return;
        }
        const avance = Math.min((maintenant - debut) / 700, 1);
        const courbe = avance < 0.5 ? 2 * avance * avance : 1 - (-2 * avance + 2) ** 2 / 2; // douce aux deux bouts
        const distance = de + (a - de) * courbe;
        placer(distance);
        if (!franchi) {
          const rapport = distance / de;
          etape.suivre?.(rapport);
          if (pince ? rapport < RAPPROCHEMENT : rapport > ECARTEMENT) agirUneFois();
        }
        if (avance < 1) requestAnimationFrame(image);
        else ok();
      };
      requestAnimationFrame(image);
    });
    agirUneFois(); // au cas où le seuil n'aurait pas été franchi
    await Promise.all(doigts.map((unDoigt) => animer(unDoigt, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.8 }], { duration: 260, easing: 'ease' })));
    for (const unDoigt of doigts) {
      unDoigt.remove();
      doigtsDuPincement.delete(unDoigt);
    }
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

  // Le doigt seul ne sert pas si la démo ne fait que pincer et écarter (ce sont deux autres doigts).
  const avecUnDoigt = etapes.some(({ geste }) => geste !== 'pincer' && geste !== 'ecarter');
  let doigtVisible = false; // le doigt est-il à l'écran en ce moment (voir rendreVisible)
  // Où en était l'écran : une démo qui déplie une carte ou change de vue le fait défiler. À la fin,
  // on y revient, pour retrouver l'écran tel qu'il était avant la démo (demande de Louis, 2026-11-11).
  const zoneQuiDefile = document.getElementById('ecran');
  const defilementDeDepart = zoneQuiDefile?.scrollTop ?? 0;

  try {
    // Le doigt apparaît un peu au-dessus et à droite de ce qu'il va toucher en premier, puis s'y pose.
    // Au-dessus, et pas en dessous : en bas de l'écran, il serait apparu sous la légende.
    const premiere = etapes[0];
    const premiereCible = (typeof premiere?.cible === 'function' ? premiere.cible() : premiere?.cible) ?? carte;
    if (avecUnDoigt) await rendreVisible(premiereCible);
    const depart = milieu(premiereCible);
    x = depart.x + 44;
    y = depart.y - 24;
    Object.assign(doigt.style, { left: `${x}px`, top: `${y}px` });
    if (avecUnDoigt) {
      await animer(doigt, [{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }], { duration: 320, easing: FEUTRE });
      doigtVisible = true;
    }

    for (const etape of etapes) {
      const cible = (typeof etape.cible === 'function' ? etape.cible() : etape.cible) ?? carte;
      if (etape.geste === 'pincer' || etape.geste === 'ecarter') {
        dire(etape).catch(() => {});
        await pincer(etape);
        await pause(1100);
      } else if (etape.geste === 'balayer') {
        await viser(carte, 0);
        dire(etape).catch(() => {});
        await balayer(etape);
        await pause(500);
      } else if (etape.geste === 'glisser') {
        await viser(carte, 0);
        await dire(etape);
        await glisser(etape.sens * ECART, 520);
        await pause(650);
        await glisser(0, 360);
        await pause(200);
      } else {
        await viser(cible);
        dire(etape).catch(() => {}); // la légende arrive pendant le geste (arrêtée, la démo s'en charge)
        await (etape.geste === 'maintenir' ? maintenir(cible) : toucher(cible));
        etape.agir?.();
        await pause(etape.geste === 'maintenir' ? 1100 : 1500);
      }
    }

    if (avecUnDoigt) await animer(doigt, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.8 }], { duration: 260, easing: 'ease' });
    doigtVisible = false;
    await pause(700);
    await animer(legende, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    // Retour au point de départ : ce que la démo a changé pour de vrai est défait (fin), puis
    // l'écran revient, en douceur, là où il était.
    fin?.();
    zoneQuiDefile?.scrollTo({ top: defilementDeDepart, behavior: 'smooth' });
  } catch (erreur) {
    if (erreur !== ARRET) throw erreur;
  } finally {
    // Tout revient comme avant : la carte à sa place, les indices cachés, l'écran pas déformé, ni
    // doigt ni légende.
    zoneArret.removeEventListener('pointerdown', arreter);
    pincementEnCours?.relacher?.();
    nettoyer?.();
    animations.forEach((animation) => animation.cancel());
    doigt.remove();
    doigtsDuPincement.forEach((unDoigt) => unDoigt.remove());
    apercusDeLaDemo.forEach((apercu) => apercu.remove());
    legende.remove();
  }
}
