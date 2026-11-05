// Écran 3 : choisir ses répliques, par rôles entiers et/ou une par une.
//
// Seule la liste des numéros est enregistrée. Une case de rôle n'est qu'un raccourci :
// la cocher ajoute toutes ses répliques, et son état se déduit toujours de la liste.
//
// Deux affichages de la même liste : le texte complet, et une grille de numéros pour aller vite.
// Pincer l'écran passe à la grille, écarter les doigts revient au texte.

import { el, hautDePage, remplacer } from '../dom.js';
import { surPincement } from '../pincement.js';
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
    compteur.textContent = `${nombre} ${nombre > 1 ? 'choisies' : 'choisie'}`;
  }

  // Appelée seulement quand l'utilisateur change quelque chose.
  function surChangement() {
    enregistrerSelection(piece.id, selection);
    actualiser();
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
          el('span', { className: 'role-fr' }, role.nom_fr)),
        total),
      role.note && el('p', { className: 'role-note' }, role.note),
      // Le lien reste hors du <label> : le toucher ne doit pas cocher la case.
      // noopener empêche la page ouverte d'agir sur notre app.
      role.lien && el('a', { className: 'role-lien', href: role.lien, target: '_blank', rel: 'noopener noreferrer' }, 'Ouvrir le lien'));
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
        el('span', { className: 'replique-fr traduction' }, ligne.fr)));
  }

  function creerBoutonGrille(ligne) {
    const bouton = el('button', {
      type: 'button',
      className: 'bouton-numero',
      'aria-label': `Réplique ${ligne.numero}`,
      onclick: () => {
        if (selection.has(ligne.numero)) selection.delete(ligne.numero);
        else selection.add(ligne.numero);
        surChangement();
      },
    }, String(ligne.numero));
    boutonsGrille.set(ligne.numero, bouton);
    return bouton;
  }

  const titre = creerTitreVue('Mes répliques', compteur);
  titre.classList.add('tete-collante'); // le compteur reste visible pendant qu'on fait défiler

  const vueTexte = el('div', { className: 'vue-texte' },
    el('section', { className: 'card pile' },
      el('h2', { className: 'titre-section' }, 'Des rôles entiers'),
      piece.roles.map(creerLigneRole)),
    el('h2', { className: 'titre-section' }, 'Ou réplique par réplique'),
    piece.scenes.map((scene) => el('section', { className: 'scene' },
      creerTitreScene(scene),
      lignes.filter((l) => l.scene === scene).map(creerLigneReplique))));

  const vueGrille = el('div', { className: 'grille-numeros', hidden: true }, lignes.map(creerBoutonGrille));

  // Un geste ne se devine pas : on l'annonce, et le bouton sert aussi sans écran tactile.
  const aide = el('p', { className: 'legende' });
  const bascule = el('button', { type: 'button', className: 'chip', onclick: () => montrerGrille(vueGrille.hidden) });

  function montrerGrille(oui) {
    vueGrille.hidden = !oui;
    vueTexte.hidden = oui;
    aide.textContent = oui
      ? 'Écarte deux doigts pour revoir le texte.'
      : "Pince l'écran avec deux doigts pour n'afficher que les numéros.";
    bascule.textContent = oui ? 'Texte' : 'Grille';
    hautDePage();
  }

  racine.classList.add('zone-pincement');
  surPincement(racine, {
    surRapprochement: () => montrerGrille(true),
    surEcartement: () => montrerGrille(false),
  });

  remplacer(racine, titre, el('div', { className: 'ligne-aide' }, aide, bascule), vueTexte, vueGrille);

  montrerGrille(false);
  actualiser();
}
