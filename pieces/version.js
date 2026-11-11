// Le numéro de version des pièces de cette troupe : leurs textes, leurs voix et leurs listes.
//
// >>> À AUGMENTER à chaque pièce ajoutée, modifiée ou retirée, et à chaque voix refaite. <<<
// Le téléphone ne détecte une mise à jour que si sw.js, ou ce fichier qu'il charge, change d'au
// moins un octet. Sans cela, il continuerait de servir les anciennes pièces, indéfiniment.
//
// Le code de l'app a son propre numéro, VERSION dans sw.js, et il n'appartient qu'à l'original
// d'Awaseru : dans la copie d'une troupe, on ne touche qu'à ce dossier pieces/. Ainsi, récupérer
// une mise à jour de l'original ne se heurte jamais aux pièces de la troupe.
const VERSION_PIECES = 1;
