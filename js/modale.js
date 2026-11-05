// La « feuille du bas » du design kit : les demandes de confirmation, à la place de la fenêtre
// confirm() du navigateur (même principe que dans Faktur), et les petits menus.

import { el } from './dom.js';

// Ouvre une feuille et renvoie la fonction qui la referme.
// actions reçoit cette même fonction, pour que ses boutons puissent refermer la feuille.
// surFermeture est appelée une seule fois, quelle que soit la façon de fermer.
export function ouvrirFeuille({ titre, corps, actions, surFermeture }) {
  let ouverte = true;

  function fermer() {
    if (!ouverte) return; // par exemple, déjà refermée à la main quand un téléchargement se termine
    ouverte = false;
    document.removeEventListener('keydown', surTouche);
    window.removeEventListener('hashchange', fermer);
    document.body.classList.remove('modal-open');
    fond.classList.remove('show'); // lance le fondu de sortie du design kit
    setTimeout(() => fond.remove(), 200);
    surFermeture?.();
  }

  const surTouche = (evenement) => {
    if (evenement.key === 'Escape') fermer();
  };

  const fond = el('div', {
    className: 'modal-overlay',
    // Toucher à côté de la feuille la referme.
    onclick: (evenement) => {
      if (evenement.target === fond) fermer();
    },
  },
  el('div', { className: 'modal-card', role: 'dialog', 'aria-modal': 'true' },
    el('div', { className: 'modal-head' }, el('strong', { className: 'modal-title' }, titre)),
    el('div', { className: 'modal-body' }, corps),
    el('div', { className: 'modal-actions' }, actions(fermer))));

  document.addEventListener('keydown', surTouche);
  // Le bouton Retour d'Android change d'écran : la feuille ne doit pas rester ouverte par-dessus.
  window.addEventListener('hashchange', fermer);
  document.body.append(fond);
  document.body.classList.add('modal-open');
  // À la prochaine image affichée seulement : sinon le fondu d'apparition ne se déclenche pas.
  requestAnimationFrame(() => fond.classList.add('show'));

  return fermer;
}

// Renvoie une promesse : on écrit « if (await confirmer({...})) ... », et le code attend la réponse.
export function confirmer({ titre, message, oui = 'Confirmer', non = 'Annuler' }) {
  return new Promise((resolve) => {
    let accepte = false; // reste faux si on referme autrement qu'avec le bouton « oui »
    ouvrirFeuille({
      titre,
      corps: el('p', { className: 'modal-msg' }, message),
      actions: (fermer) => [
        el('button', { type: 'button', className: 'btn-ghost btn-petit', onclick: fermer }, non),
        el('button', {
          type: 'button',
          className: 'btn btn-petit',
          onclick: () => {
            accepte = true;
            fermer();
          },
        }, oui),
      ],
      surFermeture: () => resolve(accepte),
    });
  });
}
