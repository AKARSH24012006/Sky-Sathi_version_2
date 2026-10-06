"""Stage 2 · Machine-learning classifiers (classical ML).

Two supervised text classifiers trained on SkySathi's labelled seed dataset
(data/utterances.csv, English + Hinglish):

  * anxiety band  — calm | raised | high      (drives tone, length, Calm button)
  * intent        — explain | reassure | panic | logistics | chitchat
                                              (drives prompt template + retrieval)

Model: TF-IDF (word 1-2 grams + character 2-5 grams, which handles Hinglish
spelling variants like "darr"/"dar") -> multinomial Logistic Regression.
Why not an LLM for this? A ~200-row linear model answers in <1 ms, is fully
explainable (we can show the top weighted n-grams), runs offline, and costs
nothing per message — the LLM is reserved for the generation step only.

A small safety lexicon sits on top: if any acute-distress phrase appears, the
band is forced to "high" (recall over precision for panic).
"""
from __future__ import annotations
import csv
import pathlib
import threading

DATA = pathlib.Path(__file__).with_name("data") / "utterances.csv"
PANIC_LEXICON = ("cant breathe", "can't breathe", "panic", "faint", "saans nahi", "ghabrahat",
                 "heart is racing", "chest is tight", "freaking out", "get off this plane")

_lock = threading.Lock()
_models: dict | None = None


def load_dataset() -> list[dict]:
    with DATA.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _make_pipeline():
    from sklearn.pipeline import Pipeline, FeatureUnion
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    feats = FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=1)),
    ])
    return Pipeline([("tfidf", feats), ("clf", LogisticRegression(max_iter=2000, C=6.0, class_weight="balanced"))])


def _train() -> dict:
    rows = load_dataset()
    X = [r["text"] for r in rows]
    out = {"n_samples": len(rows)}
    for target in ("anxiety", "intent"):
        y = [r[target] for r in rows]
        pipe = _make_pipeline().fit(X, y)
        out[target] = pipe
    return out


def models() -> dict | None:
    """Lazily train once per process (~0.3 s). None if scikit-learn is unavailable."""
    global _models
    if _models is None:
        with _lock:
            if _models is None:
                try:
                    _models = _train()
                except Exception:
                    _models = {}
    return _models or None


def _lexicon_fallback(text: str) -> dict:
    t = text.lower()
    if any(p in t for p in PANIC_LEXICON):
        return {"anxiety": "high", "intent": "panic"}
    if any(w in t for w in ("scared", "afraid", "nervous", "dar", "safe", "crash", "worried", "shaking")):
        return {"anxiety": "raised", "intent": "reassure"}
    if any(w in t for w in ("gate", "boarding", "delay", "time", "baggage", "weather")):
        return {"anxiety": "calm", "intent": "logistics"}
    return {"anxiety": "calm", "intent": "explain"}


def classify(text: str) -> dict:
    """Returns labels, class probabilities, the method used, and whether the safety rule fired."""
    m = models()
    if m is None:
        res = _lexicon_fallback(text)
        return {**res, "anxiety_proba": {}, "intent_proba": {}, "method": "lexicon-fallback", "safety_override": False}
    res: dict = {"method": "tfidf+logreg"}
    for target in ("anxiety", "intent"):
        pipe = m[target]
        proba = pipe.predict_proba([text])[0]
        classes = list(pipe.classes_)
        res[target] = str(classes[int(proba.argmax())])
        res[f"{target}_proba"] = {str(c): round(float(p), 3) for c, p in zip(classes, proba)}
    t = text.lower()
    res["safety_override"] = False
    if any(p in t for p in PANIC_LEXICON) and res["anxiety"] != "high":
        res["anxiety"], res["safety_override"] = "high", True
    return res


def explain_top_features(target: str = "anxiety", k: int = 6) -> dict:
    """Top positive n-grams per class — makes the ML layer explainable on a slide."""
    m = models()
    if not m:
        return {}
    pipe = m[target]
    names = pipe.named_steps["tfidf"].get_feature_names_out()
    coef = pipe.named_steps["clf"].coef_
    out = {}
    for i, cls in enumerate(pipe.classes_):
        idx = coef[i].argsort()[::-1]
        words = [names[j].split("__", 1)[1] for j in idx if names[j].startswith("word__")][:k]
        out[str(cls)] = words
    return out


def cross_validate(folds: int = 5) -> dict:
    """Stratified k-fold metrics for the evaluation report (accuracy, macro-F1, confusion)."""
    from sklearn.model_selection import StratifiedKFold, cross_val_predict
    from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report
    from sklearn.dummy import DummyClassifier
    rows = load_dataset()
    X = [r["text"] for r in rows]
    out = {"n_samples": len(rows), "folds": folds}
    for target in ("anxiety", "intent"):
        y = [r[target] for r in rows]
        skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
        pred = cross_val_predict(_make_pipeline(), X, y, cv=skf)
        base = cross_val_predict(DummyClassifier(strategy="most_frequent"), X, y, cv=skf)
        labels = sorted(set(y))
        rep = classification_report(y, pred, labels=labels, output_dict=True, zero_division=0)
        out[target] = {
            "accuracy": round(accuracy_score(y, pred), 3),
            "macro_f1": round(f1_score(y, pred, average="macro"), 3),
            "baseline_accuracy": round(accuracy_score(y, base), 3),
            "labels": labels,
            "confusion": confusion_matrix(y, pred, labels=labels).tolist(),
            "per_class_recall": {l: round(rep[l]["recall"], 3) for l in labels},
        }
    return out
