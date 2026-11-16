"""Delay Intelligence engine — evaluates the models exported by
scripts/train_delay_models.py (PBL-1, PBL-2, PBL-3) with plain numpy.

The same JSON is evaluated by the web app (web/src/lib/delayml.ts) when the
backend is asleep, so both give identical numbers (tests/test_delayml.py)."""
from __future__ import annotations
import json, math, pathlib
from functools import lru_cache

import numpy as np

PATH = pathlib.Path(__file__).with_name("delay_models.json")


@lru_cache(maxsize=1)
def model() -> dict:
    return json.loads(PATH.read_text())


def _tree(tree: dict, x: list[float]) -> float:
    l, r, f, t, v = tree["l"], tree["r"], tree["f"], tree["t"], tree["v"]
    n = 0
    while l[n] != -1:
        n = l[n] if x[f[n]] <= t[n] else r[n]
    return v[n]


def _f32(x: list[float]) -> list[float]:
    return [float(np.float32(v)) for v in x]


def _eval(m: dict, xs: list[float], x: list[float]) -> float:
    if m["type"] in ("logreg", "linreg"):
        z = sum(c * v for c, v in zip(m["coef"], xs)) + m["intercept"]
        return 1 / (1 + math.exp(-z)) if m["type"] == "logreg" else z
    if m["type"] == "forest":
        x32 = _f32(x)
        return sum(_tree(t, x32) for t in m["trees"]) / len(m["trees"])
    if m["type"] == "hgb":
        return 1 / (1 + math.exp(-(m["baseline"] + sum(_tree(t, x) for t in m["trees"]))))
    raise ValueError(m["type"])


def _logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def defaults(airline: str, origin: str, dest: str, hour: int) -> dict:
    lk = model()["lookups"]
    route = lk["routes"].get(f"{origin}-{dest}")
    return {
        "distance_mi": route["dist"] if route else 800.0,
        "sched_minutes": route["mins"] if route else 150.0,
        "live_origin_delay": lk["typical_live_origin"].get(f"{origin}|{hour}", lk["fill"]["live_origin_delay"]),
        "live_airline_delay": lk["typical_live_airline"].get(f"{airline}|{hour}", lk["fill"]["live_airline_delay"]),
        "live_dest_delay": lk["typical_live_origin"].get(f"{dest}|{hour}", lk["fill"]["live_dest_delay"]),
    }


def features(q: dict) -> list[float]:
    M = model(); lk = M["lookups"]
    hour = int(q.get("dep_hour", 9))
    d = defaults(q.get("airline", ""), q.get("origin", ""), q.get("dest", ""), hour)
    get = lambda k: float(q[k]) if q.get(k) is not None else d[k]
    vals = {
        "dep_hour": float(q.get("dep_hour", 9)), "day_of_week": float(q.get("day_of_week", 3)),
        "distance_mi": get("distance_mi"), "sched_minutes": get("sched_minutes"),
        "airline_rate": lk["airlines"].get(q.get("airline", ""), {}).get("rate", lk["prior"]),
        "origin_rate": lk["airport_rate"].get(q.get("origin", ""), lk["prior"]),
        "dest_rate": lk["airport_rate"].get(q.get("dest", ""), lk["prior"]),
        "live_origin_delay": min(max(get("live_origin_delay"), 0), 240),
        "live_airline_delay": min(max(get("live_airline_delay"), 0), 240),
        "live_dest_delay": min(max(get("live_dest_delay"), 0), 240),
    }
    return [vals[f] for f in M["features"]]


def predict(q: dict) -> dict:
    M = model()
    x = features(q)
    xs = [(v - m) / s for v, m, s in zip(x, M["scaler"]["mean"], M["scaler"]["std"])]
    probs = {k: _eval(m, xs, x) for k, m in M["classifiers"].items()}
    ens = M["ensemble"]
    probs["voting"] = sum(probs[k] * w for k, w in zip(ens["base"], ens["voting_weights"])) / sum(ens["voting_weights"])
    st = ens["stacking"]
    probs["stacking"] = 1 / (1 + math.exp(-(sum(c * _logit(probs[k]) for c, k in zip(st["coef"], ens["base"])) + st["intercept"])))
    mins = {k: min(max(_eval(m, xs, x), 0), 180) for k, m in M["regressors"].items()}

    # PBL-2: which flight profile (K-Means cluster) is this?
    C = M["clusters"]
    cx = [(x[M["features"].index(f)] - mu) / sd for f, mu, sd in zip(C["features"], C["mean"], C["std"])]
    dist = [sum((a - b) ** 2 for a, b in zip(cx, c)) for c in C["centers_scaled"]]
    cl = int(np.argmin(dist))

    p = probs["stacking"]
    band = "low" if p < 0.25 else "moderate" if p < 0.45 else "elevated"
    thr = M["thresholds"]
    return {
        "inputs": dict(zip(M["features"], [round(v, 3) for v in x])),
        "probability": round(p, 4), "band": band, "expected_delay_min": round(mins["random_forest"], 1),
        "committee": [{"id": k, "p": round(v, 4), "says_late": v >= thr.get(k, 0.5)} for k, v in probs.items()],
        "regression": {k: round(v, 1) for k, v in mins.items()},
        "cluster": {**C["profiles"][cl], "distance": [round(v, 3) for v in dist]},
        "prior": M["dataset"]["delayed_share"],
    }


def ripple(levels: list[int]) -> dict:
    """PBL-2 HMM: forward-filter an airline's hourly delay levels (0/1/2) and say
    which hidden state the network is in now and what the next hour looks like."""
    H = model()["hmm"]
    pi, A, B = np.array(H["start"]), np.array(H["trans"]), np.array(H["emit"])
    levels = [min(max(int(v), 0), 2) for v in levels][: len(H["hours"])] or [0]
    a = pi * B[:, levels[0]]; a /= a.sum()
    path = [a.round(4).tolist()]
    for o in levels[1:]:
        a = (a @ A) * B[:, o]; a /= a.sum()
        path.append(a.round(4).tolist())
    nxt_state = a @ A
    nxt_obs = nxt_state @ B
    return {"hours": H["hours"][: len(levels)], "states": H["states"], "posterior": path,
            "now": H["states"][int(np.argmax(a))], "next_state": nxt_state.round(4).tolist(),
            "next_obs": nxt_obs.round(4).tolist(), "p_next_late": round(float(nxt_obs[1] + nxt_obs[2]), 4),
            "next_hour": H["hours"][min(len(levels), len(H["hours"]) - 1)]}


def overview() -> dict:
    M = model()
    lk = M["lookups"]
    return {"version": M["version"], "trained_at": M["trained_at"], "dataset": M["dataset"],
            "feature_labels": M["feature_labels"], "metrics": M["metrics"], "thresholds": M["thresholds"],
            "clusters": {k: M["clusters"][k] for k in ("profiles", "silhouette_by_k", "k", "features")},
            "hmm": {k: M["hmm"][k] for k in ("hours", "states", "obs_levels", "trans", "emit", "metrics", "typical_day")},
            "airlines": lk["airlines"], "airports": sorted(lk["airport_rate"]), "routes": lk["routes"]}
