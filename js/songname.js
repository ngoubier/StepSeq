/*
 * Nom inventé d'une nouvelle chanson : un nom commun suivi d'un adjectif accordé (« Lune pâle », « Ciel d'ambre »…),
 * à la place de « Nouveau projet ». Sans DOM : testable sous Node.
 * invent(taken, rand) : évite les titres de `taken` (Set ou tableau, sans tenir compte de la casse) tant que c'est possible.
 */
window.SS = window.SS || {};
SS.songName = (() => {
  // [nom, genre] : f = féminin, m = masculin
  const NOUNS = [
    ['Lune', 'f'], ['Nuit', 'f'], ['Aube', 'f'], ['Rive', 'f'], ['Pluie', 'f'], ['Ville', 'f'], ['Route', 'f'], ['Vague', 'f'],
    ['Étoile', 'f'], ['Lumière', 'f'], ['Forêt', 'f'], ['Plage', 'f'], ['Brume', 'f'], ['Flamme', 'f'], ['Saison', 'f'], ['Danse', 'f'],
    ['Marée', 'f'], ['Neige', 'f'], ['Fenêtre', 'f'], ['Promesse', 'f'], ['Rumeur', 'f'], ['Chambre', 'f'], ['Île', 'f'], ['Comète', 'f'],
    ['Ciel', 'm'], ['Soleil', 'm'], ['Jardin', 'm'], ['Désert', 'm'], ['Orage', 'm'], ['Rivage', 'm'], ['Silence', 'm'], ['Voyage', 'm'],
    ['Miroir', 'm'], ['Matin', 'm'], ['Soir', 'm'], ['Horizon', 'm'], ['Écho', 'm'], ['Nuage', 'm'], ['Phare', 'm'], ['Rêve', 'm'],
    ['Train', 'm'], ['Quai', 'm'], ['Vertige', 'm'], ['Secret', 'm'], ['Royaume', 'm'], ['Velours', 'm'], ['Néon', 'm'], ['Hiver', 'm'],
  ];
  // [masculin, féminin]
  const ADJS = [
    ['pâle', 'pâle'], ['bleu', 'bleue'], ['doré', 'dorée'], ['lointain', 'lointaine'], ['secret', 'secrète'], ['fragile', 'fragile'],
    ['tranquille', 'tranquille'], ['électrique', 'électrique'], ['endormi', 'endormie'], ['sauvage', 'sauvage'], ['brûlant', 'brûlante'],
    ['infini', 'infinie'], ['éphémère', 'éphémère'], ['nocturne', 'nocturne'], ['argenté', 'argentée'], ['perdu', 'perdue'],
    ['immobile', 'immobile'], ['magnétique', 'magnétique'], ['suspendu', 'suspendue'], ['léger', 'légère'], ['profond', 'profonde'],
    ['violet', 'violette'], ['éclatant', 'éclatante'], ['silencieux', 'silencieuse'], ['tendre', 'tendre'], ['oublié', 'oubliée'],
    ['rêveur', 'rêveuse'], ['vertical', 'verticale'], ['cristallin', 'cristalline'], ['fauve', 'fauve'], ['vibrant', 'vibrante'], ['ardent', 'ardente'],
  ];

  function invent(taken, rand = Math.random) {
    const used = new Set([...(taken || [])].map((t) => String(t).toLowerCase()));
    let name = '';
    for (let i = 0; i < 40; i++) {
      const [n, g] = NOUNS[Math.floor(rand() * NOUNS.length)];
      const a = ADJS[Math.floor(rand() * ADJS.length)];
      name = `${n} ${g === 'f' ? a[1] : a[0]}`;
      if (!used.has(name.toLowerCase())) return name;
    }
    return name;
  }

  return { invent, NOUNS, ADJS };
})();
