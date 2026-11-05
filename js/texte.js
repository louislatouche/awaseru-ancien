// Tout ce qui concerne le balisage des textes japonais des pièces :
//   [漢字|よみ]  un kanji et sa lecture
//   （…）        une didascalie ou un bruitage (parenthèses japonaises uniquement)

// Le motif trouve [quelque chose|quelque chose]. Les parenthèses de capture donnent
// le kanji (groupe 1) et la lecture (groupe 2). Le g final veut dire « toutes les occurrences ».
const MOTIF_FURIGANA = /\[([^[\]|]+)\|([^[\]|]+)\]/g;

// Coupe un texte en morceaux : [{ didascalie: false, texte }, { didascalie: true, texte }, ...]
//
// Pourquoi une boucle plutôt qu'un simple motif ? Une didascalie peut contenir du furigana
// (réplique 8 : （シロを[無理|むり]やり...）), et on veut pouvoir traiter les deux couches
// séparément. Le compteur de profondeur gère aussi d'éventuelles parenthèses imbriquées.
function decouperDidascalies(texte) {
  const morceaux = [];
  let courant = '';
  let profondeur = 0;

  const ranger = (didascalie) => {
    if (courant) morceaux.push({ didascalie, texte: courant });
    courant = '';
  };

  for (const caractere of texte) {
    if (caractere === '（') {
      if (profondeur === 0) ranger(false);
      profondeur += 1;
      courant += caractere;
    } else if (caractere === '）' && profondeur > 0) {
      courant += caractere;
      profondeur -= 1;
      if (profondeur === 0) ranger(true);
    } else {
      courant += caractere;
    }
  }
  ranger(profondeur > 0);
  return morceaux;
}

// Ajoute un texte dans un élément en transformant [漢字|よみ] en <ruby>漢字<rt>よみ</rt></ruby>.
function ajouterAvecFurigana(parent, texte) {
  let position = 0;
  for (const trouve of texte.matchAll(MOTIF_FURIGANA)) {
    parent.append(texte.slice(position, trouve.index));
    const ruby = document.createElement('ruby');
    const lecture = document.createElement('rt');
    lecture.textContent = trouve[2];
    ruby.append(trouve[1], lecture);
    parent.append(ruby);
    position = trouve.index + trouve[0].length;
  }
  parent.append(texte.slice(position));
}

// Construit l'élément à afficher pour un texte japonais.
export function creerJaponais(texte, classe = '') {
  const racine = document.createElement('span');
  racine.className = classe;
  // lang="ja" est indispensable : sur un téléphone réglé en français, sans cette indication,
  // le système peut dessiner certains kanji avec leur forme chinoise.
  racine.lang = 'ja';

  for (const morceau of decouperDidascalies(texte)) {
    if (morceau.didascalie) {
      const span = document.createElement('span');
      span.className = 'didascalie';
      ajouterAvecFurigana(span, morceau.texte);
      racine.append(span);
    } else {
      ajouterAvecFurigana(racine, morceau.texte);
    }
  }
  return racine;
}

// Met en forme pour une voix un texte déjà débarrassé de ses furigana : sans les didascalies,
// sauf si le réglage les garde. Renvoie '' s'il n'y a rien à dire.
function preparerPourVoix(texteSansFurigana, garderDidascalies) {
  const morceaux = decouperDidascalies(texteSansFurigana);
  const resultat = morceaux
    .filter((morceau) => garderDidascalies || !morceau.didascalie)
    .map((morceau) => morceau.texte)
    .join(' ')
    .replace(/[（）]/g, ' ')  // si on garde les didascalies, on ne veut pas entendre les parenthèses
    .replace(/\s+/g, ' ')     // les retours à la ligne deviennent de simples espaces
    .trim();
  // \p{L} = une lettre, quelle que soit l'écriture. S'il ne reste que de la ponctuation,
  // il n'y a rien à prononcer, et certains moteurs ne préviennent jamais qu'ils ont fini.
  return /[\p{L}\p{N}]/u.test(resultat) ? resultat : '';
}

// Le texte pour la voix du téléphone : la lecture à la place du kanji.
export function texteAParler(texte, garderDidascalies = false) {
  return preparerPourVoix(texte.replace(MOTIF_FURIGANA, '$2'), garderDidascalies);
}

// Le texte pour générer les fichiers audio (voir outils/generer-audio.mjs) : on garde les kanji,
// car ils aident le moteur à reconnaître les mots, donc à bien couper et accentuer. Les kanji de
// l'ensemble enKana sont remplacés par leur lecture : ce sont ceux que le moteur lit de travers.
export function texteAvecKanji(texte, garderDidascalies = false, enKana = new Set()) {
  const sansFurigana = texte.replace(MOTIF_FURIGANA, (_, kanji, lecture) => (enKana.has(kanji) ? lecture : kanji));
  return preparerPourVoix(sansFurigana, garderDidascalies);
}

// La liste des furigana d'un texte, dans l'ordre : [{ kanji, lecture }, ...]
export function furiganaDe(texte, garderDidascalies = false) {
  return decouperDidascalies(texte)
    .filter((morceau) => garderDidascalies || !morceau.didascalie)
    .flatMap((morceau) => [...morceau.texte.matchAll(MOTIF_FURIGANA)])
    .map((trouve) => ({ kanji: trouve[1], lecture: trouve[2] }));
}

// Le texte sans balisage, pour les endroits qui n'acceptent pas de <ruby> (menu déroulant, onglet).
export function texteBrut(texte) {
  return texte.replace(MOTIF_FURIGANA, '$1');
}

// Vérifie le balisage d'un texte. Renvoie un message d'erreur, ou null si tout va bien.
export function erreurDeBalisage(texte) {
  const reste = texte.replace(MOTIF_FURIGANA, '');
  if (reste.includes('[') || reste.includes(']') || reste.includes('|')) {
    return 'furigana mal écrit (il faut la forme [漢字|よみ])';
  }
  let profondeur = 0;
  for (const caractere of texte) {
    if (caractere === '（') profondeur += 1;
    if (caractere === '）') profondeur -= 1;
    if (profondeur < 0) break;
  }
  return profondeur === 0 ? null : 'parenthèses japonaises （ ） non équilibrées';
}
