"""Flight status (AeroDataBox, key optional) + live aircraft position via
adsb.lol (free, keyless, crowdsourced ADS-B). Demo fallbacks everywhere."""
import os, re, httpx
from ..db.cache import cached

DEMO_FLIGHT = {"flight_no":"AI101","status":"on time","gate":"24B","depart":"18:05",
               "arrive":"20:40","aircraft":"A320neo","source":"demo"}

# IATA -> ICAO carrier code, used to derive the ADS-B callsign adsb.lol expects
# (aircraft transponders broadcast ICAO-code + flight number, e.g. AIC101, not AI101).
AIRLINE_ICAO = {
    "AI":"AIC","IX":"AXB","6E":"IGO","SG":"SEJ","QP":"AKJ","I5":"AXB",
    "9I":"LLR","G8":"GOW","UK":"VTI",
}
AIRLINE_NAME = {
    "AIC":"Air India","AXB":"Air India Express","IGO":"IndiGo","SEJ":"SpiceJet",
    "AKJ":"Akasa Air","LLR":"Alliance Air","GOW":"Go First","VTI":"Vistara",
}

def _split_flight_no(flight_no: str):
    m = re.match(r"^([A-Za-z0-9]{2})\s*0*([0-9]{1,4})$", flight_no.strip())
    if not m: return None, flight_no.upper()
    return m.group(1).upper(), m.group(2)

def callsign_candidates(flight_no: str) -> list[str]:
    """Best-guess ADS-B callsigns for a commercial flight number, most likely first."""
    prefix, num = _split_flight_no(flight_no)
    icao = AIRLINE_ICAO.get(prefix) if prefix else None
    if not icao: return [flight_no.upper().replace(" ", "")]
    return [f"{icao}{num}", f"{icao}{num.zfill(4)}"]

def airline_for(flight_no: str) -> str | None:
    prefix, _ = _split_flight_no(flight_no)
    icao = AIRLINE_ICAO.get(prefix) if prefix else None
    return AIRLINE_NAME.get(icao) if icao else None

async def get_live_flight(flight_no:str) -> dict:
    key = os.environ.get("AERODATABOX_KEY")
    async def fetch():
        if not key: return {**DEMO_FLIGHT,"flight_no":flight_no.upper()}
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(f"https://aerodatabox.p.rapidapi.com/flights/number/{flight_no}",
                    headers={"X-RapidAPI-Key":key,"X-RapidAPI-Host":"aerodatabox.p.rapidapi.com"})
                f = r.json()[0]
                return {"flight_no":flight_no.upper(),"status":f.get("status","scheduled").lower(),
                        "gate":(f.get("departure",{}).get("gate") or "TBA"),
                        "depart":f.get("departure",{}).get("scheduledTime",{}).get("local","")[11:16],
                        "arrive":f.get("arrival",{}).get("scheduledTime",{}).get("local","")[11:16],
                        "aircraft":f.get("aircraft",{}).get("model",""),"source":"aerodatabox"}
        except Exception:
            return {**DEMO_FLIGHT,"flight_no":flight_no.upper(),"source":"demo-fallback"}
    return await cached(f"fl:{flight_no.upper()}",120,fetch)

async def get_position(callsign:str) -> dict:
    """Real aircraft position, no key: https://api.adsb.lol/v2/callsign/{cs}"""
    async def fetch():
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(f"https://api.adsb.lol/v2/callsign/{callsign.upper()}")
                ac = (r.json().get("ac") or [None])[0]
                if not ac: return {"callsign":callsign.upper(),"found":False,"source":"adsb.lol"}
                return {"callsign":callsign.upper(),"found":True,
                        "lat":ac.get("lat"),"lon":ac.get("lon"),
                        "alt_ft":ac.get("alt_baro"),"gspd_kt":ac.get("gs"),
                        "heading":ac.get("track"),"source":"adsb.lol"}
        except Exception:
            return {"callsign":callsign.upper(),"found":False,"source":"error-fallback"}
    return await cached(f"pos:{callsign.upper()}",15,fetch)

async def get_track(flight_no: str) -> dict:
    """Merged live view for the UI: flight status + best-match live ADS-B position.
    Tries each plausible callsign in turn and keeps the first that's actually airborne,
    so a bare commercial flight number (AI101) works without the caller knowing ICAO codes."""
    status = await get_live_flight(flight_no)
    pos = {"found": False, "source": "adsb.lol"}
    for cs in callsign_candidates(flight_no):
        p = await get_position(cs)
        if p.get("found"):
            pos = p
            break
        pos = p  # keep the last attempt so the "not found" callsign is visible
    return {"flight_no": flight_no.upper(), "airline": airline_for(flight_no),
            "status": status, "position": pos}
