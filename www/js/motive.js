// ===== Läutemotive: Erkennung, welches Motiv ein Geläut bildet =====
// Daten aus der App „Glockenmotive“. Motive als Halbtonabstände zur tiefsten Glocke.
// Benennung nach Matthias Dichter (2021) hat Vorrang; ältere Namen erscheinen als Zweitnamen.
// "T" = laut gelaeutemotive.pdf nur als Teilgeläute verwendbar.
const MOTIVE_LISTE = [
  ['kleine Sekunde', [0, 1]], ['grosse Sekunde', [0, 2]], ['kleine Terz', [0, 3]], ['grosse Terz', [0, 4]],
  ['Quarte', [0, 5]], ['Quinte', [0, 7]], ['Dursexte', [0, 9]],
  ['Durdreiklang', [0, 4, 7]], ['Dursextakkord', [0, 3, 8]], ['Durquartsextakkord', [0, 5, 9]], ['Mollakkord', [0, 3, 7]],
  ['Mollsextakkord', [0, 4, 9]], ['Mollquartsextakkord', [0, 5, 8]], ['Gloria', [0, 2, 5]], ['Te Deum', [0, 3, 5]],
  ['Sekundenmotiv', [0, 2, 4]], ['verminderter Dreiklang', [0, 3, 6]],
  ['ausgefülltes Durmotiv', [0, 2, 4, 7]], ['ausgefülltes Durmotiv-Variante', [0, 4, 5, 7]], ['Salve Regina', [0, 4, 7, 9]],
  ['Westminster', [0, 5, 7, 9]], ['Durakkord Tonika', [0, 4, 7, 12]], ['Durakkord Tonika 1. Umkehrung', [0, 3, 8, 12]],
  ['Durakkord Tonika 2. Umkehrung', [0, 5, 9, 12]], ['Durmollquartett', [0, 4, 7, 11]], ['ausgefülltes Mollmotiv', [0, 3, 5, 7]],
  ['ausgefülltes Mollmotiv-Variante', [0, 2, 3, 7]], ['Mollakkord Tonika', [0, 3, 7, 12]], ['Mollakkord Tonika 1. Umkehrung', [0, 4, 9, 12]],
  ['Mollakkord Tonika 2. Umkehrung', [0, 5, 8, 12]], ['Molldurquartett', [0, 3, 7, 10]], ['übermässiger Mollvierklang', [0, 3, 7, 9]],
  ['Gloria-Te Deum', [0, 2, 5, 7]], ['Tetrakkord', [0, 2, 4, 5]], ['Tetrakkord-Variante', [0, 2, 3, 5]], ['Idealquartett', [0, 3, 5, 8]],
  ['verminderter Vierklang', [0, 3, 6, 9]], ['erweitertes Gloria', [0, 2, 5, 9]], ['erweitertes Gloria-Variante', [0, 2, 5, 8]],
  ['ausgefülltes Salve Regina', [0, 2, 4, 7, 9]], ['ausgefülltes Durmollmotiv', [0, 4, 7, 9, 11]], ['doppelt ausgefülltes Durmotiv', [0, 2, 4, 5, 7]],
  ['Ulmer Adventsgeläute', [0, 5, 7, 9, 12]], ['Salve Regina mit Oberoktave', [0, 4, 7, 9, 12]], ['harmonisches Durquintett', [0, 4, 7, 12, 16]],
  ['ausgefülltes Durmotiv mit Oberoktave', [0, 2, 4, 7, 12]], ['grosses Westminstergeläute', [0, 3, 8, 10, 12]],
  ['Salve Regina mit kleiner Unterterz', [0, 3, 7, 10, 12]], ['doppelt ausgefülltes Mollmotiv', [0, 2, 3, 5, 7]],
  ['ausgefülltes Molldurquintett', [0, 3, 5, 7, 10]], ['Mollquartett mit Unterquarte', [0, 5, 8, 10, 12]],
  ['grosses 5-stimmiges Trauergeläute', [0, 5, 7, 8, 12]], ['Idealquartett mit Subsemitonum', [0, 3, 5, 7, 8]],
  ['erweitertes Idealquartett', [0, 2, 5, 7, 10]], ['erweitertes Idealquartett-Variante', [0, 3, 5, 8, 10]], ['verminderter Fünfklang', [0, 3, 6, 9, 12]],
  ['erweitertes Gloria', [0, 2, 5, 9, 12]], ['erweitertes Gloria-Variante', [0, 2, 5, 8, 12]], ['Idealquartett mit Oberoktave', [0, 3, 5, 8, 12]],
  ['erweiterter verminderter Dreiklang', [0, 3, 6, 8, 10]], ['ausgefülltes erweitertes Gloria', [0, 2, 5, 7, 9]],
  ['übermässiges vermindertes Motiv', [0, 4, 6, 9, 12]], ['übermässiges vermindertes Motiv-Variante', [0, 3, 7, 9, 12]],
  ['Idealsextett', [0, 3, 5, 8, 10, 12]], ['Idealsextett, Unteroktave+Subsemitonum', [0, 4, 7, 9, 11, 12]],
  ['ausgefülltes Salve Regina mit Oberoktave', [0, 2, 4, 7, 9, 12]], ['doppelt ausgefülltes Durmollmotiv', [0, 2, 4, 7, 9, 11]],
  ['Terzen erweitertes Idealquartett', [0, 4, 7, 9, 12, 16]], ['Dur-Septnonmotiv', [0, 4, 7, 9, 11, 14]],
  ['ausgefülltes Salve Regina mit Unterquarte', [0, 5, 7, 9, 12, 14]], ['erweitertes grosses Westminstermotiv', [0, 4, 7, 12, 14, 16]],
  ['Maria-Plainer-Motiv', [0, 4, 7, 10, 12, 14]], ['ausgefülltes Salve Regina mit kleiner Unterterz', [0, 3, 5, 7, 10, 12]],
  ['ausgefülltes Salve Regina mit kleiner Unterterz-V', [0, 3, 7, 8, 10, 12]], ['Moll-Septnonmotiv', [0, 3, 7, 10, 12, 14]],
  ['hypomixolydisches Sextett', [0, 2, 5, 7, 9, 12]], ['erweiterter Tetrakkord', [0, 2, 4, 5, 7, 9]],
  ['Prime', [0, 0]], ['Tritonus', [0, 6]], ['Kleine Sexte', [0, 8]], ['Kleine Septime', [0, 10]], ['Große Septime', [0, 11]], ['Oktave', [0, 12]],
  ['Sekundenmotiv-Variante', [0, 2, 3], 'T'], ['Sekundenmotiv-Variante', [0, 1, 3], 'T'], ['Quarte-Oktave', [0, 5, 12], 'T'],
  ['Quinte-Oktave', [0, 7, 12], 'T'], ['Quarte-Quinte', [0, 5, 7], 'T'], ['Sekunde-Quinte', [0, 2, 7], 'T'], ['Quint-Sexte', [0, 7, 9], 'T'],
  ['ausgefüllte Mollumkehrung', [0, 2, 4, 9], 'T'], ['ausgefüllte Mollumkehrung-Variante', [0, 5, 7, 8], 'T'],
  ['erweiterter Molldreiklang', [0, 3, 7, 8], 'T'],
  ['Deinem Heiland, deinem Lehrer', [0, 1, 3, 5]], ['Berliner Gedächtniskirche (alt)', [0, 3, 7, 8, 10]],
  ['Berliner Gedächtniskirche (neu)', [0, 3, 5, 7, 8, 10]], ['Kölner-Dom-Motiv (Sonntag)', [0, 2, 4, 5, 9, 12]],
  ['Doppeltes Christ ist erstanden', [0, 2, 5, 7, 10, 12]], ['Pange lingua', [0, 2, 3, 5, 7, 10]],
];
const MIT_VG = ' (mit verdoppeltem Grundton)';
const MOTIVE_DICHTER = {
  '0,1': ['Kleine Sekunde'], '0,2': ['Große Sekunde'], '0,3': ['Kleine Terz (Mollterz)'], '0,4': ['Große Terz (Durterz)'],
  '0,5': ['Quarte'], '0,7': ['Quinte'], '0,9': ['Große Sexte'],
  '0,3,5': ['Te deum'], '0,2,5': ['Gloria'], '0,3,7': ['Molldreiklang'], '0,4,7': ['Durdreiklang'],
  '0,5,8': ['Moll-Quartsextakkord'], '0,5,9': ['Dur-Quartsextakkord'], '0,4,9': ['Moll-Sextakkord'], '0,3,8': ['Dur-Sextakkord'],
  '0,3,6': ['Verminderter Dreiklang'], '0,2,4': ['Pater noster', 'Ionischer, lydischer oder mixolydischer Dreiklang'],
  '0,2,4,7': ['Freu dich, du Himmelskönigin', 'Ausgefüllter Durdreiklang'], '0,4,7,9': ['Salve Regina', 'Wachet auf'],
  '0,3,5,7': ['Präfation', 'O Heiland, reiß die Himmel auf'], '0,3,5,8': ['Idealquartett', 'Parsifal oder Cibavit eos'],
  '0,2,4,5': ['Veni sancte spiritus', 'Regina caeli, ionischer oder mixolydischer Tetrachord'],
  '0,2,3,5': ['Tui sunt caeli', 'Dorischer oder äolischer Tetrachord'], '0,2,3,7': ['Resurrexi (erweitert)'], '0,5,7,9': ['Westminster'],
  '0,3,7,12': ['Molldreiklang' + MIT_VG], '0,4,7,12': ['Durdreiklang' + MIT_VG], '0,3,7,10': ['Moll-Dur'], '0,4,7,11': ['Dur-Moll'],
  '0,2,5,7': ['Christ ist erstanden'], '0,2,5,9': ['Molldreiklang (mit großer Untersekunde)'],
  '0,5,8,12': ['Moll-Quartsextakkord' + MIT_VG], '0,5,9,12': ['Dur-Quartsextakkord' + MIT_VG],
  '0,4,9,12': ['Moll-Sextakkord' + MIT_VG], '0,3,8,12': ['Dur-Sextakkord' + MIT_VG],
  '0,3,5,8,10': ['Doppeltes Te deum'], '0,2,5,7,10': ['Doppeltes Gloria'], '0,3,5,7,8': ['Te deum laudamus'],
  '0,3,5,7,10': ['Ad te levavi animam meam'], '0,3,7,10,12': ['Ilanzer Motiv'], '0,2,3,5,7': ['Resurrexi (erweitert und ausgefüllt)'],
  '0,2,4,7,9': ['Veni creator spiritus', 'Pentatonisches Quintett'], '0,4,7,9,12': ['Salve Regina' + MIT_VG, 'Wachet auf' + MIT_VG],
  '0,2,5,7,9': ['Österliches Halleluja'], '0,5,7,9,12': ['Westminster' + MIT_VG], '0,3,8,10,12': ['Westminster (mit kleiner Unterterz)'],
  '0,2,4,5,7': ['Dies irae', 'Ionisches oder mixolydisches Quintett'],
  '0,2,3': ['Resurrexi', 'Dorischer oder äolischer Dreiklang'], '0,1,3': ['Phrygischer oder lokrischer Dreiklang'],
  '0,1,3,5': ['Deinem Heiland, deinem Lehrer', 'Großer Gott, wir loben dich, phrygischer oder lokrischer Tetrachord'],
  '0,5,7,8': ['Benedicamus', 'Resurrexi (mit Unterquarte)'],
  '0,3,5,8,10,12': ['Idealsextett', 'Doppeltes Te deum' + MIT_VG], '0,3,5,7,10,12': ['Ilanzer Motiv (ausgefüllt)'],
  '0,2,4,7,9,12': ['Veni creator spiritus' + MIT_VG, 'Pentatonisches Quintett' + MIT_VG], '0,2,5,7,9,12': ['Österliches Halleluja' + MIT_VG],
};

// Je Intervallfolge ein Eintrag mit Hauptname, Zweitnamen und Teilgeläut-Hinweis
const MOTIVE = (() => {
  const norm = (s) => s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const map = new Map();
  for (const [alt, iv, tag] of MOTIVE_LISTE) {
    const key = iv.join();
    if (!map.has(key)) map.set(key, { iv, names: [...(MOTIVE_DICHTER[key] || [])], teil: tag === 'T' && !MOTIVE_DICHTER[key] });
    map.get(key).names.push(alt);
  }
  return [...map.values()].map((m) => {
    const seen = new Set(), names = m.names.filter((n) => !seen.has(norm(n)) && seen.add(norm(n)));
    return { iv: m.iv, name: names[0], other: names.slice(1), teil: m.teil };
  });
})();
const MOTIVE_BY_KEY = new Map(MOTIVE.map((m) => [m.iv.join(), m]));

// Halbtöne über a′ für einen Index der Frequenztabelle (16 Schritte je Halbton; .5 rundet aufwärts wie baseTone)
function semitoneOfIdx(idx) { return Math.round((DATA.anchor - idx) / 16); }

// glocken: [{ i: Glockennummer (0-basiert), s: Halbtöne über a′ }]
// Ergebnis: ganzes Motiv (oder null) und läutbare Teilmotive mit mindestens 3 Glocken, grösste zuerst
function motivAnalyse(glocken) {
  const g = [...glocken].sort((a, b) => a.s - b.s || a.i - b.i);
  if (g.length < 2) return { glocken: g, ganz: null, teile: [] };
  const lo = g[0].s;
  const ganz = MOTIVE_BY_KEY.get(g.map((x) => x.s - lo).join()) || null;
  const teile = [];
  const seen = new Set();
  for (const m of MOTIVE) {
    if (m.iv.length < 3 || m.iv.length >= g.length) continue;
    for (const root of new Set(g.map((x) => x.s))) {
      // jedem Motivton eine noch freie Glocke zuordnen (die Prime braucht zwei gleich gestimmte)
      const used = new Set(), pick = [];
      for (const d of m.iv) {
        const hit = g.find((x) => x.s === root + d && !used.has(x.i));
        if (!hit) break;
        used.add(hit.i); pick.push(hit);
      }
      if (pick.length !== m.iv.length) continue;
      const key = m.iv.join() + '@' + root;
      if (seen.has(key)) continue;
      seen.add(key);
      teile.push({ motiv: m, glocken: pick });
    }
  }
  teile.sort((a, b) => b.glocken.length - a.glocken.length || a.glocken[0].s - b.glocken[0].s);
  return { glocken: g, ganz, teile };
}
