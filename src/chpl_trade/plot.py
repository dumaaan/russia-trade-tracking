"""Make the charts in figures/ from data/processed/trade_totals.csv."""

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402

from . import config  # noqa: E402

EU_FLOW = "EU-27 exports to country"
RU_FLOW = "Country exports to Russia"
MI_FLOW = "Country imports from EU-27"

# Colors from the reference categorical palette (fixed order).
FLOW_COLOR = {EU_FLOW: "#2a78d6", RU_FLOW: "#eb6834"}
COUNTRY_COLOR = {"Kazakhstan": "#1baf7a", "Kyrgyzstan": "#6250d6"}
COUNTRY_MARKER = {"Kazakhstan": "o", "Kyrgyzstan": "s"}
INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#e4e3de"
SURFACE = "#fcfcfb"

plt.rcParams.update(
    {
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "axes.edgecolor": GRID,
        "axes.labelcolor": INK_2,
        "axes.titlecolor": INK,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
        "axes.titlelocation": "left",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "axes.grid.axis": "y",
        "grid.color": GRID,
        "grid.linewidth": 0.8,
        "xtick.color": INK_2,
        "ytick.color": INK_2,
        "font.size": 10,
        "legend.frameon": False,
        "savefig.dpi": 200,
        "savefig.bbox": "tight",
    }
)


def _mark_sanctions(ax):
    ax.axvline(config.SANCTIONS_YEAR - 0.85, color=INK_2, lw=0.8, ls=(0, (3, 3)))
    # The note goes to the left of the line, where the pre-2022 values are low.
    ax.text(
        config.SANCTIONS_YEAR - 0.92,
        1.0,
        "Feb 2022: invasion,\nEU sanctions ",
        transform=ax.get_xaxis_transform(),
        ha="right",
        va="top",
        fontsize=8,
        color=INK_2,
    )


def _line(ax, x, y, color, marker, label, end_label=True, suffix="", dy=0):
    ax.plot(
        x, y, color=color, lw=2, marker=marker, ms=6,
        markeredgecolor=SURFACE, markeredgewidth=1.5, label=label,
    )
    ok = y.notna()
    if end_label and ok.any():
        ax.annotate(
            f"{y[ok].iloc[-1]:,.0f}{suffix}", (x[ok].iloc[-1], y[ok].iloc[-1]), xytext=(6, dy),
            textcoords="offset points", va="center", fontsize=9, color=INK,
        )


def _finish_x(ax):
    ax.set_xticks(config.YEARS)
    ax.set_xlim(config.YEARS[0] - 0.3, config.YEARS[-1] + 0.6)
    ax.tick_params(length=0)


def plot_country(totals, country):
    df = totals[totals["country"] == country]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for flow, label in [
        (EU_FLOW, f"EU-27 exports to {country} (Comext)"),
        (RU_FLOW, f"{country} exports to Russia (reported by {country}, Comtrade)"),
    ]:
        s = df[df["flow"] == flow].sort_values("year")
        _line(ax, s["year"], s["usd_million"], FLOW_COLOR[flow], "o", label)
    _mark_sanctions(ax)
    _finish_x(ax)
    ax.set_ylim(bottom=0)
    ax.set_ylabel("USD million")
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_title(f"{country}: CHPL goods in from the EU, out to Russia")
    ax.legend(loc="upper left", bbox_to_anchor=(0, -0.1), ncol=1, fontsize=9)
    out = config.FIGURES / f"{country.lower()}_flows.png"
    fig.savefig(out)
    plt.close(fig)
    return out


def comparison_table(totals):
    """Multiples against two baselines, and the scale ratio between the two flows.

    The main baseline is the 2019-2021 average. One year (2021) can be
    unusual, and small values make a one-year base unstable.
    """
    p = totals.pivot_table(index=["country", "year"], columns="flow", values="usd", dropna=False)
    p = p.reset_index().rename(columns={EU_FLOW: "eu_exports_usd", RU_FLOW: "exports_to_ru_usd", MI_FLOW: "imports_from_eu_usd"})
    p.columns.name = None
    pre = p[p["year"].isin(config.BASELINE_YEARS)].groupby("country")
    avg = pre[["eu_exports_usd", "exports_to_ru_usd"]].mean()
    y21 = p[p["year"] == 2021].set_index("country")[["eu_exports_usd", "exports_to_ru_usd"]]
    for col, short in [("eu_exports_usd", "eu"), ("exports_to_ru_usd", "ru")]:
        p[f"{short}_index_avg1921"] = 100 * p[col] / p["country"].map(avg[col])
        p[f"{short}_index_2021"] = 100 * p[col] / p["country"].map(y21[col])
    # Exports to Russia divided by EU exports to the country. This is a scale
    # ratio, not a re-export share: other suppliers (mainly China) and local
    # stock also feed the exports to Russia.
    p["scale_ratio_pct"] = 100 * p["exports_to_ru_usd"] / p["eu_exports_usd"]
    # Mirror ratio: what the country records as imports from the EU, divided by
    # what the EU records as exports to the country. See plot_mirror().
    p["mirror_ratio_pct"] = 100 * p["imports_from_eu_usd"] / p["eu_exports_usd"]
    p["mirror_gap_usd"] = p["eu_exports_usd"] - p["imports_from_eu_usd"]
    # Part of the gap is normal (timing, CIF/FOB, origin vs destination rules).
    # The "excess gap" is the gap above the pre-war ratio: EU exports times
    # (pre-war ratio - this year's ratio). The pre-war ratio uses the baseline
    # years that have data (Kazakhstan: 2019 only).
    pre_ratio = (
        p[p["year"].isin(config.BASELINE_YEARS) & p["imports_from_eu_usd"].notna()]
        .groupby("country")[["imports_from_eu_usd", "eu_exports_usd"]].sum()
    )
    pre_ratio = pre_ratio["imports_from_eu_usd"] / pre_ratio["eu_exports_usd"]
    p["prewar_mirror_ratio_pct"] = 100 * p["country"].map(pre_ratio)
    p["excess_gap_usd"] = p["eu_exports_usd"] * (p["prewar_mirror_ratio_pct"] - p["mirror_ratio_pct"]) / 100
    p = p.round(1)
    p.to_csv(config.PROCESSED / "comparison.csv", index=False)
    return p


def plot_comparison(comp):
    fig, axes = plt.subplots(1, 3, figsize=(14, 4.6))
    panels = [
        ("eu_index_avg1921", "EU-27 exports to country\nindex, 2019–21 average = 100 (log)", True),
        ("ru_index_avg1921", "Country exports to Russia\nindex, 2019–21 average = 100 (log)", True),
        ("scale_ratio_pct", "Scale ratio: exports to Russia ÷\nEU-27 exports (not a re-export share)", False),
    ]
    for ax, (col, title, log) in zip(axes, panels):
        last = comp[comp["year"] == config.YEARS[-1]].set_index("country")[col]
        top = last.idxmax()
        close = abs(last.max() - last.min()) / max(abs(last.max()), 1e-9) < 0.15
        for country in config.COUNTRIES.values():
            name = country["name"]
            s = comp[comp["country"] == name].sort_values("year")
            # Move the end labels apart when the two end values are close.
            dy = (6 if name == top else -6) if close else 0
            _line(ax, s["year"], s[col], COUNTRY_COLOR[name], COUNTRY_MARKER[name], name,
                  suffix="" if log else "%", dy=dy)
        if log:
            ax.set_yscale("log")
            ax.axhline(100, color=INK_2, lw=0.8)
            ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}"))
            ax.yaxis.set_minor_formatter(FuncFormatter(lambda v, _: ""))
        else:
            ax.set_ylim(bottom=0)
            ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}%"))
        _mark_sanctions(ax)
        _finish_x(ax)
        ax.set_xticks(config.YEARS, [str(y)[2:] if y != config.YEARS[0] else str(y) for y in config.YEARS])
        ax.set_title(title, fontsize=11)
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper left", bbox_to_anchor=(0.01, 1.08), ncol=2)
    fig.tight_layout()
    out = config.FIGURES / "comparison_kz_kg.png"
    fig.savefig(out)
    plt.close(fig)
    return out


def plot_mirror(comp):
    """Mirror check of the first leg: does the EU export arrive in the records?

    100% means the country records the same value as the EU. Below 100%, part of
    the EU exports is not in the country's import data ("lost in transit").
    CIF import values are usually a few percent above FOB export values, so a
    normal ratio is slightly above 100%.
    """
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for country in config.COUNTRIES.values():
        name = country["name"]
        s = comp[comp["country"] == name].sort_values("year")
        _line(ax, s["year"], s["mirror_ratio_pct"], COUNTRY_COLOR[name], COUNTRY_MARKER[name], name, suffix="%")
    ax.axhline(100, color=INK_2, lw=0.8)
    ax.text(config.YEARS[-1] + 0.5, 102, "100%: both sides agree", fontsize=8, color=INK_2, va="bottom", ha="right")
    _mark_sanctions(ax)
    _finish_x(ax)
    ax.set_ylim(0, 112)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}%"))
    ax.set_title("Mirror check: imports from EU-27 as recorded ÷ EU-27 exports")
    ax.legend(loc="upper left", bbox_to_anchor=(0, -0.1), ncol=2, fontsize=9)
    fig.text(0.0, -0.13, "Kazakhstan gives no product detail for imports by partner for 2020–2022 (gap in the line).",
             fontsize=8, color=INK_2)
    out = config.FIGURES / "mirror_check.png"
    fig.savefig(out)
    plt.close(fig)
    return out


def plot_all():
    config.FIGURES.mkdir(parents=True, exist_ok=True)
    totals = pd.read_csv(config.PROCESSED / "trade_totals.csv")
    outs = [plot_country(totals, c["name"]) for c in config.COUNTRIES.values()]
    comp = comparison_table(totals)
    outs.append(plot_comparison(comp))
    outs.append(plot_mirror(comp))
    return outs, comp


if __name__ == "__main__":
    outs, comp = plot_all()
    print(comp.to_string(index=False))
    for o in outs:
        print(o)
