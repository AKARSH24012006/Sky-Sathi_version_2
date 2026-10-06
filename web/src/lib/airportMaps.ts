/** Terminal maps for the navigator. SCHEMATIC, illustrative layouts built for the
 *  demo — not official airport floor plans. In production each terminal pack
 *  comes from the airport operator's wayfinding data in this same shape. */
export type Kind = "walk" | "gate" | "entry" | "security" | "washroom" | "food" | "coffee" | "water" | "charging" | "pharmacy"
  | "lounge" | "prayer" | "baby" | "atm" | "medical" | "shop" | "belt" | "cab" | "taxi" | "bus" | "exit" | "hotel";
export type MapNode = { id: string; x: number; y: number; kind: Kind; name: string; note?: string };
export type TerminalMap = { id: string; title: string; subtitle: string; scale: number; nodes: MapNode[]; edges: [string, string][];
  starts: string[]; zones: { x: number; y: number; w: number; h: number; label: string; rx?: number }[] };

const N = (id: string, x: number, y: number, kind: Kind, name: string, note?: string): MapNode => ({ id, x, y, kind, name, note });

export const DEL: TerminalMap = {
  id: "DEL", title: "Delhi · Departures", subtitle: "Schematic terminal layout · demo data", scale: 1.5,
  zones: [
    { x: 150, y: 420, w: 700, h: 80, label: "Check-in hall" }, { x: 420, y: 352, w: 160, h: 50, label: "Security" },
    { x: 360, y: 240, w: 280, h: 110, label: "Central plaza · food court" }, { x: 410, y: 140, w: 180, h: 70, label: "Mezzanine" },
  ],
  nodes: [
    N("entry", 500, 535, "entry", "Departures entry (kerb)"),
    N("ci_w", 300, 460, "walk", "Check-in row A–D"), N("ci_c", 500, 460, "walk", "Check-in centre"), N("ci_e", 700, 460, "walk", "Check-in row E–H"),
    N("sec", 500, 378, "security", "Security check"),
    N("plaza", 500, 300, "walk", "Central plaza"),
    N("w1", 380, 250, "walk", "West pier start"), N("w2", 290, 210, "walk", "West pier"), N("w3", 200, 170, "walk", "West pier"), N("w4", 110, 130, "walk", "West pier end"),
    N("e1", 620, 250, "walk", "East pier start"), N("e2", 710, 210, "walk", "East pier"), N("e3", 800, 170, "walk", "East pier"), N("e4", 890, 130, "walk", "East pier end"),
    N("mez", 500, 185, "walk", "Mezzanine"),
    N("g1", 360, 205, "gate", "Gates 1–4"), N("g5", 270, 165, "gate", "Gates 5–8"), N("g9", 180, 125, "gate", "Gates 9–12"),
    N("g13", 640, 205, "gate", "Gates 13–16"), N("g17", 730, 165, "gate", "Gates 17–20"), N("g21", 820, 125, "gate", "Gates 21–24"), N("g25", 910, 85, "gate", "Gates 25–28"),
    N("wc1", 250, 495, "washroom", "Washroom", "check-in hall, row A"), N("wc2", 420, 325, "washroom", "Washroom", "plaza, west side"),
    N("wc3", 215, 215, "washroom", "Washroom", "west pier, near gate 10"), N("wc4", 735, 250, "washroom", "Washroom", "east pier, near gate 18"),
    N("wc5", 905, 170, "washroom", "Washroom", "east pier end, near gate 26"),
    N("burger", 585, 330, "food", "Burger & fries", "plaza, east side"), N("thali", 455, 270, "food", "Indian thali & snacks", "plaza, north side"),
    N("coffee1", 590, 275, "coffee", "Chai & coffee", "plaza, north-east"), N("coffee2", 305, 172, "coffee", "Coffee kiosk", "west pier, near gate 6"),
    N("water1", 775, 212, "water", "Water refill", "east pier, near gate 23"), N("water2", 530, 335, "water", "Water refill", "plaza"),
    N("charge1", 850, 205, "charging", "Charging points", "beside gates 22–24"), N("charge2", 330, 235, "charging", "Charging points", "west pier start"),
    N("pharm", 405, 285, "pharmacy", "Pharmacy", "plaza, west"), N("lounge", 545, 160, "lounge", "Lounge", "mezzanine level"),
    N("prayer", 455, 160, "prayer", "Prayer & quiet room", "mezzanine level"), N("baby", 500, 145, "baby", "Baby care room", "mezzanine level"),
    N("atm", 610, 490, "atm", "ATM & forex", "check-in hall"), N("med", 420, 395, "medical", "Medical room", "beside security"),
    N("shop", 650, 300, "shop", "Duty-free & shops", "plaza, east"),
  ],
  edges: [["entry", "ci_c"], ["ci_w", "ci_c"], ["ci_c", "ci_e"], ["ci_c", "sec"], ["sec", "plaza"],
    ["plaza", "w1"], ["w1", "w2"], ["w2", "w3"], ["w3", "w4"], ["plaza", "e1"], ["e1", "e2"], ["e2", "e3"], ["e3", "e4"], ["plaza", "mez"],
    ["w1", "g1"], ["w2", "g5"], ["w3", "g9"], ["e1", "g13"], ["e2", "g17"], ["e3", "g21"], ["e4", "g25"],
    ["ci_w", "wc1"], ["plaza", "wc2"], ["w3", "wc3"], ["e2", "wc4"], ["e4", "wc5"], ["plaza", "burger"], ["plaza", "thali"],
    ["plaza", "coffee1"], ["w2", "coffee2"], ["e3", "water1"], ["plaza", "water2"], ["e3", "charge1"], ["w1", "charge2"],
    ["plaza", "pharm"], ["mez", "lounge"], ["mez", "prayer"], ["mez", "baby"], ["ci_e", "atm"], ["sec", "med"], ["e1", "shop"]],
  starts: ["entry", "ci_c", "plaza", "g13"],
};

export const BLR: TerminalMap = {
  id: "BLR", title: "Bengaluru · Arrivals", subtitle: "Schematic terminal layout · demo data", scale: 1.0,
  zones: [
    { x: 130, y: 60, w: 740, h: 70, label: "Arrival gates & aerobridges" }, { x: 250, y: 250, w: 500, h: 110, label: "Baggage hall" },
    { x: 330, y: 400, w: 340, h: 50, label: "Arrivals exit" }, { x: 90, y: 470, w: 820, h: 70, label: "Kerb · transport" },
  ],
  nodes: [
    N("a1", 200, 95, "gate", "Arrival gate 1–8"), N("a2", 500, 95, "gate", "Arrival gate 9–16"), N("a3", 800, 95, "gate", "Arrival gate 17–24"),
    N("c1", 200, 170, "walk", "Arrival corridor"), N("c2", 500, 170, "walk", "Arrival corridor"), N("c3", 800, 170, "walk", "Arrival corridor"),
    N("bh", 500, 225, "walk", "Baggage hall entry"),
    N("b1", 310, 300, "belt", "Belt 1–2"), N("b3", 430, 300, "belt", "Belt 3–4"), N("b5", 570, 300, "belt", "Belt 5–6"), N("b7", 690, 300, "belt", "Belt 7–8"),
    N("bc", 500, 345, "walk", "Baggage hall centre"),
    N("exit", 500, 425, "exit", "Arrivals exit"),
    N("kerb", 500, 505, "walk", "Arrivals kerb"),
    N("cab", 300, 505, "cab", "App-cab pickup", "Uber · Ola · Namma Yatri"), N("taxi", 700, 505, "taxi", "Airport taxi stand", "metered taxis"),
    N("bus", 160, 505, "bus", "Airport bus bay", "city buses"), N("hotel", 840, 505, "hotel", "Hotel & transport desk", "arrivals kerb"),
    N("wcA", 260, 215, "washroom", "Washroom", "corridor, near gate 6"), N("wcB", 740, 215, "washroom", "Washroom", "corridor, near gate 19"),
    N("wcC", 640, 380, "washroom", "Washroom", "before the exit"),
    N("cafe", 380, 430, "coffee", "Café", "arrivals exit"), N("food", 620, 440, "food", "Quick bites", "arrivals exit"),
    N("atmA", 430, 470, "atm", "ATM", "arrivals kerb"), N("pharmA", 560, 470, "pharmacy", "Pharmacy", "arrivals kerb"),
    N("waterA", 360, 360, "water", "Water refill", "baggage hall"),
  ],
  edges: [["a1", "c1"], ["a2", "c2"], ["a3", "c3"], ["c1", "c2"], ["c2", "c3"], ["c2", "bh"], ["bh", "bc"],
    ["bc", "b1"], ["bc", "b3"], ["bc", "b5"], ["bc", "b7"], ["bc", "exit"], ["exit", "kerb"], ["kerb", "cab"], ["kerb", "taxi"],
    ["cab", "bus"], ["taxi", "hotel"], ["c1", "wcA"], ["c3", "wcB"], ["exit", "wcC"], ["exit", "cafe"], ["exit", "food"],
    ["kerb", "atmA"], ["kerb", "pharmA"], ["bc", "waterA"]],
  starts: ["a2", "a1", "a3", "bc"],
};

export const MAPS = { DEL, BLR };

/** request words -> amenity kind (English + Hinglish) */
export const WANTS: { kind: Kind; label: string; words: string[] }[] = [
  { kind: "washroom", label: "Washroom", words: ["washroom", "toilet", "restroom", "bathroom", "loo", "pee", "wc", "shauchalay"] },
  { kind: "food", label: "Food", words: ["burger", "food", "eat", "hungry", "khana", "snack", "thali", "lunch", "dinner", "breakfast", "bhook"] },
  { kind: "coffee", label: "Coffee / chai", words: ["coffee", "chai", "tea", "cafe", "café"] },
  { kind: "water", label: "Water", words: ["water", "paani", "pani", "refill", "bottle"] },
  { kind: "charging", label: "Charging", words: ["charge", "charging", "charger", "battery", "phone"] },
  { kind: "pharmacy", label: "Pharmacy", words: ["pharmacy", "medicine", "dawai", "tablet", "chemist"] },
  { kind: "lounge", label: "Lounge", words: ["lounge", "relax", "sofa"] },
  { kind: "prayer", label: "Prayer / quiet", words: ["pray", "prayer", "namaz", "quiet", "meditate", "puja"] },
  { kind: "baby", label: "Baby care", words: ["baby", "diaper", "feeding", "infant"] },
  { kind: "atm", label: "ATM / cash", words: ["atm", "cash", "forex", "money", "paise"] },
  { kind: "medical", label: "Medical", words: ["doctor", "medical", "unwell", "dizzy", "first aid"] },
  { kind: "shop", label: "Shops", words: ["shop", "shopping", "duty", "gift", "buy"] },
];
