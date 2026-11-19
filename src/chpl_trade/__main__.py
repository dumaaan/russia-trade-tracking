"""Run the full pipeline: download, build tables, make charts.

    python -m chpl_trade            # use saved raw files when present
    python -m chpl_trade --refresh  # download all raw files again
"""

import argparse

from . import ban, comtrade, control
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
    ban.fetch_all(args.refresh)
    ban.build()
    control.fetch_all(args.refresh)
    control.build()
    outs, comp = plot_all()
    outs.append(export())
    print(comp.to_string(index=False))
    for o in outs:
        print(o)
