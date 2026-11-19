PY := .venv/bin/python

.PHONY: setup run refresh serve plan status

setup:
	python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

run:
	cd src && ../$(PY) -m chpl_trade

refresh:
	cd src && ../$(PY) -m chpl_trade --refresh

serve:
	python3 -m http.server 8770 --directory docs

plan:
	cd src && ../$(PY) -m chpl_trade.comtrade plan

status:
	cd src && ../$(PY) -m chpl_trade.comtrade status
