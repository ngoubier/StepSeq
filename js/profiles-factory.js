/* Profils d'usine de la console, issus du mixage / mastering de « Train de nuit » (demos/train-de-nuit.compose.py). */
window.SS = window.SS || {};
SS.FACTORY_PROFILES = [
 {
  "id": "f_kick",
  "name": "Kick punchy (synthpop)",
  "desc": "Sub propre, carton à 350 Hz retiré, attaque à 3,5 kHz, compression 3:1.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 30
    },
    "low": {
     "f": 60,
     "g": 1
    },
    "lm": {
     "f": 350,
     "g": -3.5,
     "q": 1.2
    },
    "hm": {
     "f": 3500,
     "g": 2.5,
     "q": 1
    },
    "high": {
     "f": 8000,
     "g": 0
    }
   },
   "comp": {
    "on": true,
    "th": -14,
    "ratio": 3,
    "att": 0.012,
    "rel": 0.08,
    "knee": 3,
    "makeup": 1.5
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  }
 },
 {
  "id": "f_snare",
  "name": "Caisse claire présente",
  "desc": "Passe-haut 120 Hz, présence +3 dB à 5 kHz, air, compression 3:1.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 120
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 450,
     "g": -2.5,
     "q": 1
    },
    "hm": {
     "f": 5000,
     "g": 3,
     "q": 0.8
    },
    "high": {
     "f": 10000,
     "g": 1.5
    }
   },
   "comp": {
    "on": true,
    "th": -16,
    "ratio": 3,
    "att": 0.005,
    "rel": 0.12,
    "knee": 4,
    "makeup": 1.5
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  }
 },
 {
  "id": "f_clap",
  "name": "Clap aéré",
  "desc": "Passe-haut 220 Hz, +2 dB d’air à 9 kHz.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 220
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 400,
     "g": 0,
     "q": 1
    },
    "hm": {
     "f": 2500,
     "g": 0,
     "q": 1
    },
    "high": {
     "f": 9000,
     "g": 2
    }
   },
   "comp": {
    "on": false,
    "th": -18,
    "ratio": 3,
    "att": 0.01,
    "rel": 0.15,
    "knee": 6,
    "makeup": 0
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  }
 },
 {
  "id": "f_hat",
  "name": "Hi-hat brillant",
  "desc": "Passe-haut 400 Hz, +2,5 dB à 10 kHz.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 400
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 400,
     "g": 0,
     "q": 1
    },
    "hm": {
     "f": 2500,
     "g": 0,
     "q": 1
    },
    "high": {
     "f": 10000,
     "g": 2.5
    }
   },
   "comp": {
    "on": false,
    "th": -18,
    "ratio": 3,
    "att": 0.01,
    "rel": 0.15,
    "knee": 6,
    "makeup": 0
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  }
 },
 {
  "id": "f_ohat",
  "name": "Open hat",
  "desc": "Passe-haut 350 Hz, air léger.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 350
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 400,
     "g": 0,
     "q": 1
    },
    "hm": {
     "f": 2500,
     "g": 0,
     "q": 1
    },
    "high": {
     "f": 11000,
     "g": 1.5
    }
   },
   "comp": {
    "on": false,
    "th": -18,
    "ratio": 3,
    "att": 0.01,
    "rel": 0.15,
    "knee": 6,
    "makeup": 0
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  }
 },
 {
  "id": "f_tomlo",
  "name": "Toms (nettoyage)",
  "desc": "Passe-haut 60 Hz, −2 dB à 400 Hz.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 60
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 400,
     "g": -2,
     "q": 1
    },
    "hm": {
     "f": 2500,
     "g": 0,
     "q": 1
    },
    "high": {
     "f": 8000,
     "g": 0
    }
   },
   "comp": {
    "on": false,
    "th": -18,
    "ratio": 3,
    "att": 0.01,
    "rel": 0.15,
    "knee": 6,
    "makeup": 0
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  }
 },
 {
  "id": "f_crash",
  "name": "Cymbale / crash",
  "desc": "Passe-haut 350 Hz, air léger.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 350
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 400,
     "g": 0,
     "q": 1
    },
    "hm": {
     "f": 2500,
     "g": 0,
     "q": 1
    },
    "high": {
     "f": 12000,
     "g": 1
    }
   },
   "comp": {
    "on": false,
    "th": -18,
    "ratio": 3,
    "att": 0.01,
    "rel": 0.15,
    "knee": 6,
    "makeup": 0
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  }
 },
 {
  "id": "f_bass",
  "name": "Basse synth + pompe",
  "desc": "Boue à 250 Hz retirée, définition à 1,2 kHz, compression 4:1, sidechain sur le kick 45 %.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 32
    },
    "low": {
     "f": 80,
     "g": -0.5
    },
    "lm": {
     "f": 250,
     "g": -3,
     "q": 1
    },
    "hm": {
     "f": 1200,
     "g": 2,
     "q": 1
    },
    "high": {
     "f": 8000,
     "g": 0
    }
   },
   "comp": {
    "on": true,
    "th": -20,
    "ratio": 4,
    "att": 0.004,
    "rel": 0.1,
    "knee": 6,
    "makeup": 2
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  },
  "sc": {
   "depth": 0.45,
   "release": 0.14
  }
 },
 {
  "id": "f_pad",
  "name": "Nappe large + pompe",
  "desc": "Passe-haut 190 Hz, −2,5 dB à 700 Hz, air, sidechain sur le kick 55 %.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 190
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 700,
     "g": -2.5,
     "q": 0.8
    },
    "hm": {
     "f": 2500,
     "g": 0,
     "q": 1
    },
    "high": {
     "f": 9000,
     "g": 2
    }
   },
   "comp": {
    "on": false,
    "th": -18,
    "ratio": 3,
    "att": 0.01,
    "rel": 0.15,
    "knee": 6,
    "makeup": 0
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  },
  "sc": {
   "depth": 0.55,
   "release": 0.26
  }
 },
 {
  "id": "f_arp",
  "name": "Arpège discret + pompe",
  "desc": "Passe-haut 260 Hz, creusé à 800 Hz et 3,2 kHz, sidechain 30 %.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 260
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 800,
     "g": -2,
     "q": 1
    },
    "hm": {
     "f": 3200,
     "g": -1.5,
     "q": 1.2
    },
    "high": {
     "f": 9000,
     "g": 1.5
    }
   },
   "comp": {
    "on": false,
    "th": -18,
    "ratio": 3,
    "att": 0.01,
    "rel": 0.15,
    "knee": 6,
    "makeup": 0
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  },
  "sc": {
   "depth": 0.3,
   "release": 0.15
  }
 },
 {
  "id": "f_lead",
  "name": "Lead synth en avant",
  "desc": "Passe-haut 160 Hz, +1,5 dB à 3 kHz, compression 2,5:1.",
  "kind": "channel",
  "factory": true,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 160
    },
    "low": {
     "f": 100,
     "g": 0
    },
    "lm": {
     "f": 800,
     "g": -2,
     "q": 1
    },
    "hm": {
     "f": 3000,
     "g": 1.5,
     "q": 0.9
    },
    "high": {
     "f": 10000,
     "g": 1
    }
   },
   "comp": {
    "on": true,
    "th": -18,
    "ratio": 2.5,
    "att": 0.01,
    "rel": 0.15,
    "knee": 6,
    "makeup": 1.5
   },
   "lim": {
    "on": false,
    "ceil": -1,
    "rel": 0.1
   }
  }
 },
 {
  "id": "f_master_dance",
  "name": "Master synthpop / dance (≈ −11 LUFS)",
  "desc": "Le mastering de « Train de nuit » : EQ correctif, compresseur glue 2:1, limiteur à −2 dB.",
  "kind": "master",
  "factory": true,
  "volume": 1.0,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 25
    },
    "low": {
     "f": 70,
     "g": -2.5
    },
    "lm": {
     "f": 700,
     "g": -1.5,
     "q": 0.7
    },
    "hm": {
     "f": 1800,
     "g": 1,
     "q": 0.7
    },
    "high": {
     "f": 11000,
     "g": 2.5
    }
   },
   "comp": {
    "on": true,
    "th": -16,
    "ratio": 2,
    "att": 0.03,
    "rel": 0.2,
    "knee": 6,
    "makeup": 2
   },
   "lim": {
    "on": true,
    "ceil": -2.0,
    "rel": 0.06
   }
  }
 },
 {
  "id": "f_master_stream",
  "name": "Master streaming (≈ −14 LUFS)",
  "desc": "Même chaîne, 3 dB plus doux : adapté à la normalisation de Spotify / YouTube.",
  "kind": "master",
  "factory": true,
  "volume": 1.0,
  "mix": {
   "eq": {
    "on": true,
    "hp": {
     "on": true,
     "f": 25
    },
    "low": {
     "f": 70,
     "g": -2.5
    },
    "lm": {
     "f": 700,
     "g": -1.5,
     "q": 0.7
    },
    "hm": {
     "f": 1800,
     "g": 1,
     "q": 0.7
    },
    "high": {
     "f": 11000,
     "g": 2.5
    }
   },
   "comp": {
    "on": true,
    "th": -16,
    "ratio": 2,
    "att": 0.03,
    "rel": 0.2,
    "knee": 6,
    "makeup": -1.0
   },
   "lim": {
    "on": true,
    "ceil": -1.5,
    "rel": 0.06
   }
  }
 }
];

/* Profils de mixage complets (multi-tranches) : un réglage par rôle de piste + le Master. */
SS.FACTORY_MIXSETS = [
 {
  "id": "fm_synthpop",
  "name": "Synthpop / dance — mix « Train de nuit » (≈ −11 LUFS)",
  "desc": "Le mixage et le mastering complets de « Train de nuit » : chaque piste reçoit le réglage de son rôle (kick, basse, nappe…), sidechain sur le kick compris.",
  "kind": "mixset",
  "factory": true,
  "roles": {
   "kick": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 30
      },
      "low": {
       "f": 60,
       "g": 1
      },
      "lm": {
       "f": 350,
       "g": -3.5,
       "q": 1.2
      },
      "hm": {
       "f": 3500,
       "g": 2.5,
       "q": 1
      },
      "high": {
       "f": 8000,
       "g": 0
      }
     },
     "comp": {
      "on": true,
      "th": -14,
      "ratio": 3,
      "att": 0.012,
      "rel": 0.08,
      "knee": 3,
      "makeup": 1.5
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.78,
    "pan": 0
   },
   "snare": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 120
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 450,
       "g": -2.5,
       "q": 1
      },
      "hm": {
       "f": 5000,
       "g": 3,
       "q": 0.8
      },
      "high": {
       "f": 10000,
       "g": 1.5
      }
     },
     "comp": {
      "on": true,
      "th": -16,
      "ratio": 3,
      "att": 0.005,
      "rel": 0.12,
      "knee": 4,
      "makeup": 1.5
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.6,
    "pan": 0
   },
   "clap": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 220
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 9000,
       "g": 2
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.42,
    "pan": 0.08
   },
   "hat": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 400
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 10000,
       "g": 2.5
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.38,
    "pan": 0.3
   },
   "ohat": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 350
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 11000,
       "g": 1.5
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.3,
    "pan": -0.3
   },
   "tom": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 60
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": -2,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 8000,
       "g": 0
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.52,
    "pan": 0.3
   },
   "cymbal": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 350
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 12000,
       "g": 1
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.32,
    "pan": -0.12
   },
   "bass": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 32
      },
      "low": {
       "f": 80,
       "g": -0.5
      },
      "lm": {
       "f": 250,
       "g": -3,
       "q": 1
      },
      "hm": {
       "f": 1200,
       "g": 2,
       "q": 1
      },
      "high": {
       "f": 8000,
       "g": 0
      }
     },
     "comp": {
      "on": true,
      "th": -20,
      "ratio": 4,
      "att": 0.004,
      "rel": 0.1,
      "knee": 6,
      "makeup": 2
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.55,
    "pan": 0,
    "sc": {
     "depth": 0.45,
     "release": 0.14
    }
   },
   "pad": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 190
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 700,
       "g": -2.5,
       "q": 0.8
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 9000,
       "g": 2
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.34,
    "pan": 0,
    "sc": {
     "depth": 0.55,
     "release": 0.26
    }
   },
   "arp": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 260
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 800,
       "g": -2,
       "q": 1
      },
      "hm": {
       "f": 3200,
       "g": -1.5,
       "q": 1.2
      },
      "high": {
       "f": 9000,
       "g": 1.5
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.26,
    "pan": 0.38,
    "sc": {
     "depth": 0.3,
     "release": 0.15
    }
   },
   "lead": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 160
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 800,
       "g": -2,
       "q": 1
      },
      "hm": {
       "f": 3000,
       "g": 1.5,
       "q": 0.9
      },
      "high": {
       "f": 10000,
       "g": 1
      }
     },
     "comp": {
      "on": true,
      "th": -18,
      "ratio": 2.5,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 1.5
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.42,
    "pan": -0.05
   },
   "perc": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 150
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 10000,
       "g": 1.5
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.4,
    "pan": 0.15
   },
   "keys": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 120
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 450,
       "g": -1.5,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 1,
       "q": 0.9
      },
      "high": {
       "f": 8000,
       "g": 0
      }
     },
     "comp": {
      "on": true,
      "th": -20,
      "ratio": 2,
      "att": 0.015,
      "rel": 0.2,
      "knee": 6,
      "makeup": 1
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.45,
    "pan": 0
   }
  },
  "master": {
   "mix": {
    "eq": {
     "on": true,
     "hp": {
      "on": true,
      "f": 25
     },
     "low": {
      "f": 70,
      "g": -2.5
     },
     "lm": {
      "f": 700,
      "g": -1.5,
      "q": 0.7
     },
     "hm": {
      "f": 1800,
      "g": 1,
      "q": 0.7
     },
     "high": {
      "f": 11000,
      "g": 2.5
     }
    },
    "comp": {
     "on": true,
     "th": -16,
     "ratio": 2,
     "att": 0.03,
     "rel": 0.2,
     "knee": 6,
     "makeup": 2
    },
    "lim": {
     "on": true,
     "ceil": -2.0,
     "rel": 0.06
    }
   },
   "volume": 1.0
  }
 },
 {
  "id": "fm_synthpop_stream",
  "name": "Synthpop / dance — version streaming (≈ −14 LUFS)",
  "desc": "Le même mixage, avec le Master 3 dB plus doux pour Spotify / YouTube.",
  "kind": "mixset",
  "factory": true,
  "roles": {
   "kick": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 30
      },
      "low": {
       "f": 60,
       "g": 1
      },
      "lm": {
       "f": 350,
       "g": -3.5,
       "q": 1.2
      },
      "hm": {
       "f": 3500,
       "g": 2.5,
       "q": 1
      },
      "high": {
       "f": 8000,
       "g": 0
      }
     },
     "comp": {
      "on": true,
      "th": -14,
      "ratio": 3,
      "att": 0.012,
      "rel": 0.08,
      "knee": 3,
      "makeup": 1.5
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.78,
    "pan": 0
   },
   "snare": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 120
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 450,
       "g": -2.5,
       "q": 1
      },
      "hm": {
       "f": 5000,
       "g": 3,
       "q": 0.8
      },
      "high": {
       "f": 10000,
       "g": 1.5
      }
     },
     "comp": {
      "on": true,
      "th": -16,
      "ratio": 3,
      "att": 0.005,
      "rel": 0.12,
      "knee": 4,
      "makeup": 1.5
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.6,
    "pan": 0
   },
   "clap": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 220
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 9000,
       "g": 2
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.42,
    "pan": 0.08
   },
   "hat": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 400
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 10000,
       "g": 2.5
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.38,
    "pan": 0.3
   },
   "ohat": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 350
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 11000,
       "g": 1.5
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.3,
    "pan": -0.3
   },
   "tom": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 60
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": -2,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 8000,
       "g": 0
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.52,
    "pan": 0.3
   },
   "cymbal": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 350
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 12000,
       "g": 1
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.32,
    "pan": -0.12
   },
   "bass": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 32
      },
      "low": {
       "f": 80,
       "g": -0.5
      },
      "lm": {
       "f": 250,
       "g": -3,
       "q": 1
      },
      "hm": {
       "f": 1200,
       "g": 2,
       "q": 1
      },
      "high": {
       "f": 8000,
       "g": 0
      }
     },
     "comp": {
      "on": true,
      "th": -20,
      "ratio": 4,
      "att": 0.004,
      "rel": 0.1,
      "knee": 6,
      "makeup": 2
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.55,
    "pan": 0,
    "sc": {
     "depth": 0.45,
     "release": 0.14
    }
   },
   "pad": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 190
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 700,
       "g": -2.5,
       "q": 0.8
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 9000,
       "g": 2
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.34,
    "pan": 0,
    "sc": {
     "depth": 0.55,
     "release": 0.26
    }
   },
   "arp": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 260
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 800,
       "g": -2,
       "q": 1
      },
      "hm": {
       "f": 3200,
       "g": -1.5,
       "q": 1.2
      },
      "high": {
       "f": 9000,
       "g": 1.5
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.26,
    "pan": 0.38,
    "sc": {
     "depth": 0.3,
     "release": 0.15
    }
   },
   "lead": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 160
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 800,
       "g": -2,
       "q": 1
      },
      "hm": {
       "f": 3000,
       "g": 1.5,
       "q": 0.9
      },
      "high": {
       "f": 10000,
       "g": 1
      }
     },
     "comp": {
      "on": true,
      "th": -18,
      "ratio": 2.5,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 1.5
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.42,
    "pan": -0.05
   },
   "perc": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 150
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 400,
       "g": 0,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 0,
       "q": 1
      },
      "high": {
       "f": 10000,
       "g": 1.5
      }
     },
     "comp": {
      "on": false,
      "th": -18,
      "ratio": 3,
      "att": 0.01,
      "rel": 0.15,
      "knee": 6,
      "makeup": 0
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.4,
    "pan": 0.15
   },
   "keys": {
    "mix": {
     "eq": {
      "on": true,
      "hp": {
       "on": true,
       "f": 120
      },
      "low": {
       "f": 100,
       "g": 0
      },
      "lm": {
       "f": 450,
       "g": -1.5,
       "q": 1
      },
      "hm": {
       "f": 2500,
       "g": 1,
       "q": 0.9
      },
      "high": {
       "f": 8000,
       "g": 0
      }
     },
     "comp": {
      "on": true,
      "th": -20,
      "ratio": 2,
      "att": 0.015,
      "rel": 0.2,
      "knee": 6,
      "makeup": 1
     },
     "lim": {
      "on": false,
      "ceil": -1,
      "rel": 0.1
     }
    },
    "volume": 0.45,
    "pan": 0
   }
  },
  "master": {
   "mix": {
    "eq": {
     "on": true,
     "hp": {
      "on": true,
      "f": 25
     },
     "low": {
      "f": 70,
      "g": -2.5
     },
     "lm": {
      "f": 700,
      "g": -1.5,
      "q": 0.7
     },
     "hm": {
      "f": 1800,
      "g": 1,
      "q": 0.7
     },
     "high": {
      "f": 11000,
      "g": 2.5
     }
    },
    "comp": {
     "on": true,
     "th": -16,
     "ratio": 2,
     "att": 0.03,
     "rel": 0.2,
     "knee": 6,
     "makeup": -1.0
    },
    "lim": {
     "on": true,
     "ceil": -1.5,
     "rel": 0.06
    }
   },
   "volume": 1.0
  }
 }
];
