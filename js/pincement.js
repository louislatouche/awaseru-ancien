// Reconnaît le geste de pincement à deux doigts sur un élément.
// Attention : l'élément doit avoir la règle CSS touch-action: pan-y. Sinon, le navigateur garde
// ce geste pour lui, pour zoomer dans la page, et ces fonctions ne seraient jamais appelées.

// De combien l'écart entre les doigts doit changer pour que le geste compte.
const RAPPROCHEMENT = 0.75; // l'écart a diminué d'un quart
const ECARTEMENT = 1.35;    // l'écart a augmenté d'un tiers

const ecartEntre = ([a, b]) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

// surSuivi(rapport) est appelée à chaque mouvement : l'écran peut suivre les doigts.
// surRelache() est appelée quand le geste s'arrête, reconnu ou non.
export function surPincement(element, { surRapprochement, surEcartement, surSuivi, surRelache }) {
  let ecartDeDepart = null;

  const terminer = () => {
    if (ecartDeDepart === null) return;
    ecartDeDepart = null;
    surRelache();
  };

  element.addEventListener('touchstart', (evenement) => {
    if (evenement.touches.length === 2) ecartDeDepart = ecartEntre(evenement.touches);
  }, { passive: true });

  // passive: false, car on doit pouvoir appeler preventDefault() : sans lui, le mouvement des
  // deux doigts ferait aussi défiler la page.
  element.addEventListener('touchmove', (evenement) => {
    if (evenement.touches.length !== 2 || ecartDeDepart === null) return;
    if (evenement.cancelable) evenement.preventDefault();

    const rapport = ecartEntre(evenement.touches) / ecartDeDepart;
    surSuivi(rapport);
    // Une fois le geste reconnu, on oublie le départ : un seul changement par geste.
    if (rapport < RAPPROCHEMENT) {
      terminer();
      surRapprochement();
    } else if (rapport > ECARTEMENT) {
      terminer();
      surEcartement();
    }
  }, { passive: false });

  element.addEventListener('touchend', terminer);
  element.addEventListener('touchcancel', terminer);
}
