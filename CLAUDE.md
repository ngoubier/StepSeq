# CLAUDE.md

Les règles du projet sont dans AGENTS.md, partagé avec les autres agents :

@AGENTS.md

## En plus pour Claude Code

- Répondre à Nicolas en français, simplement, sans jargon technique inutile.
- Les skills de composition du dossier `.claude/skills/` (harmonie, mélodie sur grille, émotions, arrangement)
  guident les choix musicaux : les lire avant de toucher à l'harmonie, à la mélodie ou à l'orchestration.
- Pour voir l'application : `python3 -m http.server 8000` puis Playwright (Chromium déjà installé). Une capture
  destinée à Nicolas se fait en `deviceScaleFactor: 2`.
- Pour piloter l'application comme un utilisateur, passer par `window.StepSeq` (voir `StepSeq.aide()`) plutôt que
  par des clics.
