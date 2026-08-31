/** IATA flight-number prefix -> airline display name. Mirrors api/app/flights/data.py
 *  so the UI never hardcodes "IndiGo" for a flight number that isn't IndiGo's. */
const AIRLINE_BY_PREFIX: Record<string, string> = {
  AI: "Air India", IX: "Air India Express", "6E": "IndiGo", SG: "SpiceJet",
  QP: "Akasa Air", I5: "Air India Express", "9I": "Alliance Air", G8: "Go First", UK: "Vistara",
};

export function airlineFor(flightNo: string | null | undefined): string {
  if (!flightNo) return "your airline";
  const prefix = flightNo.trim().slice(0, 2).toUpperCase();
  return AIRLINE_BY_PREFIX[prefix] ?? "your airline";
}
