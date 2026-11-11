# Awaseru

Application web installable (PWA) pour apprendre ses répliques de théâtre en japonais, sur un téléphone Android. JavaScript vanilla (modules ES), sans framework ni étape de construction : les fichiers du dépôt sont publiés tels quels sur GitHub Pages.

Ce fichier donne les consignes à tout assistant de code (Codex, Claude Code...). `CLAUDE.md` ne fait que l'importer.

## L'original et les copies

Awaseru existe en deux sortes de dépôts :

- **L'original** : le code seul. Son dossier `pieces/` reste vide (listes vides, `VERSION_PIECES` à 0). C'est le seul endroit où le code se modifie.
- **Les copies**, une par troupe : un fork de l'original, avec les pièces de la troupe dans `pieces/`. La troupe récupère les améliorations du code avec le bouton « Sync fork » de GitHub.

Pour savoir où tu es : `gh repo view --json isFork,parent`, ou la mention « forked from » sur la page GitHub du dépôt.

**Dans une copie, ne modifie que le dossier `pieces/`.** Tout changement ailleurs (code, styles, ce fichier) ferait bloquer la prochaine synchronisation avec l'original. Si la personne demande de changer l'app elle-même, explique-lui que cela se fait dans l'original, et ne le fais pas ici.

**Dans l'original, ne touche jamais au dossier `pieces/`.** Chaque copie a modifié ces fichiers : le moindre changement ici créerait un conflit chez toutes les troupes.

(Transition : tant que l'original n'existe pas, ce dépôt-ci, `louislatouche/awaseru`, contient encore à la fois le code et les pièces de la troupe de Louis.)

## Ajouter une pièce

Suis le skill `nouvelle-piece` (`.agents/skills/nouvelle-piece/SKILL.md`), du PDF du script jusqu'aux voix enregistrées. Il dit aussi comment installer les outils nécessaires.

## Les numéros de version

Le téléphone garde une copie de toute l'app pour fonctionner hors ligne, et ne la refait que si un numéro de version change :

- les pièces ou les voix ont changé : augmente `VERSION_PIECES` dans `pieces/version.js` ;
- le code a changé (dans l'original seulement) : augmente `VERSION` dans `sw.js`.

## Publier

Un commit poussé sur la branche `main` est en ligne quelques minutes plus tard (GitHub Pages). Propose le commit et le push à la personne une fois le travail vérifié.

## Tester sur l'ordinateur

Dans ce dossier, `python -m http.server 8000`, puis ouvre http://localhost:8000. Le README explique comment voir ses changements malgré la copie hors ligne.

## Écrire pour les personnes qui utilisent ce dépôt

Elles ne sont pas développeuses. Réponds dans leur langue, avec des mots simples, et explique ce que tu fais et pourquoi. Dans le code : lisible, commenté en français.
