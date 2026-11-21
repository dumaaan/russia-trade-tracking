"""Run the full pipeline: download, build tables, make charts.

    python -m chpl_trade            # use saved raw files when present
    python -m chpl_trade --refresh  # download all raw files again
"""

import argparse

from . import ban, bns, china, comtrade, control, events, excess, mirror_cn, unitvalue
from .needs import declare_all
from .build import build
from .fetch import fetch_all
from .plot import plot_all
from .site import export

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--refresh", action="store_true", help="download all raw files again")
    args = p.parse_args()
    fetch_all(args.refresh)
    declare_all()
    comtrade.sync()
    build()
    bns.fetch(args.refresh)
    bns.build()
    ban.fetch_all(args.refresh)
    ban.build()
    control.fetch_all(args.refresh)
    control.build()
    excess.fetch_all(args.refresh)
    excess.build()
    events.fetch_all(args.refresh)
    events.build()
    china.fetch_all(args.refresh)
    china.build()
    mirror_cn.build()
    unitvalue.fetch_all(args.refresh)
    unitvalue.build()
    outs, comp = plot_all()
    outs.append(export())
    print(comp.to_string(index=False))
    for o in outs:
        print(o)
