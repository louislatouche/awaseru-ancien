# Awaseru
Web app installable (PWA) pour apprendre mes répliques du cours de théâtre en japonais, utilisée sur Android.
- JavaScript vanilla (modules ES), sans framework ni build. J'apprends le JavaScript : code lisible, commentaires en français, et explique simplement chaque changement.
- Réponds en français et tutoie-moi.
- Format des pièces : pieces/hanasaka-jiisan.json est le modèle de référence. Pour ajouter une pièce, utilise le skill /nouvelle-piece.
- Après toute modification du code de l'app, incrémente VERSION dans sw.js. Après une modification des pièces ou des voix, incrémente VERSION_PIECES dans pieces/version.js.
