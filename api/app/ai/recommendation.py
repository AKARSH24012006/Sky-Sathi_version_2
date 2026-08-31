"""Recommendation Engine v1: suggested questions ranked by phase relevance,
minus already-asked, favourites first. Bandit ranking replaces the static
weights once helpfulness signals accumulate."""
POOLS = {
 "boarding":["Why do my ears feel full?","What happens during takeoff?","How safe is this plane?"],
 "taxi":["Why are we stopping and starting?","What are the pilots doing right now?"],
 "takeoff":["Why is it so loud?","What if an engine fails on takeoff?"],
 "climb":["Why are we turning?","Why did the engines get quieter?","What was that whirring sound?"],
 "cruise":["What keeps the plane up?","Can turbulence hurt the plane?","What are the dings I keep hearing?"],
 "bumps":["How bad is this turbulence?","Can the wings break?","When will the bumps stop?"],
 "descent":["Why does my stomach drop?","Why do my ears hurt on descent?","What is a go-around?"],
 "landed":["Why was the landing so firm?","What is that loud roar after landing?"],
 "airport":["How much time until boarding?","Where is my gate?","What happens at boarding?","Nearest coffee to my gate?"],
}
def suggest(phase: str, asked: list[str], favourites: list[str], k: int = 5) -> list[str]:
    base = POOLS.get(phase, POOLS["cruise"])
    seen = set(a.lower() for a in asked)
    out, add = [], lambda q: out.append(q) if q.lower() not in seen and q not in out else None
    for q in favourites: add(q)
    for q in base: add(q)
    for pool in POOLS.values():
        for q in pool: add(q)
        if len(out) >= k: break
    return out[:k]
