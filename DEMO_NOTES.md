# SkySathi — Air India demo, what changed & how to test tonight

## What "real-time" actually means now

1. **New Live Tracker** (Flights screen, top card). Type any flight number →
   polls the real, free, keyless ADS-B network (adsb.lol) every 15 seconds.
   If that aircraft is actually flying, you get its real altitude, ground
   speed, heading, and lat/lon — genuinely live, not simulated.
2. **Flight number → correct callsign, automatically.** AI101 now resolves to
   `AIC101` (Air India's real ICAO callsign) before hitting the tracker —
   this conversion didn't exist before, so live lookups for AI/6E/SG/QP flights
   now actually work.
3. **Honesty fix on the old panel.** The old "Live flight" instrument panel
   was 100% the scripted cinematic animation — never real. It's now labeled
   "Flight experience · simulated cockpit" and sits *below* the real tracker,
   so nothing on screen overclaims.
4. **Weather** was already real (Open-Meteo) — now also auto-refreshes every
   5 minutes instead of fetching once and going stale.
5. **Removed hardcoded "IndiGo"** from five places across the app — ticket,
   profile, journey screens now read the airline from the actual flight number.

## Before you sleep tonight — run this

```
./start.sh
```
Then open the app and:

- [ ] Go to the **Flights** tab. Type a flight number you know is airborne
      right now (check on flightradar24.com first) and hit Track.
      You should see the green pulsing **LIVE** dot and real numbers within
      ~2 seconds.
- [ ] Try `AI101` even if it's not flying at that moment — confirm it falls
      back gracefully to the "isn't broadcasting right now" message, not an
      error or blank screen.
- [ ] Confirm Home screen's 3D scene still runs the full "Begin Flight"
      sequence with no console errors (open DevTools → Console).
- [ ] Check the Journey and Tickets screens show your real flight number,
      not "6E 2134."

## For tomorrow — the one real risk

**Venue wifi.** Live ADS-B and weather calls need internet. If the room's
network is bad or blocked:
- The app *won't break* — every live call has a built-in fallback to demo
  data, tested tonight in an isolated sandbox with network cut off, and it
  degraded cleanly.
- But it will silently look like "just a nice demo" instead of "live," which
  undercuts your pitch. **Do a live run tonight with good wifi and screen-record
  it** as a backup — if tomorrow's connection is bad, you show the recording
  and say "here it is live last night," which is honest and still lands.

## Optional, 10-minute upgrade if you want richer flight status (gate, real times)

Right now flight *status* (gate/depart/arrive) uses demo data unless you set
an `AERODATABOX_KEY`. Free tier: sign up at rapidapi.com, subscribe to the
free AeroDataBox plan, drop the key into `api/.env`:
```
AERODATABOX_KEY=your_key_here
```
Not required — live position tracking works without it — but it makes the
status card fully real too.

## What I didn't touch

The 3D animation engine itself (`Aircraft3D.tsx`) was already solid —
real react-three-fiber running at 60fps, already weather- and time-of-day
reactive. I left it alone rather than risk destabilizing it the night
before your demo. If you want the animation driven by real telemetry
(actual altitude modulating the plane's pitch/climb) instead of the
scripted rehearsal, that's a bigger job worth doing with more runway —
happy to take it on after tomorrow.
