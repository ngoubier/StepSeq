# Cubase Steinberg — Description fonctionnelle complète

Date de référence : 15 novembre 2026.  
Version de référence : **Cubase Pro 16**, sortie le 4 novembre 2026.  
Niveau de confiance : **élevé**, d’après les sources officielles Steinberg consultées.

Cubase est un studio de production musicale complet sur Windows et macOS : il permet de composer, programmer des instruments, enregistrer de l’audio et du MIDI, arranger un morceau, corriger les prises, mixer et exporter le résultat.

Cette description couvre l’ensemble du processus de création sans reproduire chaque commande du manuel. Elle prend comme référence l’édition Pro ; Artist et Elements disposent d’une partie de ces fonctions.

## 1. Organisation d’un projet

Le projet rassemble les pistes, les enregistrements, les instruments, les effets et les réglages du morceau.

La fenêtre principale présente une chronologie : horizontalement le temps, verticalement les pistes. Tu peux y déplacer, découper, dupliquer et organiser les éléments musicaux.

| Élément | Fonction |
|---|---|
| Piste audio | Contient les enregistrements de voix, synthétiseurs, guitares, etc. |
| Piste MIDI | Contient des notes et des messages de commande destinés à un instrument |
| Piste instrument | Associe une séquence MIDI à un instrument virtuel |
| Piste sampler | Permet de jouer un échantillon comme un instrument |
| Piste de batterie | Accueille la programmation rythmique et les sons associés |
| Groupe | Regroupe plusieurs signaux pour les traiter ensemble |
| Piste d’effets | Fournit un effet partagé, par exemple une réverbération |
| Pistes de contrôle | Gèrent notamment accords, tempo, métrique, marqueurs et arrangement |

Les dossiers, couleurs, noms et réglages de visibilité servent à garder lisibles les projets importants. Le **Pool** centralise les médias utilisés.

## 2. Composition harmonique : accords, gammes et accompagnements

Cubase dispose de plusieurs outils complémentaires.

**La piste d’accords** décrit la progression harmonique du morceau : par exemple Am, F, C, G, avec leurs positions et leurs durées. Des pistes compatibles peuvent suivre cette harmonie selon le mode choisi.

**Les Chord Pads** permettent de déclencher des accords depuis des pads à l’écran ou un clavier MIDI. Ils servent à chercher une progression et à la jouer sans devoir saisir séparément toutes les notes.

**L’assistant d’accords** aide à explorer des enchaînements. L’éditeur d’accords permet de préciser leur constitution.

**Le Scale Assistant** fournit une aide liée aux gammes dans l’édition MIDI.

Point essentiel : **définir une grille d’accords ne produit pas automatiquement un arrangement abouti**. Tu dois encore choisir les registres, les renversements, le rythme et les instruments. Cubase facilite ces opérations. Il peut également transformer l’entrée MIDI jouée en direct en fonction des accords de la piste.

## 3. Écriture et édition MIDI

Le **Key Editor**, ou piano roll, représente les notes par des rectangles : leur position indique le moment où elles commencent, leur longueur représente leur durée.

Tu peux notamment :

- saisir les notes à la souris, au clavier ou pas à pas ;
- modifier hauteur, position, durée et vélocité ;
- transposer, copier et transformer des phrases ;
- travailler les accords et les lignes mélodiques ;
- éditer les contrôleurs : sustain, modulation, expression, pitch bend, etc. ;
- enregistrer puis corriger une interprétation.

L’éditeur de batterie présente les percussions par noms plutôt que comme un clavier de piano. L’éditeur en liste donne accès aux événements MIDI sous forme de données détaillées.

Cubase 16 ajoute deux outils particulièrement utiles :

| Outil | Résultat |
|---|---|
| **Strum** | Décale les attaques des notes d’un accord pour créer un geste étalé |
| **Stretch Selection** | Étire ou comprime temporellement une phrase MIDI |

Le second permet aussi de construire des accélérations ou ralentissements internes à une phrase sans changer le tempo du projet. Les contrôleurs MIDI peuvent désormais recevoir des noms explicites, adaptés au synthétiseur piloté.

## 4. Quantification, groove et expression

La quantification rapproche les notes d’une grille rythmique : croches, doubles croches, triolets, etc.

Elle peut être :

- **stricte**, pour caler précisément les attaques ;
- **progressive**, pour corriger seulement une partie du décalage ;
- **fondée sur un groove**, pour reprendre les placements rythmiques d’une boucle audio ou MIDI.

Cubase permet également de travailler les durées et de revenir à l’état non quantifié.

Pour obtenir une interprétation expressive, il faut combiner placement, vélocité, durée et articulation. Ajouter du hasard seul ne suffit pas à créer un geste musical crédible.

## 5. Arpégiateurs et transformations MIDI

Les éditions Artist et Pro comprennent des effets MIDI, notamment :

| Effet | Usage |
|---|---|
| **Arpache 5 / Arpache SX** | Transformer des notes ou accords en arpèges |
| **Chorder** | Déclencher des accords à partir de notes |
| **Auto LFO** | Générer des variations de contrôleurs MIDI |
| **MIDI Echo** | Créer des répétitions de notes |
| **Step Designer** | Programmer des séquences |
| **MIDI Modifiers** | Modifier les propriétés des événements MIDI |

Ces traitements interviennent sur les commandes musicales envoyées à l’instrument. Un écho MIDI redéclenche donc des notes ; un delay audio répète le son déjà produit.

L’**éditeur logique** permet des transformations conditionnelles : sélectionner certaines notes, modifier leurs vélocités ou appliquer des changements à une catégorie d’événements.

## 6. Instruments virtuels, sampling et programmation rythmique

Cubase héberge des instruments VST et fournit des instruments et bibliothèques permettant de produire sans acheter immédiatement d’autres logiciels. Il peut aussi accueillir des instruments tiers compatibles.

Le travail instrumental couvre plusieurs usages :

- jouer des sons de synthétiseur ou des instruments échantillonnés ;
- programmer des batteries ;
- transformer un échantillon en instrument jouable ;
- construire des motifs avec le séquenceur de patterns ;
- superposer plusieurs sources sonores.

Dans Cubase 16, les **Instrument Stacks** réunissent plusieurs instruments virtuels, pistes sampler et pistes de batterie sous une piste jouable commune. Chaque couche possède des possibilités de filtrage. La nouvelle bibliothèque **Module FM** enrichit les sons disponibles dans HALion Sonic.

## 7. Enregistrement audio et MIDI

Cubase peut enregistrer simultanément plusieurs sources, dans les limites de l’interface audio et de l’édition utilisée.

Les fonctions comprennent :

- métronome et préparation du départ ;
- enregistrement en boucle ;
- punch in/out pour reprendre un passage précis ;
- pré-roll et post-roll ;
- récupération rétrospective de MIDI joué avant de lancer l’enregistrement ;
- enregistrement de plusieurs prises.

Le **comping**, disponible dans Artist et Pro, consiste à assembler les meilleurs passages de plusieurs prises. Par exemple, conserver le début de la prise 2 et la fin de la prise 4 pour constituer une interprétation finale. Les prises peuvent être organisées en lignes superposées.

## 8. Montage et correction audio

L’édition audio permet de découper, déplacer, ajuster les niveaux, créer des fondus et assembler des prises.

Les outils plus avancés répondent à des problèmes précis :

| Fonction | Utilité |
|---|---|
| Détection de transitoires | Repérer les attaques d’un enregistrement |
| Time-stretch | Modifier sa durée |
| AudioWarp | Repositionner son contenu temporel |
| Quantification audio | Corriger le placement rythmique |
| VariAudio | Éditer la hauteur et le placement de notes sur du contenu monophonique adapté |
| Audio Alignment | Aligner des prises similaires |
| Direct Offline Processing | Appliquer et gérer des traitements audio hors lecture en temps réel |

**VariAudio ne reconstitue pas toutes les notes d’un mix complet.** Il vise notamment les voix et lignes monophoniques ; la séparation d’un mix constitue une autre fonction.

## 9. Séparation des instruments d’un enregistrement

Cubase Pro 16 peut séparer un fichier mixé en six catégories :

**voix, batterie, basse, piano, guitare et autres instruments.**

Cela peut servir à préparer un remix, isoler une partie pour la travailler ou analyser un morceau.

Les fichiers obtenus restent des estimations : ils ne garantissent pas la restitution des pistes originales et peuvent contenir des résidus d’autres instruments.

## 10. Arrangement et structure du morceau

Cubase permet de construire une chanson complète en organisant ses sections.

Les outils structurants comprennent :

- **marqueurs**, pour identifier les passages ;
- **piste Arrangeur**, pour tester des ordres de sections ;
- **TrackVersions**, pour conserver plusieurs variantes d’une partie ;
- **pistes de tempo et de signature**, pour gérer les changements ;
- **transposition globale**, pour modifier la tonalité.

Par exemple, tu peux préparer une introduction, deux couplets, un refrain et un pont, puis essayer plusieurs structures avant de retenir l’enchaînement final.

## 11. Mixage

La **MixConsole** constitue la console de mixage de Cubase. Chaque canal comporte les commandes nécessaires au réglage et au traitement du signal.

| Fonction | Rôle |
|---|---|
| Gain et volume | Régler les niveaux |
| Panoramique | Placer le son dans l’espace stéréo |
| Égalisation | Modifier son équilibre fréquentiel |
| Inserts | Traiter directement le signal du canal |
| Départs d’effets | Envoyer une partie du signal vers un effet partagé |
| Groupes | Traiter ensemble plusieurs pistes |
| Routage | Déterminer les chemins du signal |

Tu peux, par exemple, regrouper les percussions, partager une réverbération entre plusieurs synthétiseurs et organiser des sous-mixages. Les fenêtres et filtres de visibilité permettent de se concentrer sur certaines familles de canaux.

Le **sidechain** permet à un signal de commander un traitement sur un autre : exemple classique, faire diminuer momentanément la basse à chaque frappe de grosse caisse.

Les outils fournis couvrent notamment dynamique, saturation, réverbération, delay, modulation et analyse. Dans Pro, le **Control Room** gère plus finement les écoutes et les retours destinés aux interprètes.

## 12. Automation et modulation

L’automation enregistre ou dessine l’évolution d’un paramètre dans le temps : volume, panoramique, départ de réverbération, ouverture de filtre ou paramètre d’un plugin.

Les **modulateurs**, disponibles dans Pro, produisent des variations dynamiques de paramètres. Cela permet de créer des mouvements répétitifs ou évolutifs sans dessiner chaque changement.

Il faut distinguer :

- **automation audio/plugin** : contrôle un traitement dans Cubase ;
- **contrôleurs MIDI** : transmettent des commandes à un instrument qui les reconnaît.

Cubase 16 améliore notamment la compensation de latence des modulateurs et la manipulation des traitements par glisser-déposer.

## 13. Intégration des synthétiseurs et contrôleurs physiques

Cubase peut envoyer des notes et contrôleurs MIDI à un synthétiseur matériel, puis enregistrer son retour audio.

Dans Pro, la fonction **External Instruments** associe une connexion MIDI à un bus de retour audio pour intégrer plus directement le matériel dans le projet. **Le MIDI ne transporte pas le son : le retour audio reste indispensable.**

Avec un Fantom-06 ou un Take-5, le fonctionnement serait donc :

1. Enregistrer ou écrire la partie MIDI dans Cubase.
2. La faire jouer par le synthétiseur.
3. Ajuster les commandes MIDI prises en charge.
4. Enregistrer le son par l’interface audio.
5. Mixer cet enregistrement avec les autres pistes.

**MIDI Remote** permet de piloter des fonctions de Cubase depuis des boutons, faders ou potentiomètres, selon le contrôleur et son affectation.

## 14. Orchestration, partitions et musique à l’image

Pour l’écriture orchestrale, Cubase associe :

- édition MIDI détaillée ;
- notation sur partition ;
- contrôleurs d’expression ;
- gestion des articulations ;
- travail avec une vidéo et des changements de tempo.

Les **Expression Maps**, dans Pro, organisent les articulations des instruments : legato, staccato, pizzicato, etc. Elles font correspondre une indication musicale aux commandes attendues par la bibliothèque ou l’instrument. Leur fonctionnement dépend donc des sons chargés.

L’éditeur de partition et les échanges avec Dorico/MusicXML complètent le travail de notation. Cubase 16 améliore également les possibilités de sortie vidéo.

## 15. Voix synthétiques et paroles

**Omnivocal Basic** sert à développer des idées vocales par synthèse.

Cubase 16 permet aussi de saisir et d’éditer les paroles à côté des notes MIDI, avec des réglages de prononciation et de langue. Les paroles restent associées aux notes lors de certaines opérations de déplacement et de duplication.

C’est utile pour préparer une maquette chantée. Cela ne garantit pas une interprétation ou une diction équivalente à celle d’un chanteur.

## 16. Export et préparation de la livraison

Cubase exporte le mixage sous forme de fichiers audio avec les paramètres choisis : format, résolution, fréquence d’échantillonnage et canaux concernés.

Dans Pro, les exports avancés et les files de tâches facilitent la production de plusieurs livrables : mix complet, instrumental, groupes ou pistes séparées.

Attention au vocabulaire :

- **exporter des stems** produit des fichiers à partir des pistes du projet ;
- **séparer des stems** essaie de retrouver des composantes à partir d’un fichier déjà mixé.

Les traitements de sortie permettent aussi de préparer le niveau et l’équilibre final d’un morceau. Les presets de mastering sont des points de départ à ajuster à l’enregistrement.

## 17. Différences principales entre éditions

Ce tableau résume les différences structurantes ; il ne remplace pas la matrice complète de Steinberg.

| Fonction | Elements 16 | Artist 16 | Pro 16 |
|---|---|---|---|
| Enregistrement audio/MIDI et mixage | Oui | Oui | Oui |
| Nombre de pistes audio/MIDI/instrument | Limité | Illimité* | Illimité* |
| Comping | Non | Oui | Oui |
| VariAudio | Non | Oui | Oui |
| Arpache et effets MIDI | Non | Oui | Oui |
| Pattern Sequencer et Instrument Stacks | Non | Oui | Oui |
| Expression Maps | Non | Non | Oui |
| Control Room | Non | Non | Oui |
| Modulateurs | Non | Non | Oui |
| Séparation de stems intégrée | Non | Non | Oui |
| Export audio avancé | Non | Non | Oui |

\* Sans plafond logiciel de pistes annoncé pour ces catégories ; les ressources de l’ordinateur restent déterminantes.

## 18. Fonctions particulièrement pertinentes pour tes usages

Pour tes usages de synthétiseurs, d’arpèges et de composition, les fonctions les plus pertinentes sont la piste d’accords, l’édition MIDI, les effets MIDI, la quantification par groove, Strum et l’intégration du matériel. Pour la musique cinématique, les Expression Maps et les outils de travail à l’image prennent davantage d’importance.

## Sources officielles

Sources consultées pour la description initiale, exportée ici au format Markdown :

- [Présentation de Cubase](https://www.steinberg.net/cubase/)
- [Comparaison des éditions](https://www.steinberg.net/cubase/compare-editions/)
- [Nouveautés de Cubase 16](https://www.steinberg.net/cubase/new-features/)
- [Notes de version de Cubase 16](https://www.steinberg.net/cubase/release-notes/16/)
- [Annonce officielle de Cubase 16](https://www.steinberg.net/press/2026/cubase-16/)
- [Manuel Cubase Pro 16](https://www.steinberg.help/r/cubase-pro/16.0/en)
