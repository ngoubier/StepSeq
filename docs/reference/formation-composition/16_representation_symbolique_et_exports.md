# 16 — Représentation symbolique, formats et exports

**Destination : futur agent et développeur de ses outils. Résultat : un contrat de données calculable, distinct d’un texte descriptif.**

## 1. Contrat de représentation proposé

Le format ci-dessous est une proposition propre à ce corpus, pas un standard MIDI, MusicXML ou un schéma officiel. Il permet de garder le brief, les sections, les accords, les motifs et les événements dans un même modèle. Un futur outil devra implémenter son parseur et ses validations.

Toutes les dates sont des positions absolues depuis le début de la pièce, en noires `qn`, zéro inclus. Les durées sont positives. Les fractions sont des chaînes exactes comme `"1/3"`, pas des décimales approximatives. Le champ `pitch_midi` décrit la hauteur entendue de référence avant transposition de patch ; la note écrite éventuelle est séparée.

## 2. Exemple complet minimal

Une mesure en C majeur, 4/4, noire = 120 ; trois pistes et une mélodie de quatre noires :

```json
{
  "schema": "composition-corpus/1.0",
  "title": "Etude originale en C",
  "octave_convention": "C4=MIDI60",
  "time_unit": "quarter_note",
  "duration_qn": "4",
  "tempo_map": [{"at_qn": "0", "bpm_qn": 120}],
  "meter_map": [{"at_qn": "0", "numerator": 4, "denominator": 4}],
  "sections": [{"id": "A", "start_qn": "0", "end_qn": "4"}],
  "harmony": [
    {"id": "H1", "start_qn": "0", "end_qn": "4",
     "symbol": "C", "pitch_classes": [0, 4, 7], "bass_pc": 0}
  ],
  "tracks": [
    {"id": "bass", "role": "bass", "monophonic": true,
     "events": [
       {"id": "b1", "start_qn": "0", "duration_qn": "4",
        "pitch_midi": 48, "spelling": "C3", "velocity": 78}
     ]},
    {"id": "harmony", "role": "chords", "monophonic": false,
     "events": [
       {"id": "h1", "start_qn": "0", "duration_qn": "4",
        "pitch_midi": 64, "spelling": "E4", "velocity": 64},
       {"id": "h2", "start_qn": "0", "duration_qn": "4",
        "pitch_midi": 67, "spelling": "G4", "velocity": 64}
     ]},
    {"id": "lead", "role": "melody", "monophonic": true,
     "events": [
       {"id": "m1", "start_qn": "0", "duration_qn": "1",
        "pitch_midi": 72, "spelling": "C5", "velocity": 82},
       {"id": "m2", "start_qn": "1", "duration_qn": "1",
        "pitch_midi": 76, "spelling": "E5", "velocity": 86},
       {"id": "m3", "start_qn": "2", "duration_qn": "1",
        "pitch_midi": 74, "spelling": "D5", "velocity": 76,
        "harmonic_role": "passing"},
       {"id": "m4", "start_qn": "3", "duration_qn": "1",
        "pitch_midi": 72, "spelling": "C5", "velocity": 80}
     ]}
  ]
}
```

L’accompagnement réalise C avec la basse, E et G. D5, entre E5 et C5, sert de passage descendant. L’exemple est musicalement simple mais représente effectivement toutes ses notes ; il ne contient pas de piste vide prétendument complète.

## 3. Extensions nécessaires pour un morceau réel

Ajouter : `constraints`, `tonal_centers`, `motifs`, `phrase_id`, `source_motif_id`, `transform`, `articulation`, `instrument_profile`, `concert_to_written`, `polyphony_limit`, `render_notes` et `review_status`. Chaque champ doit avoir un sens défini avant son utilisation.

Pour le chant : dictionnaire `lyrics` avec texte original, découpage et `syllable_id` ; chaque événement vocal référence la syllabe. Pour le mélisme, plusieurs notes partagent le même ID. Pour un silence explicite : `kind = rest`, sans hauteur ni vélocité. Sur les pistes polyphoniques, le silence peut aussi être implicite dans l’absence d’événements, selon un choix annoncé.

Séparer `duration_qn`, durée structurelle, de `gate_qn`, durée réellement tenue. Une release sonore peut continuer après le note-off. La durée de fichier audio n’est donc pas nécessairement égale à la durée symbolique.

## 4. Frontières et identités

Chaque intervalle temporel est semi-ouvert : `[début, fin)`. Deux accords consécutifs peuvent donc se toucher exactement sans se chevaucher. Les notes peuvent traverser les frontières, mais leur rôle doit être recalculé sur tous les segments concernés.

Un motif peut être défini relativement à son début, puis instancié. Pour l’export, développer toutes les instances en événements absolus. Conserver les IDs d’origine afin de retrouver la filiation. Les répétitions implicites ne doivent pas masquer des mesures absentes.

## 5. Export MIDI

Le MIDI transporte des événements et des contrôles, pas une voix enregistrée ni une banque sonore complète. Choisir un Standard MIDI File compatible avec la destination. Pour plusieurs pistes simultanées, le format 1 est généralement approprié ; le format 0 rassemble les événements dans une seule piste. Ne pas confondre piste et canal.

Choisir une résolution PPQ capable de représenter les fractions employées. Avec PPQ = 960, une croche de triolet vaut 320 ticks, une double croche 240. Pour un septolet de noires divisant 4 qn en sept, chaque durée est 4/7 qn ; 960 n’offre pas une division exacte. Choisir une résolution compatible ou documenter la quantification.

Le tempo d’un fichier MIDI est exprimé en microsecondes par noire : `60 000 000 / bpm_qn`. À 120 : 500 000. Les temps de piste sont généralement des deltas en ticks ; convertir depuis les positions absolues après tri. À instant identique, ordonner les note-off avant la nouvelle attaque d’une même hauteur sur le même canal si la destination le requiert pour éviter une note coupée ou bloquée.

Conserver tempo, signatures, noms de pistes, paroles et marqueurs quand la destination les prend en charge. Vérifier canaux, programmes et mapping de percussion ; ne pas supposer qu’un numéro de programme sélectionnera le même son sur tous les synthétiseurs.

## 6. MusicXML et rendu audio

MusicXML est destiné à l’échange de partitions structurées, mais nécessite orthographe, voix, mesures, liaisons et transpositions cohérentes. Un MIDI importé automatiquement peut donner une notation peu lisible. Une future implémentation devra vérifier la documentation officielle du format et du logiciel ciblé ; aucun export MusicXML n’est fourni ici.

Pour l’audio, documenter moteur, banques, effets, tempo et format. Réimporter les exports et comparer durée, début, fin et présence des parties. Une chaîne textuelle de paramètres n’est pas un rendu audio. Le corpus ne contient pas de moteur de synthèse.

**Références :** [S15, S20 et S21](21_sources_et_bibliographie.md). Contrat JSON original ; exemples à valider avant intégration. **Confiance : élevée** sur les conventions et calculs décrits ; compatibilité d’un export dépend de l’implémentation.
