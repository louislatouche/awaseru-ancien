---
name: nouvelle-piece
description: Convertit le script PDF d'une pièce du cours de théâtre japonais en fichier de pièce Replik (JSON avec furigana) et l'ajoute à l'app. À utiliser quand je donne un nouveau script ou un PDF de pièce, ou que je demande d'ajouter une pièce.
---

# Ajouter une pièce à Replik

PDF à traiter : $ARGUMENTS (si vide, demande-moi le fichier).

1. Lis le PDF, en texte ET en image des pages pour vérifier. Attention : les PDF du prof ont parfois une police mal encodée où des hiragana sortent en caractères CJK rares : 䛸=と 䛾=の 䛿=は 䛷=で 䛺=な 䛻=に 䜀=ば 䛶=て 䛹=ど. Corrige-les, et vérifie avec les images qu'il ne reste aucun caractère bizarre.
2. Structure la pièce exactement comme pieces/hanasaka-jiisan.json : rôles avec un id court en ascii, scènes, répliques numérotées comme dans le PDF, role à null quand le PDF n'indique pas de rôle. Recopie la traduction française telle quelle (ne corrige pas le texte du prof, signale-moi seulement les coquilles).
3. Furigana : chaque kanji du japonais (titre, noms de rôles, titres de scènes, répliques) au format [漢字|よみ].
   - Lecture selon le contexte (一人=ひとり, 二人=ふたり, 今日=きょう…).
   - Annotation par mot ; les lectures irrégulières (熟字訓) en bloc sur le mot entier.
   - Les lectures déjà entre parenthèses dans le PDF, ex. 掘（ほ）, passent en furigana et les parenthèses disparaissent.
   - Didascalies et bruitages restent entre （）.
4. Demande-moi quelles répliques sont les miennes (rôles et/ou numéros) et remplis mes_repliques.
5. Vérifie : JSON valide, numéros continus, chaque role existe dans roles, aucun crochet mal fermé. Relis toutes les lectures et liste-moi celles qui ont plusieurs lectures possibles (私, 何, 方…) avec le choix que tu as fait.
6. Enregistre pieces/<id>.json, ajoute-le à pieces/index.json, incrémente la version du cache du service worker, puis propose-moi de faire le commit et le push pour mettre en ligne.
7. Termine par un résumé : titre, nombre de scènes et de répliques, rôles, mes répliques, points à vérifier.
