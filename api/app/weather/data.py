"""Open-Meteo (free, keyless) -> anxiety-aware weather. Cached 10 min."""
import httpx
from ..db.cache import cached
from ..airports.data import AIRPORTS

WMO = {0:"clear",1:"mostly clear",2:"partly cloudy",3:"overcast",45:"fog",
       51:"light drizzle",61:"light rain",63:"rain",80:"light showers",95:"thunderstorms nearby"}
DEMO = {"temp_c":24,"summary":"light rain","wind_kmh":14,"code":61,
        "calm_note":"expect a firm, planted landing — intentional for grip, and a good sign"}

def calm_note(code:int, wind:float) -> str:
    if code>=95: return "pilots see storms on radar far ahead and route around them — departures wait, they never push through"
    if code==45: return "modern jets land safely in fog the pilots can barely see through — the aircraft helps fly the approach"
    if code>=51: return "expect a firm, planted landing — intentional for grip on a wet runway, and a good sign"
    if wind>30: return "a breezy landing means a few gentle corrections on approach — routine, fully practiced handling"
    return "quiet, settled air — about as easy as flying gets"

async def get_weather(iata:str) -> dict:
    ap = AIRPORTS.get(iata.upper())
    if not ap: return {**DEMO,"iata":iata.upper(),"source":"demo"}
    async def fetch():
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get("https://api.open-meteo.com/v1/forecast", params={
                    "latitude":ap["lat"],"longitude":ap["lon"],
                    "current":"temperature_2m,weather_code,wind_speed_10m"})
                cur = r.json()["current"]; code=int(cur["weather_code"]); wind=float(cur["wind_speed_10m"])
                return {"iata":iata.upper(),"temp_c":round(cur["temperature_2m"]),
                        "summary":WMO.get(code,"changing skies"),"code":code,"wind_kmh":round(wind),
                        "calm_note":calm_note(code,wind),"source":"open-meteo"}
        except Exception:
            return {**DEMO,"iata":iata.upper(),"source":"demo-fallback"}
    return await cached(f"wx:{iata.upper()}",600,fetch)
