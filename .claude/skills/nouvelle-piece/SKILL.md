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
   - Anglais : ajoute la traduction anglaise à côté du français (`titre_en`, `explication_en`, `nom_en`, `note_en`, `credit_en`, `titre_en` sur chaque scène, `en` sur chaque réplique). L'app l'affiche dans toutes les langues autres que le français.
3 bis. Vocabulaire (l'onglet Vocabulaire de l'app) : sur le modèle de pieces/hanasaka-jiisan.json, format vérifié par js/validation.js.
   - Une liste `vocabulaire` à la fin de la pièce : chaque mot employé, pas seulement les kanji (mots en kana et en katakana, particules, interjections, onomatopées, noms). `{ "id": "horu", "mot": "[掘|ほ]る", "fr": "creuser", "en": "to dig" }` : id court en ascii, le mot à sa forme du dictionnaire avec les mêmes furigana que le texte, traductions courtes.
   - Sur chaque réplique, juste après `en`, un découpage `mots` : `[{ "t": "[掘|ほ]って", "v": "horu", "fr": "creusez", "en": "dig" }, { "t": "！" }]`. Mis bout à bout, les `t` redonnent exactement `texte` (espaces, retours à la ligne, ponctuation et （ ） compris, chacun dans son propre morceau sans `v`). Ne jamais couper un bloc [漢字|よみ]. Un verbe garde sa conjugaison dans un seul morceau ; les particules sont à part. `fr`/`en` sur le morceau quand le sens en contexte diffère de celui du dictionnaire.
   - Le même mot garde le même id et le même sens de base dans toute la pièce.
4. Vérifie avec `node outils/verifier-piece.mjs <id>` (mêmes règles que l'app) jusqu'à « Pièce valide. », toutes les répliques découpées, aucun morceau japonais sans mot et aucun mot inutilisé. Vérifie aussi : numéros continus, chaque role existe dans roles. Relis toutes les lectures et liste-moi celles qui ont plusieurs lectures possibles (私, 何, 方…) avec le choix que tu as fait, ainsi que les découpages ou traductions de mots qui pourraient se discuter.
5. Enregistre pieces/<id>.json et ajoute-le à pieces/index.json.
6. Voix : crée pieces/audio/<id>/voix.json sur le modèle de pieces/audio/hanasaka-jiisan/voix.json, avec une voix par rôle prise sur AivisHub (licence ACML ou CC0, voix bien distinctes entre rôles qui se répondent). Démarre le moteur AivisSpeech si besoin (AppData\Local\Programs\AivisSpeech\AivisSpeech-Engine\run.exe), lance `node outils/generer-audio.mjs <id>`, puis relis le rapport des lectures. Ajoute à la pièce le champ "audio" avec le crédit des voix. Tu ne peux pas écouter : dis-moi quelles voix tu as choisies et demande-moi de vérifier à l'oreille.
7. Incrémente la version du cache du service worker, puis propose-moi de faire le commit et le push pour mettre en ligne.
8. Termine par un résumé : titre, nombre de scènes et de répliques, rôles, voix choisies, points à vérifier. Chacun choisit ses répliques dans l'app : ne présélectionne rien.
