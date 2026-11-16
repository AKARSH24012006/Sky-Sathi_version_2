"""Train the SkySathi Delay Intelligence models (ML course PBL-1, PBL-2, PBL-3)
and export them as ONE portable JSON file that both the FastAPI backend (numpy)
and the web app (TypeScript) evaluate identically.

    python scripts/train_delay_models.py path/to/flight_data_2018_to_2022.csv[.xz]

Dataset: the same Kaggle/BTS file used in the course notebooks (563,737 US
domestic flights, January 2022, 23 columns).  Split by time, like PBL-3:
    train  1–17 Jan   (fit every model)
    valid 18–21 Jan   (decision thresholds + stacking meta-learner)
    test  22–31 Jan   (all reported metrics — never seen during fitting)

PBL-1  regression (Linear, Decision Tree, Random Forest) → arrival delay minutes
       classification (Logistic, Decision Tree, Random Forest) → P(arrive 15+ min late)
PBL-2  K-Means flight profiles + a Categorical HMM over airline-day hourly delay
       levels ("delay ripple": calm → building → congested)
PBL-3  bagging, extra trees, gradient boosting, soft voting, stacking
"""
from __future__ import annotations
import json, sys, time, pathlib
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import (RandomForestClassifier, RandomForestRegressor, ExtraTreesClassifier,
                              BaggingClassifier, HistGradientBoostingClassifier)
from sklearn.cluster import KMeans
from sklearn.metrics import (roc_auc_score, f1_score, accuracy_score, precision_score, recall_score,
                             mean_absolute_error, mean_squared_error, r2_score, silhouette_score)

SEED = 42
OUT = pathlib.Path(__file__).resolve().parents[1] / "app" / "delayml" / "delay_models.json"
FEATURES = ["dep_hour", "day_of_week", "distance_mi", "sched_minutes", "airline_rate", "origin_rate",
            "dest_rate", "live_origin_delay", "live_airline_delay", "live_dest_delay"]
FEATURE_LABELS = {
    "dep_hour": "Scheduled departure hour", "day_of_week": "Day of week", "distance_mi": "Route distance",
    "sched_minutes": "Scheduled block time", "airline_rate": "Airline's usual delay rate",
    "origin_rate": "Departure airport's usual delay rate", "dest_rate": "Arrival airport's usual delay rate",
    "live_origin_delay": "Live: departure airport lateness 2–3 h before", "live_airline_delay": "Live: airline lateness 2–3 h before",
    "live_dest_delay": "Live: arrival airport lateness 2–3 h before"}
R = lambda x, n=4: float(round(float(x), n))


def load(path: str) -> pd.DataFrame:
    d = pd.read_csv(path)
    d.columns = d.columns.str.strip()
    d["date"] = pd.to_datetime(d["FlightDate"])
    d["day"] = d["date"].dt.day
    d["hour"] = (d["CRSDepTime"] // 100).clip(0, 23).astype(int)
    d["dep_hour"] = d["hour"] + (d["CRSDepTime"] % 100) / 60
    return d


def live_feature(d: pd.DataFrame, key: str) -> pd.Series:
    """Mean departure delay (minutes) of flights at `key` (airport/airline) whose
    scheduled hour was 2–3 h before this flight's, same day — known at check-in."""
    g = d.groupby(["FlightDate", key, "hour"])["DepDelayMinutes"].mean()
    out = np.full(len(d), np.nan)
    for lag in (2, 3):
        idx = pd.MultiIndex.from_arrays([d["FlightDate"], d[key], d["hour"] - lag])
        v = g.reindex(idx).to_numpy()
        out = np.where(np.isnan(out), v, np.where(np.isnan(v), out, (out + v) / 2))
    return pd.Series(out, index=d.index)


def smooth_rate(train: pd.DataFrame, key: str, prior: float, k: int = 50) -> dict:
    g = train.groupby(key)["ArrDel15"].agg(["sum", "count"])
    return ((g["sum"] + prior * k) / (g["count"] + k)).round(4).to_dict()


# ---------- tree export (sklearn → compact arrays) ----------
def export_tree(t, kind: str) -> dict:
    tr = t.tree_
    if kind == "clf":
        v = tr.value[:, 0, :]
        leaf = v[:, 1] / np.maximum(v.sum(1), 1e-12)
    else:
        leaf = tr.value[:, 0, 0]
    return {"l": tr.children_left.tolist(), "r": tr.children_right.tolist(), "f": tr.feature.tolist(),
            "t": [float(x) for x in tr.threshold], "v": [R(x, 5) for x in leaf]}


def export_hgb(m) -> dict:
    trees = []
    for it in m._predictors:
        n = it[0].nodes
        trees.append({"l": [int(x) if not lf else -1 for x, lf in zip(n["left"], n["is_leaf"])],
                      "r": [int(x) if not lf else -1 for x, lf in zip(n["right"], n["is_leaf"])],
                      "f": [int(x) for x in n["feature_idx"]], "t": [float(x) for x in n["num_threshold"]],
                      "v": [R(x, 6) for x in n["value"]]})
    return {"type": "hgb", "baseline": R(np.ravel(m._baseline_prediction)[0], 6), "trees": trees}


def tree_predict(tree: dict, X: np.ndarray) -> np.ndarray:
    l, r, f, t, v = (np.array(tree[k]) for k in "lrftv")
    node = np.zeros(len(X), dtype=int)
    for _ in range(64):
        internal = l[node] != -1
        if not internal.any():
            break
        i = np.where(internal)[0]
        go_left = X[i, f[node[i]]] <= t[node[i]]
        node[i] = np.where(go_left, l[node[i]], r[node[i]])
    return v[node]


def predict_exported(m: dict, Xs: np.ndarray, Xraw: np.ndarray) -> np.ndarray:
    """Reference evaluator (the backend runs the same logic) — used to prove the
    export matches sklearn before it ships."""
    if m["type"] == "logreg":
        return 1 / (1 + np.exp(-(Xs @ np.array(m["coef"]) + m["intercept"])))
    if m["type"] == "linreg":
        return Xs @ np.array(m["coef"]) + m["intercept"]
    if m["type"] == "forest":   # sklearn trees compare float32(x) against the threshold
        X32 = Xraw.astype(np.float32).astype(np.float64)
        return np.mean([tree_predict(t, X32) for t in m["trees"]], axis=0)
    if m["type"] == "hgb":
        raw = m["baseline"] + np.sum([tree_predict(t, Xraw) for t in m["trees"]], axis=0)
        return 1 / (1 + np.exp(-raw))
    raise ValueError(m["type"])


def cls_metrics(y, p, thr):
    yh = (p >= thr).astype(int)
    return {"roc_auc": R(roc_auc_score(y, p), 3), "f1": R(f1_score(y, yh), 3), "accuracy": R(accuracy_score(y, yh), 3),
            "precision": R(precision_score(y, yh, zero_division=0), 3), "recall": R(recall_score(y, yh), 3), "threshold": R(thr, 3)}


def best_threshold(y, p):
    grid = np.linspace(0.05, 0.7, 66)
    return float(grid[int(np.argmax([f1_score(y, (p >= g).astype(int)) for g in grid]))])


def main(path: str):
    t0 = time.time()
    d = load(path)
    d["live_origin_delay"] = live_feature(d, "Origin")
    d["live_airline_delay"] = live_feature(d, "Operating_Airline")
    # destination live feature = departures *from* the destination airport in the same window
    g = d.groupby(["FlightDate", "Origin", "hour"])["DepDelayMinutes"].mean()
    out = np.full(len(d), np.nan)
    for lag in (2, 3):
        v = g.reindex(pd.MultiIndex.from_arrays([d["FlightDate"], d["Dest"], d["hour"] - lag])).to_numpy()
        out = np.where(np.isnan(out), v, np.where(np.isnan(v), out, (out + v) / 2))
    d["live_dest_delay"] = out

    ok = d[(d.Cancelled == 0) & (d.Diverted == 0) & d.ArrDel15.notna()].copy()
    tr, va, te = ok[ok.day <= 17], ok[(ok.day > 17) & (ok.day <= 21)], ok[ok.day > 21]
    prior = float(tr.ArrDel15.mean())
    rates = {k: smooth_rate(tr, k, prior) for k in ("Operating_Airline", "Origin", "Dest")}
    airport_rate = smooth_rate(pd.concat([tr.assign(A=tr.Origin), tr.assign(A=tr.Dest)]), "A", prior, 100)
    typ_live = tr.groupby(["Origin", "hour"])["DepDelayMinutes"].mean()          # UI defaults
    typ_airline = tr.groupby(["Operating_Airline", "hour"])["DepDelayMinutes"].mean()
    fill = {"live_origin_delay": float(tr.DepDelayMinutes.mean()), "live_airline_delay": float(tr.DepDelayMinutes.mean()),
            "live_dest_delay": float(tr.DepDelayMinutes.mean())}

    def feats(x: pd.DataFrame) -> np.ndarray:
        f = pd.DataFrame({
            "dep_hour": x.dep_hour, "day_of_week": x.DayOfWeek, "distance_mi": x.Distance,
            "sched_minutes": x.CRSElapsedTime.fillna(x.Distance / 7 + 30),
            "airline_rate": x.Operating_Airline.map(rates["Operating_Airline"]).fillna(prior),
            "origin_rate": x.Origin.map(airport_rate).fillna(prior),
            "dest_rate": x.Dest.map(airport_rate).fillna(prior)})
        for c, v in fill.items():
            f[c] = x[c].fillna(v).clip(0, 240)
        return f[FEATURES].to_numpy(float)

    Xtr, Xva, Xte = feats(tr), feats(va), feats(te)
    ytr, yva, yte = tr.ArrDel15.to_numpy(int), va.ArrDel15.to_numpy(int), te.ArrDel15.to_numpy(int)
    rtr, rte = tr.ArrDelayMinutes.clip(0, 180).to_numpy(), te.ArrDelayMinutes.clip(0, 180).to_numpy()
    mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-9
    S = lambda X: (X - mu) / sd
    print(f"rows train={len(tr):,} valid={len(va):,} test={len(te):,}  delayed={prior:.3f}  ({time.time()-t0:.0f}s)")

    rng = np.random.RandomState(SEED)
    sub = rng.choice(len(Xtr), min(len(Xtr), 220_000), replace=False)   # keeps tree ensembles light
    Xs_, ys_, rs_ = Xtr[sub], ytr[sub], rtr[sub]

    exp: dict[str, dict] = {}
    # ---- PBL-1 classification
    lr = LogisticRegression(max_iter=500, C=1.0).fit(S(Xtr), ytr)
    exp["logreg"] = {"type": "logreg", "coef": [R(c, 6) for c in lr.coef_[0]], "intercept": R(lr.intercept_[0], 6)}
    dt = DecisionTreeClassifier(max_depth=8, min_samples_leaf=200, random_state=SEED).fit(Xs_, ys_)
    exp["tree"] = {"type": "forest", "trees": [export_tree(dt, "clf")]}
    rf = RandomForestClassifier(n_estimators=24, max_depth=10, min_samples_leaf=80, max_features=0.5, n_jobs=-1, random_state=SEED).fit(Xs_, ys_)
    exp["random_forest"] = {"type": "forest", "trees": [export_tree(t, "clf") for t in rf.estimators_]}
    # ---- PBL-3 ensembles
    bag = BaggingClassifier(DecisionTreeClassifier(max_depth=9, min_samples_leaf=80), n_estimators=16, max_samples=0.6,
                            n_jobs=-1, random_state=SEED).fit(Xs_, ys_)
    # bagging trains each tree on a bootstrap sample of ALL features (no per-split feature sampling) — that's the difference from RF
    exp["bagging"] = {"type": "forest", "trees": [export_tree(t, "clf") for t in bag.estimators_]}
    et = ExtraTreesClassifier(n_estimators=24, max_depth=11, min_samples_leaf=80, max_features=0.6, n_jobs=-1, random_state=SEED).fit(Xs_, ys_)
    exp["extra_trees"] = {"type": "forest", "trees": [export_tree(t, "clf") for t in et.estimators_]}
    hgb = HistGradientBoostingClassifier(max_iter=140, learning_rate=0.08, max_leaf_nodes=15, min_samples_leaf=100,
                                         l2_regularization=1.0, random_state=SEED).fit(Xtr, ytr)
    exp["boosting"] = export_hgb(hgb)

    # parity check: exported JSON must reproduce sklearn
    chk = Xte[:3000]
    parity = {
        "logreg": np.abs(predict_exported(exp["logreg"], S(chk), chk) - lr.predict_proba(S(chk))[:, 1]).max(),
        "random_forest": np.abs(predict_exported(exp["random_forest"], S(chk), chk) - rf.predict_proba(chk)[:, 1]).max(),
        "boosting": np.abs(predict_exported(exp["boosting"], S(chk), chk) - hgb.predict_proba(chk)[:, 1]).max(),
    }
    print("export parity (max |Δp|):", {k: f"{v:.2e}" for k, v in parity.items()})
    assert all(v < 1e-4 for v in parity.values()), parity

    P = {}
    for split, X in (("va", Xva), ("te", Xte)):
        for k, m in exp.items():
            P[(split, k)] = predict_exported(m, S(X), X)
    base = ["logreg", "random_forest", "extra_trees", "boosting"]
    vote_w = [1, 1, 1, 1]
    for split in ("va", "te"):
        P[(split, "voting")] = np.average([P[(split, k)] for k in base], axis=0, weights=vote_w)
    logit = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
    meta = LogisticRegression(C=1.0).fit(np.column_stack([logit(P[("va", k)]) for k in base]), yva)
    for split in ("va", "te"):
        P[(split, "stacking")] = meta.predict_proba(np.column_stack([logit(P[(split, k)]) for k in base]))[:, 1]

    NAMES = {"logreg": ("Logistic Regression", "PBL-1 · baseline"), "tree": ("Decision Tree", "PBL-1 · baseline"),
             "random_forest": ("Random Forest", "PBL-1 · bagging"), "bagging": ("Bagging (Decision Trees)", "PBL-3 · bagging"),
             "extra_trees": ("Extra Trees", "PBL-3 · bagging"), "boosting": ("Gradient Boosting", "PBL-3 · boosting"),
             "voting": ("Soft Voting", "PBL-3 · voting"), "stacking": ("Stacking", "PBL-3 · stacking")}
    cls = []
    for k, (nm, fam) in NAMES.items():
        thr = best_threshold(yva, P[("va", k)])
        cls.append({"id": k, "name": nm, "family": fam, **cls_metrics(yte, P[("te", k)], thr)})
    cls.sort(key=lambda r: -r["roc_auc"])
    thresholds = {r["id"]: r["threshold"] for r in cls}
    print(pd.DataFrame(cls)[["name", "family", "roc_auc", "f1", "accuracy"]].to_string(index=False))

    # ablation: what the live (2–3 h before) features add — PBL-3 finding
    no_live = HistGradientBoostingClassifier(max_iter=140, learning_rate=0.08, max_leaf_nodes=15, min_samples_leaf=100,
                                             l2_regularization=1.0, random_state=SEED).fit(Xtr[:, :7], ytr)
    ablation = {"without_live": R(roc_auc_score(yte, no_live.predict_proba(Xte[:, :7])[:, 1]), 3),
                "with_live": next(r["roc_auc"] for r in cls if r["id"] == "boosting")}

    # importance (permutation on a test slice, boosting model)
    rs = np.random.RandomState(1); slc = rs.choice(len(Xte), 20000, replace=False)
    base_auc = roc_auc_score(yte[slc], P[("te", "boosting")][slc]); imp = []
    for j, f in enumerate(FEATURES):
        Xp = Xte[slc].copy(); Xp[:, j] = rs.permutation(Xp[:, j])
        imp.append({"feature": f, "label": FEATURE_LABELS[f], "drop_auc": R(base_auc - roc_auc_score(yte[slc], predict_exported(exp["boosting"], S(Xp), Xp)), 4)})
    imp.sort(key=lambda r: -r["drop_auc"])

    # ---- PBL-1 regression
    lin = LinearRegression().fit(S(Xtr), rtr)
    dtr = DecisionTreeRegressor(max_depth=8, min_samples_leaf=200, random_state=SEED).fit(Xs_, rs_)
    rfr = RandomForestRegressor(n_estimators=20, max_depth=10, min_samples_leaf=80, max_features=0.5, n_jobs=-1, random_state=SEED).fit(Xs_, rs_)
    reg_exp = {"linear": {"type": "linreg", "coef": [R(c, 6) for c in lin.coef_], "intercept": R(lin.intercept_, 6)},
               "tree": {"type": "forest", "trees": [export_tree(dtr, "reg")]},
               "random_forest": {"type": "forest", "trees": [export_tree(t, "reg") for t in rfr.estimators_]}}
    reg = []
    for k, nm in (("linear", "Linear Regression"), ("tree", "Decision Tree"), ("random_forest", "Random Forest")):
        p = np.clip(predict_exported(reg_exp[k], S(Xte), Xte), 0, 180)
        reg.append({"id": k, "name": nm, "mae": R(mean_absolute_error(rte, p), 2), "rmse": R(np.sqrt(mean_squared_error(rte, p)), 2),
                    "r2": R(r2_score(rte, p), 3)})
    reg.append({"id": "mean_baseline", "name": "Always predict the average", "mae": R(mean_absolute_error(rte, np.full_like(rte, rtr.mean())), 2),
                "rmse": R(np.sqrt(mean_squared_error(rte, np.full_like(rte, rtr.mean()))), 2), "r2": 0.0})
    print(pd.DataFrame(reg).to_string(index=False))

    # ---- PBL-2 clustering: flight profiles
    CF = ["dep_hour", "distance_mi", "origin_rate", "live_origin_delay", "airline_rate"]
    ci = [FEATURES.index(c) for c in CF]
    Xc = Xtr[rng.choice(len(Xtr), 60000, replace=False)][:, ci]
    cmu, csd = Xc.mean(0), Xc.std(0) + 1e-9
    sils = {}
    for k in (3, 4, 5, 6):
        km_k = KMeans(k, n_init=5, random_state=SEED).fit((Xc - cmu) / csd)
        sils[k] = R(silhouette_score((Xc[:8000] - cmu) / csd, km_k.labels_[:8000]), 3)
    km = KMeans(4, n_init=10, random_state=SEED).fit((Xc - cmu) / csd)
    cent = km.cluster_centers_ * csd + cmu
    lab_all = km.predict((Xte[:, ci] - cmu) / csd)
    clusters = []
    NAMING = {("dep_hour", -1): "Early-morning departures", ("dep_hour", 1): "Late-day departures",
              ("distance_mi", 1): "Long-haul routes", ("distance_mi", -1): "Short hops",
              ("origin_rate", 1): "Busy, delay-prone hubs", ("origin_rate", -1): "Quiet airports",
              ("live_origin_delay", 1): "Airport already running late", ("live_origin_delay", -1): "Airport running on time",
              ("airline_rate", 1): "Delay-prone airlines", ("airline_rate", -1): "Punctual airlines"}
    used = set()
    for c in np.argsort([-x for x in [yte[lab_all == c].mean() for c in range(4)]])[::-1]:
        z = km.cluster_centers_[c]
        for j in np.argsort(-np.abs(z)):
            key = (CF[j], 1 if z[j] > 0 else -1)
            if NAMING[key] not in used:
                used.add(NAMING[key]); name = NAMING[key]; break
        h, dist, orate, live, arate = cent[c]
        clusters.append({"id": int(c), "name": name,
                         "detail": f"dep ~{int(h):02d}:{int((h % 1) * 60):02d} · {dist:,.0f} mi · airport lateness {live:.0f} min",
                         "centroid": dict(zip(CF, [R(x, 3) for x in cent[c]])),
                         "test_delay_rate": R(yte[lab_all == c].mean(), 3), "share": R((lab_all == c).mean(), 3)})
    clusters.sort(key=lambda r: r["id"])
    print("clusters:", [(c["name"], c["test_delay_rate"]) for c in clusters], "silhouette", sils)

    # ---- PBL-2 HMM: airline-day hourly delay levels → hidden congestion state
    from hmmlearn.hmm import CategoricalHMM
    HOURS = list(range(6, 23))
    dd = d[d.Cancelled == 0].copy()
    agg = dd.groupby(["FlightDate", "Operating_Airline", "hour"])["DepDel15"].agg(["mean", "count"]).reset_index()
    agg["obs"] = np.select([agg["mean"] < 0.12, agg["mean"] < 0.30], [0, 1], 2)
    seqs, days = [], []
    for (fd, al), g in agg.groupby(["FlightDate", "Operating_Airline"]):
        m = g.set_index("hour")
        if m["count"].sum() < 60:
            continue
        o = [int(m.obs.get(h, 0)) if m["count"].get(h, 0) >= 3 else None for h in HOURS]
        last = 0
        o = [(last := v) if v is not None else last for v in o]
        seqs.append(o); days.append((int(fd[-2:]), al))
    seqs = np.array(seqs); dnum = np.array([x[0] for x in days])
    trS, teS = seqs[dnum <= 21], seqs[dnum > 21]
    # sticky, ordered initialisation (calm → building → congested); random init falls into
    # a degenerate optimum where two states have identical emissions and just alternate
    hmm = CategoricalHMM(n_components=3, n_iter=300, random_state=SEED, init_params="", params="ste")
    hmm.n_features = 3
    hmm.startprob_ = np.array([0.6, 0.3, 0.1])
    hmm.transmat_ = np.array([[0.85, 0.12, 0.03], [0.1, 0.8, 0.1], [0.03, 0.12, 0.85]])
    hmm.emissionprob_ = np.array([[0.8, 0.17, 0.03], [0.3, 0.55, 0.15], [0.05, 0.3, 0.65]])
    hmm.fit(trS.reshape(-1, 1), lengths=[len(HOURS)] * len(trS))
    order = np.argsort(hmm.emissionprob_[:, 2])                 # calm < building < congested
    pi, A, B = hmm.startprob_[order], hmm.transmat_[order][:, order], hmm.emissionprob_[order]

    def next_hour(seq):     # forward filter → P(next hour congested-level obs)
        a = pi * B[:, seq[0]]; a /= a.sum(); outp = []
        for t in range(1, len(seq)):
            pred = a @ A; outp.append((pred @ B)[:, ].tolist())
            a = pred * B[:, seq[t]]; a /= a.sum()
        return outp
    yy, pp, naive = [], [], []
    for s in teS:
        pr = next_hour(s)
        for t in range(1, len(s)):
            yy.append(int(s[t] >= 1)); pp.append(pr[t - 1][1] + pr[t - 1][2]); naive.append(int(s[t - 1] >= 1))
    ty, tp = [], []
    for s_ in trS[:600]:
        pr = next_hour(s_)
        for t_ in range(1, len(s_)):
            ty.append(int(s_[t_] >= 1)); tp.append(pr[t_ - 1][1] + pr[t_ - 1][2])
    grid = np.linspace(0.1, 0.9, 81)
    hmm_thr = float(grid[int(np.argmax([accuracy_score(ty, (np.array(tp) >= g).astype(int)) for g in grid]))])
    hmm_auc = R(roc_auc_score(yy, pp), 3)
    pers_acc = R(accuracy_score(yy, naive), 3)
    hmm_acc = R(accuracy_score(yy, (np.array(pp) >= hmm_thr).astype(int)), 3)
    print(f"HMM next-hour AUC {hmm_auc}  acc {hmm_acc}  vs persistence acc {pers_acc}")
    typical = {}
    for (fd, al), s in zip(days, seqs):
        typical.setdefault(al, []).append(s)
    typical = {al: [int(round(x)) for x in np.median(np.array(v), axis=0)] for al, v in typical.items() if len(v) >= 10}

    # ---- lookups for the UI
    top_air = ok.Origin.value_counts()
    airports = [a for a in top_air.index if top_air[a] >= 1500]
    routes = ok[ok.Origin.isin(airports) & ok.Dest.isin(airports)].groupby(["Origin", "Dest"]).agg(
        n=("Distance", "size"), dist=("Distance", "median"), mins=("CRSElapsedTime", "median"),
        airlines=("Operating_Airline", lambda s: s.value_counts().index[:4].tolist())).reset_index()
    routes = routes[routes.n >= 60]
    AIRLINE_NAMES = {"WN": "Southwest", "AA": "American", "DL": "Delta", "OO": "SkyWest", "UA": "United", "YX": "Republic",
                     "MQ": "Envoy", "9E": "Endeavor", "B6": "JetBlue", "OH": "PSA", "NK": "Spirit", "AS": "Alaska",
                     "F9": "Frontier", "YV": "Mesa", "G4": "Allegiant", "PT": "Piedmont", "QX": "Horizon",
                     "C5": "CommutAir", "ZW": "Air Wisconsin", "HA": "Hawaiian", "G7": "GoJet"}
    lookups = {
        "prior": R(prior), "fill": {k: R(v, 2) for k, v in fill.items()},
        "airlines": {a: {"name": AIRLINE_NAMES.get(a, a), "rate": rates["Operating_Airline"][a]} for a in rates["Operating_Airline"]},
        "airport_rate": {a: airport_rate[a] for a in airports},
        "routes": {f"{r.Origin}-{r.Dest}": {"dist": R(r.dist, 0), "mins": R(r.mins, 0), "airlines": r.airlines} for r in routes.itertuples()},
        "typical_live_origin": {f"{a}|{h}": R(v, 1) for (a, h), v in typ_live.items() if a in airports and not np.isnan(v)},
        "typical_live_airline": {f"{a}|{h}": R(v, 1) for (a, h), v in typ_airline.items() if not np.isnan(v)},
    }

    doc = {
        "version": "delayml-1.0", "trained_at": time.strftime("%Y-%m-%d"),
        "dataset": {"name": "flight_data_2018_to_2022.csv (Kaggle / US BTS)", "period": "1–31 Jan 2022",
                    "rows_total": int(len(d)), "rows_used": int(len(ok)), "train": int(len(tr)), "valid": int(len(va)), "test": int(len(te)),
                    "split": "train 1–17 Jan · validation 18–21 Jan · test 22–31 Jan (time-based, no future data)",
                    "target": "arrival 15+ minutes late (ArrDel15)", "delayed_share": R(prior, 3)},
        "features": FEATURES, "feature_labels": FEATURE_LABELS, "scaler": {"mean": [R(x, 6) for x in mu], "std": [R(x, 6) for x in sd]},
        "classifiers": exp, "regressors": reg_exp,
        "ensemble": {"base": base, "voting_weights": vote_w, "stacking": {"coef": [R(c, 6) for c in meta.coef_[0]], "intercept": R(meta.intercept_[0], 6)}},
        "thresholds": thresholds,
        "metrics": {"classification": cls, "regression": reg, "ablation_live_features": ablation, "importance": imp},
        "clusters": {"features": CF, "mean": [R(x, 6) for x in cmu], "std": [R(x, 6) for x in csd],
                     "centers_scaled": [[R(x, 5) for x in c] for c in km.cluster_centers_], "profiles": clusters, "silhouette_by_k": sils, "k": 4},
        "hmm": {"hours": HOURS, "obs_levels": ["under 12% of departures late", "12–30% late", "over 30% late"],
                "states": ["Calm", "Building", "Congested"], "start": [R(x, 5) for x in pi],
                "trans": [[R(x, 5) for x in r] for r in A], "emit": [[R(x, 5) for x in r] for r in B],
                "threshold": R(hmm_thr, 3), "metrics": {"next_hour_auc": hmm_auc, "next_hour_accuracy": hmm_acc, "persistence_accuracy": pers_acc,
                            "train_sequences": int(len(trS)), "test_sequences": int(len(teS))},
                "typical_day": typical},
        "lookups": lookups,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, separators=(",", ":")))
    web = OUT.parents[3] / "web" / "public" / "delay_models.json"     # browser copy (offline fallback)
    if web.parent.exists():
        web.write_text(OUT.read_text())
    print(f"wrote {OUT} ({OUT.stat().st_size/1e6:.2f} MB) in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "flight_data_2018_to_2022.csv")
