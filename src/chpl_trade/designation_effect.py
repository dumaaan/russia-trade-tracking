"""Do designations work? Exports to Russia after waves of sanctions designations.

A wave is a month in which at least one organisation of the country was designated (designations.py).
For each wave and for every other month (the comparison months), the change in the country's listed
exports to Russia in the 6 months after the month against the 6 months before (the month itself left
out), minus the same change for the other two route countries:

    effect = ln(after / before)  -  ln(others' after / others' before)

A negative effect means the country's exports fell more than the others' did. Each wave is compared
with all months of the same country that had no designation: the share of those months with an
effect as low as the wave's, or lower, says how unusual the wave is (a simple permutation test).
Windows of nearby waves overlap, so the waves are not independent; a month with less than $50k a
month before is left out (too small for a ratio).

Output: data/processed/designation_effect.json.
"""

import json
import math

import pandas as pd

from . import config

ROUTE = ["KZ", "KG", "UZ"]
NAMES = {"KZ": "Kazakhstan", "KG": "Kyrgyzstan", "UZ": "Uzbekistan"}
WINDOW, MIN_AFTER, MIN_BASE = 6, 3, 50_000
START = "2022-09"  # the 6 months before are all after the invasion (no pre-war boom in the window)


def _shift(m, k):
    y, mo = map(int, m.split("-"))
    t = y * 12 + mo - 1 + k
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def _flows():
    f = pd.read_csv(config.PROCESSED / "events_monthly.csv")
    f = f[(f.leg == "ru") & (f.group == "listed")]
    return {c: dict(zip(g.month, g.usd)) for c, g in f.groupby("country")}


def _window(s, m):
    before = [s.get(_shift(m, k)) for k in range(-WINDOW, 0)]
    after = []
    for k in range(1, WINDOW + 1):
        v = s.get(_shift(m, k))
        if v is None or (isinstance(v, float) and math.isnan(v)):
            break
        after.append(v)
    if any(v is None or (isinstance(v, float) and math.isnan(v)) for v in before) or len(after) < MIN_AFTER:
        return None
    return sum(before) / WINDOW, sum(after) / len(after)


def _effect(fl, c, m):
    own = _window(fl.get(c, {}), m)
    if not own or own[0] < MIN_BASE or own[1] <= 0:
        return None
    others = [_window(fl.get(o, {}), m) for o in ROUTE if o != c]
    if any(x is None for x in others):
        return None
    ob, oa = sum(x[0] for x in others), sum(x[1] for x in others)
    if ob <= 0 or oa <= 0:
        return None
    return {"own": math.log(own[1] / own[0]), "others": math.log(oa / ob), "effect": math.log(own[1] / own[0]) - math.log(oa / ob),
            "before": own[0], "after": own[1]}


def build():
    fl = _flows()
    d = pd.read_csv(config.PROCESSED / "designations.csv")
    d["group"] = d["list"].map(lambda s: "US" if s.startswith("US") else s)
    months = sorted({m for s in fl.values() for m in s})
    waves, base = [], {}
    for c in ROUTE:
        dc = d[d.country == c]
        wave_months = sorted(set(dc.month))
        base[c] = []
        for m in months:
            if m < START:
                continue
            e = _effect(fl, c, m)
            if e is None:
                continue
            if m in wave_months:
                w = dc[dc.month == m]
                waves.append({"country": c, "month": m, "n": int(len(w)), "lists": sorted(set(w.group)),
                              "names": sorted(set(w.name))[:6], **e})
            else:
                base[c].append({"month": m, **e})
    # how unusual is each wave: the share of the country's other months with an effect as low or lower
    for w in waves:
        b = [x["effect"] for x in base[w["country"]]]
        w["share_as_low"] = sum(1 for x in b if x <= w["effect"]) / len(b) if b else None
    pct = lambda v: 100 * (math.exp(v) - 1)

    def summary(sel):
        if not sel:
            return None
        e = sorted(x["effect"] for x in sel)
        med = e[len(e) // 2] if len(e) % 2 else (e[len(e) // 2 - 1] + e[len(e) // 2]) / 2
        return {"n": len(sel), "median_effect_pct": pct(med), "mean_effect_pct": pct(sum(e) / len(e)),
                "share_negative": sum(1 for x in e if x < 0) / len(e)}

    out = {
        "window": WINDOW, "min_base": MIN_BASE, "start": START,
        "waves": [{**w, "effect_pct": pct(w["effect"]), "own_pct": pct(w["own"]), "others_pct": pct(w["others"])} for w in waves],
        "base": {c: {"n": len(base[c]), "effects_pct": sorted(pct(x["effect"]) for x in base[c])} for c in ROUTE},
        "by_country": {c: {"waves": summary([w for w in waves if w["country"] == c]), "other_months": summary(base[c])} for c in ROUTE},
        "by_list": {g: summary([w for w in waves if g in w["lists"]]) for g in ("US", "UK", "EU")},
        "all": {"waves": summary(waves), "other_months": summary([x for c in ROUTE for x in base[c]])},
        "names": NAMES,
    }
    (config.PROCESSED / "designation_effect.json").write_text(json.dumps(out, indent=1) + "\n")
    return out


if __name__ == "__main__":
    o = build()
    for c in ROUTE:
        print(c, o["by_country"][c])
    print("by list", o["by_list"])
    print("all", o["all"])
    for w in o["waves"]:
        print(f"  {w['country']} {w['month']} n={w['n']} {w['lists']} effect {w['effect_pct']:+.0f}% (own {w['own_pct']:+.0f}%, others {w['others_pct']:+.0f}%) share as low {w['share_as_low']:.2f}")
