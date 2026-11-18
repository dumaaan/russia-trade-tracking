"""Run the full pipeline: download, build tables, make charts.

    python -m chpl_trade            # use saved raw files when present
    python -m chpl_trade --refresh  # download all raw files again
"""

import argparse

from .build import build
from .fetch import fetch_all
from .plot import plot_all
from .site import export

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--refresh", action="store_true", help="download all raw files again")
    args = p.parse_args()
    fetch_all(args.refresh)
    build()
    outs, comp = plot_all()
    outs.append(export())
    print(comp.to_string(index=False))
    for o in outs:
        print(o)
