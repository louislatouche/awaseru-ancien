# Replik

Une application web installable (PWA) pour apprendre ses répliques de théâtre en japonais, sur un téléphone Android. Elle fonctionne hors ligne et garde toutes ses données sur le téléphone : aucun serveur, aucun compte.

## Rôle de chaque fichier

| Fichier | Rôle |
|---|---|
| `index.html` | L'unique page de l'app : trois zones vides que le JavaScript remplit. |
| `manifest.webmanifest` | La carte d'identité de l'app pour Android : nom, icônes, mode plein écran. |
| `sw.js` | Le service worker : garde une copie de l'app pour le hors-ligne. Contient le numéro de version. |
| `css/style.css` | Les styles propres à Replik, posés sur le design kit. |
| `css/polices.css` | Déclare les polices rangées dans `polices/`. |
| `design-kit/` | Copie exacte de `tokens.css` et `base.css` du design kit : couleurs, boutons, cartes. Ne pas les modifier ici. |
| `polices/` | Fraunces, Karla et Poppins, servies par l'app pour rester hors ligne, avec leurs licences. |
| `js/app.js` | Le point d'entrée : affiche le bon écran selon l'adresse, enregistre le service worker. |
| `js/dom.js` | Petits outils pour fabriquer des éléments de page sans `innerHTML`, et les icônes. |
| `js/modale.js` | Les demandes de confirmation, en feuille du bas. |
| `js/texte.js` | Le balisage japonais : `[漢字\|よみ]`, `（…）`, texte à lire à voix haute. |
| `js/validation.js` | Vérifie qu'un fichier de pièce est correct avant de l'accepter. |
| `js/stockage.js` | Lit et écrit dans `localStorage` : réglages, sélection, progression, pièces importées. |
| `js/pieces.js` | Charge les pièces, calcule la progression, le signal d'entrée et les enchaînements. |
| `js/voix.js` | La lecture à voix haute et ses précautions pour Android. |
| `js/affichage.js` | Les briques communes aux écrans : réplique, interrupteurs, avertissements. |
| `js/ecrans/bibliotheque.js` | Écran des pièces, import et suppression. |
| `js/ecrans/script.js` | Écran du texte complet. |
| `js/ecrans/mes-repliques.js` | Écran du choix des rôles et des répliques. |
| `js/ecrans/fiches.js` | Répétition en fiches. |
| `js/ecrans/filage.js` | Répétition en filage. |
| `js/ecrans/reglages.js` | Écran des réglages. |
| `pieces/index.json` | La liste des pièces fournies avec l'app. |
| `pieces/hanasaka-jiisan.json` | La pièce d'exemple. |
| `icons/` | Les dessins sources (SVG) et les icônes exportées (PNG). |
| `.nojekyll` | Fichier vide : dit à GitHub Pages de publier les fichiers tels quels. |
| `CLAUDE.md` | Les consignes du projet pour Claude. |
| `.claude/skills/nouvelle-piece/` | Le skill qui transforme un PDF de pièce en fichier Replik. |

## L'apparence

Replik utilise le thème clair du design kit de Louis, comme Faktur et SessionConnect : fond papier, sauge, ambre, Fraunces pour les titres, Karla pour le texte. L'app ne suit pas le mode sombre du téléphone.

Le kit fonctionne par copie : le maître est dans `P:\_DEV\design-kit`. Pour reprendre une nouvelle version, recopie `tokens.css` et `base.css` dans `design-kit/`, puis augmente `VERSION` dans `sw.js`.

Le kit charge normalement ses polices depuis Google Fonts. Replik garde les siennes dans `polices/` : aucune ressource externe, et la même typographie hors ligne. Le japonais reste affiché avec la police du téléphone.

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

GitHub Pages héberge gratuitement l'app en HTTPS. Le dépôt doit être public avec un compte gratuit : le texte de tes pièces fournies sera donc visible par tous. Si tu préfères le garder pour toi, publie l'app sans ta pièce et importe-la depuis le téléphone.

1. Sur <https://github.com/new>, crée un dépôt nommé `replik`, public.
2. Dans ce dossier, envoie les fichiers (remplace `TONNOM` par ton identifiant GitHub) :

   ```bash
   git init -b main
   ```

   ```bash
   git add .
   ```

   ```bash
   git commit -m "Première version de Replik"
   ```

   ```bash
   git remote add origin https://github.com/TONNOM/replik.git
   ```

   ```bash
   git push -u origin main
   ```

3. Sur la page du dépôt, ouvre **Settings**, puis **Pages** dans la colonne de gauche.
4. Sous **Build and deployment**, à la ligne **Source**, choisis **Deploy from a branch**.
5. Choisis la branche `main`, le dossier `/ (root)`, puis clique sur **Save**.
6. Attends quelques minutes (jusqu'à 10) : l'app est en ligne à l'adresse `https://TONNOM.github.io/replik/`.

### Publier une mise à jour

1. Modifie les fichiers.
2. **Augmente `VERSION` dans `sw.js`** (1 devient 2). Sans cela, le téléphone garde indéfiniment l'ancienne version : il ne détecte une mise à jour que si `sw.js` change.
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

4. Sur le téléphone, ferme l'app et rouvre-la. Un bandeau « Nouvelle version prête » apparaît : touche-le. Le numéro de version est affiché en bas des Réglages.

## Installer sur Android

1. Ouvre `https://TONNOM.github.io/replik/` dans Chrome et laisse la page se charger quelques secondes.
2. Menu **⋮** de Chrome, puis **Ajouter à l'écran d'accueil** ou **Installer l'application** (le libellé varie selon la version).
3. Replik apparaît sur l'écran d'accueil et s'ouvre sans la barre d'adresse.
4. Pour vérifier le hors-ligne : passe en mode avion et ouvre l'app.

### La voix japonaise

Replik utilise la synthèse vocale du téléphone. Si aucune voix japonaise n'est trouvée, l'app le signale et le filage s'arrête à chaque réplique au lieu de lire. Pour l'installer :

**Paramètres Android > Synthèse vocale** (parfois rangée dans Accessibilité ou Gestion globale) **> moteur Google > installer les données vocales > japonais.** Ferme puis rouvre ensuite Replik.

## Ajouter une nouvelle pièce

**Depuis un PDF du cours :** dans Claude Code, lance `/nouvelle-piece chemin/du/script.pdf`. Le skill convertit le PDF, pose les furigana, te demande tes répliques, vérifie le tout et ajoute la pièce à l'app.

**Depuis un fichier déjà prêt : l'importer.** Copie le fichier `.json` sur le téléphone, puis dans la bibliothèque, touche *Importer une pièce*. Elle reste sur ce téléphone seulement. Réimporter un fichier de même `id` remplace la pièce et conserve la progression, ce qui permet de corriger un texte.

**Pour la fournir avec l'app :**

1. Place le fichier dans `pieces/`.
2. Ajoute son nom dans `pieces/index.json` : `["hanasaka-jiisan.json", "ma-piece.json"]`.
3. Augmente `VERSION` dans `sw.js`, puis publie.

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
  "mes_repliques": [2],
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

Les règles que l'import vérifie :

- **Numéros de répliques** : uniques dans toute la pièce, pas seulement dans une scène. La progression y est attachée, évite donc de les renuméroter.
- **`role`** : l'`id` d'un rôle déclaré, ou `null` pour une réplique sans rôle. Une réplique sans rôle est lue par l'app, sauf si tu la coches dans *Mes répliques*.
- **`[漢字|よみ]`** : affiche le kanji avec sa lecture, et c'est la lecture qui est prononcée.
- **`（…）`** : didascalie ou bruitage, en gris italique, non lue par défaut. Seules les parenthèses japonaises comptent.
- **`\n`** : retour à la ligne.
- **`lien`** : uniquement une adresse `http` ou `https`.
- **Facultatifs** : `format`, `id` (sinon le nom du fichier est utilisé), `nom_court`, `note`, `lien`, `mes_repliques`.
