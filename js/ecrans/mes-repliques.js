// Écran 3 : choisir ses répliques, par rôles entiers et/ou une par une.
//
// Seule la liste des numéros est enregistrée. Une case de rôle n'est qu'un raccourci :
// la cocher ajoute toutes ses répliques, et son état se déduit toujours de la liste.
//
// Deux affichages de la même liste : le texte complet, et une grille de numéros pour aller vite.
// Pincer l'écran passe à la grille, écarter les doigts revient au texte.

import { brancherAppuiLong, cascade, definirRetour, el, rebond, remplacer } from '../dom.js';
import { surPincement } from '../pincement.js';
import { t, traduire } from '../langues.js';
import { creerJaponais } from '../texte.js';
import { creerNomRole, creerTitreScene, creerTitreVue } from '../affichage.js';
import { lignesDe } from '../pieces.js';
import { enregistrerSelection, lireSelection } from '../stockage.js';

export function afficherMesRepliques(racine, piece) {
  const lignes = lignesDe(piece);
  const selection = lireSelection(piece);

  const casesRepliques = new Map(); // numéro de réplique -> sa case
  const boutonsGrille = new Map();  // numéro de réplique -> son bouton dans la grille
  const casesRoles = new Map();     // id du rôle -> sa case et son compteur
  const compteur = el('span', { className: 'pill pill--ok', role: 'status' });

  // Remet les cases et les boutons d'accord avec la liste.
  function actualiser() {
    for (const [numero, caseReplique] of casesRepliques) {
      caseReplique.checked = selection.has(numero);
    }

    for (const [numero, bouton] of boutonsGrille) {
      const choisie = selection.has(numero);
      bouton.classList.toggle('est-choisi', choisie);
      bouton.setAttribute('aria-pressed', String(choisie));
    }

    for (const [idRole, { caseRole, total }] of casesRoles) {
      const miennes = lignes.filter((l) => l.role === idRole && selection.has(l.numero)).length;
      const toutes = lignes.filter((l) => l.role === idRole).length;
      caseRole.checked = toutes > 0 && miennes === toutes;
      // indeterminate affiche un tiret dans la case : « une partie seulement ». Il n'existe qu'en JS.
      caseRole.indeterminate = miennes > 0 && miennes < toutes;
      total.textContent = `${miennes}/${toutes}`;
    }

    const nombre = selection.size;
    compteur.textContent = t(nombre > 1 ? '{n} choisies' : '{n} choisie', { n: nombre });
  }

  // Appelée seulement quand l'utilisateur change quelque chose.
  function surChangement() {
    enregistrerSelection(piece.id, selection);
    actualiser();
    rebond(compteur);
  }

  function creerLigneRole(role) {
    const caseRole = el('input', {
      type: 'checkbox',
      disabled: !lignes.some((l) => l.role === role.id),
      onchange: () => {
        for (const ligne of lignes) {
          if (ligne.role !== role.id) continue;
          if (caseRole.checked) selection.add(ligne.numero);
          else selection.delete(ligne.numero);
        }
        surChangement();
      },
    });
    const total = el('span', { className: 'role-total' });
    casesRoles.set(role.id, { caseRole, total });

    return el('div', { className: 'ligne-role' },
      el('label', { className: 'coche' },
        caseRole,
        el('span', { className: 'coche-texte' },
          creerJaponais(role.nom, 'role'),
          el('span', { className: 'role-fr' }, traduire(role, 'nom_fr'))),
        total),
      role.note && el('p', { className: 'role-note' }, traduire(role, 'note')));
  }

  function creerLigneReplique(ligne) {
    const caseReplique = el('input', {
      type: 'checkbox',
      onchange: () => {
        if (caseReplique.checked) selection.add(ligne.numero);
        else selection.delete(ligne.numero);
        surChangement();
      },
    });
    casesRepliques.set(ligne.numero, caseReplique);

    return el('label', { className: 'coche coche-replique' },
      caseReplique,
      el('span', { className: 'coche-texte' },
        el('span', { className: 'replique-tete' },
          el('span', { className: 'numero' }, String(ligne.numero)),
          creerNomRole(piece, ligne.role)),
        creerJaponais(ligne.texte, 'japonais japonais-petit'),
        el('span', { className: 'replique-fr traduction' }, traduire(ligne, 'fr'))));
  }

  // Un numéro de la grille : le toucher choisit la réplique (ou la retire),
  // l'appui long ramène au texte, sur cette réplique.
  function creerBoutonGrille(ligne) {
    const bouton = el('button', {
      type: 'button',
      className: 'bouton-numero',
      'aria-label': t('Réplique {n}', { n: ligne.numero }),
    }, String(ligne.numero));
    brancherAppuiLong(bouton, {
      toucher: () => {
        if (selection.has(ligne.numero)) {
          selection.delete(ligne.numero);
        } else {
          selection.add(ligne.numero);
          rebond(bouton);
        }
        surChangement();
      },
      maintenir: () => allerA(ligne.numero),
    });
    boutonsGrille.set(ligne.numero, bouton);
    return bouton;
  }

  const titre = creerTitreVue(t('Mes répliques'), compteur);
  titre.classList.add('tete-collante'); // le compteur reste visible pendant qu'on fait défiler

  const vueTexte = el('div', { className: 'vue-texte' },
    el('section', { className: 'card pile' },
      el('h2', { className: 'titre-section' }, t('Des rôles entiers')),
      piece.roles.map(creerLigneRole)),
    el('h2', { className: 'titre-section' }, t('Réplique par réplique')),
    piece.scenes.map((scene) => el('section', { className: 'scene' },
      creerTitreScene(scene),
      lignes.filter((l) => l.scene === scene).map(creerLigneReplique))));

  const vueGrille = el('div', { className: 'grille-numeros', hidden: true }, lignes.map((ligne) => creerBoutonGrille(ligne)));

  // Un geste ne se devine pas : on l'annonce, et le bouton sert aussi sans écran tactile.
  const aide = el('p', { className: 'legende' });
  const bascule = el('button', { type: 'button', className: 'chip', onclick: () => montrerGrille(vueGrille.hidden) });

  const mouvementReduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // On zoome autour du milieu de ce qui est visible, pas autour du haut de la page.
  function centrerLeZoom(vue) {
    const zone = document.getElementById('ecran').getBoundingClientRect();
    vue.style.transformOrigin = `50% ${zone.top + zone.height / 2 - vue.getBoundingClientRect().top}px`;
  }

  // Pendant le geste, l'affichage suit les doigts : il se zoome et devient flou. Il ne réagit qu'au
  // geste utile : rapprocher quand on voit le texte, écarter quand on voit la grille.
  function suivreLesDoigts(rapport) {
    if (mouvementReduit()) return;
    const surLeTexte = vueGrille.hidden;
    const vue = surLeTexte ? vueTexte : vueGrille;
    const effet = surLeTexte ? Math.min(rapport, 1) : Math.max(rapport, 1);
    const ecart = Math.abs(effet - 1);
    if (!vue.classList.contains('en-pincement')) {
      centrerLeZoom(vue); // une seule fois, au début du geste : ensuite, la vue est déjà déformée
      vue.classList.add('en-pincement');
    }
    vue.style.transform = `scale(${1 + (effet - 1) * 0.8})`;
    vue.style.filter = `blur(${ecart * 32}px)`;
    vue.style.opacity = 1 - ecart;
  }

  // Sans le style écrit à la main, le CSS reprend la main : la vue revient en souplesse.
  function relacher() {
    for (const vue of [vueTexte, vueGrille]) {
      vue.classList.remove('en-pincement');
      vue.style.transform = '';
      vue.style.filter = '';
      vue.style.opacity = '';
    }
  }

  function afficherVue(grille) {
    vueGrille.hidden = !grille;
    vueTexte.hidden = grille;
    aide.textContent = grille
      ? t('Garde le doigt sur un numéro pour aller à sa réplique. Écarte deux doigts pour revoir le texte.')
      : t("Pince l'écran avec deux doigts pour n'afficher que les numéros.");
    bascule.textContent = grille ? t('Texte') : t('Grille');
  }

  // La vue qui arrive continue le mouvement des doigts, et sa netteté revient en même temps.
  function arriverEnZoomFlou(vue, classe) {
    centrerLeZoom(vue);
    vue.classList.add(classe);
    const fin = (evenement) => {
      if (evenement.target !== vue) return; // l'animation d'un bouton intérieur, pas la nôtre
      vue.classList.remove(classe);
      vue.removeEventListener('animationend', fin);
    };
    vue.addEventListener('animationend', fin);
  }

  // Où on en était dans le texte, pour y revenir en quittant la grille.
  let positionTexte = 0;
  let grilleDejaVue = false;

  // versElement : en revenant au texte, l'endroit à montrer au milieu de l'écran, au lieu de
  // la position quittée. Il faut le placer avant le zoom, qui se centre sur ce qui est visible.
  function montrerGrille(oui, versElement = null) {
    if (oui === !vueGrille.hidden) return; // déjà sur cette vue
    // Sur la grille, la flèche de retour ramène au texte ; sur le texte, elle quitte l'écran.
    definirRetour(oui ? () => montrerGrille(false) : null);
    const zone = document.getElementById('ecran');
    if (oui) positionTexte = zone.scrollTop;
    afficherVue(oui);
    // behavior: 'instant' : la zone défile en douceur d'habitude, mais ici le saut doit être invisible.
    if (versElement) versElement.scrollIntoView({ block: 'center', behavior: 'instant' });
    else zone.scrollTo({ top: oui ? 0 : positionTexte, behavior: 'instant' });
    if (!mouvementReduit()) arriverEnZoomFlou(oui ? vueGrille : vueTexte, oui ? 'zoom-depuis-grand' : 'zoom-depuis-petit');
    // La vague de boutons ne se joue qu'une fois, comme les tuiles de Faktur. Ensuite, un simple
    // fondu : on vient ici pour aller vite, on ne va pas attendre l'animation à chaque pincement.
    if (oui && !grilleDejaVue) {
      grilleDejaVue = true;
      cascade(vueGrille, getComputedStyle(vueGrille).gridTemplateColumns.split(' ').length);
    }
  }

  // L'appui long sur un numéro : retour au texte, centré sur cette réplique, qu'un halo signale un instant.
  function allerA(numero) {
    const carte = casesRepliques.get(numero).closest('.coche-replique');
    montrerGrille(false, carte);
    carte.classList.remove('reperee');
    void carte.offsetWidth; // fait rejouer le halo, même sur la même réplique
    carte.classList.add('reperee');
    carte.addEventListener('animationend', () => carte.classList.remove('reperee'), { once: true });
  }

  racine.classList.add('zone-pincement');
  surPincement(racine, {
    surRapprochement: () => montrerGrille(true),
    surEcartement: () => montrerGrille(false),
    surSuivi: suivreLesDoigts,
    surRelache: relacher,
  });

  remplacer(racine, titre, el('div', { className: 'ligne-aide' }, aide, bascule), vueTexte, vueGrille);

  afficherVue(false);
  actualiser();
  cascade(vueTexte);
  // Rien de choisi : le compteur clignote pour montrer que tout commence ici, comme un champ
  // obligatoire resté vide dans Faktur.
  if (selection.size === 0) {
    compteur.classList.add('clignote');
    compteur.addEventListener('animationend', () => compteur.classList.remove('clignote'), { once: true });
  }
}
