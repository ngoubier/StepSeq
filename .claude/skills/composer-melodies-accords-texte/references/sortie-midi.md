# Sortie et export MIDI

Employer Python 3 sans dépendance supplémentaire :

```sh
python3 scripts/export_midi.py phrase.json
python3 scripts/export_midi.py phrase.json melodie.mid
```

Fournir les chemins absolus adaptés au dossier du skill. Le premier appel valide sans produire de MIDI. Sauvegarder les livrables selon les règles de fichiers en vigueur dans la session ; garder les données de travail temporaires en scratch.

# Schéma JSON

- time_signature : [numérateur, dénominateur puissance de deux].
- bars : nombre entier de mesures complètes.
- bpm : tempo à la noire, 90 par défaut ; convertir un tempo à la noire pointée en le multipliant par 3/2.
- attacks_per_bar : liste optionnelle des nombres d’attaques attendus dans chaque mesure.
- events : événements successifs, triés, contigus et sans chevauchement.
- Pour chaque événement : start (début absolu, 0 = début de phrase), duration (durée strictement positive), note (MIDI 0–127, ou null pour un silence), velocity (1–127 pour une note), syllable (texte facultatif).
- Exprimer start et duration en noires, avec des chaînes rationnelles pour les fractions : "1/3", "7/2". Ne pas utiliser 0.333333 pour un triolet exact.
- Employer un seul événement pour une note liée traversant une barre ou un changement d’accord. Ne pas répéter la syllabe à la barre.
- Pour une structure sans paroles, conserver les identifiants abstraits dans le tableau, omettre syllable dans le MIDI ou indiquer explicitement qu’il s’agit d’identifiants.

Exemple de huit attaques sur deux mesures 4/4, répartition 3+5. Les hauteurs ci-dessous illustrent uniquement le format ; composer les hauteurs d’après la vraie grille :

```json
{
  "time_signature": [4, 4], "bars": 2, "bpm": 90,
  "attacks_per_bar": [3, 5],
  "events": [
    {"start": 0, "duration": 2, "note": 64, "velocity": 84},
    {"start": 2, "duration": 1, "note": null},
    {"start": 3, "duration": "1/2", "note": 67, "velocity": 75},
    {"start": "7/2", "duration": "1/2", "note": 65, "velocity": 72},
    {"start": 4, "duration": 1, "note": 64, "velocity": 82},
    {"start": 5, "duration": "1/2", "note": 62, "velocity": 74},
    {"start": "11/2", "duration": "1/2", "note": 64, "velocity": 76},
    {"start": 6, "duration": 1, "note": 62, "velocity": 79},
    {"start": 7, "duration": 1, "note": 60, "velocity": 86}
  ]
}
```

# Garanties et limites de l’outil

Exporter un fichier MIDI standard type 0, une piste de mélodie canal 1, résolution 960 ticks par noire, métadonnées tempo et signature, paroles UTF-8 si fournies. Certains lecteurs interprètent diversement les caractères accentués des paroles ; le tableau textuel reste la référence. Ne produire ni timbre vocal ni audio.

Contrôler les valeurs numériques, la couverture temporelle complète, la monophonie et, si fournis, les nombres d’attaques par mesure. Représenter explicitement les silences par note null. Faire terminer le MIDI à la durée déclarée même en présence d’un silence final. Ordonner les fins de notes avant les attaques à un même tick pour les répétitions.

Ne pas prétendre que l’outil contrôle les accords, le décompte linguistique ou le lien entre syllabes et mots. Réaliser ces vérifications dans le workflow. Une subdivision non représentable exactement à 960 PPQ est rejetée ; adapter l’exporteur si nécessaire, sans arrondir silencieusement.

Pour une anacrouse ou des mesures changeantes, expliquer la convention dans le tableau et employer un exporteur adapté : le script fourni couvre une signature fixe et des mesures complètes uniquement. Ne pas falsifier la structure pour le faire accepter.

Après export, vérifier le fichier, le nombre d’attaques et les durées au moyen d’un lecteur MIDI si disponible, ou d’une lecture indépendante de ses événements. Ne pas annoncer une écoute si aucune n’a eu lieu. Fournir le tableau et le lien vers le fichier réellement créé.
