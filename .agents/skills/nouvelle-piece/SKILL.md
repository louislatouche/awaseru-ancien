---
name: nouvelle-piece
description: Convertit le script PDF d'une pièce de théâtre japonais en fichier de pièce Awaseru (JSON avec furigana, vocabulaire et voix enregistrées) et l'ajoute à l'app. À utiliser quand on donne un nouveau script ou un PDF de pièce, ou qu'on demande d'ajouter une pièce.
---

# Ajouter une pièce à Awaseru

Le PDF à traiter est celui que la personne indique. Si elle n'en indique pas, demande-le.

Le modèle de référence est `exemple/hanasaka-jiisan.json`, dans le dossier de ce skill, avec `exemple/voix.json` pour les voix : une pièce complète et validée, où toutes les règles ci-dessous sont appliquées. C'est un exemple : ne l'ajoute pas à l'app.

Ne modifie rien en dehors du dossier `pieces/` (voir AGENTS.md).

## Avant de commencer : les outils

Trois outils doivent être installés sur l'ordinateur. Vérifie chacun. S'il manque, dis à la personne ce que tu vas installer et pourquoi, demande son accord, puis installe-le.

- **Node.js**, pour vérifier la pièce et préparer les voix. Vérifier : `node --version`. Windows : `winget install --id OpenJS.NodeJS.LTS --exact`. macOS : `brew install node`, ou l'installateur de https://nodejs.org.
- **ffmpeg**, pour enregistrer les voix en MP3. Vérifier : `ffmpeg -version`. Windows : `winget install --id Gyan.FFmpeg --exact`. macOS : `brew install ffmpeg`.
- **AivisSpeech**, qui fabrique les voix japonaises, gratuitement, sur l'ordinateur. Il n'est pas dans winget : télécharge l'installateur depuis le site officiel, https://aivis-project.com/ (Windows : `.exe`, macOS : `.dmg`), puis lance-le ; la personne suit l'assistant d'installation. Son moteur, à démarrer avant de fabriquer les voix :
  - Windows : `C:\Program Files\AivisSpeech\AivisSpeech-Engine\run.exe`, ou `%LOCALAPPDATA%\Programs\AivisSpeech\AivisSpeech-Engine\run.exe` pour une installation réservée à l'utilisateur ;
  - macOS : `/Applications/AivisSpeech.app/Contents/Resources/AivisSpeech-Engine/run`.

  Le moteur répond sur http://127.0.0.1:10101. À son tout premier lancement, il télécharge ses modèles de base (environ 900 Mo) : préviens que cela prend plusieurs minutes. Les voix de chaque rôle, elles, sont installées par `outils/generer-audio.mjs`.

Après une installation par winget, ouvre un nouveau terminal si `node` ou `ffmpeg` reste introuvable.

## Les étapes

1. Lis le PDF, en texte ET en image des pages pour vérifier. Attention : certains PDF ont une police mal encodée où des hiragana sortent en caractères CJK rares : 䛸=と 䛾=の 䛿=は 䛷=で 䛺=な 䛻=に 䜀=ば 䛶=て 䛹=ど. Corrige-les, et vérifie avec les images qu'il ne reste aucun caractère bizarre.
2. Structure la pièce exactement comme le modèle : rôles avec un id court en ascii, scènes, répliques numérotées comme dans le PDF, role à null quand le PDF n'indique pas de rôle. Recopie la traduction française telle quelle (ne corrige pas le texte du script, signale seulement les coquilles).
3. Furigana : chaque kanji du japonais (titre, noms de rôles, titres de scènes, répliques) au format [漢字|よみ].
   - Lecture selon le contexte (一人=ひとり, 二人=ふたり, 今日=きょう…).
   - Annotation par mot ; les lectures irrégulières (熟字訓) en bloc sur le mot entier.
   - Les lectures déjà entre parenthèses dans le PDF, ex. 掘（ほ）, passent en furigana et les parenthèses disparaissent.
   - Didascalies et bruitages restent entre （）.
   - Anglais : ajoute la traduction anglaise à côté du français (`titre_en`, `explication_en`, `nom_en`, `note_en`, `credit_en`, `titre_en` sur chaque scène, `en` sur chaque réplique). L'app l'affiche dans toutes les langues autres que le français.
3 bis. Vocabulaire (l'onglet Vocabulaire de l'app) : sur le modèle, format vérifié par js/validation.js.
   - Une liste `vocabulaire` à la fin de la pièce : chaque mot employé, pas seulement les kanji (mots en kana et en katakana, particules, interjections, onomatopées, noms). `{ "id": "horu", "mot": "[掘|ほ]る", "fr": "creuser", "en": "to dig" }` : id court en ascii, le mot à sa forme du dictionnaire avec les mêmes furigana que le texte, traductions courtes.
   - Sur chaque réplique, juste après `en`, un découpage `mots` : `[{ "t": "[掘|ほ]って", "v": "horu", "fr": "creusez", "en": "dig" }, { "t": "！" }]`. Mis bout à bout, les `t` redonnent exactement `texte` (espaces, retours à la ligne, ponctuation et （ ） compris, chacun dans son propre morceau sans `v`). Ne jamais couper un bloc [漢字|よみ]. Un verbe garde sa conjugaison dans un seul morceau ; les particules sont à part. `fr`/`en` sur le morceau quand le sens en contexte diffère de celui du dictionnaire.
   - Le même mot garde le même id et le même sens de base dans toute la pièce.
   - Et d'une pièce à l'autre : avant de créer un id, cherche le mot dans le vocabulaire des autres pièces (pieces/*.json). Un mot déjà présent avec le même sens reprend exactement son id et son `mot` : une coche « Je savais » vaut pour toutes les pièces, et « Toutes » ne lui donne qu'une carte. Un homographe d'un autre sens prend un autre id (ある « un certain » et ある « il y a »). verifier-piece signale les mots écrits pareil sous un autre id ailleurs : à vérifier un par un.
   - Les particules portent `"particule": true` (après `en`) : la liste du Vocabulaire ne les montre pas, et elles ne s'y révisent pas (le texte les garde touchables). Ce sont les particules casuelles et de liaison (に, と, が, を, は, の, で, から, も, や, へ, まで, より…), leurs emplois de liaison entre propositions (と « quand », が « mais », の « c'est que ») et les particules de fin de phrase (か, よ, ね, ぞ, な, わ…). Pas les copules だ et です, ni の « le fait que » : ils restent des mots ordinaires (choix de l'auteur d'Awaseru, 2026-11-10). Modèle : les 18 particules du modèle.
4. Vérifie avec `node outils/verifier-piece.mjs <id>` (mêmes règles que l'app) jusqu'à « Pièce valide. », toutes les répliques découpées, aucun morceau japonais sans mot et aucun mot inutilisé ; relis la ligne « Particules » qu'il affiche, pour qu'il n'en manque aucune. Vérifie aussi : numéros continus, chaque role existe dans roles. Relis toutes les lectures et liste à la personne celles qui ont plusieurs lectures possibles (私, 何, 方…) avec le choix que tu as fait, ainsi que les découpages ou traductions de mots qui pourraient se discuter.
5. Enregistre pieces/<id>.json et ajoute-le à pieces/index.json.
6. Voix : crée pieces/audio/<id>/voix.json sur le modèle de `exemple/voix.json`, avec une voix par rôle prise sur AivisHub (licence ACML ou CC0, voix bien distinctes entre rôles qui se répondent). Démarre le moteur AivisSpeech (voir « Les outils »), lance `node outils/generer-audio.mjs <id>`, puis relis le rapport des lectures. Ajoute à la pièce le champ "audio" avec le crédit des voix. Tu ne peux pas écouter : dis quelles voix tu as choisies et demande à la personne de vérifier à l'oreille.
7. Augmente VERSION_PIECES dans pieces/version.js (jamais VERSION dans sw.js, qui est celle du code), puis propose de faire le commit et le push pour mettre en ligne.
8. Termine par un résumé : titre, nombre de scènes et de répliques, rôles, voix choisies, points à vérifier. Chacun choisit ses répliques dans l'app : ne présélectionne rien.
