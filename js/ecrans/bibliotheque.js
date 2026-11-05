// Écran 1 : la liste des pièces, l'import et la suppression.

import { el, remplacer, signaler } from '../dom.js';
import { creerTitreVue } from '../affichage.js';
import { confirmer } from '../modale.js';
import { creerJaponais, texteBrut } from '../texte.js';
import { importerFichier, lignesDe, progressionDe, supprimerPieceImportee, toutesLesPieces } from '../pieces.js';

function texteProgression({ total, sues, aRevoir }) {
  if (total === 0) return 'Aucune réplique choisie';
  const base = `${sues}/${total} ${sues > 1 ? 'sues' : 'sue'}`;
  return aRevoir > 0 ? `${base}, ${aRevoir} à revoir` : base;
}

function creerCarte(piece, surSuppression) {
  const progression = progressionDe(piece);
  return el('article', { className: 'card carte-piece' },
    el('a', { className: 'carte-lien', href: `#/piece/${encodeURIComponent(piece.id)}/script` },
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
  const zoneErreur = el('p', { className: 'avis avis-erreur', role: 'alert', hidden: true });
  const zoneListe = el('div', { className: 'liste-pieces' });

  async function rafraichir() {
    const { fournies, importees, erreurs } = await toutesLesPieces();
    const cartes = [
      ...fournies.map((piece) => creerCarte(piece, null)),
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

  // Volontairement sans attribut accept=".json" : sur Android, ce filtre est mal pris en charge et
  // peut griser un fichier .json valide, sans aucun moyen de le choisir. La validation qui suit
  // refuse de toute façon ce qui n'est pas une pièce, avec un message clair.
  const champFichier = el('input', {
    type: 'file',
    hidden: true,
    onchange: async () => {
      const fichier = champFichier.files[0];
      // On vide le champ : sinon, rechoisir le même fichier corrigé ne déclencherait aucun événement.
      champFichier.value = '';
      if (!fichier) return;
      zoneErreur.hidden = true;
      try {
        const piece = await importerFichier(fichier, (p) => confirmer({
          titre: 'Remplacer cette pièce ?',
          message: `« ${texteBrut(p.titre)} » existe déjà. Ta progression est conservée.`,
          oui: 'Remplacer',
        }));
        if (!piece) return;
        signaler(`« ${texteBrut(piece.titre)} » est enregistrée sur ce téléphone.`);
        await rafraichir();
      } catch (erreur) {
        zoneErreur.textContent = `Import impossible (${fichier.name}) :\n${erreur.message}`;
        zoneErreur.hidden = false;
      }
    },
  });

  await rafraichir();

  remplacer(racine,
    creerTitreVue('Mes pièces'),
    zoneListe,
    zoneErreur,
    el('button', {
      type: 'button',
      className: 'btn',
      onclick: () => champFichier.click(),
    }, 'Importer une pièce'),
    champFichier,
  );
}
