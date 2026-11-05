// Écran 1 : la liste des pièces et la progression de chacune.

import { el, remplacer } from '../dom.js';
import { creerTitreVue } from '../affichage.js';
import { confirmer } from '../modale.js';
import { creerJaponais, texteBrut } from '../texte.js';
import { lignesDe, progressionDe, supprimerPieceImportee, toutesLesPieces } from '../pieces.js';

function texteProgression({ total, sues, aRevoir }) {
  if (total === 0) return 'Aucune réplique choisie';
  const base = `${sues}/${total} ${sues > 1 ? 'sues' : 'sue'}`;
  return aRevoir > 0 ? `${base}, ${aRevoir} à revoir` : base;
}

function creerCarte(piece, surSuppression) {
  const progression = progressionDe(piece);
  // Tant qu'aucune réplique n'est choisie, on ouvre directement l'écran pour les choisir.
  const onglet = progression.total > 0 ? 'script' : 'mes-repliques';
  return el('article', { className: 'card carte-piece' },
    el('a', { className: 'carte-lien', href: `#/piece/${encodeURIComponent(piece.id)}/${onglet}` },
      creerJaponais(piece.titre, 'carte-titre'),
      el('span', { className: 'carte-sous-titre' }, piece.titre_fr),
      el('span', { className: 'carte-details' }, `${lignesDe(piece).length} répliques, ${piece.scenes.length} scènes`),
      el('progress', { value: progression.sues, max: Math.max(progression.total, 1), 'aria-label': 'Répliques sues' }),
      el('span', { className: 'carte-progression' }, texteProgression(progression))),
    surSuppression && el('button', {
      type: 'button',
      className: 'btn-ghost btn-petit',
      onclick: surSuppression,
    }, 'Supprimer cette pièce'));
}

export async function afficherBibliotheque(racine) {
  const zoneListe = el('div', { className: 'liste-pieces' });

  async function rafraichir() {
    const { fournies, importees, erreurs } = await toutesLesPieces();
    const cartes = [
      ...fournies.map((piece) => creerCarte(piece, null)),
      // On ne peut plus importer de pièce. Mais si un téléphone en garde une d'avant, elle reste
      // accessible : la faire disparaître en silence serait une mauvaise surprise.
      ...importees.map((piece) => creerCarte(piece, async () => {
        const accepte = await confirmer({
          titre: 'Supprimer cette pièce ?',
          message: `« ${texteBrut(piece.titre)} » et sa progression seront effacées de ce téléphone.`,
          oui: 'Supprimer',
        });
        if (!accepte) return;
        supprimerPieceImportee(piece.id);
        rafraichir();
      })),
    ];
    remplacer(zoneListe,
      cartes,
      erreurs.map((erreur) => el('p', { className: 'avis avis-erreur' }, `Pièce illisible : ${erreur}`)),
    );
  }

  await rafraichir();

  remplacer(racine, creerTitreVue('Mes pièces'), zoneListe);
}
