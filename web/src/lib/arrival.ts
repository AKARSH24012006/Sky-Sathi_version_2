/** Arrival planner data + scoring for Bengaluru (KIA). Distances and times are
 *  approximate; fares are rough estimates from a stated per-km assumption and
 *  are labelled as such everywhere. Nothing is booked here — options hand off
 *  to the passenger's own apps with the trip pre-filled. */
export const AIRPORT = { name: "Kempegowda International Airport, Bengaluru", lat: 13.1986, lon: 77.7066 };
export const AREAS = [
  { id: "hebbal", name: "Hebbal / Manyata", km: 25, min: [35, 60] },
  { id: "mgroad", name: "MG Road", km: 37, min: [50, 90] },
  { id: "indiranagar", name: "Indiranagar", km: 40, min: [55, 95] },
  { id: "koramangala", name: "Koramangala", km: 43, min: [60, 100] },
  { id: "whitefield", name: "Whitefield", km: 45, min: [60, 110] },
  { id: "ecity", name: "Electronic City", km: 60, min: [80, 130] },
];
export type Inputs = { area: string; people: number; bags: number; budget: "save" | "balanced" | "comfort"; hour: number; needHotel: boolean; anxious: boolean };
export type Option = { id: string; mode: string; title: string; minutes: [number, number]; fare: string; score: number; reasons: string[];
  pickup: string; links: { label: string; href: string }[] };

const enc = encodeURIComponent;
const gmaps = (area: string, mode: "driving" | "transit") =>
  `https://www.google.com/maps/dir/?api=1&origin=${enc(AIRPORT.name)}&destination=${enc(area + ", Bengaluru")}&travelmode=${mode}`;

export function options(inp: Inputs): Option[] {
  const a = AREAS.find(x => x.id === inp.area) ?? AREAS[1];
  const late = inp.hour >= 23 || inp.hour < 5;
  const big = inp.people >= 5 || inp.bags >= 4;
  const rs = (lo: number, hi: number) => `≈ ₹${Math.round(a.km * lo / 50) * 50}–${Math.round(a.km * hi / 50) * 50}`;
  const cab: Option = {
    id: "app_cab", mode: "cab", title: big ? "App cab (XL / SUV)" : "App cab", minutes: [a.min[0], a.min[1]],
    fare: rs(big ? 28 : 20, big ? 38 : 28) + " (est.)", score: 0, reasons: [], pickup: "App-cab pickup, arrivals kerb",
    links: [
      { label: "Open Uber", href: `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${AIRPORT.lat}&pickup[longitude]=${AIRPORT.lon}&pickup[nickname]=${enc("Bengaluru Airport")}&dropoff[formatted_address]=${enc(a.name + ", Bengaluru")}` },
      { label: "Ola", href: "https://www.olacabs.com/" }, { label: "Namma Yatri", href: "https://nammayatri.in/" },
      { label: "Route in Maps", href: gmaps(a.name, "driving") }],
  };
  const taxi: Option = {
    id: "airport_taxi", mode: "taxi", title: "Airport taxi (metered)", minutes: [a.min[0], a.min[1]],
    fare: rs(24, 34) + " (est.)", score: 0, reasons: [], pickup: "Airport taxi stand, arrivals kerb",
    links: [{ label: "Route in Maps", href: gmaps(a.name, "driving") }],
  };
  const bus: Option = {
    id: "airport_bus", mode: "bus", title: "Airport city bus", minutes: [a.min[0] + 15, a.min[1] + 25],
    fare: "lowest cost (fixed bus fare)", score: 0, reasons: [], pickup: "Airport bus bay, arrivals kerb",
    links: [{ label: "Bus route in Maps", href: gmaps(a.name, "transit") }],
  };
  const w = { save: [1, 2, 3], balanced: [3, 2, 1.5], comfort: [3, 3.5, 0] }[inp.budget];
  cab.score = w[0] + 1; taxi.score = w[1] + 0.5; bus.score = w[2];
  cab.reasons.push("door-to-door, fare shown before you ride");
  taxi.reasons.push("no app or phone signal needed — walk up and go");
  bus.reasons.push("cheapest, comfortable coaches");
  if (inp.anxious) { taxi.score += 1.2; taxi.reasons.push("simplest right after a stressful flight"); }
  if (late) { bus.score -= 2; bus.reasons.push("fewer buses late at night"); taxi.score += 0.6; }
  if (big) { bus.score -= 1.5; cab.score += 0.8; cab.reasons.push(`fits ${inp.people} people and ${inp.bags} bags in an XL`); }
  if (inp.bags >= 3 && !big) bus.score -= 0.6;
  if (inp.people >= 3 && inp.budget !== "comfort") { cab.score += 0.5; cab.reasons.push("split fare makes it good value"); }
  return [cab, taxi, bus].sort((x, y) => y.score - x.score);
}

export function hotelLinks(areaId: string) {
  const a = AREAS.find(x => x.id === areaId) ?? AREAS[1];
  return [
    { label: "Booking.com", href: `https://www.booking.com/searchresults.html?ss=${enc(a.name + ", Bengaluru")}` },
    { label: "Google Hotels", href: `https://www.google.com/travel/search?q=${enc("hotels in " + a.name + " Bengaluru")}` },
    { label: "MakeMyTrip", href: "https://www.makemytrip.com/hotels/" },
  ];
}

export function templatePlan(inp: Inputs, opts: Option[]) {
  const a = AREAS.find(x => x.id === inp.area) ?? AREAS[1];
  const best = opts[0];
  return {
    recommended: best.id,
    headline: `${best.title} to ${a.name} — about ${best.minutes[0]}–${best.minutes[1]} min`,
    why: `${best.reasons.slice(0, 2).join("; ")}. Fares and times are estimates — the app or meter shows the real price.`,
    after_landing: [`Walk to the baggage belt shown on the arrivals screen.`, `Follow signs to ${best.pickup}.`,
      best.mode === "cab" ? "Book in the app once you have your bags — pickup usually takes a few minutes." : "Confirm the destination with the driver before you set off."],
    hotel_tips: inp.needHotel ? ["Choose free cancellation in case your flight is delayed.",
      inp.hour >= 21 ? "Tell the hotel you'll check in late tonight." : "Ask for early check-in if you land before noon.",
      `Stay near ${a.name} to keep tomorrow's travel short.`] : [],
  };
}
