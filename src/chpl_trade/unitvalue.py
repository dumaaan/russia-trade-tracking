"""Unit values: US dollars per kilogram of the listed goods at each step of the route.

For each listed code, year and route country (Kazakhstan, Kyrgyzstan, Uzbekistan):
- eu   EU-27 exports to the country (Comext value and net weight; euros converted at the ECB rate);
- cn   China's exports to the country (Comtrade, China as reporter);
- ru   the country's exports to Russia (Comtrade, the country as reporter).
Comtrade marks some weights as estimated; the flag is kept.

Price index: the Russia-leg value of a basket of codes, divided by the value of the same kilograms
at the EU price (or the China price) of each code in the same year:
    index_eu = sum(ru value) / sum(ru kg x eu value per kg),  over codes that have both.
Above 1: the goods sent to Russia are dearer per kg than the EU's goods of the same codes. Below 1:
they are cheaper, which fits goods from other (cheaper) suppliers better than EU goods.
One HS6 code holds cheap and dear goods, so an index also moves when the product mix moves.

Output: data/processed/unit_values.csv, data/processed/unit_value_index.csv.
"""

import json

import pandas as pd

from . import comtrade as ct
from . import config
from .build import load_fx
from .control import _stamp
from .fetch import COMEXT_URL, _get, chpl_codes, query_codes

RAW = config.RAW / "unitvalue"
CN = 156
COUNTRIES = {"KZ": ("Kazakhstan", 398), "KG": ("Kyrgyzstan", 417), "UZ": ("Uzbekistan", 860)}


def fetch_comext(partner, refresh=False):
    """EU-27 exports to one partner: value and net weight (100 kg) of the listed codes, annual."""
    out = RAW / f"comext_eu27_to_{partner}_qty.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", partner), ("flow", "2"), ("freq", "A"),
              ("indicators", "VALUE_IN_EUROS"), ("indicators", "QUANTITY_IN_100KG")]
    params += [("product", c) for c in query_codes()]
    params += [("time", str(y)) for y in config.YEARS]
    out.write_text(json.dumps(_stamp(_get(COMEXT_URL, params).json())))
    return out


BAN = ["845710", "851762"]
BAN_START, BEFORE_END, AFTER_START = "2025-04", "2026-03", "2026-05"  # the ban chapter's windows


def _months(start, end):
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def fetch_comext_monthly(partner, refresh=False):
    """EU-27 monthly exports of the two banned codes: value and net weight."""
    from datetime import date
    out = RAW / f"comext_eu27_to_{partner}_ban_qty_M.json"
    if out.exists() and not refresh:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    t = date.today()
    params = [("format", "JSON"), ("reporter", "EU27_2020"), ("partner", partner), ("flow", "2"), ("freq", "M"),
              ("indicators", "VALUE_IN_EUROS"), ("indicators", "QUANTITY_IN_100KG")]
    params += [("product", c) for c in BAN]
    params += [("time", m) for m in _months(BAN_START, f"{t.year}-{t.month:02d}")]
    out.write_text(json.dumps(_stamp(_get(COMEXT_URL, params).json())))
    return out


def fetch_all(refresh=False):
    for p, (name, _) in COUNTRIES.items():
        print(f"Comext weights: EU-27 -> {name}")
        fetch_comext(p, refresh)
    for p in ("KG", "KZ"):
        fetch_comext_monthly(p, refresh)


def build_ban():
    """Price per kg of the two banned codes before and after the ban, on each leg, KG and KZ."""
    from datetime import date
    fx = pd.read_csv(config.RAW / "events" / "ecb_usd_per_eur_monthly.csv")
    fx = dict(zip(fx["month"], fx["usd_per_eur"]))
    t = date.today()
    months = _months(BAN_START, f"{t.year}-{t.month:02d}")
    cells = {}
    for p in ("KG", "KZ"):
        d = json.loads((RAW / f"comext_eu27_to_{p}_ban_qty_M.json").read_text())
        dims, sizes = d["id"], d["size"]
        index = {k: {v: c for c, v in d["dimension"][k]["category"]["index"].items()} for k in dims}
        tmp = {}
        for flat, value in d["value"].items():
            flat = int(flat)
            pos = {}
            for dim, size in reversed(list(zip(dims, sizes))):
                pos[dim] = flat % size
                flat //= size
            k = (index["product"][pos["product"]], index["time"][pos["time"]])
            tmp.setdefault(k, {})[index["indicators"][pos["indicators"]]] = float(value)
        for (c, m), v in tmp.items():
            if v.get("VALUE_IN_EUROS") and v.get("QUANTITY_IN_100KG") and m in fx:
                cells[("eu", p, c, m)] = (v["VALUE_IN_EUROS"] * fx[m], v["QUANTITY_IN_100KG"] * 100)
        m49 = COUNTRIES[p][1]
        for leg, flow, rep, par in (("cn", "M", m49, CN), ("ru", "X", m49, config.RUSSIA_M49)):
            for m in months:
                per = m.replace("-", "")
                vals = {r["cmdCode"]: r["primaryValue"] for r in ct.records("M", flow, rep, par, per)}
                for c, (kg, *_) in ct.weights("M", flow, rep, par, per).items():
                    if c in BAN and vals.get(c) and kg:
                        cells[(leg, p, c, m)] = (vals[c], kg)
    before = _months(BAN_START, BEFORE_END)
    after = [m for m in months if m >= AFTER_START]
    out = {}
    for leg in ("eu", "cn", "ru"):
        for p in ("KG", "KZ"):
            for c in BAN:
                res = {}
                for name, ms in (("before", before), ("after", after)):
                    v = sum(cells[(leg, p, c, m)][0] for m in ms if (leg, p, c, m) in cells)
                    kg = sum(cells[(leg, p, c, m)][1] for m in ms if (leg, p, c, m) in cells)
                    res[name] = {"usd": v, "kg": kg, "usd_per_kg": v / kg if kg else None,
                                 "months": sum(1 for m in ms if (leg, p, c, m) in cells)}
                out[f"{leg}|{p}|{c}"] = res
    meta = {"before": [before[0], before[-1]], "after": [after[0], after[-1]] if after else None, "prices": out,
            "note": "China leg: the importing country's records of imports from China."}
    (config.PROCESSED / "ban_unit_values.json").write_text(json.dumps(meta, indent=1) + "\n")
    return meta


def _comext(partner):
    d = json.loads((RAW / f"comext_eu27_to_{partner}_qty.json").read_text())
    dims, sizes = d["id"], d["size"]
    index = {k: {v: c for c, v in d["dimension"][k]["category"]["index"].items()} for k in dims}
    cells = {}
    for flat, value in d["value"].items():
        flat = int(flat)
        pos = {}
        for dim, size in reversed(list(zip(dims, sizes))):
            pos[dim] = flat % size
            flat //= size
        key = (index["product"][pos["product"]], int(index["time"][pos["time"]]))
        cells.setdefault(key, {})[index["indicators"][pos["indicators"]]] = float(value)
    return cells


def build():
    fx = load_fx()
    old_to_new = {old: new for new, old in config.HS2017_EQUIVALENT.items()}
    basket = {c for c in chpl_codes() if c not in config.EXCLUDED_FROM_BASKET}
    rows = []
    for p, (name, m49) in COUNTRIES.items():
        for (code, y), v in _comext(p).items():
            code = old_to_new.get(code, code)
            if code in basket and v.get("VALUE_IN_EUROS") and v.get("QUANTITY_IN_100KG"):
                rows.append({"leg": "eu", "country": p, "year": y, "hs6": code, "usd": v["VALUE_IN_EUROS"] * fx[y],
                             "kg": v["QUANTITY_IN_100KG"] * 100, "estimated": False})
        # cm: imports from China as the importing country records them (a check on China's own prices).
        for leg, flow, rep, par in (("cn", "X", CN, m49), ("ru", "X", m49, config.RUSSIA_M49), ("cm", "M", m49, CN)):
            for y in config.YEARS:
                vals = {r["cmdCode"]: r["primaryValue"] for r in ct.records("A", flow, rep, par, y)}
                for c, (kg, est, *_) in ct.weights("A", flow, rep, par, y).items():
                    code = old_to_new.get(c, c)
                    if code in basket and vals.get(c) and kg:
                        rows.append({"leg": leg, "country": p, "year": y, "hs6": code, "usd": vals[c], "kg": kg, "estimated": est})
    df = pd.DataFrame(rows).groupby(["leg", "country", "year", "hs6"], as_index=False).agg(
        usd=("usd", "sum"), kg=("kg", "sum"), estimated=("estimated", "max"))
    df["usd_per_kg"] = df["usd"] / df["kg"]
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.PROCESSED / "unit_values.csv", index=False)

    # The price index of the Russia leg against the EU and the China price, per country and year.
    idx = []
    w = df.pivot_table(index=["country", "year", "hs6"], columns="leg", values=["usd", "kg", "usd_per_kg", "estimated"], aggfunc="first")
    for (c, y), g in w.groupby(level=[0, 1]):
        for ref in ("eu", "cn"):
            for no_est in (False, True):
                ok = g[("usd", "ru")].notna() & g[("usd_per_kg", ref)].notna()
                if no_est:
                    ok &= ~g[("estimated", "ru")].fillna(False).astype(bool) & ~g[("estimated", ref)].fillna(False).astype(bool)
                gg = g[ok]
                if gg.empty:
                    continue
                at_ref = (gg[("kg", "ru")] * gg[("usd_per_kg", ref)]).sum()
                idx.append({"country": c, "year": y, "ref": ref, "no_estimates": no_est, "index": gg[("usd", "ru")].sum() / at_ref,
                            "codes": int(len(gg)), "ru_value_covered": gg[("usd", "ru")].sum()})
    ix = pd.DataFrame(idx)
    ix.to_csv(config.PROCESSED / "unit_value_index.csv", index=False)
    return df, ix


if __name__ == "__main__":
    fetch_all()
    df, ix = build()
    t = ix[~ix.no_estimates].pivot_table(index=["country", "ref"], columns="year", values="index").round(2)
    print("Price index of the Russia leg (1 = same price per kg as the reference supplier)")
    print(t.to_string())
    t2 = ix[ix.no_estimates].pivot_table(index=["country", "ref"], columns="year", values="index").round(2)
    print("\nWithout estimated weights"); print(t2.to_string())
