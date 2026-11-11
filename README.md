# Awaseru

Une application web installable (PWA) pour apprendre ses répliques de théâtre en japonais, sur un téléphone Android. Elle fonctionne hors ligne et garde toutes ses données sur le téléphone : aucun serveur, aucun compte.

## Rôle de chaque fichier

| Fichier | Rôle |
|---|---|
| `index.html` | L'unique page de l'app : trois zones vides que le JavaScript remplit. |
| `manifest.webmanifest` | La carte d'identité de l'app pour Android : nom, icônes, mode plein écran. |
| `sw.js` | Le service worker : garde une copie de l'app pour le hors-ligne. Contient le numéro de version du code. |
| `pieces/version.js` | Le numéro de version des pièces et de leurs voix, distinct de celui du code. |
| `css/style.css` | Les styles propres à Awaseru, posés sur le design kit. |
| `css/polices.css` | Déclare les polices rangées dans `polices/`. |
| `design-kit/` | Copie exacte de `tokens.css` et `base.css` du design kit : couleurs, boutons, cartes. Ne pas les modifier ici. |
| `polices/` | Fraunces, Karla et Poppins, servies par l'app pour rester hors ligne, avec leurs licences. |
| `js/app.js` | Le point d'entrée : affiche le bon écran selon l'adresse, enregistre le service worker. |
| `js/dom.js` | Petits outils pour fabriquer des éléments de page sans `innerHTML`, et les icônes. |
| `js/modale.js` | Les demandes de confirmation, en feuille du bas. |
| `js/texte.js` | Le balisage japonais : `[漢字\|よみ]`, `（…）`, texte à lire à voix haute. |
| `js/validation.js` | Vérifie qu'un fichier de pièce est correct avant de l'accepter. |
| `js/stockage.js` | Lit et écrit dans `localStorage` : réglages, sélection, progression. |
| `js/sauvegarde.js` | Copie ces données dans un fichier et les récupère. |
| `js/telechargement.js` | Retire une pièce du téléphone et la retélécharge. |
| `js/langues.js` et `js/langues/` | La langue de l'app et ses dictionnaires, un fichier par langue. |
| `js/pincement.js` | Reconnaît le pincement à deux doigts. |
| `js/pieces.js` | Charge les pièces, calcule la progression, le signal d'entrée et les enchaînements. |
| `js/voix.js` | La lecture à voix haute et ses précautions pour Android. |
| `js/affichage.js` | Les briques communes aux écrans : réplique, interrupteurs, avertissements. |
| `js/ecrans/bibliotheque.js` | Écran des pièces. |
| `js/ecrans/script.js` | Écran du texte complet. |
| `js/ecrans/mes-repliques.js` | Écran du choix des rôles et des répliques. |
| `js/ecrans/fiches.js` | Répétition en fiches. |
| `js/ecrans/filage.js` | Répétition en filage. |
| `js/ecrans/reglages.js` | Écran des réglages. |
| `pieces/index.json` | La liste des pièces fournies avec l'app. |
| `pieces/hanasaka-jiisan.json` | La pièce d'exemple. |
| `pieces/audio/` | Les fichiers audio par réplique, et dans chaque dossier `voix.json`, le choix des voix par rôle. |
| `outils/generer-audio.mjs` | Fabrique ces fichiers audio avec AivisSpeech. Il tourne sur ton ordinateur, pas dans l'app. |
| `icons/` | Les dessins sources (SVG) et les icônes exportées (PNG). |
| `.nojekyll` | Fichier vide : dit à GitHub Pages de publier les fichiers tels quels. |
| `CLAUDE.md` | Les consignes du projet pour Claude. |
| `.claude/skills/nouvelle-piece/` | Le skill qui transforme un PDF de pièce en fichier Awaseru. |

## L'apparence

Awaseru utilise le thème clair du design kit de Louis, comme Faktur et SessionConnect : fond papier, sauge, ambre, Fraunces pour les titres, Karla pour le texte. L'app ne suit pas le mode sombre du téléphone.

Le kit fonctionne par copie : le maître est dans `P:\_DEV\design-kit`. Pour reprendre une nouvelle version, recopie `tokens.css` et `base.css` dans `design-kit/`, puis augmente `VERSION` dans `sw.js`.

Le kit charge normalement ses polices depuis Google Fonts. Awaseru garde les siennes dans `polices/` : aucune ressource externe, et la même typographie hors ligne. Le japonais reste affiché avec la police du téléphone.

## Les voix

Les pièces fournies ont une voix enregistrée par rôle : des fichiers MP3 générés à l'avance sur l'ordinateur avec [AivisSpeech](https://aivis-project.com/), gratuit et local. Elles marchent donc hors ligne, avec la même voix sur tous les téléphones. L'app se sert de la voix du téléphone si un fichier manque. Un réglage permet de les comparer.

Pour changer une voix, modifie `pieces/audio/<id>/voix.json`, démarre AivisSpeech, puis :

```bash
node outils/generer-audio.mjs hanasaka-jiisan
```

Pour ne refaire que quelques répliques, ajoute leurs numéros à la fin de la commande. Il faut que `ffmpeg` soit installé. Augmente ensuite `VERSION_PIECES` dans `pieces/version.js`, puis publie.

Le script garde les kanji, car le moteur reconnaît mieux les mots qu'avec des kana seuls. Il compare ensuite la lecture du moteur à tes furigana : là où elle diffère, il remplace ce kanji par sa lecture, puis le signale dans son rapport.

## Tester sur l'ordinateur

Dans ce dossier :

```bash
python -m http.server 8000
```

Puis ouvre <http://localhost:8000> dans Chrome. Il faut passer par ce petit serveur : ouvrir `index.html` en double-cliquant ne fonctionne pas, car les modules JavaScript et le service worker sont refusés pour un fichier local.

**Piège quand tu modifies le code.** Une fois le service worker en place, le navigateur sert sa copie, pas tes fichiers. Pour voir tes changements : monte le numéro `VERSION` dans `sw.js`, ou bien, dans Chrome, ouvre les outils de développement (F12), onglet *Application*, section *Service workers*, et coche *Update on reload*.

## Tester depuis le téléphone, sur le même Wi-Fi

1. Laisse le serveur tourner sur l'ordinateur.
2. Trouve l'adresse de l'ordinateur : tape `ipconfig` dans un terminal et repère « Adresse IPv4 » (par exemple `192.168.1.20`).
3. Sur le téléphone, ouvre dans Chrome `http://192.168.1.20:8000` avec ton adresse.
4. Si la page ne s'ouvre pas, le pare-feu de Windows bloque sans doute Python : autorise-le sur les réseaux privés.

**Limite importante : sans HTTPS, l'installation et le hors-ligne ne marchent pas.** Chrome réserve les service workers aux adresses sécurisées (HTTPS ou `localhost`). Une adresse en `http://192.168...` permet de tester l'affichage et la voix, rien de plus. Pour installer l'app, il faut la mettre en ligne.

## Mettre en ligne sur GitHub Pages

GitHub Pages héberge gratuitement l'app en HTTPS. Le dépôt doit être public avec un compte gratuit : le texte de tes pièces fournies sera donc visible par tous.

1. Sur <https://github.com/new>, crée un dépôt nommé `awaseru`, public.
2. Dans ce dossier, envoie les fichiers (remplace `TONNOM` par ton identifiant GitHub) :

   ```bash
   git init -b main
   ```

   ```bash
   git add .
   ```

   ```bash
   git commit -m "Première version d'Awaseru"
   ```

   ```bash
   git remote add origin https://github.com/TONNOM/awaseru.git
   ```

   ```bash
   git push -u origin main
   ```

3. Sur la page du dépôt, ouvre **Settings**, puis **Pages** dans la colonne de gauche.
4. Sous **Build and deployment**, à la ligne **Source**, choisis **Deploy from a branch**.
5. Choisis la branche `main`, le dossier `/ (root)`, puis clique sur **Save**.
6. Attends quelques minutes (jusqu'à 10) : l'app est en ligne à l'adresse `https://TONNOM.github.io/awaseru/`.

### Publier une mise à jour

1. Modifie les fichiers.
2. **Augmente le bon numéro de version** (1 devient 2) : `VERSION` dans `sw.js` si tu as changé le code, `VERSION_PIECES` dans `pieces/version.js` si tu as changé une pièce ou une voix. Sans cela, le téléphone garde indéfiniment l'ancienne version : il ne détecte une mise à jour que si l'un de ces deux fichiers change.
3. Envoie les changements :

   ```bash
   git add .
   ```

   ```bash
   git commit -m "Ce que j'ai changé"
   ```

   ```bash
   git push
   ```

4. Sur le téléphone, ferme l'app et rouvre-la. Un bandeau « Nouvelle version prête » apparaît : touche-le. Le numéro de version est affiché en bas des Réglages : « 131.4 » veut dire le code en version 131 et les pièces en version 4.

## Installer sur Android

1. Ouvre `https://TONNOM.github.io/awaseru/` dans Chrome et laisse la page se charger quelques secondes.
2. Menu **⋮** de Chrome, puis **Ajouter à l'écran d'accueil** ou **Installer l'application** (le libellé varie selon la version).
3. Awaseru apparaît sur l'écran d'accueil et s'ouvre sans la barre d'adresse.
4. Pour vérifier le hors-ligne : passe en mode avion et ouvre l'app.

### La voix japonaise

Awaseru lit ses pièces avec ses voix enregistrées. La voix du téléphone ne sert que de secours, ou si tu coupes le réglage « Utiliser les voix enregistrées ». Pour l'installer :

**Paramètres Android > Synthèse vocale** (parfois rangée dans Accessibilité ou Gestion globale) **> moteur Google > installer les données vocales > japonais.** Ferme puis rouvre ensuite Awaseru.

## Choisir ses répliques

Awaseru sert à toute la troupe : rien n'est présélectionné, chacun coche ses répliques dans l'écran *Mes répliques*. Pour aller plus vite, pince l'écran avec deux doigts : il ne reste qu'une grille de numéros à toucher. Écarte deux doigts pour revenir au texte.

## Tes données

Les répliques choisies, la progression et les réglages restent sur le téléphone, dans le stockage du navigateur. Ils disparaissent si tu vides les « cookies et données de site » de Chrome. Dans les Réglages, *Sauvegarder* en fait une copie dans un fichier, et *Restaurer* la récupère, y compris sur un autre téléphone.

*Supprimer du téléphone*, sur la carte d'une pièce, efface ses voix de ce téléphone pour libérer de la place, sans rien changer sur le site. La ligne *Télécharger des pièces*, en bas de *Mes pièces*, ouvre la liste des pièces du site, comme celle des extensions d'un navigateur : on coche celles qui manquent, puis *Télécharger* les récupère (il faut alors du réseau). Une suppression ne touche jamais aux répliques choisies ni à la progression, et les mises à jour de l'app ne réinstallent pas une pièce retirée.

## Ajouter une nouvelle pièce

**Depuis un PDF du cours :** dans Claude Code, lance `/nouvelle-piece chemin/du/script.pdf`. Le skill convertit le PDF, pose les furigana, choisit les voix, génère l'audio, vérifie le tout et ajoute la pièce à l'app.

**À la main :**

1. Place le fichier dans `pieces/`.
2. Ajoute son nom dans `pieces/index.json` : `["hanasaka-jiisan.json", "ma-piece.json"]`.
3. Choisis les voix dans `pieces/audio/<id>/voix.json`, puis génère l'audio (voir « Les voix »).
4. Augmente `VERSION_PIECES` dans `pieces/version.js`, puis publie.

### Format d'un fichier de pièce

```json
{
  "format": 1,
  "id": "ma-piece",
  "titre": "[花|はな]さかじいさん",
  "titre_fr": "Le Vieux Monsieur aux fleurs",
  "explication": "Quelques mots sur la pièce.",
  "roles": [
    { "id": "narrateur", "nom": "ナレーター", "nom_fr": "Narrateur" },
    {
      "id": "ojiisan",
      "nom": "[正直|しょうじき]なおじいさん",
      "nom_court": "[正直|しょうじき]おじい",
      "nom_fr": "Gentil Vieux Monsieur",
      "note": "Facultatif",
      "lien": "https://exemple.fr/facultatif"
    }
  ],
  "scenes": [
    {
      "numero": 1,
      "titre": "[畑|はたけ]とシロ",
      "titre_fr": "Le champ et Shiro",
      "repliques": [
        { "numero": 1, "role": "narrateur", "texte": "むかしむかし。", "fr": "Il était une fois." },
        { "numero": 2, "role": "ojiisan", "texte": "おや。\n（[犬|いぬ]が[吠|ほ]える）", "fr": "Tiens. (Le chien aboie)" },
        { "numero": 3, "role": null, "texte": "おしまい。", "fr": "Fin." }
      ]
    }
  ]
}
```

Les règles que l'app vérifie au chargement :

- **Numéros de répliques** : uniques dans toute la pièce, pas seulement dans une scène. La progression y est attachée, évite donc de les renuméroter.
- **`role`** : l'`id` d'un rôle déclaré, ou `null` pour une réplique sans rôle. Une réplique sans rôle est lue par l'app, sauf si tu la coches dans *Mes répliques*.
- **`[漢字|よみ]`** : affiche le kanji avec sa lecture, et c'est la lecture qui est prononcée.
- **`（…）`** : didascalie ou bruitage, en gris italique, non lue par défaut. Seules les parenthèses japonaises comptent.
- **`\n`** : retour à la ligne.
- **`lien`** : uniquement une adresse `http` ou `https`. Il s'affiche dans *À propos de cette pièce*, à côté du nom du rôle. Son libellé suit l'adresse : *Voir la vidéo* pour YouTube ou Vimeo, sinon *Ouvrir le lien*.
- **Facultatifs** : `format`, `id` (sinon le nom du fichier est utilisé), `nom_court`, `note`, `lien`.
- **Anglais** : `titre_en`, `explication_en`, `nom_en`, `note_en`, `credit_en`, et `en` sur chaque réplique. Toutes les langues autres que le français les affichent. S'il en manque un, le français s'affiche à sa place.
