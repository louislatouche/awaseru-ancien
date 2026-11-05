// Les demandes de confirmation, dans le style de l'app (la « feuille du bas » du design kit),
// à la place de la fenêtre confirm() du navigateur. Même principe que dans Faktur.

import { el } from './dom.js';

// Renvoie une promesse : on écrit « if (await confirmer({...})) ... », et le code attend la réponse.
export function confirmer({ titre, message, oui = 'Confirmer', non = 'Annuler' }) {
  return new Promise((resolve) => {
    function fermer(reponse) {
      document.removeEventListener('keydown', surTouche);
      window.removeEventListener('hashchange', surChangementEcran);
      document.body.classList.remove('modal-open');
      fond.remove();
      resolve(reponse);
    }

    const surTouche = (evenement) => {
      if (evenement.key === 'Escape') fermer(false);
    };
    // Le bouton Retour d'Android change d'écran : la fenêtre ne doit pas rester ouverte par-dessus.
    const surChangementEcran = () => fermer(false);

    const fond = el('div', {
      className: 'modal-overlay',
      // Toucher à côté de la fenêtre vaut pour « Annuler ».
      onclick: (evenement) => {
        if (evenement.target === fond) fermer(false);
      },
    },
    el('div', { className: 'modal-card', role: 'dialog', 'aria-modal': 'true' },
      el('div', { className: 'modal-head' }, el('strong', { className: 'modal-title' }, titre)),
      el('div', { className: 'modal-body' }, el('p', { className: 'modal-msg' }, message)),
      el('div', { className: 'modal-actions' },
        el('button', { type: 'button', className: 'btn-ghost btn-petit', onclick: () => fermer(false) }, non),
        el('button', { type: 'button', className: 'btn btn-petit', onclick: () => fermer(true) }, oui))));

    document.addEventListener('keydown', surTouche);
    window.addEventListener('hashchange', surChangementEcran);
    document.body.append(fond);
    document.body.classList.add('modal-open');
    // À la prochaine image affichée seulement : sinon le fondu d'apparition ne se déclenche pas.
    requestAnimationFrame(() => fond.classList.add('show'));
  });
}
