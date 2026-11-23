(function () {
  "use strict";

  const D = window.CHPL_DATA;
  const YEARS = D.years;
  const SVGNS = "http://www.w3.org/2000/svg";
  const tip = document.getElementById("tooltip");

  const FLOW = {
    eu: { label: (c) => `EU-27 exports to ${c}`, short: "From the EU", color: "--flow-eu" },
    ru: { label: (c) => `${c} exports to Russia`, short: "To Russia", color: "--flow-ru" },
    mi: { label: (c) => `${c} imports from EU-27 (recorded)`, short: "Recorded imports from EU", color: "--flow-eu" },
  };
  const COUNTRY = {
    Kazakhstan: { color: "--kz", marker: "circle" },
    Kyrgyzstan: { color: "--kg", marker: "square" },
    Uzbekistan: { color: "--uz", marker: "triangle" },
  };
  const TIER_NAMES = {
    "1": "Tier 1: integrated circuits",
    "2": "Tier 2: communication, navigation, capacitors",
    "3A": "Tier 3.A: discrete parts, connectors, cameras",
    "3B": "Tier 3.B: bearings, optics, aircraft parts",
    "4A": "Tier 4.A: electronics production and testing",
    "4B": "Tier 4.B: CNC machine tools",
  };
  const chplByCode = Object.fromEntries(D.chpl.map((r) => [r.hs6, r]));
  // What the goods are and what they are used for. Sources: the EU's List of Common High Priority
  // Items (version of February 2024) for the tiers; Regulation (EU) 2026/506, recital 34, for the two
  // codes in the first anti-circumvention ban.
  const SRC_CHPL = "Source: EU List of Common High Priority Items, Feb 2024";
  const SRC_BAN = "Source: Regulation (EU) 2026/506, recital 34";
  const TIER_NOTE = {
    "1": "Integrated circuits (microelectronics). The list's items were found in Russian weapons used in Ukraine, such as the Kalibr and Kh-101 cruise missiles, the Orlan-10 drone and the Ka-52 helicopter.",
    "2": "Electronics for wireless communication, satellite-based radio navigation, and passive components.",
    "3A": "Discrete electronic components, electrical plugs and connectors, navigation equipment and digital cameras.",
    "3B": "Mechanical and non-electronic components, such as bearings and optical components.",
    "4A": "Manufacturing equipment for producing and quality-testing electronic components and circuits.",
    "4B": "CNC machine tools for working metal, and their parts.",
  };
  const CODE_NOTE = {
    "845710": "Machining centres produce the high-precision metal components essential for military production.",
    "851762": "Used, among other things, for field communication networks and drone telemetry.",
  };
  const noteFor = (code) => {
    const info = chplByCode[code] || {};
    return CODE_NOTE[code] ? [CODE_NOTE[code], SRC_BAN] : TIER_NOTE[info.tier] ? [TIER_NOTE[info.tier], SRC_CHPL] : null;
  };
  const fmtCode = (c) => c.replace(/^(\d{4})(\d{2})$/, "$1.$2");

  // ---------- state (filters at the top apply to every chart) ----------
  const state = {
    basket: "all", currency: "USD", prices: "real", baseline: "avg",
    flowsCountry: "Kazakhstan", goodsCountry: "Kazakhstan", goodsFlow: "ru",
    routeYear: YEARS[YEARS.length - 1], tiersCountry: "Kazakhstan", banGoods: "banned", uvYear: YEARS[YEARS.length - 1], xpCode: "851762", memDest: "all",
  };

  // ---------- data ----------
  const avail = {};
  for (const a of D.availability) avail[`${a.flow}|${a.country}|${a.year}`] = a;
  const isAvail = (f, c, y) => !!(avail[`${f}|${c}|${y}`] || {}).available;

  function inBasket(code, basket) {
    if (D.excluded.includes(code)) return false;
    if (basket === "all") return true;
    if (basket === "art12f") return D.art12f.includes(code);
    return (chplByCode[code] || {}).tier === basket;
  }
  // Price indices, annual averages, for "2025 prices".
  // USD: US CPI-U, all items (BLS series CUUR0000SA0, via FRED CPIAUCNS); 2025 is the mean of 11 months,
  // because BLS published no October 2025 figure. EUR: euro-area HICP, all items (Eurostat prc_hicp_aind, EA).
  const PRICE_INDEX = {
    USD: { 2019: 255.657, 2020: 258.811, 2021: 270.97, 2022: 292.655, 2023: 304.702, 2024: 313.689, 2025: 321.943 },
    EUR: { 2019: 104.8, 2020: 105.06, 2021: 107.78, 2022: 116.82, 2023: 123.15, 2024: 126.07, 2025: 128.75 },
  };
  const REF_YEAR = 2025;
  const deflate = (v, year, currency) => {
    const P = PRICE_INDEX[currency];
    return P[year] && P[REF_YEAR] ? (v * P[REF_YEAR]) / P[year] : v;
  };
  const conv = (usdM, year) => {
    const v = state.currency === "EUR" ? usdM / D.fx[String(year)] : usdM;
    return state.prices === "real" ? deflate(v, year, state.currency) : v;
  };
  const priceLabel = () => (state.prices === "real" ? `${REF_YEAR} ${state.currency === "EUR" ? "euros" : "US dollars"}` : `current ${state.currency === "EUR" ? "euros" : "US dollars"}`);
  // A multiple of a tiny pre-war value says nothing about size (×3,000 from $0.0M), so a base below
  // this (millions a year) gets no multiple. The ban table uses the same rule a month.
  const MIN_BASE = 0.5;
  const MIN_BASE_MONTH = 50000;

  // Values per year for one flow and country, in millions of the chosen currency.
  // null = the source has no data for that year.
  function series(flow, country, basket = state.basket, raw = false) {
    const sum = Object.fromEntries(YEARS.map((y) => [y, 0]));
    for (const r of D.codes) {
      if (r[0] === flow && r[1] === country && inBasket(r[3], basket) && r[4] != null) sum[r[2]] += r[4];
    }
    return YEARS.map((y) => (isAvail(flow, country, y) ? (raw ? sum[y] : conv(sum[y], y)) : null));
  }
  function baseOf(vals, mode = state.baseline) {
    const pick = mode === "avg" ? D.baselineYears : [2021];
    const v = pick.map((y) => vals[YEARS.indexOf(y)]).filter((x) => x != null);
    if (!v.length) return null;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return m > 0 ? m : null;
  }
  // The pre-war value, or null when it is too small to divide by.
  const usableBase = (vals, mode) => { const b = baseOf(vals, mode); return b != null && b >= MIN_BASE ? b : null; };
  const rawBase = (vals, mode = state.baseline) => { const v = (mode === "avg" ? D.baselineYears : [2021]).map((y) => vals[YEARS.indexOf(y)]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const smallBaseNote = (vals) => `pre-war base ${fmtMoney(rawBase(vals) || 0)} a year, too small for a multiple`;
  const baseLabel = (mode = state.baseline) => (mode === "avg" ? "2019–21 average" : "2021");
  const indexOf = (vals, mode) => { const b = usableBase(vals, mode); return vals.map((v) => (v == null || b == null ? null : (100 * v) / b)); };
  const basketLabel = () => (state.basket === "all" ? "All 49 codes" : state.basket === "art12f" ? "The two EU-ban codes (8457.10, 8517.62)" : TIER_NAMES[state.basket]);
  const basketPhrase = () => (state.basket === "all" ? "all 49 codes" : state.basket === "art12f" ? "the two EU-ban codes" : TIER_NAMES[state.basket].replace(/^Tier ([^:]+): (.*)$/, "tier $1 goods ($2)"));
  const cur = () => (state.currency === "EUR" ? "€" : "$");

  // ---------- helpers ----------
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const h = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const k in props) {
      if (k === "text") n.textContent = props[k];
      else if (k === "style") Object.assign(n.style, props[k]);
      else n.setAttribute(k, props[k]);
    }
    for (const c of [].concat(kids)) if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  };
  const fmtM = (v) => (v == null ? "no data" : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  const fmtMoney = (v) => (v == null ? "no data" : v >= 1000 ? `${cur()}${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}bn` : `${cur()}${fmtM(v)}M`);
  const fmtIdx = (v) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
  const fmtPct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
  // The war-time peak (2022 onwards): its index in YEARS, or -1.
  const peakOf = (vals) => { let p = -1; vals.forEach((v, i) => { if (v != null && YEARS[i] >= 2022 && (p < 0 || v > vals[p])) p = i; }); return p; };
  const fmtX = (v) => (v == null ? "—" : `×${v >= 10 ? v.toFixed(0) : v.toFixed(1)}`);
  // Words for prose: headlines and findings say a change the way a person would ("nearly quadrupled",
  // "halved", "rose by about 60%"); the × multiples stay in tables and on axes.
  const NUMW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const round10 = (v) => Math.max(10, Math.round(v / 10) * 10);
  // m = new / old. Past tense, fits after a subject: "EU exports to Kazakhstan doubled".
  const grew = (m) => {
    if (m == null || !isFinite(m)) return "changed";
    if (m >= 1.9) {
      const k = Math.round(m);
      const base = k === 2 ? "doubled" : k === 3 ? "tripled" : k === 4 ? "quadrupled" : `grew ${k <= 12 ? NUMW[k] : k}-fold`;
      const nearly = m < k - 0.05, more = m > k + 0.05;
      if (k >= 5 && (nearly || more)) return `grew about ${k <= 12 ? NUMW[k] : k}-fold`;
      return nearly ? `nearly ${base}` : more ? `more than ${base}` : base;
    }
    if (m >= 1.1) return `rose by about ${round10((m - 1) * 100)}%`;
    if (m > 0.9) return "held steady";
    if (m >= 0.45 && m <= 0.55) return "halved";
    if (m < 0.1) return "almost stopped";
    if (m < 0.25) return "fell by more than three quarters";
    if (m < 0.334) return "fell by more than two thirds";
    if (m < 0.45) return "fell by more than half";
    return `fell by about ${round10((1 - m) * 100)}%`;
  };
  // Plain nouns for the tiers, for headlines.
  const TIER_NOUN = { "1": "chips", "2": "radio and navigation gear", "3A": "electronic parts and cameras", "3B": "bearings and optics", "4A": "chip-making and test equipment", "4B": "machine tools" };
  const capW = (t) => t.replace(/^./, (x) => x.toUpperCase());
  const timesW = (n) => (n === 1 ? "once" : n === 2 ? "twice" : `${n <= 12 ? NUMW[n] : n} times`);
  // A share (0–1) in words: "a third", "about a quarter", "71%".
  const shareW = (f) => {
    if (f == null) return "—";
    const F = [[0.2, "a fifth"], [0.25, "a quarter"], [1 / 3, "a third"], [0.5, "half"], [2 / 3, "two thirds"], [0.75, "three quarters"]];
    for (const [v, w] of F) { if (Math.abs(f - v) < 0.01) return w; if (Math.abs(f - v) < 0.03) return `about ${w}`; }
    return `${Math.round(100 * f)}%`;
  };
  // r = growth of A over growth of B: "about 70% faster than", "less than half as fast as".
  const pace = (r) => {
    if (r == null) return "—";
    if (r >= 1.9) return `about ${Math.round(r) <= 12 ? NUMW[Math.round(r)] : Math.round(r)} times as fast as`;
    if (r >= 1.1) return `about ${round10((r - 1) * 100)}% faster than`;
    if (r > 0.9) return "about as fast as";
    if (r < 0.25) return "less than a quarter as fast as";
    if (r < 0.5) return "less than half as fast as";
    return `about ${round10((1 - r) * 100)}% slower than`;
  };

  function niceTicks(max, n = 5) {
    if (!(max > 0)) return [0, 1];
    const raw = max / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const ticks = [];
    for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(10));
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }
  function logTicks(min, max) {
    const out = [];
    for (let p = Math.floor(Math.log10(min)) - 1; p <= Math.ceil(Math.log10(max)); p++) {
      for (const m of [1, 2, 5]) {
        const v = m * Math.pow(10, p);
        if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
      }
    }
    return out.length > 8 ? out.filter(isPow10) : out;
  }
  // 0.01, 0.1, 1, 10, 100 ... (a string test such as /^1/ misses 0.1 and below)
  function isPow10(v) { const l = Math.log10(v); return Math.abs(l - Math.round(l)) < 1e-9; }

  function showTip(x, y, title, rows, note) {
    tip.replaceChildren(h("div", { class: "t", text: title }));
    for (const r of rows) {
      tip.appendChild(h("div", { class: "r" }, [
        h("i", { style: { background: r.color } }),
        h("b", { text: r.value }),
        h("span", { text: r.label }),
      ]));
    }
    if (note) for (const line of [].concat(note)) tip.appendChild(h("div", { class: "n", text: line }));
    tip.hidden = false;
    const w = tip.offsetWidth, ht = tip.offsetHeight;
    let left = x + 14, top = y - ht - 10;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (left < 8) left = 8;
    if (top < 8) top = y + 16;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  function legend(container, items) {
    container.replaceChildren(...items.map((it) =>
      h("span", {}, [h("i", { class: it.marker === "square" ? "sq" : "", style: { background: css(it.color) } }), it.label])
    ));
  }
  function table(container, head, rows) {
    const t = h("table", {}, [
      h("thead", {}, h("tr", {}, head.map((c) => h("th", { text: c })))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", { text: c }))))),
    ]);
    container.replaceChildren(h("div", { class: "table-wrap" }, t));
  }

  // Position of a date on the year axis. A year's point sits in the middle of that year.
  function datePos(iso) {
    const d = new Date(iso + "T00:00:00Z");
    const y = d.getUTCFullYear();
    const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
    return YEARS.indexOf(y) - 0.5 + (d - start) / (end - start) + (YEARS.indexOf(y) < 0 ? NaN : 0);
  }
  function eventsFor(country) {
    return D.events.filter((e) => !e.country || e.country === country).map((e, i) => ({ ...e, n: i + 1, pos: datePos(e.date) }));
  }

  // ---------- line chart ----------
  // opts: { series:[{label,color,values,marker}], fmt, tickFmt, log, baseline, events, aria }
  function lineChart(container, opts) {
    const W = container.clientWidth, H = container.clientHeight;
    if (W < 120 || H < 80) return; // not laid out yet; the resize handler draws it later
    const small = W < 420;
    const right = opts.endNames ? (small ? 96 : 132) : (small ? 48 : 60);
    const m = { top: opts.events ? 52 : 22, right, bottom: 26, left: small ? 42 : 52 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const all = opts.series.flatMap((s) => s.values).filter((v) => v != null && (opts.log ? v > 0 : true));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" });
    if (!all.length) {
      const t = el("text", { x: W / 2, y: H / 2, "text-anchor": "middle" }, svg);
      t.textContent = "No data for this selection";
      container.replaceChildren(svg);
      return;
    }

    let y, ticks;
    if (opts.log) {
      const lo = opts.domain ? opts.domain[0] : Math.min(...all, opts.baseline || Infinity) * 0.8;
      const hi = opts.domain ? opts.domain[1] : Math.max(...all, opts.baseline || 0) * 1.15;
      ticks = logTicks(lo, hi);
      // fewer ticks when asked, but never fewer than two (a scale needs two marks)
      if (opts.tickFilter && ticks.filter(opts.tickFilter).length >= 2) ticks = ticks.filter(opts.tickFilter);
      const l0 = Math.log10(lo), l1 = Math.log10(hi);
      y = (v) => m.top + ih - ((Math.log10(Math.max(v, lo)) - l0) / (l1 - l0)) * ih;
    } else {
      ticks = niceTicks((opts.ymax != null ? opts.ymax : Math.max(...all, ...(opts.refs || []).map((r) => r.value || 0))) * 1.05, opts.tickCount || 5);
      const top = ticks[ticks.length - 1];
      y = (v) => m.top + ih - (v / top) * ih;
    }
    const x = (i) => m.left + (iw * i) / (YEARS.length - 1);
    const surface = css("--surface-1");

    const topTick = Math.max(...ticks);
    for (const t of ticks) {
      el("line", { x1: m.left, x2: W - m.right + 8, y1: y(t), y2: y(t), stroke: css("--grid"), "stroke-width": 1 }, svg);
      const lab = el("text", { x: m.left - 8, y: y(t) + 4, "text-anchor": "end" }, svg);
      // the unit rides on the top tick only, so it reads left to right and is said once
      lab.textContent = t === topTick && opts.topTickFmt ? opts.topTickFmt(t) : opts.tickFmt ? opts.tickFmt(t) : t.toLocaleString("en-US");
    }
    // Reference lines (e.g. a pre-war level), thin and dashed, labelled at the right.
    for (const r of opts.refs || []) {
      if (r.value == null) continue;
      el("line", { x1: m.left, x2: W - m.right + 8, y1: y(r.value), y2: y(r.value), stroke: css(r.color), "stroke-width": 1.25, "stroke-dasharray": "1 3", "stroke-opacity": r.opacity || 0.9 }, svg);
      if (r.label) { const t = el("text", { x: m.left + 4, y: y(r.value) + (r.below ? 13 : -5), class: "ref-lbl" }, svg); t.textContent = r.label; }
    }
    if (opts.baseline) {
      el("line", { x1: m.left, x2: W - m.right + 8, y1: y(opts.baseline), y2: y(opts.baseline), stroke: css("--axis"), "stroke-width": 1 }, svg);
    }
    YEARS.forEach((yr, i) => {
      const t = el("text", { x: x(i), y: H - 6, "text-anchor": "middle" }, svg);
      t.textContent = small && i > 0 ? "’" + String(yr).slice(2) : yr;
    });

    // Event marks: numbered, explained in the list under the chart.
    if (opts.events) {
      const rowsEnd = [];
      for (const e of opts.events) {
        if (!(e.pos >= -0.5 && e.pos <= YEARS.length - 0.5)) continue;
        const ex = x(e.pos);
        // the first label row that is free at this x
        const label = e.short || e.label;
        const wEst = label.length * 6.2 + 6;
        let row = rowsEnd.findIndex((end) => end < ex - 2);
        if (row < 0) { row = rowsEnd.length; rowsEnd.push(0); }
        rowsEnd[row] = ex + wEst;
        const ly = m.top - 40 + row * 13;
        el("line", { x1: ex, x2: ex, y1: ly - 9, y2: m.top + ih, stroke: css("--axis"), "stroke-dasharray": "3 3" }, svg);
        const t = el("text", { x: ex + 3, y: ly, class: "ev-lbl" }, svg);
        t.textContent = label;
      }
    } else {
      const ex = x(datePos("2022-02-24"));
      el("line", { x1: ex, x2: ex, y1: m.top - 6, y2: m.top + ih, stroke: css("--axis"), "stroke-dasharray": "3 3" }, svg);
    }

    const ends = [];
    for (const s of opts.series) {
      const col = css(s.color);
      let d = "", pen = false;
      s.values.forEach((v, i) => {
        if (v == null || (opts.log && v <= 0)) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      const pa = el("path", { d, fill: "none", stroke: col, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      if (s.dash) pa.setAttribute("stroke-dasharray", s.dash);
      if (s.tint) pa.setAttribute("stroke-opacity", s.tint);
      const mo = s.tint ? { "fill-opacity": Math.min(1, s.tint + 0.25) } : {};
      s.values.forEach((v, i) => {
        if (v == null || (opts.log && v <= 0)) return;
        if (s.marker === "square") el("rect", { x: x(i) - 4, y: y(v) - 4, width: 8, height: 8, rx: 1, fill: col, stroke: surface, "stroke-width": 2, "paint-order": "stroke", ...mo }, svg);
        else if (s.marker === "triangle") el("path", { d: `M${x(i)},${y(v) - 5.5}L${x(i) + 5},${y(v) + 3.5}L${x(i) - 5},${y(v) + 3.5}Z`, fill: col, stroke: surface, "stroke-width": 2, "paint-order": "stroke", ...mo }, svg);
        else el("circle", { cx: x(i), cy: y(v), r: 4, fill: col, stroke: surface, "stroke-width": 2, "paint-order": "stroke", ...mo }, svg);
      });
      let li = s.values.length - 1;
      while (li >= 0 && (s.values[li] == null || (opts.log && s.values[li] <= 0))) li--;
      if (li >= 0) ends.push({ x: x(li), y: y(s.values[li]), text: opts.fmt(s.values[li]), name: s.endName || s.label });
    }
    // A note inside each gap of a line (missing years), and labels on chosen points.
    for (const s of opts.series) {
      const v = s.values;
      if (s.gapNote) {
        for (let a = 1; a < v.length; a++) {
          if (v[a] != null || v[a - 1] == null) continue;
          let b = a;
          while (b < v.length && v[b] == null) b++;
          const right = b < v.length ? v[b] : null;
          // in the gap; or at the foot of the plot when another line runs through the gap
          const yy = opts.gapAtFoot ? m.top + ih + 2 : right != null ? (y(v[a - 1]) + y(right)) / 2 : y(v[a - 1]);
          const t = el("text", { x: x((a + b - 1) / 2), y: yy - 8, "text-anchor": "middle", class: "gap-note" }, svg);
          t.textContent = s.gapNote;
          a = b;
        }
      }
      for (const L of s.labels || []) {
        if (v[L.i] == null) continue;
        const t = el("text", { x: x(L.i), y: y(v[L.i]) + (L.below ? 18 : -10), "text-anchor": "middle", class: "pt-lbl" }, svg);
        t.textContent = L.text;
      }
    }
    ends.sort((a, b) => a.y - b.y);
    const step = opts.endNames ? 32 : 16;
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < step) ends[i].y = ends[i - 1].y + step;
    // keep the last label above the year axis
    const maxY = m.top + ih - (opts.endNames ? 16 : 2);
    for (let i = ends.length - 1; i >= 0; i--) ends[i].y = Math.min(ends[i].y, maxY - (ends.length - 1 - i) * step);
    for (const e of ends) {
      // Direct label: the value, and (when named) the series name under it. Text in ink, not series colour.
      const t = el("text", { x: e.x + 9, y: e.y + (opts.endNames ? 0 : 4), class: "end" }, svg);
      t.textContent = e.text;
      if (opts.endNames) {
        const n = el("text", { x: e.x + 9, y: e.y + 14, class: "end-name" }, svg);
        n.textContent = e.name;
      }
    }

    const cross = el("line", { y1: m.top - 6, y2: m.top + ih, stroke: css("--text-muted"), "stroke-width": 1, visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.left - 12, y: 0, width: iw + 24, height: H, fill: "transparent", tabindex: 0 }, svg);
    let curI = -1;
    const at = (i, cx, cy) => {
      curI = i;
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
      cross.setAttribute("visibility", "visible");
      const rows = opts.series
        .map((s) => ({ color: css(s.color), value: opts.fmt(s.values[i]), label: s.label, raw: s.values[i] == null ? -Infinity : s.values[i] }))
        .sort((a, b) => b.raw - a.raw);
      showTip(cx, cy, String(YEARS[i]), rows);
    };
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      at(Math.max(0, Math.min(YEARS.length - 1, Math.round(((px - m.left) / iw) * (YEARS.length - 1)))), e.clientX, e.clientY);
    });
    const leave = () => { cross.setAttribute("visibility", "hidden"); hideTip(); curI = -1; };
    hit.addEventListener("pointerleave", leave);
    hit.addEventListener("blur", leave);
    const focusAt = (i) => { const r = svg.getBoundingClientRect(); at(i, r.left + (x(i) / W) * r.width, r.top + r.height * 0.3); };
    hit.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      focusAt(curI < 0 ? YEARS.length - 1 : Math.max(0, Math.min(YEARS.length - 1, curI + (e.key === "ArrowRight" ? 1 : -1))));
    });
    hit.addEventListener("focus", () => focusAt(YEARS.length - 1));
    container.replaceChildren(svg);
  }

  // ---------- controls ----------
  function seg(container, options, get, onChange) {
    const render = () => {
      container.replaceChildren(...options.map((o) => {
        const b = h("button", { type: "button", role: "radio", "aria-checked": String(o.value === get()), text: o.label });
        b.addEventListener("click", () => { onChange(o.value); render(); });
        return b;
      }));
    };
    render();
  }

  // ---------- route diagram (hero) ----------
  // Bands to scale: EU -> Kazakhstan / Kyrgyzstan (leg 1), then -> Russia (leg 2).
  const route = { paths: null, first: true };
  function routeDiagram() {
    const box = document.getElementById("route");
    const W = box.clientWidth, H = box.clientHeight;
    if (W < 200 || H < 120) return;
    const small = W < 560;
    const yi = YEARS.indexOf(state.routeYear);
    const S = {};
    for (const c of D.countries) S[c] = { eu: series("eu", c), ru: series("ru", c) };
    // one scale for all years, so a year's bands can be compared with another year's
    let maxTot = 0;
    YEARS.forEach((_, i) => {
      const a = D.countries.reduce((t, c) => t + (S[c].eu[i] || 0), 0);
      const b = D.countries.reduce((t, c) => t + (S[c].ru[i] || 0), 0);
      maxTot = Math.max(maxTot, a, b);
    });
    const top = small ? 54 : 58, gap = small ? 40 : 46;
    const k = maxTot > 0 ? (H - top - gap - (small ? 70 : 64)) / maxTot : 0;
    const th = (v) => (v == null ? 0 : v * k); // true to scale; no minimum width
    const nodeW = 8;
    const xEU = 0, xMid = Math.round(W * 0.5) - nodeW / 2, xRU = W - nodeW;

    const kz = D.countries[0], kg = D.countries[1];
    const v = (c, f) => S[c][f][yi];
    const hIn = (c) => th(v(c, "eu")), hOut = (c) => th(v(c, "ru"));
    const hMid = (c) => Math.max(hIn(c), hOut(c), 2);
    const yKZ = top, yKG = top + hMid(kz) + gap;
    const midCentre = (yKZ + yKG + hMid(kg)) / 2;
    const euH = hIn(kz) + hIn(kg), ruH = hOut(kz) + hOut(kg);
    const yEU = Math.max(top, midCentre - euH / 2), yRU = Math.max(top, midCentre - ruH / 2);

    const band = (x1, a0, a1, x2, b0, b1) => {
      const xm = (x1 + x2) / 2;
      return `M${x1},${a0}C${xm},${a0} ${xm},${b0} ${x2},${b0}L${x2},${b1}C${xm},${b1} ${xm},${a1} ${x1},${a1}Z`;
    };
    const geo = {
      [`eu-${kz}`]: band(xEU + nodeW, yEU, yEU + hIn(kz), xMid, yKZ, yKZ + hIn(kz)),
      [`eu-${kg}`]: band(xEU + nodeW, yEU + hIn(kz), yEU + euH, xMid, yKG, yKG + hIn(kg)),
      [`ru-${kz}`]: band(xMid + nodeW, yKZ, yKZ + hOut(kz), xRU, yRU, yRU + hOut(kz)),
      [`ru-${kg}`]: band(xMid + nodeW, yKG, yKG + hOut(kg), xRU, yRU + hOut(kz), yRU + ruH),
    };

    // Build once; later calls move the bands (CSS transition on d).
    if (!route.paths || route.w !== W || route.h !== H) {
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
      route.svg = svg; route.w = W; route.h = H; route.paths = {}; route.nodes = {}; route.labels = el("g", { class: "lbl" });
      for (const key of Object.keys(geo)) {
        const [f, c] = key.split("-");
        const p = el("path", { class: `band leg${f === "eu" ? 1 : 2}`, fill: css(f === "eu" ? "--flow-eu" : "--flow-ru"), "fill-opacity": 0.88, tabindex: 0 }, svg);
        p.addEventListener("pointermove", (e) => bandTip(e.clientX, e.clientY, f, c));
        p.addEventListener("pointerleave", hideTip);
        p.addEventListener("focus", () => { const r = p.getBoundingClientRect(); bandTip(r.left + r.width / 2, r.top, f, c); });
        p.addEventListener("blur", hideTip);
        route.paths[key] = p;
      }
      for (const n of ["eu", kz, kg, "ru"]) route.nodes[n] = el("rect", { width: nodeW, fill: css("--text-primary"), rx: 1 }, svg);
      svg.appendChild(route.labels);
      box.replaceChildren(svg);
      if (route.first) { box.classList.add("enter"); route.first = false; setTimeout(() => box.classList.remove("enter"), 2000); }
    }
    for (const [key, d] of Object.entries(geo)) {
      const p = route.paths[key];
      p.setAttribute("d", d);
      p.style.d = `path("${d}")`;
      const [f, c] = key.split("-");
      p.setAttribute("aria-label", `${f === "eu" ? `EU exports to ${c}` : `${c} exports to Russia`}, ${state.routeYear}: ${fmtMoney(v(c, f))}`);
    }
    const setNode = (n, x, y, h) => { const r = route.nodes[n]; r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("height", Math.max(h, 2)); };
    setNode("eu", xEU, yEU, euH); setNode(kz, xMid, yKZ, hMid(kz)); setNode(kg, xMid, yKG, hMid(kg)); setNode("ru", xRU, yRU, ruH);

    // Labels: node names on top, values beside each band.
    const L = route.labels;
    L.replaceChildren();
    const txt = (x, y, cls, t, anchor = "start") => { const n = el("text", { x, y, class: cls, "text-anchor": anchor }, L); n.textContent = t; return n; };
    txt(xEU, yEU - 30, "node", "EU-27");
    txt(xEU, yEU - 12, "node-sub", small ? "exports" : "exports, as the EU records them");
    txt(xRU + nodeW, yRU - 30, "node", "Russia", "end");
    txt(xRU + nodeW, yRU - 12, "node-sub", small ? "no own data" : "no data of its own since 2021", "end");
    txt(xMid + nodeW / 2, yKZ - 12, "node", kz, "middle");
    txt(xMid + nodeW / 2, yKG + hMid(kg) + 22, "node", kg, "middle");
    // A thick band carries its value inside; a thin one has it just under the band.
    const q1 = xEU + nodeW + (xMid - xEU - nodeW) / 2, q3 = xMid + nodeW + (xRU - xMid - nodeW) / 2;
    const bandLabel = (x, a0, a1, b0, b1, val, sub, leg) => {
      const t = ((a1 - a0) + (b1 - b0)) / 2, c = (a0 + a1 + b0 + b1) / 4;
      if (t >= 46) {
        txt(x, c + (small ? 5 : -1), `val val-in ${leg}`, val, "middle");
        if (!small) txt(x, c + 16, `val-sub val-in ${leg}`, sub, "middle");
      } else {
        const y = (a1 + b1) / 2 + 20;
        txt(x, y, "val", val, "middle");
        if (!small) txt(x, y + 16, "val-sub", sub, "middle");
      }
    };
    bandLabel(q1, yEU, yEU + hIn(kz), yKZ, yKZ + hIn(kz), fmtMoney(v(kz, "eu")), `EU to ${kz}`, "on1");
    bandLabel(q3, yKZ, yKZ + hOut(kz), yRU, yRU + hOut(kz), fmtMoney(v(kz, "ru")), `${kz} to Russia`, "on2");
    bandLabel(q1, yEU + hIn(kz), yEU + euH, yKG, yKG + hIn(kg), fmtMoney(v(kg, "eu")), `EU to ${kg}`, "on1");
    bandLabel(q3, yKG, yKG + hOut(kg), yRU + hOut(kz), yRU + ruH, fmtMoney(v(kg, "ru")), `${kg} to Russia`, "on2");
    route.svg.setAttribute("aria-label", `Route diagram for ${state.routeYear}. ${document.getElementById("route-caption").textContent}`);
  }
  function bandTip(x, y, f, c) {
    const vals = series(f, c), i = YEARS.indexOf(state.routeYear), b = baseOf(vals);
    showTip(x, y, `${state.routeYear}`, [
      { color: css(f === "eu" ? "--flow-eu" : "--flow-ru"), value: fmtMoney(vals[i]), label: f === "eu" ? `EU exports to ${c}` : `${c} exports to Russia` },
      ...(vals[i] != null && b ? [{ color: "transparent", value: fmtX(vals[i] / b), label: `vs the ${baseLabel()}` }] : []),
    ]);
  }
  function routeCaption() {
    const i = YEARS.indexOf(state.routeYear), yr = state.routeYear;
    const [kz, kg] = D.countries;
    const g = (c, f) => fmtMoney(series(f, c)[i]);
    const cap = document.getElementById("route-caption");
    cap.replaceChildren(
      `In ${yr} the EU sold `, h("b", { text: g(kz, "eu") }), ` of ${state.basket === "all" ? "these goods" : "the selected goods"} to ${kz} and `,
      h("b", { text: g(kg, "eu") }), ` to ${kg}, while ${kz} reported exporting `, h("b", { text: g(kz, "ru") }), ` of them to Russia and ${kg} `,
      h("b", { text: g(kg, "ru") }), ". The bands are drawn to scale. Each leg is measured separately, and the second also carries goods from China and elsewhere, so it is not all EU goods in transit.",
    );
  }
  // ---------- hero: flow map (EU and China through three countries into Russia) ----------
  const PLACES = {
    EU: { ll: [10.4, 50.9], name: "EU-27" }, CN: { ll: [103.0, 35.0], name: "China" }, RU: { ll: [37.6, 55.75], name: "Russia" },
    KZ: { ll: [71.4, 51.1], name: "Kazakhstan" }, KG: { ll: [74.6, 42.9], name: "Kyrgyzstan" },
    UZ: { ll: [69.3, 41.3], name: "Uzbekistan" }, HK: { ll: [114.17, 22.3], name: "Hong Kong" },
  };
  const HUBS = ["KZ", "KG", "UZ"];
  function mapValue(kind, from, to, i) {
    const y = YEARS[i];
    const basket = (code) => inBasket(code, state.basket);
    if (kind === "eu" || kind === "cn" || kind === "hk") {
      const SP = D.suppliers;
      if (!SP || SP.meta.missing.includes(`${kind}|${to}|${y}`)) return null;
      let t = 0;
      for (const r of SP.rows) if (r[0] === kind && r[1] === to && r[2] === y && basket(r[3]) && r[4] != null) t += r[4];
      return conv(t, y);
    }
    const C = D.control;
    if (!C || C.meta.missing.includes(`ru|${from}|${y}`)) return null;
    let t = 0;
    for (const r of C.rows) if (r[0] === "ru" && r[1] === from && r[2] === y && r[3] === "listed" && basket(r[4]) && r[5] != null) t += r[5];
    return conv(t, y);
  }
  function mapBands(i) {
    const b = [];
    // Hong Kong is drawn as its own band: in 2023 it shipped the three countries more than the whole EU.
    for (const h of HUBS) b.push({ kind: "eu", from: "EU", to: h }, { kind: "cn", from: "CN", to: h }, { kind: "hk", from: "HK", to: h });
    for (const h of HUBS) b.push({ kind: "ru", from: h, to: "RU" });
    for (const x of b) x.v = mapValue(x.kind, x.from, x.to, i);
    return b;
  }
  const map = { built: false };
  function routeMap() {
    const box = document.getElementById("route");
    const W = box.clientWidth;
    if (W < 200) return;
    const small = W < 640;
    const H = Math.round(Math.max(300, Math.min(520, W * (small ? 0.78 : 0.44))));
    box.style.height = `${H}px`;
    const yi = YEARS.indexOf(state.routeYear);
    const proj = d3.geoConicEqualArea().parallels([35, 55]).rotate([-58, 0]);
    // the frame reaches south to Hong Kong
    const frame = { type: "MultiPoint", coordinates: small ? [[3, 20], [117, 20], [3, 59], [117, 59]] : [[2, 20], [117, 20], [2, 58], [117, 58]] };
    proj.fitExtent([[10, 10], [W - 10, H - 10]], frame);
    const path = d3.geoPath(proj);
    const pt = (k) => proj(PLACES[k].ll);

    // one width scale for all years, so years can be compared
    let maxV = 0;
    YEARS.forEach((_, i) => mapBands(i).forEach((x) => { if (x.v != null) maxV = Math.max(maxV, x.v); }));
    const k = maxV ? (small ? 40 : 64) / maxV : 0;
    const color = { eu: css("--flow-eu"), cn: css("--text-primary"), hk: css("--text-primary"), ru: css("--flow-ru") };
    const opacity = { eu: 0.85, cn: 0.85, hk: 0.4, ru: 0.85 }; // Hong Kong: a lighter tint of China's colour

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "flow-map" });
    box.replaceChildren(svg);
    const countries = topojson.feature(WORLD, WORLD.objects.countries).features;
    const ids = { Kazakhstan: "KZ", Kyrgyzstan: "KG", Uzbekistan: "UZ", Russia: "RU", China: "CN" };
    const BIG = new Set(["EU", "CN", "RU"]);
    const gLand = el("g", {}, svg);
    for (const f of countries) {
      const d = path(f);
      if (!d) continue;
      const hub = ids[f.properties.name];
      el("path", { d, class: hub ? (HUBS.includes(hub) ? "land hub" : "land big") : "land" }, gLand);
    }

    // curved bands: a quadratic curve that bows to one side
    const curve = (a, b, bend) => {
      const [x1, y1] = a, [x2, y2] = b, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / len) * bend * len, cy = my + (dx / len) * bend * len;
      return { d: `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`, at: (t) => [(1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2] };
    };
    // EU bands bow south and the Russia legs north, so the two legs do not lie on top of each other.
    const bendOf = (x) => (x.kind === "ru" ? 0.12 : x.kind === "hk" ? -0.14 : 0.1); // Hong Kong bows the other way from China
    const bands = mapBands(yi);
    const gB = el("g", {}, svg), gL = el("g", {}, svg), gV = el("g", {}, svg);
    const labels = [];
    const order = [...bands].sort((a, b) => (b.v || 0) - (a.v || 0)); // wide bands behind narrow ones
    const yearMax = Math.max(...bands.map((b) => b.v || 0));
    for (const x of order) {
      const c = curve(pt(x.from), pt(x.to), bendOf(x));
      const wv = x.v == null ? 0 : x.v * k;
      const p = el("path", {
        d: c.d, fill: "none", stroke: x.v == null ? css("--text-muted") : color[x.kind],
        "stroke-width": x.v == null ? 1 : Math.max(wv, 0.5), "stroke-opacity": opacity[x.kind],
        "stroke-dasharray": x.v == null ? "3 3" : null, "stroke-linecap": "butt", class: "flow", tabindex: 0,
      }, gB);
      const what = x.kind === "ru" ? `${PLACES[x.from].name} to Russia` : `${PLACES[x.from].name} to ${PLACES[x.to].name}`;
      const tipAt = (cx, cy) => showTip(cx, cy, String(state.routeYear), [{ color: color[x.kind], value: x.v == null ? "no data" : fmtMoney(x.v), label: what }]);
      p.addEventListener("pointermove", (e) => tipAt(e.clientX, e.clientY));
      p.addEventListener("pointerleave", hideTip);
      p.addEventListener("focus", () => { const r = p.getBoundingClientRect(); tipAt(r.left + r.width / 2, r.top); });
      p.addEventListener("blur", hideTip);
      p.setAttribute("aria-label", `${what}, ${state.routeYear}: ${x.v == null ? "no data" : fmtMoney(x.v)}`);
      // Very thin bands carry no number on the map (hover or the table gives it); it only crowds the map.
      if (x.v != null && x.v < yearMax * 0.01) continue;
      labels.push({ v: x.v == null ? -1 : x.v, c, text: x.v == null ? "no data" : fmtMoney(x.v),
        ts: x.kind === "ru" ? [0.45, 0.3, 0.6] : [0.62, 0.78, 0.45] });
    }
    // places
    const placed = [];
    const overlaps = (b) => placed.some((q) => b.x < q.x + q.width + 3 && q.x < b.x + b.width + 3 && b.y < q.y + q.height + 1 && q.y < b.y + b.height + 1);
    for (const [key, pl] of Object.entries(PLACES)) {
      const [x, y] = pt(key);
      const dot = el("circle", { cx: x, cy: y, r: BIG.has(key) || key === "HK" ? 5 : 3.5, class: "node" }, gL);
      placed.push(dot.getBBox()); // a value label must not cover a place's dot
      // EU, China and Russia: name above the point (so it stays inside the map); hubs beside it
      const above = BIG.has(key);
      const right = key === "KG";
      const under = key === "UZ";
      // Kyrgyzstan's name sits below and right of its dot, under the China band that ends there
      const t = el("text", { x: x + (above || under ? 0 : right ? 4 : -8), y: y + (above ? -10 : key === "KZ" ? -8 : under ? 18 : key === "HK" ? -10 : right ? 20 : 16), "text-anchor": above || under ? "middle" : right ? "start" : "end", class: "node-lbl" + (above || key === "HK" ? " big" : "") }, gL);
      t.textContent = pl.name;
      placed.push(t.getBBox());
    }
    // the value on every band, largest first; a label that would cover another moves along its band, else is left out
    labels.sort((a, b) => b.v - a.v);
    for (const L of labels) {
      for (const tt of L.ts) {
        const [lx, ly] = L.c.at(tt);
        const t = el("text", { x: lx, y: ly + 4, "text-anchor": "middle", class: "flow-lbl" + (L.v >= 0 && L.v * k < 2 ? " thin" : "") }, gV);
        t.textContent = L.text;
        const bb = t.getBBox();
        if (!overlaps(bb)) { placed.push(bb); break; }
        t.remove();
      }
    }
    svg.setAttribute("aria-label", `Map of ${state.routeYear} flows. ${document.getElementById("route-caption").textContent}`);
  }

  function mapCaption() {
    const i = YEARS.indexOf(state.routeYear), yr = state.routeYear;
    const sum = (kind) => HUBS.reduce((t, hh) => { const v = mapValue(kind, kind === "ru" ? hh : kind.toUpperCase(), hh, i); return v == null ? t : t + v; }, 0);
    const eu = sum("eu"), cn = sum("cn"), hk = sum("hk"), ru = HUBS.reduce((t, hh) => { const v = mapValue("ru", hh, "RU", i); return v == null ? t : t + v; }, 0);
    const cap = document.getElementById("route-caption");
    cap.replaceChildren(
      `In ${yr} the EU sent `, h("b", { text: fmtMoney(eu) }), ` and China `, h("b", { text: fmtMoney(cn) }),
      ...(hk > 0 ? [` and Hong Kong `, h("b", { text: fmtMoney(hk) }), ``] : []),
      ` to the three countries, which sent `, h("b", { text: fmtMoney(ru) }), ` of the same goods to Russia. The bands are to scale, and the scale is fixed across years.`,
    );
  }

  function routeAll() {
    if (window.d3 && window.topojson && window.WORLD && D.suppliers && D.control) { mapCaption(); routeMap(); }
    else { routeCaption(); routeDiagram(); }
  }

  function summaryBox() {
    const el = document.getElementById("summary");
    if (!el) return;
    const ly = YEARS.length - 1, yr = YEARS[ly];
    const usd = (v) => (v == null ? "no data" : v >= 1000 ? `$${(v / 1000).toFixed(2)}bn` : `$${fmtM(v)}M`);
    const pre = (vals) => baseOf(vals, "avg");
    // one notation for every cell in a change column: a multiple of the pre-war level
    const chg = (a, b) => (a == null || b == null || a < MIN_BASE ? "—" : fmtX(b / a));
    const rows = [];
    // Always all codes, in 2025 US dollars (US CPI), whatever the filters say.
    const real = (v) => v.map((x, i) => (x == null ? null : deflate(x, YEARS[i], "USD")));
    for (const c of D.countries) { const v = real(series("ru", c, "all", true)); const pk = peakOf(v); rows.push([`${c} to Russia`, pre(v), v[ly], pk >= 0 ? v[pk] : null, pk >= 0 ? YEARS[pk] : null]); }

    // Mirror gap above the pre-war ratio, all codes, 2022 onwards, all route countries.
    let excess = 0;
    for (const c of D.countries) {
      const eu = real(series("eu", c, "all", true)), mi = real(series("mi", c, "all", true));
      let se = 0, sm = 0;
      for (const y of D.baselineYears) { const i = YEARS.indexOf(y); if (eu[i] && mi[i] != null) { se += eu[i]; sm += mi[i]; } }
      if (!se) continue;
      const r = sm / se;
      YEARS.forEach((y, i) => { if (y >= 2022 && eu[i] && mi[i] != null) excess += Math.max(0, eu[i] * r - mi[i]); });
    }
    const t = h("table", { class: "summary-table" }, [
      h("caption", { text: `Battlefield goods, all 49 codes, ${REF_YEAR} US dollars a year. This table stays on ${yr}; the year buttons change only the map.` }),
      h("thead", {}, h("tr", {}, ["", "2019–21 average", "Peak", "Change to peak", String(yr), "Change to " + yr].map((x) => h("th", { text: x })))),
      h("tbody", {}, [
        ...rows.map((r) => h("tr", {}, [h("th", { scope: "row", text: r[0] }), h("td", { text: usd(r[1]) }), h("td", { text: r[3] == null ? "—" : `${usd(r[3])} (${r[4]})` }), h("td", { text: chg(r[1], r[3]) }), h("td", { text: usd(r[2]) }), h("td", { text: chg(r[1], r[2]) })])),
      ]),
    ]);
    el.replaceChildren(t);
    // A total over several years does not belong in a table of yearly values, so it is a sentence.
    // The key ratio: recorded exports to Russia against all recorded supply (EU, China, Hong Kong), latest year.
    const SP = D.suppliers;
    const basketAll = new Set(D.chpl.map((r) => r.hs6).filter((c) => inBasket(c, "all")));
    const supply = SP ? SP.rows.filter((r) => r[1] !== "RU" && r[2] === yr && basketAll.has(r[3]) && r[4] != null).reduce((t, r) => t + r[4], 0) : null;
    const toRu = rows.reduce((t, r) => t + (r[2] || 0), 0);
    // China leg of the mirror check: shipments missing above each country's pre-war ratio, latest year.
    let cnGap = null;
    const MC = D.mirrorCn;
    if (MC) {
      const miss = new Set(MC.meta.missing);
      const val = (c, side, y) => {
        if (miss.has(`${side}|${c}|${y}`) || miss.has(`${side}-listed|${c}|${y}`)) return null;
        const r = MC.rows.find((x) => x[0] === c && x[1] === y && x[2] === side);
        return r ? r[3] : null;
      };
      cnGap = 0;
      for (const c of Object.keys(MC.meta.countries)) {
        let sc = 0, si = 0;
        for (const y of D.baselineYears) { const a = val(c, "cn", y), b = val(c, "imp", y); if (a && b != null) { sc += a; si += b; } }
        const a = val(c, "cn", yr), b = val(c, "imp", yr);
        if (sc && a && b != null) cnGap += Math.max(0, a * (si / sc) - b);
      }
    }
    // Prose carries the finding in words; the figures go in a small text-table (more than two numbers
    // in a sentence are hard to compare).
    const note = document.getElementById("summary-note");
    const kg = (() => {
      const E = D.estimate;
      const r = E ? E.rows.find((q) => q[0] === "KG" && q[1] === yr) : null;
      if (!r) return null;
      const i = (c) => E.cols.indexOf(c);
      return [r[i("low")] / 1e6, r[i("high")] / 1e6];
    })();
    const share = supply ? toRu / supply : null;
    const lede = share == null ? "" : `In ${yr} the three countries reported sending Russia ${share < 0.1 ? "less than a tenth" : `about ${shareW(share)}`} of the battlefield goods they took in from the EU, China and Hong Kong` +
      (cnGap && cnGap > toRu ? `, and more of China's shipments went missing from their import books than reached Russia on record.` : ".");
    const rowsN = [
      supply ? [`Shipped to the three by the EU, China and Hong Kong, ${yr}`, usd(supply)] : null,
      [`Exported by the three to Russia, on record, ${yr}`, usd(toRu)],
      excess > 0 ? [`EU shipments missing from their import records, 2022–${yr} in total, beyond the pre-war gap`, usd(excess)] : null,
      cnGap ? [`China's shipments missing the same way, ${yr}`, usd(cnGap)] : null,
      kg ? [h("span", {}, [`Through Kyrgyzstan, ${yr}: on record, and the ceiling if every missing arrival went on (`, h("a", { href: "#estimate", text: "Part 5" }), `)`]), `${usd(kg[0])} – ${usd(kg[1])}`] : null,
    ].filter(Boolean);
    if (note) note.replaceChildren(
      h("p", { text: lede }),
      h("table", { class: "summary-table text-table" }, h("tbody", {}, rowsN.map(([a, b]) => h("tr", {}, [h("th", { scope: "row" }, [a]), h("td", { text: b })])))),
    );
  }

  // ---------- section 1 ----------
  function flows() {
    const c = state.flowsCountry;
    const s = ["eu", "ru"].map((f) => ({ label: FLOW[f].label(c), endName: f === "eu" ? "from the EU" : "to Russia", color: FLOW[f].color, values: series(f, c) }));
    // The finding, from the data: the pre-war level against the latest year, for each leg.
    const last = YEARS.length - 1, ly = YEARS[last];
    const say = (vals, what) => {
      const b = rawBase(vals), l = vals[last];
      if (b == null || l == null) return `${what}: too little data for this selection.`;
      const ok = usableBase(vals);
      const pk = peakOf(vals), peaked = pk >= 0 && pk !== last && vals[pk] > l * 1.1 ? `, after peaking in ${YEARS[pk]}` : "";
      if (!ok) return `${what} went from ${fmtMoney(b)} a year before the war to ${fmtMoney(l)} in ${ly}.`;
      const g = grew(l / ok), pkd = peaked ? ` after a ${YEARS[pk]} peak` : "";
      return g === "held steady"
        ? `${what} held steady at pre-war levels, at ${fmtMoney(l)} in ${ly}${pkd}.`
        : `${what} ${g} over pre-war levels, reaching ${fmtMoney(l)} in ${ly}${pkd}.`;
    };
    {
      const ru = s[1].values, b = usableBase(ru), l = ru[last], pk = peakOf(ru);
      const fell = b && l != null && pk >= 0 && pk !== last && ru[pk] > l * 1.1;
      document.getElementById("flows-h").textContent = fell
        ? `${c}'s sales to Russia ${grew(ru[pk] / b)} by ${YEARS[pk]}, then ${grew(l / ru[pk])}`
        : b && l != null
        ? `${c}'s sales to Russia ${grew(l / b)} after the invasion`
        : l != null ? `${c} sold Russia ${fmtMoney(rawBase(ru) || 0)} a year of these goods before the war and ${fmtMoney(l)} in ${ly}` : "Both legs, year by year";
    }
    document.getElementById("flows-sub").textContent =
      `${say(s[0].values, `EU sales to ${c}`)} ` + (() => {
        const ru = s[1].values, b = rawBase(ru), l = ru[last];
        return b != null && l != null ? `${c} sold Russia ${fmtMoney(l)} of these goods in ${ly}, against ${fmtMoney(b)} a year before the war.` : "";
      })();
    document.getElementById("flows-legend").replaceChildren();
    const ev = eventsFor(c);
    // On the chart, the three steps of the goods list (9, 45, 50 codes) are one mark; three marks
    // within nine months crowd the top of the chart.
    const listEv = ev.filter((e) => /codes/.test(e.short || ""));
    const chartEv = listEv.length > 1
      ? [...ev.filter((e) => !listEv.includes(e)), { ...listEv[0], short: `List: ${listEv.map((e) => (e.short.match(/\d+/) || [""])[0]).join(" → ")} codes` }]
      : ev;
    lineChart(document.getElementById("flows-chart"), {
      series: s, fmt: fmtMoney, events: chartEv, endNames: true,
      topTickFmt: (t) => `${cur()}${t.toLocaleString("en-US")}M`,
      aria: `${c}: EU-27 exports and exports to Russia, ${basketLabel()}, ${state.currency} million, 2019 to 2025`,
    });
    const lastPos = YEARS.length - 0.5;
    document.getElementById("flows-events").replaceChildren(...ev.map((e) =>
      h("li", {}, [
        h("time", { datetime: e.date, text: new Date(e.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) }),
        h("span", { text: e.label + (e.pos > lastPos || isNaN(e.pos) ? " (after the data period)" : "") }),
        h("a", { href: e.url, target: "_blank", rel: "noopener", text: "source" }),
      ])
    ));
    table(document.getElementById("flows-table"),
      ["Year", ...s.map((x) => `${x.label} (${state.currency} M)`)],
      YEARS.map((yr, i) => [String(yr), ...s.map((x) => fmtM(x.values[i]))]));
  }

  // ---------- section 2 ----------
  function comparison() {
    const data = {};
    for (const c of D.countries) {
      const eu = series("eu", c), ru = series("ru", c);
      data[c] = {
        eu: indexOf(eu).map((v) => (v == null ? null : v / 100)), ru: indexOf(ru).map((v) => (v == null ? null : v / 100)),
        ratio: YEARS.map((_, i) => (eu[i] && ru[i] != null ? (100 * ru[i]) / eu[i] : null)),
      };
    }
    {
      const [kz, kg] = D.countries, ly = YEARS.length - 1;
      const rz = series("ru", kz), rg = series("ru", kg);
      const size = rz[ly] && rg[ly] ? rz[ly] / rg[ly] : null;
      const gz = data[kz].ru[ly], gg = data[kg].ru[ly];
      const pz = peakOf(data[kz].ru), pg = peakOf(data[kg].ru);
      document.getElementById("cmp-h").textContent = gz != null && gg != null && pz >= 0 && pg >= 0 && pz !== ly && pg !== ly
        ? `${kz} ships more, ${kg} grew faster, and both have passed their peak`
        : `${kz} ships more; ${kg} grew faster`;
      document.getElementById("cmp-sub").textContent =
        `In ${YEARS[ly]}, ${kz} sold Russia ${fmtMoney(rz[ly])} of these goods` +
        (size && size >= 1.9 ? `, about ${Math.round(size) <= 12 ? NUMW[Math.round(size)] : Math.round(size)} times as much as ${kg}. ` : size ? `, against ${kg}'s ${fmtMoney(rg[ly])}. ` : ". ") +
        (gz != null && gg != null ? `Since before the war, ${kg}'s sales ${grew(gg)} and ${kz}'s ${grew(gz)}.` : "") +
        (gz != null && gg != null && pz >= 0 && pg >= 0 && pz !== ly && pg !== ly ? ` ${kg}'s peaked in ${YEARS[pg]}, ${kz}'s in ${YEARS[pz]}.` : "") +
        D.countries.slice(2).map((c) => {
          const r = series("ru", c), g = data[c].ru[ly];
          return r[ly] == null ? "" : g != null ? ` ${c}'s sales ${grew(g)}, to ${fmtMoney(r[ly])}.` : ` ${c} sold ${fmtMoney(r[ly])}.`;
        }).join("");
    }
    // The colour says the leg (as everywhere on the page); the marker, the dash and the name say the country.
    const mk = (key) => D.countries.map((c) => ({
      label: c, endName: c, color: key === "eu" ? FLOW.eu.color : FLOW.ru.color, marker: COUNTRY[c].marker, dash: COUNTRY[c].dash,
      tint: COUNTRY[c].marker === "square" ? 0.5 : null, values: data[c][key],
    }));
    const capFor = (key) => {
      const small = D.countries.filter((c) => data[c][key].every((v) => v == null) && series(key, c).some((v) => v != null));
      return `times the ${baseLabel()}, log scale` + small.map((c) => `; ${c}: ${smallBaseNote(series(key, c))}`).join("");
    };
    document.getElementById("cmp-eu-cap").textContent = capFor("eu");
    document.getElementById("cmp-ru-cap").textContent = capFor("ru");
    document.getElementById("cmp-legend").replaceChildren();
    // One log scale for both panels, so a step up means the same growth in each.
    const allX = D.countries.flatMap((c) => [...data[c].eu, ...data[c].ru]).filter((v) => v > 0);
    const dom = [Math.min(...allX, 1) * 0.8, Math.max(...allX, 1) * 1.15];
    const xt = (t) => `×${t < 1 ? t : t.toLocaleString("en-US")}`;
    lineChart(document.getElementById("cmp-eu"), { series: mk("eu"), fmt: fmtX, tickFmt: xt, log: true, baseline: 1, domain: dom, endNames: true, aria: `EU-27 exports as a multiple of the ${baseLabel()}` });
    lineChart(document.getElementById("cmp-ru"), { series: mk("ru"), fmt: fmtX, tickFmt: xt, log: true, baseline: 1, domain: dom, endNames: true, aria: `Exports to Russia as a multiple of the ${baseLabel()}` });
    // The two legs against each other: one point a year, in money, not a ratio. One small scatterplot a
    // country on one shared log scale, so each path reads on its own and every year can carry a label.
    {
      const box = document.getElementById("cmp-ratio");
      const S = D.countries.map((c) => ({ label: c, marker: COUNTRY[c].marker, x: series("eu", c), y: series("ru", c) }));
      const vals = S.flatMap((s) => [...s.x, ...s.y]).filter((v) => v > 0);
      const domS = vals.length ? [Math.min(...vals) * 0.7, Math.max(...vals) * 1.4] : null;
      box.replaceChildren(...S.map((s) => h("figure", { class: "scatter-fig" }, [h("figcaption", { text: s.label }), h("div", { class: "chart" })])));
      S.forEach((s, i) => scatterChart(box.children[i].querySelector(".chart"), {
        series: [s], domain: domS, allYears: true,
        aria: `${s.label}: exports to Russia against EU exports to it, one point a year, log scales`,
      }));
    }
    const head = ["Year"];
    for (const c of D.countries) head.push(`${c}: EU exports, ×`, `${c}: to Russia, ×`, `${c}: EU exports, ${cur()}M`, `${c}: to Russia, ${cur()}M`);
    table(document.getElementById("cmp-table"), head, YEARS.map((yr, i) => {
      const row = [String(yr)];
      for (const c of D.countries) row.push(fmtX(data[c].eu[i]), fmtX(data[c].ru[i]), fmtM(series("eu", c)[i]), fmtM(series("ru", c)[i]));
      return row;
    }));
  }

  // ---------- connected scatterplot: leg 1 (x) against leg 2 (y), log scales ----------
  function scatterChart(container, opts) {
    const W = container.clientWidth, H = container.clientHeight;
    if (W < 120 || H < 80) return;
    const m = { top: 14, right: 16, bottom: 34, left: 50 };
    // Square plot area: both axes use one scale, so the equal-value line runs at 45 degrees.
    const iw = Math.min(W - m.left - m.right, H - m.top - m.bottom), ih = iw;
    const pts = opts.series.flatMap((s) => s.x.map((xv, i) => [xv, s.y[i]])).filter(([a, b]) => a > 0 && b > 0);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" });
    if (!pts.length) { container.replaceChildren(svg); return; }
    const all = pts.flat();
    const lo = opts.domain ? opts.domain[0] : Math.min(...all) * 0.7, hi = opts.domain ? opts.domain[1] : Math.max(...all) * 1.4;
    const l0 = Math.log10(lo), l1 = Math.log10(hi);
    const sx = (v) => m.left + ((Math.log10(v) - l0) / (l1 - l0)) * iw;
    const sy = (v) => m.top + ih - ((Math.log10(v) - l0) / (l1 - l0)) * ih;
    const ticks = logTicks(lo, hi).filter((t) => isPow10(t) || logTicks(lo, hi).length <= 5);
    const tf = (t) => `${cur()}${t >= 1 ? t.toLocaleString("en-US") : t}M`;
    for (const t of ticks) {
      el("line", { x1: m.left, x2: m.left + iw, y1: sy(t), y2: sy(t), stroke: css("--grid") }, svg);
      el("line", { x1: sx(t), x2: sx(t), y1: m.top, y2: m.top + ih, stroke: css("--grid") }, svg);
      const a = el("text", { x: m.left - 6, y: sy(t) + 4, "text-anchor": "end" }, svg); a.textContent = tf(t);
      const b = el("text", { x: sx(t), y: m.top + ih + 15, "text-anchor": "middle" }, svg); b.textContent = tf(t);
    }
    const xl = el("text", { x: m.left + iw, y: m.top + ih + 30, "text-anchor": "end", class: "axis-lbl" }, svg); xl.textContent = "from the EU →";
    const yl = el("text", { x: m.left + 4, y: m.top + 10, class: "axis-lbl" }, svg); yl.textContent = "↑ to Russia";
    // Equal value: on this line the country sends Russia as much as it buys from the EU.
    el("line", { x1: sx(lo), y1: sy(lo), x2: sx(hi), y2: sy(hi), stroke: css("--axis"), "stroke-dasharray": "1 3" }, svg);
    const eqAt = lo * Math.pow(hi / lo, 0.62);
    const eq = el("text", { x: sx(eqAt) - 6, y: sy(eqAt) - 4, "text-anchor": "end", class: "ref-lbl" }, svg); eq.textContent = "equal value";
    const ink = css("--text-primary"), surface = css("--surface-1");
    for (const s of opts.series) {
      const P = s.x.map((xv, i) => ({ i, xv, yv: s.y[i] })).filter((p) => p.xv > 0 && p.yv > 0);
      const d = P.map((p, k) => `${k ? "L" : "M"}${sx(p.xv).toFixed(1)},${sy(p.yv).toFixed(1)}`).join("");
      el("path", { d, fill: "none", stroke: ink, "stroke-width": 1.2, "stroke-opacity": s.tint ? 0.4 : 0.75 }, svg);
      for (const p of P) {
        const cx = sx(p.xv), cy = sy(p.yv);
        const mark = s.marker === "square"
          ? el("rect", { x: cx - 3.5, y: cy - 3.5, width: 7, height: 7, fill: ink, "fill-opacity": s.tint ? 0.7 : 1, stroke: surface, "stroke-width": 1.5, "paint-order": "stroke", tabindex: 0 }, svg)
          : s.marker === "triangle"
            ? el("path", { d: `M${cx},${cy - 5}L${cx + 4.5},${cy + 3.2}L${cx - 4.5},${cy + 3.2}Z`, fill: ink, stroke: surface, "stroke-width": 1.5, "paint-order": "stroke", tabindex: 0 }, svg)
            : el("circle", { cx, cy, r: 3.5, fill: ink, stroke: surface, "stroke-width": 1.5, "paint-order": "stroke", tabindex: 0 }, svg);
        const tipAt = (x, y) => showTip(x, y, `${s.label}, ${YEARS[p.i]}`, [
          { color: css(FLOW.eu.color), value: fmtMoney(p.xv), label: "from the EU" },
          { color: css(FLOW.ru.color), value: fmtMoney(p.yv), label: "to Russia" },
        ]);
        mark.addEventListener("pointermove", (e) => tipAt(e.clientX, e.clientY));
        mark.addEventListener("pointerleave", hideTip);
        mark.addEventListener("focus", () => { const r = mark.getBoundingClientRect(); tipAt(r.left, r.top); });
        mark.addEventListener("blur", hideTip);
        const yr = YEARS[p.i], lastP = p === P[P.length - 1];
        const L = P[P.length - 1], far = Math.hypot(sx(L.xv) - cx, sy(L.yv) - cy) > 28; // keep clear of the end label
        if (opts.allYears) {
          // every year labelled, short form; a label that would sit on an earlier one is left out
          const lx = cx + 6, ly = cy - 5;
          s._lbl = s._lbl || [];
          if (lastP || !s._lbl.some(([qx, qy]) => Math.abs(qx - lx) < 24 && Math.abs(qy - ly) < 11)) {
            const t = el("text", { x: lx, y: ly, class: lastP ? "pt-yr end" : "pt-yr" }, svg);
            t.textContent = lastP || p === P[0] ? String(yr) : `’${String(yr).slice(2)}`;
            s._lbl.push([lx, ly]);
          }
          continue;
        }
        if (p === P[0] || (yr === 2022 && far) || lastP) {
          // the end label goes to the left when another point of the line sits just to its right
          const lblW = (lastP ? `${s.label}, ${yr}` : String(yr)).length * 6.6;
          const left = lastP && (cx + 7 + lblW > W || P.some((q) => q !== p && sx(q.xv) > cx && sx(q.xv) - cx < 110 && Math.abs(sy(q.yv) - cy) < 12));
          const t = el("text", { x: cx + (left ? -7 : 7), y: cy + (lastP ? 4 : yr === 2022 ? -6 : 13), "text-anchor": left ? "end" : "start", class: lastP ? "pt-yr end" : "pt-yr" }, svg);
          t.textContent = lastP ? `${s.label}, ${yr}` : String(yr);
        }
      }
    }
    container.replaceChildren(svg);
  }

  // ---------- mirror check ----------
  function mirror() {
    const data = {};
    for (const c of D.countries) {
      const eu = series("eu", c), mi = series("mi", c);
      const ratio = YEARS.map((_, i) => (eu[i] && mi[i] != null ? (100 * mi[i]) / eu[i] : null));
      // Pre-war ratio: sum over the baseline years that have both values.
      const pick = state.baseline === "avg" ? D.baselineYears : [2021];
      let se = 0, sm = 0, used = [];
      for (const y of pick) {
        const i = YEARS.indexOf(y);
        if (eu[i] && mi[i] != null) { se += eu[i]; sm += mi[i]; used.push(y); }
      }
      const pre = se ? (100 * sm) / se : null;
      data[c] = {
        eu, mi, ratio, pre, used,
        gap: YEARS.map((_, i) => (eu[i] != null && mi[i] != null ? eu[i] - mi[i] : null)),
        excess: YEARS.map((_, i) => (pre != null && ratio[i] != null ? (eu[i] * (pre - ratio[i])) / 100 : null)),
      };
    }
    const s = D.countries.map((c) => {
      const r = data[c].ratio;
      let lo = -1;
      r.forEach((v, i) => { if (v != null && YEARS[i] >= 2022 && (lo < 0 || v < r[lo])) lo = i; });
      return {
        label: c, endName: c, color: FLOW.eu.color, marker: COUNTRY[c].marker, dash: COUNTRY[c].dash, tint: COUNTRY[c].marker === "square" ? 0.5 : null, values: r, gapNote: "no data",
        // the lowest point since 2022; not in the last year, where the end label already gives the value
        labels: lo >= 0 && lo !== YEARS.length - 1 ? [{ i: lo, text: `${Math.round(r[lo])}% in ${YEARS[lo]}`, below: true }] : [],
      };
    });
    const legendEl = document.getElementById("mirror-legend");
    legendEl.replaceChildren();
    // Small multiples by country: one panel answers "did both suppliers' goods vanish here?"
    const CN = chinaMirror() || {};
    const grid = document.getElementById("mirror-chart");
    const all = D.countries.flatMap((c) => [...data[c].ratio, ...((CN[c] || {}).ratio || []), data[c].pre, (CN[c] || {}).pre]).filter((v) => v != null);
    const ymax = Math.min(Math.max(...all, 100), 220);
    grid.replaceChildren(...D.countries.map((c) => h("figure", {}, [h("figcaption", { text: c }), h("div", { class: "chart sm" })])));
    D.countries.forEach((c, k) => {
      const lo = s[k].labels;
      const cn = CN[c];
      const close = cn && cn.pre != null && data[c].pre != null && Math.abs(cn.pre - data[c].pre) < 14;
      lineChart(grid.children[k].querySelector(".chart"), {
        series: [
          { label: "EU", endName: "EU", color: FLOW.eu.color, values: data[c].ratio, gapNote: "no data", labels: lo },
          ...(cn ? [{ label: "China", endName: "China", color: "--text-primary", marker: "square", values: cn.ratio }] : []),
        ],
        fmt: fmtPct, tickFmt: (t) => t + "%", baseline: 100, endNames: true, ymax, gapAtFoot: true,
        refs: [
          { value: data[c].pre, color: FLOW.eu.color, opacity: 0.6, label: data[c].pre == null ? "" : `EU pre-war ${fmtPct(data[c].pre)}`, below: close && data[c].pre < cn.pre },
          ...(cn ? [{ value: cn.pre, color: "--text-primary", opacity: 0.5, label: cn.pre == null ? "" : `China pre-war ${fmtPct(cn.pre)}`, below: close && cn.pre < data[c].pre }] : []),
        ],
        aria: `${c}: imports on record as a share of the EU's and China's exports to it, percent`,
      });
    });

    {
      let best = null;
      for (const c of D.countries) {
        const d = data[c];
        d.ratio.forEach((v, i) => {
          // In proportion to the country's own pre-war ratio: pre-war levels differ (61% to 136%).
          if (v != null && d.pre && YEARS[i] >= 2022 && (!best || 1 - v / d.pre > best.rel)) best = { c, i, v, drop: d.pre - v, rel: 1 - v / d.pre };
        });
      }
      const lv = best ? data[best.c].ratio[YEARS.length - 1] : null;
      const after = lv == null || best.i === YEARS.length - 1 ? ""
        : lv >= data[best.c].pre ? `; by ${YEARS[YEARS.length - 1]} the gap had closed`
        : lv > best.v ? `; the gap has since narrowed` : "";
      document.getElementById("mirror-h").textContent = best && best.drop > 5
        ? (best.v <= 95
          ? `In ${YEARS[best.i]}, ${shareW(1 - best.v / 100)} of what the EU shipped to ${best.c} never showed up in its import records${after}`
          : `In ${YEARS[best.i]}, EU shipments to ${best.c} went missing from its import records on a scale not seen before the war${after}`)
        : "What the EU ships shows up in the importers' records";
    }
    // Summary: the year with the largest excess gap for each country.
    const parts = D.countries.map((c) => {
      const d = data[c];
      let bi = -1;
      d.excess.forEach((v, i) => { if (v != null && (bi < 0 || v > d.excess[bi])) bi = i; });
      if (bi < 0 || d.pre == null) return `${c}: too little data for this selection.`;
      const yr = YEARS[bi];
      return `${c}, ${yr}: imports on record equal ${fmtPct(d.ratio[bi])} of EU exports, against ${fmtPct(d.pre)} before the war (${d.used.length > 1 ? `${d.used[0]}–${String(d.used[d.used.length - 1]).slice(2)}` : d.used[0]}). ` +
        (d.gap[bi] >= 0
          ? `Of the ${fmtMoney(d.gap[bi])} gap, ${fmtMoney(Math.max(0, d.excess[bi]))} goes beyond the pre-war level.`
          : `The books show ${fmtMoney(-d.gap[bi])} more than the EU exported, yet ${fmtMoney(Math.max(0, d.excess[bi]))} less than the pre-war ratio would predict.`) +
        (bi !== YEARS.length - 1 && d.ratio[YEARS.length - 1] != null
          ? ` In ${YEARS[YEARS.length - 1]}: ${fmtPct(d.ratio[YEARS.length - 1])}, ${d.excess[YEARS.length - 1] > 0 ? `with ${fmtMoney(d.excess[YEARS.length - 1])} beyond the pre-war level` : "and no gap beyond the pre-war level"}.` : "");
    });
    const sum = document.getElementById("mirror-summary");
    const ly = YEARS.length - 1;
    const pctCell = (v, p) => (v == null ? "—" : `${fmtPct(v)}${p != null ? ` (pre-war ${fmtPct(p)})` : ""}`);
    const rowsT = D.countries.map((c) => {
      const d = data[c], cn = CN[c];
      let bi = -1;
      d.excess.forEach((v, i) => { if (v != null && (bi < 0 || v > d.excess[bi])) bi = i; });
      return h("tr", {}, [
        h("th", { scope: "row", text: c }),
        h("td", { text: bi < 0 ? "—" : String(YEARS[bi]) }),
        h("td", { text: bi < 0 ? "—" : pctCell(d.ratio[bi], d.pre) }),
        h("td", { class: "chg", text: bi < 0 ? "—" : fmtMoney(Math.max(0, d.excess[bi])) }),
        h("td", { text: pctCell(d.ratio[ly], null) }),
        h("td", { text: cn ? pctCell(cn.ratio[ly], cn.pre) : "—" }),
        h("td", { class: "chg", text: cn && cn.excess[ly] != null ? `$${fmtM(cn.excess[ly])}M` : "—" }),
      ]);
    });
    sum.replaceChildren(
      h("thead", {}, [
        h("tr", {}, [h("th", { text: "" }), h("th", { colspan: 4, text: `From the EU (${basketLabel().toLowerCase()})` }), h("th", { colspan: 2, text: "From China (all 49 codes)" })]),
        h("tr", {}, ["", "Worst year", "Recorded share", "Missing beyond pre-war", String(YEARS[ly]), `${YEARS[ly]} share`, "Missing beyond pre-war"].map((t) => h("th", { text: t }))),
      ]),
      h("tbody", {}, rowsT),
    );
    void parts;

    const head = ["Year"];
    for (const c of D.countries) head.push(`${c}: EU exports`, `${c}: recorded imports`, `${c}: ratio`, `${c}: excess gap`);
    table(document.getElementById("mirror-table"), head, YEARS.map((yr, i) => {
      const row = [String(yr)];
      for (const c of D.countries) {
        const d = data[c];
        row.push(fmtM(d.eu[i]), fmtM(d.mi[i]), fmtPct(d.ratio[i]), d.excess[i] == null ? "—" : fmtM(d.excess[i]));
      }
      return row;
    }));
  }

  // ---------- tier small multiples ----------
  function tiers() {
    const c = state.tiersCountry;
    const grid = document.getElementById("tiers-grid");
    const keys = Object.keys(TIER_NAMES);
    const panels = keys.map((t) => {
      const eu = series("eu", c, t), ru = series("ru", c, t);
      const be = usableBase(eu), br = usableBase(ru);
      return {
        t, eu, ru,
        xeu: eu.map((v) => (v == null || !be ? null : v / be)),
        xru: ru.map((v) => (v == null || !br ? null : v / br)),
      };
    });
    const all = panels.flatMap((p) => [...p.xeu, ...p.xru]).filter((v) => v > 0);
    const dom = [Math.min(...all, 1) * 0.8, Math.max(...all, 1) * 1.15];
    const last = YEARS.length - 1, ly = YEARS[last];
    grid.replaceChildren(...panels.map((p) => {
      const [name, what] = TIER_NAMES[p.t].split(": ");
      const box = h("div", { class: "chart sm" });
      const fig = h("figure", {}, [
        h("figcaption", {}, [`${name}, ${what}`,
          h("span", { text: `${ly}: ${fmtMoney(p.eu[last])} from the EU, ${fmtMoney(p.ru[last])} to Russia` })]),
        box,
        // under the chart, so that every panel's plot starts at the same height
        ...[["eu", "From the EU"], ["ru", "To Russia"]].filter(([k]) => p[`x${k}`].every((v) => v == null) && p[k].some((v) => v != null))
          .map(([k, w]) => h("p", { class: "panel-note", text: `${w}: no line, ${smallBaseNote(p[k])}.` })),
      ]);
      fig.dataset.tier = p.t;
      return fig;
    }));
    const xt = (t) => `×${t < 1 ? t : t.toLocaleString("en-US")}`;
    panels.forEach((p, i) => {
      lineChart(grid.children[i].querySelector(".chart"), {
        series: [
          { label: `from the EU`, endName: "from the EU", color: FLOW.eu.color, values: p.xeu },
          { label: `to Russia`, endName: "to Russia", color: FLOW.ru.color, values: p.xru },
        ],
        fmt: fmtX, tickFmt: xt, log: true, baseline: 1, domain: dom, endNames: true,
        aria: `${TIER_NAMES[p.t]}, ${c}: EU exports and exports to Russia as multiples of the ${baseLabel()}`,
      });
    });
    document.getElementById("tiers-legend").replaceChildren();
    // Finding: which tier grew most on the Russia leg (only tiers with a pre-war base large enough to divide by).
    const ranked = panels.filter((p) => p.xru[last] != null).sort((a, b) => b.xru[last] - a.xru[last]);
    let named = [];
    {
      const bySize = panels.filter((p) => p.ru[last] != null).sort((a, b) => b.ru[last] - a.ru[last]);
      const what = (p) => TIER_NAMES[p.t].split(": ")[1];
      const cap = (t) => t.replace(/^./, (x) => x.toUpperCase());
      let head = "Tier by tier";
      if (bySize.length && ranked.length) {
        const big = bySize[0], fast = ranked[0];
        // Short label for the headline: the tier and the first item of its contents (the full names are in the text under it).
        const tl = (p) => `${TIER_NAMES[p.t].split(": ")[0].replace("Tier", "tier")} (${what(p).split(",")[0]})`;
        // Growth leads; the largest tier is named with its own multiple, so its size does not read as growth.
        head = big === fast
          ? `${capW(TIER_NOUN[fast.t])} are ${c}'s biggest and fastest-growing line to Russia: sales ${grew(fast.xru[last])}`
          : `${capW(TIER_NOUN[fast.t])} sold from ${c} to Russia ${grew(fast.xru[last])}, while ${TIER_NOUN[big.t]}, the biggest line, ` +
            (big.xru[last] == null ? "were too small before the war to compare" : grew(big.xru[last]));
        named = [big, fast];
      }
      document.getElementById("tiers-h").textContent = head;
    }
    {
      const cap = (t) => t.replace(/^./, (x) => x.toUpperCase());
      const full = (p) => `${TIER_NOUN[p.t]} (${TIER_NAMES[p.t].split(": ")[0].replace("Tier", "tier")})`;
      const rest = ranked.filter((p) => !named.includes(p)).map((p) => `${full(p)} ${grew(p.xru[last])}`);
      const small = panels.length - ranked.length;
      document.getElementById("tiers-sub").textContent = ranked.length
        ? (rest.length ? `Over the same years, ` + rest.join(", ").replace(/, ([^,]*)$/, " and $1") + "." : "") +
          (small ? ` ${small === 1 ? "One tier" : `${cap(NUMW[small])} tiers`} sold too little before the war, under ${cur()}${MIN_BASE}M a year, to compare.` : "")
        : "Too little data for this country.";
    }
  }

  // ---------- suppliers: the EU and China ----------
  function supplierStudy() {
    const SP = D.suppliers, meta = SP.meta;
    const missing = new Set(meta.missing);
    const basket = new Set(D.chpl.map((r) => r.hs6).filter((c) => inBasket(c, state.basket)));
    const ser = (sup, dest) => {
      const sum = Object.fromEntries(YEARS.map((y) => [y, 0]));
      for (const r of SP.rows) if (r[0] === sup && r[1] === dest && basket.has(r[3]) && r[4] != null) sum[r[2]] += r[4];
      return YEARS.map((y) => (missing.has(`${sup}|${dest}|${y}`) ? null : conv(sum[y], y)));
    };
    const dests = Object.keys(meta.destinations).filter((d) => d !== "RU"); // the detour only
    const rows = dests.map((d) => ({ d, name: meta.destinations[d], eu: ser("eu", d), cn: ser("cn", d), hk: ser("hk", d), ru: series("ru", meta.destinations[d]) }));
    const ly = YEARS.length - 1, yr = YEARS[ly];

    // Heading and finding, from the data (they follow the filters).
    const route = rows;
    const both = route.filter((r) => r.eu[ly] != null && r.cn[ly] != null);
    const sumEU = both.reduce((t, r) => t + r.eu[ly], 0), sumCN = both.reduce((t, r) => t + r.cn[ly], 0);
    const ratio = sumEU ? sumCN / sumEU : null;
    document.getElementById("sup-h").textContent = ratio == null ? "The EU and China as suppliers"
      : ratio >= 1 ? "China, not Europe, is the bigger supplier" : "Europe, not China, is the bigger supplier";
    const more = route.filter((r) => r.eu[ly] != null && r.cn[ly] != null && r.eu[ly] > r.cn[ly]).map((r) => r.name);
    document.getElementById("sup-sub").textContent =
      // one or two figures a sentence; the rest is in the panels and "Show the numbers"
      `In ${yr}, China shipped ${fmtMoney(sumCN)} of these goods to ${both.map((r) => r.name).join(", ").replace(/, ([^,]*)$/, " and $1")}` +
      (ratio ? `, ${ratio >= 1.9 ? `about ${Math.round(ratio) <= 12 ? NUMW[Math.round(ratio)] : Math.round(ratio)} times as much as the EU` : ratio >= 1 ? "more than the EU" : "less than the EU"}. ` : ". ") +
      (more.length ? `${more.join(" and ")} ${more.length > 1 ? "are the exceptions, where" : "is the exception, where"} the EU ships more. ` : "") +
      (() => {
        // Hong Kong: its largest year to one country, if it shipped more than China that year.
        let best = null;
        for (const r of route) r.hk.forEach((v, i) => { if (v != null && r.cn[i] != null && v > r.cn[i] && (!best || v > best.v)) best = { r, i, v }; });
        return best ? `In ${YEARS[best.i]}, Hong Kong, which mostly re-exports Chinese goods, sent ${best.r.name} more than China did${best.r.hk[ly] != null && best.r.hk[ly] < best.v / 10 ? "; by " + yr + " that flow had almost stopped" : ""}.` : "";
      })();

    const grid = document.getElementById("sup-grid");
    // Small multiples on one shared log scale: the same height is the same money in every panel, and the
    // gap between the two lines is the China/EU ratio, readable for small and large countries alike.
    const pos = rows.flatMap((r) => [...r.eu, ...r.cn, ...r.hk, ...r.ru]).filter((v) => v != null && v > 0);
    const dom = [Math.min(...pos) * 0.8, Math.max(...pos) * 1.25];
    const tkf = (t) => (t >= 1000 ? `${t / 1000}bn` : t >= 1 ? `${t}M` : `${Math.round(t * 1000)}k`);
    grid.replaceChildren(...rows.map((r) => h("figure", { class: "sup-cell" }, [
      h("figcaption", { text: r.name }),
      h("div", { class: "chart sm" }),
    ])));
    rows.forEach((r, i) => lineChart(grid.children[i].querySelector(".chart"), {
      series: [
        { label: `EU exports to ${r.name}`, endName: "from the EU", color: "--flow-eu", values: r.eu },
        { label: `China's exports to ${r.name}`, endName: "from China", color: "--text-primary", values: r.cn, marker: "square", gapNote: "no Chinese data" },
        { label: `Hong Kong's exports to ${r.name}`, endName: "from Hong Kong", color: "--text-primary", values: r.hk, tint: 0.45 },
        { label: `${r.name}'s exports to Russia`, endName: "to Russia", color: "--flow-ru", values: r.ru },
      ],
      fmt: fmtMoney, endNames: true, log: true, domain: dom, gapAtFoot: true, tickFmt: tkf,
      tickFilter: isPow10, // powers of ten only ($1M, 10M, 100M, 1bn): fewer labels than data points
      topTickFmt: (t) => `${cur()}${t >= 1000 ? `${t / 1000}bn` : `${t}M`}`,
      aria: `${r.name}: exports of the listed goods from the EU, from China and from Hong Kong, ${state.currency} million`,
    }));

    table(document.getElementById("sup-table"), ["Destination", "Supplier", ...YEARS.map(String)],
      rows.flatMap((r) => [[r.name, "EU", ...r.eu.map(fmtM)], [r.name, "China", ...r.cn.map(fmtM)], [r.name, "Hong Kong", ...r.hk.map(fmtM)], [r.name, "To Russia", ...r.ru.map(fmtM)]]));
  }

  // ---------- sparkline: one row's values on its own scale ----------
  function sparkline(values, opts = {}) {
    const W = opts.w || 168, H = opts.h || 30, n = values.length;
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "spark", "aria-hidden": "true" });
    const vals = values.filter((v) => v != null);
    const max = opts.max != null ? Math.max(opts.max, 1e-9) : Math.max(...vals, 1e-9);
    const col = css(opts.color || "--text-primary");
    const bw = W / n;
    const y = (v) => H - 2 - (v / max) * (H - 5);
    if (opts.kind === "line") {
      let d = "", pen = false;
      values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${(i + 0.5) * bw},${y(v).toFixed(1)}`; pen = true; });
      el("path", { d, fill: "none", stroke: col, "stroke-width": 1.5, "stroke-linejoin": "round" }, svg);
      const li = values.length - 1;
      if (values[li] != null) el("circle", { cx: (li + 0.5) * bw, cy: y(values[li]), r: 2.2, fill: col }, svg);
    } else {
      values.forEach((v, i) => {
        if (v == null) { el("line", { x1: i * bw + 1, x2: (i + 1) * bw - 1, y1: H - 1, y2: H - 1, stroke: css("--text-muted"), "stroke-dasharray": "1 1.5" }, svg); return; }
        const lit = opts.lit ? opts.lit(i) : true;
        el("rect", { x: i * bw + 0.5, y: y(v), width: Math.max(bw - 1, 0.8), height: H - 2 - y(v), fill: col, "fill-opacity": lit ? 0.95 : 0.3 }, svg);
      });
    }
    if (opts.mark != null) {
      const mx = (opts.mark + 0.73) * bw;
      el("line", { x1: mx, x2: mx, y1: 0, y2: H, stroke: css("--text-primary"), "stroke-width": 1 }, svg);
    }
    el("line", { x1: 0, x2: W, y1: H - 1.5, y2: H - 1.5, stroke: css("--axis"), "stroke-width": 0.75 }, svg);
    return svg;
  }

  // ---------- listed goods as a share of all trade ----------
  function controlStudy() {
    const C = D.control, meta = C.meta;
    const missing = new Set(meta.missing);
    const basket = new Set(D.chpl.map((r) => r.hs6).filter((c) => inBasket(c, state.basket)));
    const ser = (flow, dest, kind) => {
      const sum = Object.fromEntries(YEARS.map((y) => [y, 0]));
      const seen = new Set();
      for (const r of C.rows) {
        if (r[0] !== flow || r[1] !== dest || r[3] !== kind || r[5] == null) continue;
        if (kind === "listed" && !basket.has(r[4])) continue;
        sum[r[2]] += r[5];
        seen.add(r[2]);
      }
      return YEARS.map((y) => (missing.has(`${flow}|${dest}|${y}`) || (kind === "total" && !seen.has(y)) ? null : sum[y]));
    };
    const rows = Object.keys(meta.destinations).map((d) => {
      const info = meta.destinations[d];
      const leg = (flow) => {
        if (flow === "ru" && !info.russia) return null;
        const L = ser(flow, d, "listed"), T = ser(flow, d, "total");
        const share = YEARS.map((_, i) => (L[i] == null || !T[i] ? null : (100 * L[i]) / T[i]));
        const pick = state.baseline === "avg" ? D.baselineYears : [2021];
        let sl = 0, st = 0;
        for (const y of pick) { const i = YEARS.indexOf(y); if (L[i] != null && T[i]) { sl += L[i]; st += T[i]; } }
        return { listed: L, total: T, share, pre: st ? (100 * sl) / st : null };
      };
      return { d, info, eu: leg("eu"), ru: leg("ru") };
    });
    {
      const routeRows = rows.filter((r) => r.info.group === "route");
      const ly = YEARS.length - 1;
      const up = (key) => routeRows.filter((r) => r[key] && r[key].pre != null && r[key].share[ly] != null && r[key].share[ly] > r[key].pre * 1.1).map((r) => r.info.name);
      const ue = up("eu"), ur = up("ru");
      const list = (a) => a.join(", ").replace(/, ([^,]*)$/, " and $1");
      document.getElementById("ctl-h").textContent =
        ur.length > ue.length
          ? `Battlefield goods took a bigger share of ${list(ur.map((n) => `${n}'s`))} trade with Russia, but not of ${ur.length > 1 ? "their" : "its"} trade with the EU`
          : ue.length
            ? `Battlefield goods took a bigger share of EU sales to ${list(ue)}`
            : "Battlefield goods kept pace with trade overall";
    }
    // One supertable for every country, route and comparison alike: one sparkline a leg, all on one
    // scale (the same height is the same share), with the pre-war and latest shares as numbers.
    const ly = YEARS.length - 1;
    const pf = (v) => (v == null ? "—" : `${v < 10 ? v.toFixed(1) : Math.round(v)}%`);
    const shared = Math.max(...rows.flatMap((r) => [...(r.eu ? r.eu.share : []), ...(r.ru ? r.ru.share : [])]).filter((v) => v != null), 0.1);
    const lastNonNull = (v) => { for (let i = v.length - 1; i >= 0; i--) if (v[i] != null) return [v[i], YEARS[i]]; return [null, null]; };
    const legCells = (l, flowKey) => {
      if (!l) return [h("td", { class: "spark-cell" }), h("td", { text: "" }), h("td", { text: "" })];
      const [v, y] = lastNonNull(l.share);
      const hasLine = l.share.some((q) => q != null);
      return [
        h("td", { class: "spark-cell" }, hasLine ? sparkline(l.share, { kind: "line", color: FLOW[flowKey].color, w: 150, h: 30, max: shared }) : null),
        h("td", { text: pf(l.pre) }),
        h("td", { class: "chg", text: v == null ? "no data" : y === YEARS[ly] ? pf(v) : `${pf(v)} (${y})` }),
      ];
    };
    const tr = (r) => h("tr", {}, [h("th", { scope: "row", text: r.info.name }), ...legCells(r.eu, "eu"), ...legCells(r.ru, "ru")]);
    const route = rows.filter((r) => r.info.group === "route"), comp = rows.filter((r) => r.info.group !== "route");
    const head = h("thead", {}, [
      h("tr", {}, [h("th", { text: "" }), h("th", { colspan: 3, text: "From the EU" }), h("th", { colspan: 3, text: "To Russia" })]),
      h("tr", {}, ["", "2019–2025, one scale", baseLabel(), String(YEARS[ly]), "2019–2025, one scale", baseLabel(), String(YEARS[ly])].map((t) => h("th", { text: t }))),
    ]);
    const group = (t) => h("tr", { class: "group" }, h("th", { colspan: 7, scope: "rowgroup", text: t }));
    document.getElementById("ctl-grid").replaceChildren(h("div", { class: "table-wrap" }, h("table", { class: "supertable ctl-table" }, [head, h("tbody", {}, [
      group("Route countries"), ...route.map(tr), group("Comparison countries"), ...comp.map(tr),
    ])])));
  }


  // ---------- excess growth: listed goods against the other goods of the same chapters ----------
  // Dot plot for the excess-growth results: one row a group and control, two panels (EU, Russia), a log
  // axis around ×1. Filled dot: all codes; hollow: without bearings.
  function excessDots(box, R) {
    if (!box) return;
    const W = box.clientWidth;
    if (W < 200) return;
    const small = W < 600;
    // Group names sit on their own line above the group's rows, so long names never run into the labels.
    const LW = small ? 112 : 220, rowH = 24, headH = 20, gap = 28;
    const pw = small ? W - LW : (W - LW - gap) / 2;
    const ys = [];
    let y = 22;
    R.forEach((r, i) => { if (i === 0 || r.name !== R[i - 1].name) y += headH; ys.push(y + rowH / 2); y += rowH; });
    const blockH = y + 22;
    const H = small ? blockH * 2 : blockH;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "exc-dots", role: "img", "aria-label": "Excess growth, dot plot" });
    const vals = R.flatMap((r) => [...r.eu, ...r.ru]).filter((v) => v > 0);
    const lo = Math.min(0.25, ...vals) * 0.85, hi = Math.max(4, ...vals) * 1.15;
    const ink = css("--text-primary"), grid = css("--grid"), axis = css("--axis");
    const labels = (dy) => R.forEach((r, i) => {
      if (i === 0 || r.name !== R[i - 1].name) {
        const g = el("text", { x: 0, y: dy + ys[i] - rowH / 2 - 6, class: "exc-dot-l" }, svg);
        g.textContent = r.name;
      }
      const c2 = el("text", { x: 10, y: dy + ys[i] + 4, class: "exc-dot-c" }, svg);
      c2.textContent = small ? r.ctrl.replace("against same HS4 headings", "same headings").replace("against same chapters", "same chapters") : r.ctrl;
    });
    const panel = (key, x0, dy, title) => {
      const sx = (v) => x0 + ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (pw - 34);
      const t = el("text", { x: x0, y: dy + 12, class: "exc-dot-h" }, svg); t.textContent = title;
      const yb = dy + ys[ys.length - 1] + rowH / 2;
      for (const tk of [0.25, 0.5, 1, 2, 4].filter((q) => q >= lo && q <= hi)) {
        el("line", { x1: sx(tk), x2: sx(tk), y1: dy + 20, y2: yb, stroke: tk === 1 ? axis : grid, "stroke-width": tk === 1 ? 1.25 : 1 }, svg);
        const l = el("text", { x: sx(tk), y: yb + 14, "text-anchor": "middle", class: "exc-dot-t" }, svg); l.textContent = `×${tk}`;
      }
      R.forEach((r, i) => {
        const cy = dy + ys[i];
        const [a, b] = r[key];
        if (a == null && b == null) { const n = el("text", { x: x0, y: cy + 4, class: "exc-dot-t" }, svg); n.textContent = "too small"; return; }
        if (a != null && b != null) el("line", { x1: sx(a), x2: sx(b), y1: cy, y2: cy, stroke: ink, "stroke-opacity": 0.35 }, svg);
        if (b != null) el("circle", { cx: sx(b), cy, r: 4.5, fill: css("--surface-1"), stroke: ink, "stroke-width": 1.5 }, svg);
        if (a != null) el("circle", { cx: sx(a), cy, r: 4.5, fill: ink }, svg);
        const right = a != null && (b == null || a >= b);
        const lab = el("text", { x: sx(a ?? b) + (right ? 9 : -9), y: cy + 4, "text-anchor": right ? "start" : "end", class: "exc-dot-v" }, svg);
        lab.textContent = a != null ? fmtX(a) : "";
      });
    };
    labels(0);
    panel("eu", LW, 0, "From the EU");
    if (small) { labels(blockH); panel("ru", LW, blockH, "To Russia"); }
    else panel("ru", LW + pw + gap, 0, "To Russia");
    box.replaceChildren(svg);
  }

  function excessStudy() {
    const E = D.excess, meta = E.meta, miss = new Set(meta.missing);
    const val = {};
    for (const r of E.rows) val[`${r[0]}|${r[1]}|${r[3]}|${r[2]}`] = r[4];
    const ser = (flow, dest, k) => YEARS.map((y) => (miss.has(`${flow}|${dest}|${y}`) ? null : val[`${flow}|${dest}|${k}|${y}`] ?? null));
    const idx = (v) => { const b = baseOf(v); return v.map((x) => (x == null || b == null || b < MIN_BASE ? null : x / b)); };
    const ROUTE = ["KZ", "KG", "UZ"].filter((c) => meta.countries[c]), COMP = ["GE", "AZ", "MN"].filter((c) => meta.countries[c]);
    const name = (c) => meta.countries[c].name;
    const after = YEARS.filter((y) => y >= 2022);
    // A leg is "too small" when the listed goods are under MIN_BASE a year before or after the war.
    const avgOf = (v, ys) => { const a = ys.map((y) => v[YEARS.indexOf(y)]).filter((x) => x != null); return a.length ? a.reduce((p, q) => p + q, 0) / a.length : null; };
    const tooSmall = (flow, c) => { const L = ser(flow, c, "listed"); const b = baseOf(L), a = avgOf(L, after); return b == null || b < MIN_BASE || a == null || a < MIN_BASE; };
    // Countries of a group added together; only years that all of them report.
    const pooled = (flow, cs, listed, other) => {
      const sum = (k) => YEARS.map((_, i) => { let t = 0; for (const c of cs) { const v = ser(flow, c, k)[i]; if (v == null) return null; t += v; } return t; });
      const L = sum(listed), O = sum(other);
      const bl = baseOf(L), bo = baseOf(O), al = avgOf(L, after), ao = avgOf(O, after);
      return bl && bo && al != null && ao && bl >= MIN_BASE ? (al / bl) / (ao / bo) : null;
    };
    const eaeu = ROUTE.filter((c) => meta.countries[c].eaeu), out = ROUTE.filter((c) => !meta.countries[c].eaeu);
    const list = (a) => a.map(name).join(", ").replace(/, ([^,]*)$/, " and $1");
    {
      const a = pooled("ru", eaeu, "listed", "other_ch"), b = pooled("ru", eaeu, "listed_nb", "other_ch");
      const c = pooled("ru", out, "listed", "other_ch"), d = pooled("ru", out, "listed_nb", "other_ch");
      const word = (v) => (v >= 1.1 ? "faster" : v <= 0.9 ? "slower" : "at the same rate");
      const than = (v) => (word(v) === "at the same rate" ? "at the same rate as" : `${word(v)} than`);
      const wa = a == null ? null : word(a), wb = b == null ? null : word(b);
      document.getElementById("exc-h").textContent = wa == null || wb == null ? "Battlefield goods against their closest relatives"
        : wa === wb ? (wa === "faster" ? "Battlefield goods outgrew other machinery on the way to Russia"
          : wa === "slower" ? "Battlefield goods lagged behind other machinery on the way to Russia"
          : "Battlefield goods grew in step with other machinery on the way to Russia")
        : wa === "slower" && wb === "faster" ? "Strip out bearings, and battlefield goods outgrew other machinery on the way to Russia"
        : wa === "faster" && wb === "slower" ? "Bearings drove the growth; without them, battlefield goods lagged behind other machinery"
        : `Battlefield goods grew ${than(a)} other machinery on the way to Russia; without bearings, ${wb}`;
      document.getElementById("exc-sub").textContent = a == null ? "" :
        `${list(eaeu)} ${eaeu.length > 1 ? "sit" : "sits"} inside the EAEU customs union, with no checks on the Russian border. Since the invasion, the battlefield goods ${eaeu.length > 1 ? "they" : "it"} sent to Russia grew ${pace(a)} other machines and electronics. ` +
        `Take out bearings and they grew ${pace(b)} the rest.` +
        (c != null ? ` In ${list(out)}, outside the union, they grew ${pace(c)} the rest` + (pace(c) === pace(d) ? ", with or without bearings." : `; without bearings, ${pace(d).replace(/ (as|than)$/, "")}.`) : "");
    }
    // One log scale for every chart in the grid.
    const all = [];
    const cells = {};
    for (const c of [...ROUTE, ...COMP]) for (const f of ["eu", "ru"]) {
      if (tooSmall(f, c) && f === "ru") continue;
      const [L, Lnb, O] = ["listed", "listed_nb", "other_ch"].map((k) => idx(ser(f, c, k)));
      const rel = (a) => a.map((v, i) => (v == null || O[i] == null || !O[i] ? null : v / O[i]));
      cells[`${f}|${c}`] = [rel(L), rel(Lnb)];
      all.push(...cells[`${f}|${c}`].flat().filter((v) => v > 0));
    }
    const dom = [Math.min(...all, 1) * 0.8, Math.max(...all, 1) * 1.15];
    const grid = document.getElementById("exc-grid");
    const kids = [];
    for (const c of [...ROUTE, ...COMP]) {
      if (c === COMP[0]) kids.push(h("h3", { class: "ctl-group", text: "Comparison countries, outside the EAEU" }));
      const ru = cells[`ru|${c}`]
        ? h("div", { class: "chart sm" })
        : h("p", { class: "exc-small", text: `Too small to compare: listed goods were ${fmtMoney(baseOf(ser("ru", c, "listed")) || 0)} a year before the war and ${fmtMoney(avgOf(ser("ru", c, "listed"), after) || 0)} a year in 2022–25` });
      kids.push(h("div", { class: "ctl-row", "data-c": c }, [
        h("div", { class: "ctl-name", text: name(c) + (meta.countries[c].eaeu ? " (EAEU)" : "") }),
        h("figure", {}, [h("figcaption", { class: "mobile-only", text: "From the EU" }), h("div", { class: "chart sm" })]),
        h("figure", {}, [h("figcaption", { class: "mobile-only", text: "To Russia" }), ru]),
      ]));
    }
    grid.replaceChildren(...kids);
    const xt = (t) => `×${t < 1 ? t : t.toLocaleString("en-US")}`;
    for (const row of grid.querySelectorAll(".ctl-row")) {
      const c = row.dataset.c, charts = row.querySelectorAll(".chart");
      ["eu", "ru"].forEach((f, i) => {
        const s = cells[`${f}|${c}`];
        if (!s || !charts[i]) return;
        lineChart(charts[i], {
          series: [
            { label: "all battlefield codes", endName: "all codes", color: FLOW[f].color, values: s[0] },
            { label: "without bearings", endName: "no bearings", color: FLOW[f].color, values: s[1], tint: 0.45 },
          ],
          fmt: fmtX, tickFmt: xt, log: true, baseline: 1, domain: dom, endNames: true,
          tickFilter: isPow10,
          aria: `${name(c)}, ${f === "eu" ? "EU exports" : "exports to Russia"}: growth of battlefield goods divided by growth of other goods, ×1 = alike`,
        });
      });
    }
    // The table: each group, two control groups, four results.
    const cell = (f, cs, l, o) => {
      if (f === "ru" && cs.every((c) => tooSmall("ru", c))) return h("td", { text: "too small" });
      const v = pooled(f, cs.filter((c) => !(f === "ru" && tooSmall("ru", c))), l, o);
      return h("td", { class: "chg", text: v == null ? "—" : fmtX(v) });
    };
    const groups = [[`${list(eaeu)} (EAEU)`, eaeu], [`${list(out)} (not EAEU)`, out], [list(COMP), COMP]];
    const ctrls = [["other_ch", "Other goods, same chapters"], ["other_hs4", "Other goods, same HS4 headings"]];
    const head = h("thead", {}, [
      h("tr", {}, [h("th", { text: "" }), h("th", { text: "" }), h("th", { colspan: 2, text: "From the EU" }), h("th", { colspan: 2, text: "To Russia" })]),
      h("tr", {}, [h("th", { text: "" }), h("th", { text: "Control goods" }), ...["All codes", "Without bearings", "All codes", "Without bearings"].map((t) => h("th", { text: t }))]),
    ]);
    const body = [];
    for (const [gname, cs] of groups) {
      if (!cs.length) continue;
      ctrls.forEach(([k, label], j) => body.push(h("tr", {}, [
        j === 0 ? h("th", { scope: "rowgroup", rowspan: 2, text: gname }) : null,
        h("td", { class: "lbl", text: label }),
        cell("eu", cs, "listed", k), cell("eu", cs, "listed_nb", k), cell("ru", cs, "listed", k), cell("ru", cs, "listed_nb", k),
      ].filter(Boolean))));
    }
    document.getElementById("exc-table").replaceChildren(head, h("tbody", {}, body));
    {
      const val2 = (f, cs, l, o) => {
        if (f === "ru" && cs.every((c) => tooSmall("ru", c))) return null;
        return pooled(f, cs.filter((c) => !(f === "ru" && tooSmall("ru", c))), l, o);
      };
      const R = [];
      for (const [gname, cs] of groups) if (cs.length) for (const [k, label] of ctrls) {
        R.push({ name: gname, ctrl: label.replace("Other goods, ", "against "), eu: [val2("eu", cs, "listed", k), val2("eu", cs, "listed_nb", k)], ru: [val2("ru", cs, "listed", k), val2("ru", cs, "listed_nb", k)] });
      }
      excessDots(document.getElementById("exc-dots"), R);
    }
    document.getElementById("exc-note").textContent =
      `The table divides the growth of battlefield goods by the growth of the comparison goods, 2022–25 against the ${baseLabel()}; ×1 means they grew alike. ` +
      `Countries in a group are pooled, and since both sides are in one currency, prices and exchange rates cancel out. ` +
      `The same-heading comparison is closer, but goods can slip between codes within a heading. Sales to Russia come from the exporter's own records, so they are a floor.`;
  }



  // ---------- mirror check, China leg ----------
  function chinaMirror() {
    if (!D.mirrorCn) return null;
    const M = D.mirrorCn, miss = new Set(M.meta.missing), names = M.meta.countries;
    const val = (c, side, y) => {
      if (miss.has(`${side}|${c}|${y}`) || miss.has(`${side}-listed|${c}|${y}`)) return null;
      const r = M.rows.find((x) => x[0] === c && x[1] === y && x[2] === side);
      return r ? r[3] : null;
    };
    const pick = state.baseline === "avg" ? D.baselineYears : [2021];
    const out = {};
    for (const c of Object.keys(names)) {
      const cn = YEARS.map((y) => val(c, "cn", y)), imp = YEARS.map((y) => val(c, "imp", y));
      const ratio = YEARS.map((_, i) => (cn[i] && imp[i] != null ? (100 * imp[i]) / cn[i] : null));
      let sc = 0, si = 0;
      for (const y of pick) { const i = YEARS.indexOf(y); if (cn[i] && imp[i] != null) { sc += cn[i]; si += imp[i]; } }
      const pre = sc ? (100 * si) / sc : null;
      out[names[c]] = { cn, imp, ratio, pre, excess: YEARS.map((_, i) => (pre != null && ratio[i] != null ? Math.max(0, (cn[i] * (pre - ratio[i])) / 100) : null)) };
    }
    return out;
  }
  function mirrorChina() {
    // Always current US dollars: the currency and price filters do not apply here.
    const usdM = (v) => (v == null ? "no data" : v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}bn` : `$${fmtM(v)}M`);
    const M = D.mirrorCn, miss = new Set(M.meta.missing), names = M.meta.countries;
    const val = (c, side, k, y) => {
      if (miss.has(`${side}|${c}|${y}`) || (k === "listed" && miss.has(`${side}-listed|${c}|${y}`))) return null;
      const r = M.rows.find((x) => x[0] === c && x[1] === y && x[2] === side);
      return r ? r[k === "listed" ? 3 : 4] : null;
    };
    const order = ["KZ", "KG", "UZ"].filter((c) => names[c]);
    const style = { KZ: { marker: "circle" }, KG: { marker: "square", tint: 0.5 }, UZ: { marker: "triangle" } };
    const pick = state.baseline === "avg" ? D.baselineYears : [2021];
    const data = {};
    for (const c of order) {
      const cn = YEARS.map((y) => val(c, "cn", "listed", y)), imp = YEARS.map((y) => val(c, "imp", "listed", y));
      const ratio = YEARS.map((_, i) => (cn[i] && imp[i] != null ? (100 * imp[i]) / cn[i] : null));
      let sc = 0, si = 0; const used = [];
      for (const y of pick) { const i = YEARS.indexOf(y); if (cn[i] && imp[i] != null) { sc += cn[i]; si += imp[i]; used.push(y); } }
      const pre = sc ? (100 * si) / sc : null;
      data[c] = { cn, imp, ratio, pre, used, excess: YEARS.map((_, i) => (pre != null && ratio[i] != null ? Math.max(0, (cn[i] * (pre - ratio[i])) / 100) : null)) };
    }
    const ly = YEARS.length - 1, yr = YEARS[ly];
    {
      let best = null;
      for (const c of order) data[c].ratio.forEach((v, i) => {
        // The largest fall relative to the country's own pre-war ratio (pre-war levels differ a lot).
        if (v != null && data[c].pre && YEARS[i] >= 2022 && (!best || 1 - v / data[c].pre > best.drop)) best = { c, i, v, drop: 1 - v / data[c].pre };
      });
      document.getElementById("mcn-h").textContent = best && best.drop > 0.1
        ? `Chinese shipments went missing too: in ${YEARS[best.i]}, ${names[best.c]} recorded ${shareW(best.v / 100)} of what China says it sent, against ${shareW(data[best.c].pre / 100)} before the war`
        : "Checked against China";
    }
    void style; void usdM;
    const head = ["Year"];
    for (const c of order) head.push(`${names[c]}: China's exports`, `${names[c]}: recorded imports`, `${names[c]}: ratio`);
    table(document.getElementById("mcn-table"), head, YEARS.map((y, i) => [String(y), ...order.flatMap((c) => [
      data[c].cn[i] == null ? "no data" : usdM(data[c].cn[i]), data[c].imp[i] == null ? "no data" : usdM(data[c].imp[i]), data[c].ratio[i] == null ? "—" : fmtPct(data[c].ratio[i]),
    ])]));
  }


  // ---------- price per kg: EU, China, to Russia ----------
  function uvStudy() {
    const U = D.unitValues, yr = state.uvYear;
    const NAMES = { KZ: "Kazakhstan", KG: "Kyrgyzstan", UZ: "Uzbekistan" };
    const cell = {};
    for (const [leg, c, y, code, usd, kg, est] of U.rows) cell[`${leg}|${c}|${y}|${code}`] = { usd, kg, est, uv: usd / kg };
    const get = (leg, c, y, code) => cell[`${leg}|${c}|${y}|${code}`];
    const codesOf = (c, y) => [...new Set(U.rows.filter((r) => r[0] === "ru" && r[1] === c && r[2] === y).map((r) => r[3]))];
    const name = (code) => SHORT[code] || code;
    const fmtCode = (code) => `${code.slice(0, 4)}.${code.slice(4)}`;
    const uvf = (v) => (v == null ? "—" : v >= 100 ? `$${Math.round(v).toLocaleString("en-US")}` : `$${v.toFixed(v >= 10 ? 0 : 1)}`);
    const TOP = 6;
    // Rows: the largest codes to Russia with a weight, and an EU or China price to compare with.
    const blocks = ["KZ", "KG", "UZ"].map((c) => {
      const rows = codesOf(c, yr).map((code) => ({ code, ru: get("ru", c, yr, code), eu: get("eu", c, yr, code), cn: get("cn", c, yr, code) }))
        .filter((r) => r.ru && r.ru.usd >= 1e5 && (r.eu || r.cn) && !(c === "UZ" && r.ru.est))
        .sort((a, b) => b.ru.usd - a.ru.usd).slice(0, TOP);
      return { c, rows };
    }).filter((b) => b.rows.length);
    // Headline: for each country, the share of the value to Russia in codes priced nearer the EU than China.
    // China's price from China's own records ("cn"), or from the importer's records ("cm") as a check.
    const nearShare = (c, cnLeg) => {
      let e = 0, t = 0;
      for (const code of codesOf(c, yr)) {
        const r = get("ru", c, yr, code), eu = get("eu", c, yr, code), cn = get(cnLeg, c, yr, code);
        if (!r || !eu || !cn || r.est) continue;
        t += r.usd;
        if (Math.abs(Math.log(r.uv / eu.uv)) < Math.abs(Math.log(r.uv / cn.uv))) e += r.usd;
      }
      return t ? (100 * e) / t : null;
    };
    {
      const near = blocks.map(({ c }) => {
        let e = 0, t = 0;
        for (const code of codesOf(c, yr)) {
          const r = get("ru", c, yr, code), eu = get("eu", c, yr, code), cn = get("cn", c, yr, code);
          if (!r || !eu || !cn || r.est) continue;
          t += r.usd;
          if (Math.abs(Math.log(r.uv / eu.uv)) < Math.abs(Math.log(r.uv / cn.uv))) e += r.usd;
        }
        return { c, share: t ? (100 * e) / t : null };
      }).filter((x) => x.share != null && x.c !== "UZ");
      // Largest share first: "71% of Kyrgyzstan's ...; for Kazakhstan, 27%".
      near.sort((a, b) => b.share - a.share);
      document.getElementById("uv-h").textContent = near.length
        ? `${near[0].share >= 60 ? "Most" : near[0].share > 50 ? "More than half" : capW(shareW(near[0].share / 100))} of what ${NAMES[near[0].c]} sells Russia is priced like European goods` +
          near.slice(1).map((x) => `; in ${NAMES[x.c]}'s case, ${x.share >= 60 ? "most" : x.share > 50 ? "more than half" : shareW(x.share / 100)}`).join("")
        : "What a kilogram costs";
      const k = get("ru", "KG", yr, "851762"), ke = get("eu", "KG", yr, "851762"), kc = get("cn", "KG", yr, "851762");
      const z = get("ru", "KZ", yr, "851762"), ze = get("eu", "KZ", yr, "851762"), zc = get("cn", "KZ", yr, "851762");
      const check = near.map((x) => ({ c: x.c, a: x.share, b: nearShare(x.c, "cm") })).filter((x) => x.b != null);
      const side = (r, e, cn) => (Math.abs(Math.log(r.uv / e.uv)) < Math.abs(Math.log(r.uv / cn.uv)) ? "about the EU price" : "about the Chinese price");
      document.getElementById("uv-sub").textContent = (k && ke && kc && z && ze && zc
        ? `Routers and data transmitters (8517.62) are a clear case: in ${yr}, Kyrgyzstan sold them to Russia at ${side(k, ke, kc)}, Kazakhstan at ${side(z, ze, zc)}. `
        : "") + (check.length
          ? check.every((x) => Math.abs(x.b - x.a) < 5)
            ? "Taking China's prices from the importers' records instead of China's own barely changes these shares."
            : "Taking China's prices from the importers' records instead of China's own moves the shares to " + check.map((x) => `${Math.round(x.b)}% for ${NAMES[x.c]}`).join(" and ") + "."
          : "");
    }
    // One log scale for all rows.
    const all = blocks.flatMap((b) => b.rows.flatMap((r) => [r.ru, r.eu, r.cn].filter(Boolean).map((x) => x.uv)));
    const lo = 10 ** Math.floor(Math.log10(Math.min(...all))), hi = 10 ** Math.ceil(Math.log10(Math.max(...all)));
    const box = document.getElementById("uv-plot");
    const W = box.clientWidth || 700, small = W < 560;
    const L = small ? 130 : 250, R = small ? 54 : 84, rowH = 24, top = 22;
    const x = (v) => L + ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - L - R);
    const ticks = []; for (let t = lo; t <= hi * 1.0001; t *= 10) ticks.push(t);
    const kids = [];
    for (const b of blocks) {
      const H = top + b.rows.length * rowH + 6;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "uv-svg", role: "img",
        "aria-label": `${NAMES[b.c]}, ${yr}: price per kg of the largest listed codes, from the EU, from China and to Russia` });
      for (const t of ticks) {
        el("line", { x1: x(t), x2: x(t), y1: top - 4, y2: H - 4, class: "uv-grid" }, svg);
        const tx = el("text", { x: x(t), y: 12, "text-anchor": "middle", class: "uv-tick" }, svg);
        tx.textContent = t >= 1000 && small ? `$${t / 1000}k` : t >= 1 ? `$${t.toLocaleString("en-US")}` : `$${t}`;
      }
      if (!small) {
        const vt = el("text", { x: W - 2, y: 12, "text-anchor": "end", class: "uv-tick" }, svg);
        vt.textContent = "to Russia";
      }
      b.rows.forEach((r, i) => {
        const y = top + i * rowH + rowH / 2;
        const lab = el("text", { x: 0, y: y + 4, class: "uv-lbl" }, svg);
        // on phones a short name still says what the goods are; a code alone means nothing to most readers
        lab.textContent = small ? (name(r.code).length > 16 ? `${name(r.code).slice(0, 15)}…` : name(r.code)) : `${fmtCode(r.code)} ${name(r.code)}`;
        const pts = [["eu", r.eu, "--flow-eu"], ["cn", r.cn, "--text-primary"], ["ru", r.ru, "--flow-ru"]].filter((p) => p[1]);
        const xs = pts.map((p) => x(p[1].uv));
        el("line", { x1: Math.min(...xs), x2: Math.max(...xs), y1: y, y2: y, class: "uv-span" }, svg);
        for (const [leg, v, col] of pts) {
          const dot = el("circle", { cx: x(v.uv), cy: y, r: leg === "ru" ? 5.5 : 4.5, fill: v.est ? css("--paper") : css(col), stroke: css(col), "stroke-width": 2, tabindex: 0, class: "uv-dot" }, svg);
          const label = { eu: "from the EU", cn: "from China", ru: "to Russia" }[leg];
          const tip = (cx, cy) => showTip(cx, cy, `${fmtCode(r.code)} ${name(r.code)}, ${yr}`, [{ color: css(col), value: `${uvf(v.uv)} a kg`, label: `${label}${v.est ? " (weight estimated)" : ""}, ${moneyK(v.usd)}` }]);
          dot.addEventListener("pointermove", (e) => tip(e.clientX, e.clientY));
          dot.addEventListener("pointerleave", hideTip);
          dot.addEventListener("focus", () => { const q = dot.getBoundingClientRect(); tip(q.left, q.top); });
          dot.addEventListener("blur", hideTip);
        }
        const val = el("text", { x: W - 2, y: y + 4, "text-anchor": "end", class: "uv-val" }, svg);
        val.textContent = moneyK(r.ru.usd);
      });
      kids.push(h("div", { class: "uv-block" }, [h("h3", { class: "ctl-group", text: NAMES[b.c] }), svg]));
    }
    box.replaceChildren(...kids);

    // The price index table: per country, against the EU and against China, with and without bearings.
    const index = (c, y, ref, noBear) => {
      let v = 0, at = 0;
      for (const code of codesOf(c, y)) {
        if (noBear && code.startsWith("8482")) continue;
        const r = get("ru", c, y, code), s = get(ref, c, y, code);
        if (!r || !s) continue;
        v += r.usd; at += r.kg * s.uv;
      }
      return at ? v / at : null;
    };
    // Small multiples (one log scale, ×1 line) instead of 84 numbers; the "without bearings" lines only
    // where they differ from the full lines (bearings matter only where they are a large part of sales).
    const UVC = ["KZ", "KG", "UZ"];
    const IX = {};
    for (const c of UVC) {
      const s = { eu: YEARS.map((y) => index(c, y, "eu", false)), cn: YEARS.map((y) => index(c, y, "cn", false)),
        euNb: YEARS.map((y) => index(c, y, "eu", true)), cnNb: YEARS.map((y) => index(c, y, "cn", true)) };
      const differs = (a, b) => a.some((v, i) => v != null && b[i] != null && Math.abs(Math.log(v / b[i])) > 0.15);
      s.nb = differs(s.eu, s.euNb) || differs(s.cn, s.cnNb);
      IX[c] = s;
    }
    const ixAll = UVC.flatMap((c) => [...IX[c].eu, ...IX[c].cn, ...(IX[c].nb ? [...IX[c].euNb, ...IX[c].cnNb] : [])]).filter((v) => v > 0);
    const ixDom = [Math.min(...ixAll, 0.5) * 0.8, Math.max(...ixAll, 2) * 1.2];
    const ixBox = document.getElementById("uv-index");
    ixBox.replaceChildren(...UVC.map((c) => h("figure", {}, [h("figcaption", { text: NAMES[c] }), h("div", { class: "chart sm" })])));
    UVC.forEach((c, k) => lineChart(ixBox.children[k].querySelector(".chart"), {
      series: [
        { label: "against EU prices", endName: "vs EU", color: FLOW.eu.color, values: IX[c].eu },
        { label: "against China prices", endName: "vs China", color: "--text-primary", marker: "square", values: IX[c].cn },
        ...(IX[c].nb ? [
          { label: "against EU prices, without bearings", endName: "vs EU, no bearings", color: FLOW.eu.color, tint: 0.45, values: IX[c].euNb },
          { label: "against China prices, without bearings", endName: "vs China, no bearings", color: "--text-primary", marker: "square", tint: 0.45, values: IX[c].cnNb },
        ] : []),
      ],
      fmt: (v) => (v == null ? "—" : `×${v < 10 ? v.toFixed(2) : Math.round(v)}`), tickFmt: (t) => `×${t}`, log: true, baseline: 1, domain: ixDom, endNames: true,
      tickFilter: (t) => [0.1, 0.5, 1, 2, 10].includes(t),
      aria: `${NAMES[c]}: value of exports to Russia divided by the same kilograms at EU and at Chinese prices`,
    }));
    const head = h("thead", {}, h("tr", {}, [h("th", { text: "" }), h("th", { text: "Against" }), ...YEARS.map((y) => h("th", { text: String(y) }))]));
    const body = [];
    for (const c of UVC) {
      const lines = [["eu", "EU prices"], ["cn", "China prices"], ...(IX[c].nb ? [["euNb", "EU prices, without bearings"], ["cnNb", "China prices, without bearings"]] : [])];
      lines.forEach(([k, lab], j) => {
        body.push(h("tr", {}, [
          j === 0 ? h("th", { scope: "rowgroup", rowspan: lines.length, text: NAMES[c] }) : null,
          h("td", { class: "lbl", text: lab }),
          ...YEARS.map((y, i) => { const v = IX[c][k][i]; return h("td", { class: y === yr ? "chg" : "", text: v == null ? "—" : `×${v < 10 ? v.toFixed(2) : Math.round(v)}` }); }),
        ].filter(Boolean)));
      });
    }
    document.getElementById("uv-table").replaceChildren(head, h("tbody", {}, body));
    document.getElementById("uv-note").textContent =
      "In the index, ×1 means goods bound for Russia are valued per kilo exactly like the supplier's goods under the same codes; below ×1, they are cheaper. " +
      "Only codes weighed on both legs count, and a few small codes can swing Kyrgyzstan's and Uzbekistan's index.";
  }


  // ---------- sanctions designations next to the flows ----------
  function designationStudy() {
    const S = D.designations;
    const NAMES = { KZ: "Kazakhstan", KG: "Kyrgyzstan", UZ: "Uzbekistan" };
    const group = (l) => (l.startsWith("US") ? "US" : l);
    const COL = { US: "--text-primary", UK: "--c-kz", EU: "--flow-eu" };
    const order = ["KZ", "KG", "UZ"];
    const flows = S.flows;
    const months = [...new Set(order.flatMap((c) => (flows[c] || []).map((x) => x[0])))].sort().filter((m) => m >= "2022-01"); // the store starts in 2021, for the 6 months before early events
    const last = months[months.length - 1];
    const dmonths = [...new Set(S.rows.map((r) => r[2].slice(0, 7)))].filter((m) => m > last);
    const all = [...months, ...dmonths].sort();
    const fmtD = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    // Headline and summary from the data.
    {
      const count = Object.fromEntries(order.map((c) => [c, S.rows.filter((r) => r[1] === c).length]));
      const total = S.rows.length;
      const top = [...order].sort((a, b) => count[b] - count[a])[0];
      const avg = (c, from, to) => { const v = (flows[c] || []).filter((x) => x[0] >= from && x[0] <= to && x[1] != null).map((x) => x[1]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const lastM = (c) => { const f = (flows[c] || []).filter((x) => x[1] != null); return f.length ? f[f.length - 1][0] : null; };
      const back12 = (m) => { const [y, mo] = m.split("-").map(Number); const t = y * 12 + mo - 1 - 11; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
      document.getElementById("des-h").textContent = `${capW(shareW(count[top] / total))} of the ${total} blacklisted organisations are in ${NAMES[top]}`;
      const and = (a) => a.join(", ").replace(/, ([^,]*)$/, " and $1");
      const chg = order.map((c) => {
        const lm = lastM(c), a = avg(c, "2023-01", "2023-12"), b = lm ? avg(c, back12(lm), lm) : null;
        return a && b != null ? { c, g: grew(b / a) } : null;
      }).filter(Boolean);
      // "Kazakhstan's sales to Russia fell by about 40%, Kyrgyzstan's by more than two thirds ...": drop a repeated verb.
      const verb = (g) => g.split(" ")[0];
      const phr = chg.map((x, i) => (i === 0 ? `${NAMES[x.c]}'s sales to Russia ${x.g}`
        : `${NAMES[x.c]}'s ${verb(x.g) === verb(chg[0].g) && /^(fell|rose) by/.test(x.g) ? x.g.replace(/^\S+ /, "") : x.g}`));
      document.getElementById("des-sub").textContent =
        `${and(order.map((c, i) => `${NAMES[c]} ${i ? "" : "has "}${count[c]}`))}. ` +
        (phr.length ? `Since 2023, ${and(phr)}.` : "");
    }
    const box = document.getElementById("des-plot");
    const W = box.clientWidth || 700, small = W < 560;
    const L = small ? 0 : 92, R = 6, barH = 46, gap = 3;
    const x0 = (i) => L + (i / all.length) * (W - L - R), bw = (W - L - R) / all.length;
    const dotR = Math.max(1.8, Math.min(4, bw / 2 - 0.4)); // dots of neighbouring months must not touch
    const kids = [];
    for (const c of order) {
      const f = Object.fromEntries((flows[c] || []).map((x) => [x[0], x[1]]));
      const rows = S.rows.filter((r) => r[1] === c);
      const byM = {};
      for (const r of rows) (byM[r[2].slice(0, 7)] = byM[r[2].slice(0, 7)] || []).push(r);
      const stack = Math.max(1, ...Object.values(byM).map((v) => v.length));
      const H = 16 + barH + 8 + stack * (dotR * 2 + gap) + 18;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "des-svg", role: "img",
        "aria-label": `${NAMES[c]}: monthly listed exports to Russia and ${rows.length} designated organisations` });
      const vals = all.map((m) => f[m]).filter((v) => v != null);
      const max = Math.max(...vals, 1);
      const yb = 16 + barH;
      if (!small) { const t = el("text", { x: 0, y: 16 + barH / 2, class: "des-lbl" }, svg); t.textContent = "to Russia"; const t2 = el("text", { x: 0, y: yb + 8 + dotR + 4, class: "des-lbl" }, svg); t2.textContent = "designated"; }
      const mt = el("text", { x: L, y: 11, class: "des-tick" }, svg); mt.textContent = `max ${moneyK(max)} a month`;
      all.forEach((m, i) => {
        const v = f[m];
        if (v == null) {
          if (m <= last) el("line", { x1: x0(i) + 1, x2: x0(i) + bw - 1, y1: yb - 0.5, y2: yb - 0.5, stroke: css("--text-muted"), "stroke-dasharray": "1 1.5" }, svg);
        } else {
          const hh = (v / max) * barH;
          const b = el("rect", { x: x0(i) + 0.5, y: yb - hh, width: Math.max(bw - 1, 0.8), height: hh, fill: css("--flow-ru"), "fill-opacity": 0.85 }, svg);
          b.addEventListener("pointermove", (e) => showTip(e.clientX, e.clientY, monthName(m), [{ color: css("--flow-ru"), value: moneyK(v), label: `${NAMES[c]} to Russia, listed goods` }]));
          b.addEventListener("pointerleave", hideTip);
        }
        if (m.endsWith("-01")) {
          el("line", { x1: x0(i), x2: x0(i), y1: 14, y2: H - 14, class: "des-year" }, svg);
          const yt = el("text", { x: x0(i) + 2, y: H - 3, class: "des-tick" }, svg); yt.textContent = m.slice(0, 4);
        }
        (byM[m] || []).forEach((r, k) => {
          const g = group(r[0]), col = css(COL[g]);
          const dot = el("circle", { cx: x0(i) + bw / 2, cy: yb + 8 + dotR + k * (dotR * 2 + gap), r: dotR, fill: r[4] ? css("--paper") : col, stroke: col, "stroke-width": 1.6, tabindex: 0, class: "des-dot" }, svg);
          const tip = (cx, cy) => showTip(cx, cy, r[3], [{ color: col, value: fmtD(r[2]), label: `${r[0]}${r[4] ? " (date first seen by OpenSanctions)" : ""}` }]);
          dot.addEventListener("pointermove", (e) => tip(e.clientX, e.clientY));
          dot.addEventListener("pointerleave", hideTip);
          dot.addEventListener("focus", () => { const q = dot.getBoundingClientRect(); tip(q.left, q.top); });
          dot.addEventListener("blur", hideTip);
        });
      });
      el("line", { x1: L, x2: W - R, y1: yb, y2: yb, stroke: css("--axis"), "stroke-width": 0.75 }, svg);
      kids.push(h("div", { class: "des-block" }, [h("h3", { class: "ctl-group", text: `${NAMES[c]} · ${rows.length} organisations` }), svg]));
    }
    box.replaceChildren(...kids);
    table(document.getElementById("des-table"), ["Date", "Country", "List", "Organisation", "Also listed with"],
      S.rows.map((r) => [r[2] + (r[4] ? " (first seen)" : ""), NAMES[r[1]], r[0], r[3], r[5] || ""]));
  }


  // ---------- how much reached Russia: through the country (a range), and sold by its companies ----------
  function estimateStudy() {
    const E = D.estimate, M = E.meta, N = M.names;
    const ix = Object.fromEntries(E.cols.map((c, i) => [c, i]));
    const rows = E.rows.map((r) => Object.fromEntries(E.cols.map((c) => [c, r[ix[c]]])));
    const get = (c, y) => rows.find((r) => r.country === c && r.year === y);
    const usd = (v) => (v == null ? "—" : v < 500 ? "$0" : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}bn` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : `$${Math.round(v / 1e3)}k`);
    const ly = Math.max(...rows.map((r) => r.year));
    {
      const kg = get("KG", ly);
      document.getElementById("est-h").textContent = kg && kg.high != null
        ? `Kyrgyzstan reported ${usd(kg.recorded)} of battlefield goods sold to Russia in ${ly}, but up to ${usd(kg.high - kg.recorded)} more arrived in the country unrecorded`
        : "How much reached Russia through each country";
      const ratioW = (q) => (q >= 1.9 ? `about ${Math.round(q) <= 12 ? NUMW[Math.round(q)] : Math.round(q / 10) * 10} times the record` : q >= 1.1 ? `about ${round10((q - 1) * 100)}% above the record` : "close to the record");
      document.getElementById("est-sub").textContent = `In ${ly}, the ceiling for goods passing through was ` + ["KG", "KZ", "UZ"].map((c) => {
        const r = get(c, ly);
        return r ? (r.high != null && r.low > 0 ? `${ratioW(r.high / r.low)} for ${N[c]}` : `not measurable for ${N[c]}`) : "";
      }).filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1") + ". The table under the chart gives every figure." +
        (kg && kg.eu_priced_share != null ? ` ${kg.eu_priced_share > 0.5 ? "Most" : shareW(kg.eu_priced_share).replace(/^./, (x) => x.toUpperCase())} of Kyrgyzstan's recorded exports to Russia, by value, are in codes priced like EU goods (see Price per kg).` : "");
      const S = M.sellers;
      document.getElementById("est-sellers").replaceChildren(
        `${S.KG > 1.5 * S.measured_recorded_KG ? "Russia's own customs records tell a bigger story. " : ""}In ${S.period.replace("-", "–")} they logged `, h("b", { text: usd(S.KG) }),
        ` of battlefield goods sold by Kyrgyz companies, ` +
        (S.KG >= 1.9 * S.measured_recorded_KG ? `about ${NUMW[Math.round(S.KG / S.measured_recorded_KG)] || Math.round(S.KG / S.measured_recorded_KG)} times what Kyrgyzstan reported exporting to Russia in the same months` : `more than Kyrgyzstan reported exporting to Russia in the same months`) + `; the black mark on the chart shows it. ` +
        `Most of it was shipped from somewhere else, chiefly China and Hong Kong: by country of dispatch, Kyrgyzstan is not even in the top ten. ` +
        `Kazakh and Uzbek companies are not in the sellers' top ten either.`
      );
      document.getElementById("est-note").replaceChildren(
        "Russian customs data: ",
        h("a", { href: S.source, target: "_blank", rel: "noopener", text: "KSE, “Challenges of Export Controls Enforcement” (January 2024), Appendix 3" }),
        ". KSE notes that these records leave out some trade inside the EAEU, so they cannot track goods physically moving through Kazakhstan or Kyrgyzstan. " +
        "Missing imports come from the mirror checks in Part 2. Kazakhstan lacks import detail for 2022, so that year has no ceiling. The ceiling treats every missing shipment as if it went on to Russia; some may have stayed in the country unrecorded, so the true value is below it. " +
        "Uzbekistan's ceiling is high because its recorded imports from China dropped far below a pre-war ratio that was over 100%; some of that drop may reflect a change in how it records origin. ",
        ...(() => {
          // Hong Kong is not a leg of the ceiling: its largest year to one country, as a known gap.
          const SP = D.suppliers;
          if (!SP) return [];
          const by = {};
          for (const r of SP.rows) if (r[0] === "hk" && r[1] !== "RU" && r[4] != null) by[`${r[1]}|${r[2]}`] = (by[`${r[1]}|${r[2]}`] || 0) + r[4];
          const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
          if (!top) return [];
          const [c, y] = top[0].split("|");
          return [`Hong Kong is not part of the ceiling. It shipped ${usd(top[1] * 1e6)} (current US dollars) of these goods to ${N[c]} in ${y}, but importers file such goods under their origin, mostly China, so adding them to the China leg would count them twice. We leave this as a known gap.`];
        })(),
      );
    }
    // Range plot: one row a country and year, on a LINEAR dollar scale. The question is "how much", so the
    // bar's length must be dollars: on a log scale a $0.8M–$198M range looked wider than $229M–$869M.
    const box = document.getElementById("est-plot");
    const W = box.clientWidth || 700, small = W < 560;
    const L = small ? 92 : 140, R = small ? 8 : 150, rowH = 22, top = 22;
    const S2 = M.sellers;
    const vals = [...rows.flatMap((r) => [r.recorded, r.low, r.high]), S2 ? S2.KG : 0].filter((v) => v > 0);
    const ticksE = niceTicks(Math.max(...vals) / 1e6, small ? 3 : 5).map((t) => t * 1e6);
    const hi = ticksE[ticksE.length - 1];
    const x = (v) => L + (Math.max(0, v) / hi) * (W - L - R);
    const order = ["KG", "KZ", "UZ"];
    const list = order.flatMap((c) => rows.filter((r) => r.country === c).sort((a, b) => a.year - b.year));
    const H = top + list.length * rowH + order.length * 10 + 8;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "est-svg", role: "img", "aria-label": "Recorded exports to Russia and the estimated range, by country and year" });
    for (const t of ticksE) {
      el("line", { x1: x(t), x2: x(t), y1: top - 4, y2: H - 4, class: "uv-grid" }, svg);
      const tx = el("text", { x: x(t), y: 12, "text-anchor": "middle", class: "uv-tick" }, svg);
      tx.textContent = t === 0 ? "0" : t >= 1e9 ? `$${t / 1e9}bn` : `$${t / 1e6}M`;
    }
    let y = top, prev = null;
    for (const r of list) {
      if (r.country !== prev) { y += prev ? 10 : 0; prev = r.country; }
      const cy = y + rowH / 2;
      const lab = el("text", { x: 0, y: cy + 4, class: "uv-lbl" }, svg);
      lab.textContent = `${N[r.country]} ${small ? String(r.year).slice(2) : r.year}`;
      if (r.high != null) el("rect", { x: x(r.low), y: cy - 5, width: Math.max(1, x(r.high) - x(r.low)), height: 10, class: "est-range" }, svg);
      const dot = el("circle", { cx: x(r.recorded), cy, r: 4.5, class: "est-rec", tabindex: 0 }, svg);
      const tip = (px, py) => showTip(px, py, `${N[r.country]}, ${r.year}`, [
        { color: css("--flow-ru"), value: usd(r.recorded), label: "recorded exports to Russia" },
        { color: css("--ink-3"), value: `${usd(r.eu_gap)} + ${usd(r.china_gap)}`, label: "missing imports, EU + China legs" },
        { color: css("--ink-3"), value: r.high != null ? `${usd(r.low)}–${usd(r.high)}` : "no ceiling", label: "range" },
      ]);
      dot.addEventListener("pointermove", (e) => tip(e.clientX, e.clientY));
      dot.addEventListener("pointerleave", hideTip);
      dot.addEventListener("focus", () => { const q = dot.getBoundingClientRect(); tip(q.left, q.top); });
      dot.addEventListener("blur", hideTip);
      // the second method on the same scale: Russia's own records of Kyrgyz sellers (Jan–Oct only)
      if (S2 && r.country === "KG" && String(r.year) === (String(S2.period).match(/\d{4}/) || [""])[0]) {
        const sx = x(S2.KG);
        const mk = el("path", { d: `M${sx},${cy - 6}L${sx + 6},${cy}L${sx},${cy + 6}L${sx - 6},${cy}Z`, class: "est-seller", tabindex: 0 }, svg);
        const st = (px, py) => showTip(px, py, `Kyrgyzstan, ${S2.period.replace("-", "–")}`, [{ color: css("--ink"), value: usd(S2.KG), label: "sold by Kyrgyz companies, in Russia's customs records (KSE)" }]);
        mk.addEventListener("pointermove", (e) => st(e.clientX, e.clientY));
        mk.addEventListener("pointerleave", hideTip);
        mk.addEventListener("focus", () => { const q = mk.getBoundingClientRect(); st(q.left, q.top); });
        mk.addEventListener("blur", hideTip);
      }
      if (!small) {
        const v = el("text", { x: W - 2, y: cy + 4, "text-anchor": "end", class: "uv-val" }, svg);
        v.textContent = r.high != null ? `${usd(r.low)}–${usd(r.high)}` : `${usd(r.low)}, no ceiling`;
      }
      y += rowH;
    }
    box.replaceChildren(svg);
    // The table: every part, so each number can be checked.
    const head = h("thead", {}, h("tr", {}, ["", "Year", "Recorded", "Missing imports, EU leg", "Missing imports, China leg", "Through the country"].map((t) => h("th", { text: t }))));
    const body = list.map((r) => h("tr", {}, [
      h("th", { scope: "row", text: N[r.country] }), h("td", { text: String(r.year) }), h("td", { text: usd(r.recorded) }),
      h("td", { text: r.eu_gap == null ? "no data" : usd(r.eu_gap) }), h("td", { text: r.china_gap == null ? "no data" : usd(r.china_gap) }),
      h("td", { class: "chg", text: r.high != null ? `${usd(r.low)}–${usd(r.high)}` : `${usd(r.low)}, no ceiling` }),
    ]));
    document.getElementById("est-table").replaceChildren(head, h("tbody", {}, body));
  }


  // ---------- code explorer: one code, the whole route ----------
  function codeExplorer() {
    const code = state.xpCode;
    const NAME = { KZ: "Kazakhstan", KG: "Kyrgyzstan", UZ: "Uzbekistan" };
    const order = ["KZ", "KG", "UZ"];
    const usdM = (v) => (v == null ? "—" : v >= 1000 ? `$${(v / 1000).toFixed(2)}bn` : v >= 1 ? `$${v.toFixed(v >= 100 ? 0 : 1)}M` : v >= 0.001 ? `$${Math.round(v * 1000)}k` : v > 0 ? "<$1k" : "$0");
    const meta = chplByCode[code] || {};
    // annual series in $M, current US dollars
    const fromCodes = (flow, iso) => {
      const name = NAME[iso];
      return YEARS.map((y) => {
        if (!isAvail(flow, name, y)) return null;
        let t = 0;
        for (const r of D.codes) if (r[0] === flow && r[1] === name && r[2] === y && r[3] === code && r[4] != null) t += r[4];
        return t;
      });
    };
    const sup = (s, iso) => {
      const miss = new Set((D.suppliers && D.suppliers.meta.missing) || []);
      return YEARS.map((y) => {
        if (miss.has(`${s}|${iso}|${y}`)) return null;
        let t = 0;
        for (const r of D.suppliers.rows) if (r[0] === s && r[1] === iso && r[2] === y && r[3] === code && r[4] != null) t += r[4];
        return t;
      });
    };
    const cnImp = (iso) => {
      const have = new Set((D.cnImports || []).filter((r) => r[0] === iso).map((r) => r[1]));
      return YEARS.map((y) => {
        if (!have.has(y)) return null;
        const r = D.cnImports.find((q) => q[0] === iso && q[1] === y && q[2] === code);
        return r ? r[3] : 0;
      });
    };
    const data = Object.fromEntries(order.map((iso) => [iso, {
      eu: sup("eu", iso), cn: sup("cn", iso), hk: sup("hk", iso), ru: fromCodes("ru", iso), mi: fromCodes("mi", iso), cm: cnImp(iso),
    }]));
    const ly = YEARS.length - 1, yr = YEARS[ly];

    // what the code is
    const tier = meta.tier;
    document.getElementById("xp-what").replaceChildren(
      h("b", { text: `${fmtCode(code)} ${SHORT[code] || meta.description || ""}` }),
      `. ${meta.description || ""}. ${TIER_NAMES[tier] || ""}${TIER_USE[tier] ? ` (${TIER_USE[tier].toLowerCase()})` : ""}.` +
      (CODE_USE[code] ? ` ${CODE_USE[code]}.` : "") +
      (D.art12f.includes(code) ? " Covered by the EU's April 2026 export ban on Kyrgyzstan." : "") +
      (D.excluded.includes(code) ? " Left out of the 49-code basket, as there is no comparable data before 2022." : ""),
    );
    // found in Russian weapons (IISS/CAR teardowns, part types linked to codes by us)
    {
      const W = (D.weapons || []).filter((r) => r[0] === code);
      const src = h("a", { href: "https://www.iiss.org/globalassets/media-library---content--migration/files/research-papers/2025/09/pub25-094-tracking-the-components-of-missiles-and-uavs-used-by-russia-in-ukraine.pdf", target: "_blank", rel: "noopener", text: "IISS and Conflict Armament Research (2025)" });
      document.getElementById("xp-weapons").replaceChildren(
        h("h3", { class: "ctl-group", text: "Found in Russian weapons" }),
        W.length
          ? h("ul", { class: "xp-wlist" }, W.map((r) => h("li", {}, [h("b", { text: r[1] }), `: ${r[2]} (${String(r[3]).includes(";") ? `pp. ${String(r[3]).replace(/;\s*/g, ", ")}` : `p. ${r[3]}`})` + (r[4] ? `; ${r[4]}` : "") + "."])))
          : h("p", { class: "aside", text: "The IISS/CAR report names no part under this code. Every code is on the EU list because it was found in, or is critical to, Russian weapon systems used in Ukraine." }),
        h("p", { class: "aside" }, ["Source: ", src, ". The report lists part types rather than customs codes. Matching parts to codes is our own work, and some parts could go under more than one. In CAR's sample, tier 1 holds more than 25% of Shahed-136 parts and about 40% of Kh-69 parts, while under 10% of all parts fall outside the list (p. 11; page numbers as printed)."]),
      );
    }
    // the finding: largest route to Russia, and the supply into it
    {
      const best = order.map((iso) => ({ iso, v: data[iso].ru[ly] })).filter((x) => x.v != null).sort((a, b) => b.v - a.v)[0];
      const tot = (k) => order.reduce((t, iso) => t + (data[iso][k][ly] || 0), 0);
      document.getElementById("xp-sub").textContent =
        `In ${yr} the EU shipped ${usdM(tot("eu"))} of this code to the three countries, China ${usdM(tot("cn"))} and Hong Kong ${usdM(tot("hk"))}. ` +
        (best && best.v > 0
          ? `The three recorded ${usdM(tot("ru"))} of exports to Russia, most of it from ${NAME[best.iso]} (${usdM(best.v)}).`
          : "The three recorded no exports of it to Russia.");
    }

    // small multiples: EU, China, Hong Kong into each country, and the country's exports to Russia
    const grid = document.getElementById("xp-grid");
    const pos = order.flatMap((iso) => ["eu", "cn", "hk", "ru"].flatMap((k) => data[iso][k])).filter((v) => v != null && v > 0);
    const dom = pos.length ? [Math.min(...pos) * 0.8, Math.max(...pos) * 1.25] : [0.01, 1];
    grid.replaceChildren(...order.map((iso) => h("figure", { class: "sup-cell" }, [h("figcaption", { text: NAME[iso] }), h("div", { class: "chart sm" })])));
    const tkf = (t) => (t >= 1000 ? `${t / 1000}bn` : t >= 1 ? `${t}M` : `${Math.round(t * 1000)}k`);
    order.forEach((iso, i) => lineChart(grid.children[i].querySelector(".chart"), {
      series: [
        { label: `EU exports to ${NAME[iso]}`, endName: "from the EU", color: "--flow-eu", values: data[iso].eu },
        { label: `China's exports to ${NAME[iso]}`, endName: "from China", color: "--text-primary", values: data[iso].cn, marker: "square" },
        { label: `Hong Kong's exports to ${NAME[iso]}`, endName: "from Hong Kong", color: "--text-primary", values: data[iso].hk, tint: 0.45 },
        { label: `${NAME[iso]} to Russia`, endName: "to Russia", color: "--flow-ru", values: data[iso].ru, gapNote: "no data" },
      ],
      fmt: usdM, endNames: true, log: true, domain: dom, gapAtFoot: true, tickFmt: tkf, topTickFmt: (t) => `$${tkf(t)}`,
      tickFilter: isPow10,
      aria: `${fmtCode(code)}, ${NAME[iso]}: exports from the EU, China and Hong Kong, and exports to Russia, US dollars`,
    }));

    // mirror ratios: pre-war and the latest year, EU leg and China leg
    // A ratio needs a supplier value large enough to divide by: at least $100k a year (pre-war: on average).
    const MINR = 0.1;
    const pre = (num, den) => { let a = 0, b = 0, n = 0; for (const y of D.baselineYears) { const i = YEARS.indexOf(y); if (den[i] != null && num[i] != null) { a += num[i]; b += den[i]; n++; } } return n && b / n >= MINR ? (100 * a) / b : null; };
    const at = (num, den, i) => (den[i] != null && den[i] >= MINR && num[i] != null ? (100 * num[i]) / den[i] : null);
    const pct = (v) => (v == null ? "—" : v > 999 ? ">999%" : `${Math.round(v)}%`);
    document.getElementById("xp-mirror").replaceChildren(
      h("thead", {}, [
        h("tr", {}, [h("th", { text: "" }), h("th", { colspan: 3, text: "From the EU: recorded imports ÷ EU exports" }), h("th", { colspan: 3, text: "From China: recorded imports ÷ China's exports" })]),
        h("tr", {}, [h("th", { text: "" }), ...["Pre-war", "2023", String(yr), "Pre-war", "2023", String(yr)].map((t) => h("th", { text: t }))]),
      ]),
      h("tbody", {}, order.map((iso) => {
        const d = data[iso], i23 = YEARS.indexOf(2023);
        return h("tr", {}, [h("th", { scope: "row", text: NAME[iso] }),
          ...[pre(d.mi, d.eu), at(d.mi, d.eu, i23), at(d.mi, d.eu, ly), pre(d.cm, d.cn), at(d.cm, d.cn, i23), at(d.cm, d.cn, ly)].map((v) => h("td", { text: pct(v) }))]);
      })),
    );

    // price per kg, latest year with any weight
    const U = (D.unitValues && D.unitValues.rows) || [];
    const uvOf = (leg, iso, y) => { const r = U.find((q) => q[0] === leg && q[1] === iso && q[2] === y && q[3] === code); return r && r[5] ? { uv: r[4] / r[5], est: r[6], usd: r[4] } : null; };
    const uvYear = [...YEARS].reverse().find((y) => order.some((iso) => uvOf("ru", iso, y))) || yr;
    const uvf = (x) => (x == null ? "—" : `${x.uv >= 100 ? `$${Math.round(x.uv).toLocaleString("en-US")}` : `$${x.uv.toFixed(x.uv >= 10 ? 0 : 1)}`}${x.est ? "*" : ""}`);
    document.getElementById("xp-uv-h").textContent = `Price per kg, ${uvYear} (* weight estimated by the reporter)`;
    document.getElementById("xp-uv").replaceChildren(
      h("thead", {}, h("tr", {}, ["", "From the EU", "From China (China's records)", "From China (importer's records)", "To Russia", "To Russia is nearer"].map((t) => h("th", { text: t })))),
      h("tbody", {}, order.map((iso) => {
        const e = uvOf("eu", iso, uvYear), c = uvOf("cn", iso, uvYear), m = uvOf("cm", iso, uvYear), r = uvOf("ru", iso, uvYear);
        const near = !(r && e && c) ? "—" : r.est || e.est || c.est ? "not decided (estimated weight)"
          : Math.abs(Math.log(r.uv / e.uv)) < Math.abs(Math.log(r.uv / c.uv)) ? "EU price" : "China price";
        return h("tr", {}, [h("th", { scope: "row", text: NAME[iso] }), h("td", { text: uvf(e) }), h("td", { text: uvf(c) }), h("td", { text: uvf(m) }), h("td", { class: "chg", text: uvf(r) }), h("td", { text: near })]);
      })),
    );

    // the April 2026 ban, for the two banned codes: monthly flows of this code, Kyrgyzstan and Kazakhstan
    const banBox = document.getElementById("xp-ban");
    if (D.ban && D.art12f.includes(code)) {
      const B = D.ban, S = B.summary.series;
      const rowsB = [];
      for (const iso of ["KG", "KZ"]) for (const [f, lab, col] of [["eu", "From the EU", "--flow-eu"], ["cn", "From China", "--text-primary"], ["ru", "To Russia", "--flow-ru"]]) {
        const m = B.monthly.filter((r) => r[0] === f && r[1] === iso && r[2] === code);
        if (!m.length) continue;
        const s = S[`${f}|${iso}|${code}`] || {};
        const ch = s.year_ago_avg >= MIN_BASE_MONTH && s.after_avg != null ? `${s.after_avg >= s.year_ago_avg ? "+" : "−"}${Math.abs(Math.round(100 * (s.after_avg / s.year_ago_avg - 1)))}%` : s.after_avg != null && s.year_ago_avg != null ? `${s.after_avg - s.year_ago_avg >= 0 ? "+" : "−"}${moneyK(Math.abs(s.after_avg - s.year_ago_avg))}` : "—";
        rowsB.push(h("tr", {}, [h("th", { scope: "row", text: `${NAME[iso]}: ${lab.replace(/^From/, "from").replace(/^To/, "to")}` }),
          h("td", { class: "spark-cell" }, sparkline(m.map((r) => r[4]), { color: col, mark: m.map((r) => r[3]).indexOf(B.transition) })),
          h("td", { text: s.year_ago_avg != null ? moneyK(s.year_ago_avg) : "—" }), h("td", { text: s.after_avg != null ? moneyK(s.after_avg) : "—" }), h("td", { class: "chg", text: ch })]));
      }
      // folded: Part 4 has the ban table for the two codes together; this is the one-code detail
      banBox.replaceChildren(h("details", { class: "table-view" }, [h("summary", { text: "The April 2026 EU ban, this code only (Part 4 has both codes together)" }),
        h("div", { class: "table-wrap" }, h("table", { class: "supertable" }, [
          h("thead", {}, h("tr", {}, ["", "Months (line: the ban)", "Same months of 2025, a month", "After the ban, a month", "Change"].map((t) => h("th", { text: t })))),
          h("tbody", {}, rowsB)]))]));
    } else banBox.replaceChildren();

    // inside the code: Kazakhstan's exports to Russia by 10-digit line (statistics bureau, 2024 onwards)
    {
      const box = document.getElementById("xp-hs10");
      const T = D.hs10;
      const rows10 = T ? T.rows.filter((r) => r[0] === "RU" && r[2] === code) : [];
      if (!rows10.length) box.replaceChildren();
      else {
        const years = [...new Set(rows10.map((r) => r[1]))].sort();
        const lines = [...new Set(rows10.map((r) => r[3]))];
        const tot = (l) => rows10.filter((r) => r[3] === l).reduce((t, r) => t + (r[6] || 0), 0);
        lines.sort((a, b) => tot(b) - tot(a));
        const lastY = years[years.length - 1], lastLab = T.last.slice(0, 4) === String(lastY) && T.last.slice(5) !== "12" ? `${lastY} (Jan–${monthName(T.last).split(" ")[0]})` : String(lastY);
        const k = (v) => (v == null ? "—" : moneyK(v));
        const body = lines.slice(0, 10).map((l) => {
          const any = rows10.find((r) => r[3] === l);
          const cells = years.map((y) => { const r = rows10.find((q) => q[3] === l && q[1] === y); return h("td", { text: r ? k(r[6]) : "—" }); });
          const r = rows10.find((q) => q[3] === l && q[1] === lastY);
          const perKg = r && r[7] ? r[6] / (r[7] * 1000) : null;
          return h("tr", {}, [h("td", { class: "code", text: `${l.slice(0, 4)}.${l.slice(4, 6)}.${l.slice(6)}` }), h("td", { class: "lbl xp-ru", text: (T.en && T.en[l]) || any[4], title: `The bureau's text: ${any[4]}` }),
            ...cells, h("td", { class: "chg", text: perKg == null ? "—" : `$${perKg >= 100 ? Math.round(perKg).toLocaleString("en-US") : perKg.toFixed(1)}` })]);
        });
        box.replaceChildren(
          h("h3", { class: "ctl-group", text: "Inside this code: Kazakhstan's exports to Russia by 10-digit line" }),
          h("div", { class: "table-wrap" }, h("table", { class: "supertable" }, [
            h("thead", {}, h("tr", {}, ["Line", "Goods", ...years.map((y) => (y === lastY ? lastLab : String(y))), `Per kg, ${lastY}`].map((t) => h("th", { text: t })))),
            h("tbody", {}, body)])),
          h("p", { class: "aside", text: `Source: Kazakhstan's Bureau of National Statistics, EAEU trade by 10-digit code (company reports on form 1-TS). The English names are our own short translations of the bureau's Russian; hover over one to see the original. ${lines.length > 10 ? `Top 10 of ${lines.length} lines. ` : ""}Kyrgyzstan and Uzbekistan do not publish 10-digit data like this.` }),
        );
      }
    }

    // the numbers
    const head = ["Country", "Flow", ...YEARS.map(String)];
    const L = { eu: "EU exports to the country", cn: "China's exports to the country", hk: "Hong Kong's exports to the country", mi: "Recorded imports from the EU", cm: "Recorded imports from China", ru: "Exports to Russia" };
    table(document.getElementById("xp-table"), head, order.flatMap((iso) => Object.keys(L).map((k) => [NAME[iso], L[k], ...data[iso][k].map((v) => (v == null ? "no data" : usdM(v)))])));
  }


  // ---------- the common test for every enforcement step ----------
  // The same method as src/chpl_trade/designation_effect.py: the country's listed exports to Russia over
  // the 6 months after the step's month against the 6 before (the month itself left out), net of the other
  // two route countries: effect = ln(after/before) − ln(others' after/before). At least 3 months after;
  // under $50k a month before is too small for a ratio.
  const shiftM = (m, k) => { const [y, mo] = m.split("-").map(Number); const t = y * 12 + mo - 1 + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  let flowMaps = null;
  function netEffect(c, m) {
    const FL = D.designations && D.designations.flows;
    if (!FL) return { reason: "no data" };
    if (!flowMaps) flowMaps = Object.fromEntries(Object.entries(FL).map(([cc, rows]) => [cc, Object.fromEntries(rows.map((x) => [x[0], x[1]]))]));
    const win = (s) => {
      const before = []; for (let k = -6; k <= -1; k++) before.push(s[shiftM(m, k)]);
      const after = []; for (let k = 1; k <= 6; k++) { const v = s[shiftM(m, k)]; if (v == null) break; after.push(v); }
      if (before.some((v) => v == null)) return { reason: "no data before" };
      if (after.length < 3) return { reason: "under 3 months after" };
      return { b: before.reduce((a, x) => a + x, 0) / 6, a: after.reduce((a, x) => a + x, 0) / after.length };
    };
    const own = win(flowMaps[c] || {});
    if (own.reason) return own;
    if (own.b < MIN_BASE_MONTH || own.a <= 0) return { reason: "too small", own };
    const others = Object.keys(flowMaps).filter((o) => o !== c).map((o) => win(flowMaps[o]));
    if (others.some((x) => x.reason)) return { reason: "no data for the others" };
    const ob = others.reduce((t, x) => t + x.b, 0), oa = others.reduce((t, x) => t + x.a, 0);
    if (ob <= 0 || oa <= 0) return { reason: "no data for the others" };
    const e = Math.log(own.a / own.b) - Math.log(oa / ob);
    return { pct: 100 * (Math.exp(e) - 1), own: 100 * (own.a / own.b - 1), others: 100 * (oa / ob - 1) };
  }
  const sgnPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}%`);

  // ---------- what the governments said and did ----------
  // Two shapes in one ink, not five hues: hollow for what a government said, filled for what it or its
  // banks did. The kind in words is in the table.
  const RESP_KIND = {
    promise: { label: "promise", col: "--ink", hollow: true },
    measure: { label: "own measure", col: "--ink" },
    bank: { label: "banks", col: "--ink" },
    "plays down": { label: "plays down", col: "--ink", hollow: true },
    objection: { label: "objection", col: "--ink", hollow: true },
  };
  function responsesStudy() {
    const R = D.responses, FL = D.designations && D.designations.flows;
    if (!R || !FL) return;
    const NAMES = { KZ: "Kazakhstan", KG: "Kyrgyzstan", UZ: "Uzbekistan" };
    const order = ["KZ", "KG", "UZ"];
    const items = R.map((r, i) => ({ n: i + 1, c: r[0], date: r[1], kind: r[2], actor: r[3], what: r[4], src: r[5], srcType: r[6], checked: r[7] }));
    const fmtD = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const shift = (m, k) => { const [y, mo] = m.split("-").map(Number); const t = y * 12 + mo - 1 + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
    // The common test (the same as for blacklistings): 6 months after against 6 before, net of the other two.
    const START = (D.designationEffect && D.designationEffect.start) || "2022-09";
    const change = (c, date) => {
      const m = date.slice(0, 7);
      if (m < START) return { text: "before Sept 2022", v: null };
      const r = netEffect(c, m);
      if (r.reason) return { text: r.reason === "under 3 months after" ? "under 3 months" : r.reason, v: null };
      return { text: sgnPct(r.pct), v: r.pct };
    };
    for (const it of items) it.chg = change(it.c, it.date);
    {
      const kz = items.filter((x) => x.c === "KZ" && x.kind === "promise");
      const kgM = items.filter((x) => x.c === "KG" && x.kind === "measure");
      const kgO = items.filter((x) => x.c === "KG" && (x.kind === "objection" || x.kind === "plays down"));
      const yr = (d) => d.slice(0, 4);
      document.getElementById("resp-h").textContent = kz.length && kgM.length
        ? `Kazakhstan has pledged since ${yr(kz[0].date)} not to be a sanctions route; Kyrgyzstan's first restriction of its own came only in ${yr(kgM[0].date)}`
        : "What the governments said and did";
      const firstKzMeasure = items.find((x) => x.c === "KZ" && x.kind === "measure");
      document.getElementById("resp-sub").textContent = [
        kz.length ? `Kazakhstan made the promise ${timesW(kz.length)} between ${fmtD(kz[0].date)} and ${fmtD(kz[kz.length - 1].date)}.` : "",
        firstKzMeasure && firstKzMeasure.chg.v != null ? `In the six months after it announced a goods-tracking system on ${fmtD(firstKzMeasure.date)}, its sales of battlefield goods to Russia ${firstKzMeasure.chg.v < 0 ? `fell about ${round10(-firstKzMeasure.chg.v)}% further than its neighbours'` : `did about ${round10(firstKzMeasure.chg.v)}% better than its neighbours'`}.` : "",
        kgO.length ? `Kyrgyzstan, meanwhile, played down or rejected the sanctions on its banks ${timesW(kgO.length)} before its first step on ${fmtD(kgM[0].date)}.` : "",
      ].filter(Boolean).join(" ");
    }
    // timeline: one row a country, bars = monthly exports to Russia, numbered markers above
    const box = document.getElementById("resp-plot");
    const W = box.clientWidth || 700, small = W < 560;
    const L = small ? 0 : 92, Rm = 6, barH = 42;
    const months = [...new Set(order.flatMap((c) => (FL[c] || []).map((x) => x[0])))].sort().filter((m) => m >= "2022-01");
    const last = items.map((x) => x.date.slice(0, 7)).reduce((a, b) => (a > b ? a : b), months[months.length - 1]);
    const all = []; for (let m = months[0]; m <= last; m = shift(m, 1)) all.push(m);
    const bw = (W - L - Rm) / all.length, x0 = (i) => L + i * bw;
    const kids = [];
    for (const c of order) {
      const f = Object.fromEntries((FL[c] || []).map((x) => [x[0], x[1]]));
      const mine = items.filter((x) => x.c === c);
      const max = Math.max(...Object.values(f).filter((v) => v != null), 1);
      // A marker that would touch the one before it goes one level higher (markers are 16 px wide).
      const levels = [];
      for (const it of mine) {
        const i = all.indexOf(it.date.slice(0, 7));
        const cx = x0(i) + bw / 2;
        let lv = 0;
        while (levels.some((q) => q.lv === lv && Math.abs(q.cx - cx) < 17)) lv++;
        levels.push({ cx, lv });
        it.lv = lv;
      }
      const top = 12 + 17 * Math.max(0, ...levels.map((q) => q.lv));
      const H = top + 18 + barH + 18;
      const yb = top + 18 + barH;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "des-svg", role: "img",
        "aria-label": `${NAMES[c]}: monthly listed exports to Russia and ${mine.length} government statements or measures` });
      if (!small) { const t = el("text", { x: 0, y: yb - barH / 2, class: "des-lbl" }, svg); t.textContent = "to Russia"; }
      all.forEach((m, i) => {
        const v = f[m];
        if (v != null) { const hh = (v / max) * barH; el("rect", { x: x0(i) + 0.5, y: yb - hh, width: Math.max(bw - 1, 0.8), height: hh, fill: css("--flow-ru"), "fill-opacity": 0.35 }, svg); }
        if (m.endsWith("-01")) {
          el("line", { x1: x0(i), x2: x0(i), y1: yb - barH - 4, y2: H - 14, class: "des-year" }, svg);
          const yt = el("text", { x: x0(i) + 2, y: H - 3, class: "des-tick" }, svg); yt.textContent = m.slice(0, 4);
        }
      });
      // markers, at the level found above
      for (const it of mine) {
        const i = all.indexOf(it.date.slice(0, 7));
        if (i < 0) continue;
        const cx = x0(i) + bw / 2, cy = top - 17 * it.lv;
        const K = RESP_KIND[it.kind] || RESP_KIND.measure, col = css(K.col);
        el("line", { x1: cx, x2: cx, y1: cy + 6, y2: yb, stroke: col, "stroke-width": 1, "stroke-dasharray": it.checked === "yes" ? null : "2 2" }, svg);
        const g = el("g", { tabindex: 0, class: "resp-mark" }, svg);
        el("circle", { cx, cy, r: 8, fill: K.hollow ? css("--paper") : col, stroke: col, "stroke-width": 1.6, "stroke-dasharray": it.checked === "yes" ? null : "2 2" }, g);
        const t = el("text", { x: cx, y: cy + 3.5, "text-anchor": "middle", class: "resp-num", fill: K.hollow ? css("--ink") : css("--paper") }, g);
        t.textContent = String(it.n);
        const tip = (px, py) => showTip(px, py, `${it.n}. ${fmtD(it.date)}, ${it.actor}`, [{ color: col, value: K.label, label: it.what }]);
        g.addEventListener("pointermove", (e) => tip(e.clientX, e.clientY));
        g.addEventListener("pointerleave", hideTip);
        g.addEventListener("focus", () => { const q = g.getBoundingClientRect(); tip(q.left, q.top); });
        g.addEventListener("blur", hideTip);
      }
      el("line", { x1: L, x2: W - Rm, y1: yb, y2: yb, stroke: css("--axis"), "stroke-width": 0.75 }, svg);
      kids.push(h("div", { class: "des-block" }, [h("h3", { class: "ctl-group", text: NAMES[c] }),
        h("p", { class: "des-scale", text: `bars: listed exports to Russia, tallest ${moneyK(max)} a month` }), svg]));
    }
    box.replaceChildren(...kids);
    // the table
    const head = h("thead", {}, h("tr", {}, ["#", "Date", "", "Who", "What", "Source", "Exports to Russia, 6 months after, net of the other two"].map((t) => h("th", { text: t }))));
    const body = [];
    for (const c of order) {
      body.push(h("tr", { class: "group" }, h("th", { colspan: 7, scope: "rowgroup", text: NAMES[c] })));
      for (const it of items.filter((x) => x.c === c)) {
        const K = RESP_KIND[it.kind] || RESP_KIND.measure;
        body.push(h("tr", {}, [
          h("td", { text: String(it.n) }), h("td", { text: fmtD(it.date) }), h("td", { class: "lbl", text: K.label }),
          h("td", { class: "lbl", text: it.actor }), h("td", { class: "lbl resp-what", text: it.what + (it.checked === "yes" ? "" : " (Not confirmed by a Kazakh source.)") }),
          h("td", { class: "lbl" }, h("a", { href: it.src, target: "_blank", rel: "noopener", text: it.srcType })),
          h("td", { class: "chg", text: it.chg.text }),
        ]));
      }
    }
    document.getElementById("resp-table").replaceChildren(head, h("tbody", {}, body));
  }


  // ---------- EU member states: who ships the goods ----------
  // Comext by member state. The 27 add up to the EU-27 line used everywhere else. Current US dollars.
  function membersStudy() {
    const M = D.members;
    if (!M) return;
    const NAMES = M.names, BORDER = new Set(M.border);
    const ROUTE = { all: "the three countries", KZ: "Kazakhstan", KG: "Kyrgyzstan", UZ: "Uzbekistan" };
    const dest = state.memDest;
    const inDest = (d) => dest === "all" || d === dest;
    const val = {}; // member|year -> $M
    for (const [d, m, y, v] of M.rows) if (inDest(d) && v != null) val[`${m}|${y}`] = (val[`${m}|${y}`] || 0) + v;
    const members = Object.keys(NAMES);
    const get = (m, y) => val[`${m}|${y}`] || 0;
    const preYears = [2019, 2020, 2021];
    const pre = (m) => preYears.reduce((a, y) => a + get(m, y), 0) / preYears.length;
    const total = (y) => members.reduce((a, m) => a + get(m, y), 0);
    const last = Math.max(...M.rows.map((r) => r[2]));
    const peak = YEARS.filter((y) => y >= 2022).reduce((a, y) => (total(y) > total(a) ? y : a), 2022);
    const usd = (v) => (v == null ? "—" : v >= 1000 ? `$${(v / 1000).toFixed(2)}bn` : v >= 1 ? `$${v.toFixed(v >= 100 ? 0 : 1)}M` : v >= 0.001 ? `$${Math.round(v * 1000)}k` : "$0");
    const sum = (set, f) => members.filter((m) => set(m)).reduce((a, m) => a + f(m), 0);
    const PN = (m) => (m === "NL" ? "the Netherlands" : NAMES[m]); // name inside a sentence
    const usd1 = (v) => (v >= 100 ? `$${v.toFixed(1)}M` : usd(v)); // one more digit where two values are close
    const listAnd = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

    // text, computed
    const bPre = sum((m) => BORDER.has(m), pre), bPeak = sum((m) => BORDER.has(m), (m) => get(m, peak));
    const rPre = sum((m) => !BORDER.has(m), pre), rPeak = sum((m) => !BORDER.has(m), (m) => get(m, peak));
    const bLast = sum((m) => BORDER.has(m), (m) => get(m, last)), rLast = sum((m) => !BORDER.has(m), (m) => get(m, last));
    const nRest = members.length - BORDER.size;
    // "fell by about 40% by 2024 and again by 2025", not the same words twice
    const after = (a, b) => (last === peak ? "" : grew(b / a) === grew(a / bPre) ? ` and again by ${last}` : ` and ${grew(b / a)} by ${last}`);
    const to = dest === "all" ? "" : ` to ${ROUTE[dest]}`;
    document.getElementById("mem-h").textContent =
      `Exports${to} from the EU's border states ${grew(bPeak / bPre)} by ${peak}${after(bPeak, bLast)}`;
    const byLast = [...members].sort((a, b) => get(b, last) - get(a, last));
    const risers = members.filter((m) => get(m, peak) >= 5 && pre(m) > 0).sort((a, b) => get(b, peak) / pre(b) - get(a, peak) / pre(a)).slice(0, 3);
    document.getElementById("mem-sub").textContent =
      `Over the same years, exports from the other ${nRest} member states ${grew(rPeak / rPre)}${last !== peak ? ` and then ${grew(rLast / rPeak)}` : ""}. ` +
      `${capW(PN(byLast[0]))} and ${PN(byLast[1])} shipped the most in ${last}` + (Math.abs(get(byLast[0], last) / get(byLast[1], last) - 1) < 0.05 ? `, about ${usd(get(byLast[0], last))} each. ` : `: ${usd1(get(byLast[0], last))} and ${usd1(get(byLast[1], last))}. `) +
      (risers.length
        ? `Of the states that shipped at least $5M in ${peak}, ${PN(risers[0])}'s exports ${grew(get(risers[0], peak) / pre(risers[0]))}, the fastest rise` +
          (risers.length > 1 ? `; ${listAnd(risers.slice(1).map(PN))} came next.` : ".")
        : "");
    // why the importers' records by member state are not compared: they follow the country of origin
    {
      const I = {};
      for (const [d, m, y, v] of M.imports || []) if (d === "KZ") I[`${m}|${y}`] = v;
      const ky = Math.max(...(M.imports || []).filter((r) => r[0] === "KZ").map((r) => r[2]));
      const ex = {};
      for (const [d, m, y, v] of M.rows) if (d === "KZ" && y === ky) ex[m] = v;
      const diff = members.filter((m) => ex[m] != null && I[`${m}|${ky}`] != null).map((m) => ({ m, e: ex[m], i: I[`${m}|${ky}`] }));
      const less = diff.sort((a, b) => (b.e - b.i) - (a.e - a.i))[0], more = [...diff].sort((a, b) => (b.i - b.e) - (a.i - a.e))[0];
      document.getElementById("mem-origin").textContent = less && more && isFinite(ky)
        ? `The importers' own records cannot be checked state by state. They file goods under the country that made them; the EU files them under the state that shipped them. In ${ky} Kazakhstan recorded ${usd(less.i)} from ${PN(less.m)}, which shipped ${usd(less.e)}, and ${usd(more.i)} from ${PN(more.m)}, which shipped ${usd(more.e)}. Part 2 compares the two records for the EU as a whole, where it does not matter which state shipped the goods.`
        : "";
    }

    // A supertable with sparklines: one row a member state, grouped (totals, border states, the rest) and
    // ordered to tell the story. Each sparkline is the full 2019–2025 series on its own linear scale from
    // zero, so its shape is honest within the row; the numbers beside it give the size.
    const box = document.getElementById("mem-plot");
    const SW = 132, SH = 28, pad = 3;
    const fx = (v) => (v >= 10 ? `×${v.toFixed(0)}` : `×${v.toFixed(1)}`);
    const pct = (v) => { const p = Math.round(100 * (v - 1)); return p === 0 ? "0%" : `${p > 0 ? "+" : "−"}${Math.abs(p)}%`; };
    const series = (f) => YEARS.map((yy) => f(yy));
    const rowOf = (label, f, border, note) => {
      const s = series(f);
      const p0 = preYears.reduce((a, yy) => a + f(yy), 0) / preYears.length;
      const pk = YEARS.filter((yy) => yy >= 2022).reduce((a, yy) => (f(yy) > f(a) ? yy : a), 2022);
      return { label, s, pre: p0, pk, pkv: f(pk), lastv: f(last), border, note };
    };
    const spark = (r) => {
      const max = Math.max(...r.s, 1e-9);
      const X = (i) => pad + (i * (SW - 2 * pad)) / (YEARS.length - 1);
      const Y = (v) => SH - pad - (v / max) * (SH - 2 * pad);
      const svg = el("svg", { width: SW, height: SH, viewBox: `0 0 ${SW} ${SH}`, class: "mem-spark", role: "img",
        "aria-label": `${r.label}: ${YEARS.map((yy, i) => `${yy} ${usd(r.s[i])}`).join(", ")}` });
      const b1 = X(preYears.length - 1) + (X(1) - X(0)) / 2;
      el("rect", { x: 0, y: 0, width: b1, height: SH, class: "mem-pre" }, svg); // the pre-war years
      const col = r.border ? css("--c-kg") : css("--ink-2");
      el("polyline", { points: r.s.map((v, i) => `${X(i)},${Y(v)}`).join(" "), fill: "none", stroke: col, "stroke-width": 1.5, "stroke-linejoin": "round" }, svg);
      const ip = YEARS.indexOf(r.pk), il = YEARS.length - 1;
      el("circle", { cx: X(ip), cy: Y(r.s[ip]), r: 2.4, fill: col }, svg);
      if (il !== ip) el("circle", { cx: X(il), cy: Y(r.s[il]), r: 1.8, fill: css("--ink-3") }, svg);
      const hit = el("rect", { x: 0, y: 0, width: SW, height: SH, fill: "transparent", tabindex: 0 }, svg);
      const tip = (px, py, i) => showTip(px, py, `${r.label} to ${ROUTE[dest]}`, [{ color: col, value: usd(r.s[i]), label: String(YEARS[i]) }], r.note || "");
      hit.addEventListener("pointermove", (e) => { const q = svg.getBoundingClientRect(); const i = Math.max(0, Math.min(il, Math.round(((e.clientX - q.left) / q.width * SW - pad) / ((SW - 2 * pad) / il)))); tip(e.clientX, e.clientY, i); });
      hit.addEventListener("pointerleave", hideTip);
      hit.addEventListener("focus", () => { const q = svg.getBoundingClientRect(); tip(q.right, q.top, ip); });
      hit.addEventListener("blur", hideTip);
      return svg;
    };
    const topNote = (m) => {
      const agg = {};
      for (const r of M.top) if (inDest(r[0]) && r[1] === m && r[2] === peak) agg[r[3]] = (agg[r[3]] || 0) + r[4];
      const t = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return t.length ? `Largest codes in ${peak}: ` + t.map(([c, v]) => `${fmtCode(c)} ${(chplByCode[c] || {}).description || ""} (${usd(v)})`).join("; ") : "";
    };
    const nCases = {};
    for (const r of D.cases || []) (nCases[r[3]] = nCases[r[3]] || new Set()).add(r[0]);
    let barMax = 1e-9; // set below from the member states' latest values
    const sizeBar = (v) => {
      const BW = 72, w = Math.max(v > 0 ? 1 : 0, (v / barMax) * BW);
      const svg = el("svg", { width: BW, height: 10, viewBox: `0 0 ${BW} 10`, class: "mem-bar", "aria-hidden": "true" });
      el("rect", { x: 0, y: 2, width: Math.min(w, BW), height: 6, class: "mem-bar-fill" }, svg);
      return svg;
    };
    const tr = (r, cls) => h("tr", cls ? { class: cls } : {}, [
      h("th", { scope: "row", class: "lbl", text: r.label }),
      h("td", { class: "spark-cell" }, spark(r)),
      h("td", { text: usd(r.pre) }),
      h("td", { text: `${usd(r.pkv)} (${r.pk})` }),
      h("td", { text: usd(r.lastv) }),
      h("td", { class: "bar-cell" }, r.noBar ? null : sizeBar(r.lastv)),
      h("td", { class: "chg", text: r.pre >= 0.05 ? fx(r.pkv / r.pre) : "from near zero" }),
      h("td", { class: "chg", text: r.pk === last ? "at the peak" : r.pkv > 0 ? pct(r.lastv / r.pkv) : "—" }),
      h("td", r.cases ? { text: String(r.cases) } : { text: "" }), // a blank cell, not "none" twenty times
    ]);
    const group = (t) => h("tr", { class: "group" }, h("th", { colspan: 9, scope: "rowgroup", text: t }));
    const state1 = (m) => Object.assign(rowOf(NAMES[m], (yy) => get(m, yy), BORDER.has(m), topNote(m)), { cases: nCases[m] ? nCases[m].size : 0 });
    const borderRows = members.filter((m) => BORDER.has(m)).map(state1).sort((a, b) => b.pkv / Math.max(b.pre, 1e-9) - a.pkv / Math.max(a.pre, 1e-9));
    // States that never reached $1M a year are one row: their own sparklines would only show noise.
    const SMALL = 1;
    const isSmall = (m) => !BORDER.has(m) && Math.max(...YEARS.map((yy) => get(m, yy))) < SMALL;
    const smallSet = members.filter(isSmall);
    const otherRows = members.filter((m) => !BORDER.has(m) && !isSmall(m)).map(state1).sort((a, b) => b.lastv - a.lastv);
    if (smallSet.length) {
      const sr = rowOf(`${capW(NUMW[smallSet.length] || String(smallSet.length))} others, each under $1M a year`, (yy) => sum((m) => smallSet.includes(m), (m) => get(m, yy)), false,
        smallSet.map((m) => NAMES[m]).join(", "));
      sr.cases = smallSet.reduce((a, m) => a + (nCases[m] ? nCases[m].size : 0), 0);
      otherRows.push(sr);
    }
    barMax = Math.max(...[...borderRows, ...otherRows].map((r) => r.lastv), 1e-9);
    const bTot = rowOf(`The ${NUMW[BORDER.size] || BORDER.size} border states`, (yy) => sum((m) => BORDER.has(m), (m) => get(m, yy)), true);
    const oTot = rowOf(`The other ${nRest}`, (yy) => sum((m) => !BORDER.has(m), (m) => get(m, yy)), false);
    const head = h("thead", {}, h("tr", {}, ["", "2019–2025, own scale", "2019–21 average", "Peak (year)", String(last), `${last}, one scale`, "Rise to the peak", `Change since the peak`, "Cases (Part 4)"].map((t) => h("th", { scope: "col", text: t }))));
    const t = h("table", { class: "supertable mem-table" }, [head, h("tbody", {}, [
      group("Totals"), tr(Object.assign(bTot, { noBar: true }), "mem-total"), tr(Object.assign(oTot, { noBar: true }), "mem-total"),
      group("Border with Russia or Belarus"), ...borderRows.map((r) => tr(r)),
      group(`Other member states, largest in ${last} first`), ...otherRows.map((r) => tr(r)),
    ])]);
    box.replaceChildren(h("div", { class: "table-wrap" }, t));

    // the numbers: every member state, every year
    const yHead = ["Member state", ...YEARS.map(String)];
    const yRows = [...members].sort((a, b) => get(b, last) - get(a, last)).map((m) => [NAMES[m] + (BORDER.has(m) ? " (border)" : ""), ...YEARS.map((yy) => usd(get(m, yy)))]);
    yRows.push(["All 27 (EU-27)", ...YEARS.map((yy) => usd(total(yy)))]);
    table(document.getElementById("mem-table"), yHead, yRows);
  }


  // ---------- EU enforcement cases that name the route ----------
  const CASE_STAGE = {
    investigation: { label: "investigation", g: "open" }, arrest: { label: "arrest", g: "open" },
    charge: { label: "charged", g: "charged" }, "sent to prosecutor": { label: "sent to prosecutor", g: "charged" },
    conviction: { label: "conviction", g: "decided" }, fine: { label: "fine", g: "decided" },
  };
  function casesStudy() {
    const C = D.cases;
    if (!C) return;
    const EU = { AT: "Austria", BE: "Belgium", BG: "Bulgaria", CZ: "Czechia", DE: "Germany", EE: "Estonia", FI: "Finland", FR: "France", LT: "Lithuania", LV: "Latvia", NL: "Netherlands", PL: "Poland", SE: "Sweden", ...((D.members || {}).names || {}) };
    const RN = { KZ: "Kazakhstan", KG: "Kyrgyzstan", UZ: "Uzbekistan" };
    const items = C.map((r) => ({ id: r[0], date: r[1], dk: r[2], c: r[3], stage: r[4], who: r[5], route: r[6].split(";"), also: r[7], goods: r[8], value: r[9], outcome: r[10], src: r[11], srcType: r[12], primary: r[13] === "yes" }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    items.forEach((it, i) => { it.n = i + 1; });
    const fmtD = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const listW = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
    const PN = (c) => (c === "NL" ? "the Netherlands" : EU[c] || c); // name inside a sentence
    const cap = (n) => capW(n <= 12 ? NUMW[n] : String(n));

    // text, computed
    const cases = [...new Set(items.map((x) => x.id))];
    const named = (iso) => cases.filter((id) => items.some((x) => x.id === id && x.route.includes(iso))).length;
    const decided = items.filter((x) => CASE_STAGE[x.stage] && CASE_STAGE[x.stage].g === "decided");
    const convicted = items.filter((x) => x.stage === "conviction");
    const convCountries = [...new Set(convicted.map((x) => x.c))];
    const w = (n) => (n <= 12 ? NUMW[n] : String(n));
    const nKZ = named("KZ"), nKG = named("KG"), nUZ = named("UZ");
    document.getElementById("case-h").textContent = nKZ >= nKG && nKZ >= nUZ
      ? `Kazakhstan appears in ${w(nKZ)} of the ${w(cases.length)} EU cases that name the route`
      : `${cap(cases.length)} EU cases name the route through Central Asia`;
    const convCases = new Set(convicted.map((x) => x.id));
    const fined = decided.filter((x) => x.stage === "fine");
    const fineCases = new Set(fined.map((x) => x.id).filter((id) => !convCases.has(id)));
    const open = cases.filter((id) => !convCases.has(id) && !fineCases.has(id)).length;
    let sub = `Kyrgyzstan appears in ${w(nKG)}, Uzbekistan in ${w(nUZ)}. ` +
      `Courts in ${listW(convCountries.map(PN))} have convicted in ${w(convCases.size)} cases` +
      (fineCases.size ? `; ${listW([...new Set(fined.map((x) => PN(x.c)))])} fined a company` : "") +
      `; ${w(open)} ${open === 1 ? "is" : "are"} still open.`;
    if (D.members) {
      const last = Math.max(...D.members.rows.map((r) => r[2]));
      const tot = {}; for (const [, m, y, v] of D.members.rows) if (y === last && v != null) tot[m] = (tot[m] || 0) + v;
      const top5 = Object.keys(tot).sort((a, b) => tot[b] - tot[a]).slice(0, 5);
      const withCase = new Set(items.map((x) => x.c));
      const no = top5.filter((m) => !withCase.has(m));
      if (no.length) sub += ` ${capW(listW(no.map(PN)))}, ${no.length === 1 ? "one" : w(no.length)} of the five largest shippers in ${last}, ${no.length === 1 ? "has" : "have"} no case here.`;
    }
    document.getElementById("case-sub").textContent = sub;

    // timeline: one row an EU country, numbered marks, a thin line joins the steps of one case
    const box = document.getElementById("case-plot");
    const W = box.clientWidth || 700, small = W < 560;
    const L = small ? 30 : 100, R = 14, rowH = 40, top = 14;
    const countries = [...new Set(items.map((x) => x.c))];
    const t0 = Date.UTC(+items[0].date.slice(0, 4), 0, 1);
    const lastD = new Date(items[items.length - 1].date + "T00:00:00Z");
    const t1 = Date.UTC(lastD.getUTCFullYear() + 1, 0, 1);
    const x = (d) => L + ((Date.parse(d + "T00:00:00Z") - t0) / (t1 - t0)) * (W - L - R);
    const H = top + countries.length * rowH + 20;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "case-svg", role: "img", "aria-label": `${items.length} enforcement steps in ${countries.length} EU countries, by date` });
    for (let yy = new Date(t0).getUTCFullYear(); yy <= new Date(t1).getUTCFullYear(); yy++) {
      const xx = x(`${yy}-01-01`);
      el("line", { x1: xx, x2: xx, y1: top - 4, y2: H - 16, class: "uv-grid" }, svg);
      if (yy < new Date(t1).getUTCFullYear()) { const t = el("text", { x: xx + 3, y: H - 3, class: "uv-tick" }, svg); t.textContent = String(yy); }
    }
    countries.forEach((c, k) => {
      const cy = top + k * rowH + rowH / 2;
      const lab = el("text", { x: 0, y: cy + 4, class: "uv-lbl" }, svg); lab.textContent = small ? c : EU[c] || c;
      el("line", { x1: L, x2: W - R, y1: cy, y2: cy, class: "case-row" }, svg);
      const mine = items.filter((it) => it.c === c);
      for (const id of new Set(mine.map((it) => it.id))) {
        const steps = mine.filter((it) => it.id === id);
        if (steps.length > 1) el("line", { x1: x(steps[0].date), x2: x(steps[steps.length - 1].date), y1: cy, y2: cy, class: "case-link" }, svg);
      }
      const placed = [];
      for (const it of mine) {
        const cx = x(it.date);
        let dy = 0; while (placed.some((p) => Math.abs(p.cx - cx) < 24 && p.dy === dy)) dy += 1;
        placed.push({ cx, dy });
        const cyy = cy - dy * 24;
        const g0 = (CASE_STAGE[it.stage] || CASE_STAGE.investigation).g;
        const g = el("g", { tabindex: 0, class: "resp-mark" }, svg);
        const fill = g0 === "decided" ? css("--ink") : g0 === "charged" ? css("--ink-3") : css("--paper");
        // the source type (court page or news report) is in the table only: four encodings on one mark were too many
        el("circle", { cx, cy: cyy, r: 8, fill, stroke: g0 === "open" ? css("--ink-2") : fill, "stroke-width": 1.6 }, g);
        const t = el("text", { x: cx, y: cyy + 3.5, "text-anchor": "middle", class: "resp-num", fill: g0 === "open" ? css("--ink") : css("--paper") }, g);
        t.textContent = String(it.n);
        const tip = (px, py) => showTip(px, py, `${it.n}. ${EU[it.c]}, ${fmtD(it.date)}${it.dk === "first reported" ? " (first report)" : ""}`,
          [{ color: fill === css("--paper") ? css("--ink-2") : fill, value: (CASE_STAGE[it.stage] || {}).label || it.stage, label: `${it.goods}; route: ${it.route.map((r) => RN[r]).join(", ")}` }], it.outcome);
        g.addEventListener("pointermove", (e) => tip(e.clientX, e.clientY));
        g.addEventListener("pointerleave", hideTip);
        g.addEventListener("focus", () => { const q = g.getBoundingClientRect(); tip(q.left, q.top); });
        g.addEventListener("blur", hideTip);
      }
    });
    box.replaceChildren(svg);

    // the table
    const head = h("thead", {}, h("tr", {}, ["#", "Date", "EU country", "Step", "Route named", "Goods", "Value", "Outcome", "Source"].map((t) => h("th", { text: t }))));
    const body = items.map((it) => h("tr", {}, [
      h("td", { text: String(it.n) }),
      h("td", { text: fmtD(it.date) + (it.dk === "first reported" ? " (first report)" : "") }),
      h("td", { class: "lbl", text: EU[it.c] || it.c }),
      h("td", { class: "lbl", text: (CASE_STAGE[it.stage] || {}).label || it.stage }),
      h("td", { class: "lbl", text: it.route.map((r) => RN[r]).join(", ") + (it.also ? `; also ${it.also}` : "") }),
      h("td", { class: "lbl", text: it.goods }),
      h("td", { text: it.value }),
      h("td", { class: "lbl resp-what", text: `${it.who}. ${it.outcome}` }),
      h("td", { class: "lbl" }, [h("a", { href: it.src, target: "_blank", rel: "noopener", text: it.srcType }), it.primary ? "" : " (secondary)"]),
    ]));
    document.getElementById("case-table").replaceChildren(head, h("tbody", {}, body));
  }


  // ---------- do designations work? waves against all other months ----------
  function designationEffect() {
    const X = D.designationEffect, N = X.names;
    const order = ["KZ", "KG", "UZ"];
    const COL = { US: "--text-primary", UK: "--c-kz", EU: "--flow-eu" };
    const sg = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}%`);
    const fmtM = (m) => monthName(m);
    // headline and text from the data
    {
      const bc = X.by_country;
      const word = (w, o) => (w == null || o == null ? null : w < o - 10 ? "fell more" : w > o + 10 ? "did not fall more" : "changed as in other months");
      const kz = bc.KZ, kg = bc.KG;
      const kzW = kz.waves && kz.waves.median_effect_pct, kzO = kz.other_months && kz.other_months.median_effect_pct;
      const kgW = kg.waves && kg.waves.median_effect_pct, kgO = kg.other_months && kg.other_months.median_effect_pct;
      const strong = X.waves.filter((w) => w.share_as_low != null && w.share_as_low <= 0.1).sort((a, b) => a.effect_pct - b.effect_pct);
      document.getElementById("dx-h").textContent = kzW != null && kgW != null
        ? `After each wave of blacklistings, Kazakhstan's sales to Russia ${({ "fell more": "fell harder than its neighbours'", "did not fall more": "did not fall harder than its neighbours'" })[word(kzW, kzO)] || "moved as usual"}; Kyrgyzstan's mostly ${({ "fell more": "fell harder", "did not fall more": "did not" })[word(kgW, kgO)] || "moved as usual"}`
        : "What blacklisting did to trade";
      const rel = (v) => (v == null ? "—" : `${Math.abs(Math.round(v))}% ${v < 0 ? "behind" : "ahead of"}`);
      const rel2 = (v) => (v == null ? "—" : `${Math.abs(Math.round(v))}% ${v < 0 ? "behind" : "ahead"}`);
      const and = (a) => a.join(", ").replace(/, ([^,]*)$/, " and $1");
      document.getElementById("dx-sub").textContent =
        `In the six months after a wave, Kazakhstan's sales to Russia typically ran ${rel(kzW)} its neighbours', against ${rel2(kzO)} in ordinary months. ` +
        `Kyrgyzstan's ran ${rel2(kgW)}, against ${rel2(kgO)} in ordinary months. ` +
        (strong.length ? `${strong.length === 1 ? "One wave stands" : `${capW(NUMW[strong.length])} waves stand`} out, each followed by a fall deeper than in nine out of ten ordinary months: ` +
          and(strong.map((w) => `the ${w.lists.join(" and ")} wave on ${N[w.country]} in ${fmtM(w.month)}`)) + "." : "");
      // Payment channels against trading firms, Kyrgyzstan (where nearly all payment-channel waves are).
      const T = X.by_type, kgP = T && T.payment.KG, kgT = T && T.trade.KG;
      document.getElementById("dx-pay").textContent = kgP && kgT
        ? (kgP.median_effect_pct >= 0 ? "Going after the money did not dent Kyrgyzstan's trade. " : "") +
          `Net of its neighbours, its sales to Russia typically ${grew(1 + kgP.median_effect_pct / 100)} after the ${kgP.n <= 12 ? NUMW[kgP.n] : kgP.n} waves that hit banks, payment firms or crypto firms, and ${grew(1 + kgT.median_effect_pct / 100)} after the ${kgT.n <= 12 ? NUMW[kgT.n] : kgT.n} waves of trading firms alone. ` +
          `No single bank listing was followed by a fall. The two falls came after the August and October 2025 actions against the whole A7A5 network, when a bank, a crypto exchange, the stablecoin firm and its issuer were hit on several lists at once. The windows overlap, so it is one episode, not two.`
        : "";
      document.getElementById("dx-note").textContent =
        `Waves close together share months, so they are not independent tests, and other events, such as the April 2026 EU ban, fall in the same windows. ` +
        `Uzbekistan's sales to Russia fell in most months, so its waves are lost in the trend. Months with under $${X.min_base / 1000}k a month beforehand are dropped. ` +
        `Sales to Russia are the exporter's own records, so they are a floor; the listings are those shown above.`;
    }
    // The strip of waves is now the first row of each country in the common chart (enforcementStrip).
    // the table
    const row = (label, w, o) => h("tr", {}, [h("th", { scope: "row", text: label }), h("td", { text: w ? String(w.n) : "0" }),
      h("td", { class: "chg", text: w ? sg(w.median_effect_pct) : "—" }), h("td", { text: o ? sg(o.median_effect_pct) : "—" }),
      h("td", { text: w ? `${Math.round(100 * w.share_negative)}%` : "—" })]);
    document.getElementById("dx-table").replaceChildren(
      h("thead", {}, h("tr", {}, ["", "Waves", "Median after a wave", "Median, other months", "Waves with a fall"].map((t) => h("th", { text: t })))),
      h("tbody", {}, [
        ...order.map((c) => row(N[c], X.by_country[c].waves, X.by_country[c].other_months)),
        h("tr", { class: "group" }, h("th", { colspan: 5, scope: "rowgroup", text: "By type of organisation" })),
        row("Payment channels, Kyrgyzstan", X.by_type.payment.KG, X.by_country.KG.other_months),
        row("Trading and other firms, Kyrgyzstan", X.by_type.trade.KG, X.by_country.KG.other_months),
        row("Payment channels, all three", X.by_type.payment.all, X.all.other_months),
        row("Trading and other firms, all three", X.by_type.trade.all, X.all.other_months),
        h("tr", { class: "group" }, h("th", { colspan: 5, scope: "rowgroup", text: "By designating list (all three countries)" })),
        ...["US", "UK", "EU"].map((g) => row(g, X.by_list[g], X.all.other_months)),
      ]),
    );
  }


  // ---------- one test for every enforcement step: a strip a kind of step, a block a country ----------
  function enforcementStrip() {
    const X = D.designationEffect, E = D.eventStudy, R = D.responses;
    const box = document.getElementById("enf-plot");
    if (!X || !box) return;
    const N = X.names, order = ["KZ", "KG", "UZ"], START = X.start;
    const COL = { US: "--text-primary", UK: "--c-kz", EU: "--flow-eu" };
    const fmtD = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const SAID = new Set(["promise", "plays down", "objection"]);
    const steps = [], left = [];
    for (const w of X.waves) steps.push({ c: w.country, kind: "wave", m: w.month, pct: w.effect_pct, own: w.own_pct, others: w.others_pct,
      label: `${w.n} organisation${w.n > 1 ? "s" : ""} blacklisted (${w.lists.join(", ")})`, list: w.lists.includes("EU") ? "EU" : w.lists.includes("UK") ? "UK" : "US", payment: w.payment });
    for (const e of (E ? E.events : [])) {
      if (!e.focus) continue; // a step that hit all three cannot be netted against the other two
      const r = e.month >= START ? netEffect(e.focus, e.month) : { reason: "before Sept 2022" };
      if (r.reason) { left.push(`${e.label} (${r.reason})`); continue; }
      steps.push({ c: e.focus, kind: "event", m: e.month, pct: r.pct, own: r.own, others: r.others, label: e.label, date: e.date });
    }
    for (const x of (R || [])) {
      const [c, date, kind, actor] = x;
      const m = date.slice(0, 7);
      const r = m >= START ? netEffect(c, m) : { reason: "before Sept 2022" };
      if (r.reason) { left.push(`${N[c]}, ${fmtD(date)}, ${kind} (${r.reason})`); continue; }
      steps.push({ c, kind: SAID.has(kind) ? "said" : "did", m, pct: r.pct, own: r.own, others: r.others, label: `${actor}: ${kind}`, date });
    }
    // how unusual: below the tenth percentile of the country's months without a blacklisting
    const p10 = {};
    for (const c of order) { const b = [...X.base[c].effects_pct].sort((a, q) => a - q); p10[c] = b.length ? b[Math.floor(0.1 * (b.length - 1))] : null; }
    const unusual = steps.filter((s) => p10[s.c] != null && s.pct <= p10[s.c]);
    const KINDN = { wave: "blacklistings", event: "EU, US or UK steps aimed at one country", said: "government statements", did: "government or bank measures" };
    document.getElementById("enf-h").textContent =
      `${capW(unusual.length <= 12 ? NUMW[unusual.length] : String(unusual.length))} of ${steps.length} enforcement steps were followed by a fall deeper than in nine out of ten ordinary months`;
    {
      const by = {};
      for (const s of unusual) by[s.kind] = (by[s.kind] || 0) + 1;
      const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n <= 12 ? NUMW[n] : n} ${n === 1 ? KINDN[k].replace(/s( |$)/, "$1") : KINDN[k]}`);
      const byC = order.map((c) => [c, unusual.filter((s) => s.c === c).length]).filter(([, n]) => n);
      document.getElementById("enf-sub").textContent = unusual.length
        ? `They were ${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}, in ${byC.map(([c, n]) => `${N[c]} (${n})`).join(", ").replace(/, ([^,]*)$/, " and $1")}. Most steps were followed by nothing unusual.`
        : "None of the steps was followed by an unusual fall.";
    }
    document.getElementById("enf-note").textContent =
      `Left out: steps that hit all three countries (they cannot be measured against the other two; the sanctions-events table below compares them with EU sales to other neighbours), steps before September 2022 (their six months before include the invasion), and steps with under three months of data after. ` +
      (left.length ? `Not shown for these reasons: ${left.join("; ")}. ` : "") +
      `Windows of nearby steps overlap, so they are not independent tests, and a fall after a step does not prove the step caused it.`;

    const W = box.clientWidth || 700, small = W < 560;
    const L = small ? 92 : 210, Rm = 10, rowH = 30, headH = 22, top = 22;
    const ROWS = [["wave", "Blacklist waves"], ["event", "EU, US, UK steps"], ["did", "Government did"], ["said", "Government said"]];
    const blocks = order.map((c) => ({ c, rows: ROWS.filter(([k]) => steps.some((s) => s.c === c && s.kind === k)) }));
    const all = [...order.flatMap((c) => X.base[c].effects_pct), ...steps.map((s) => s.pct)];
    const lv = (p) => Math.log10(1 + p / 100);
    const lo = Math.min(-1, Math.floor(Math.min(...all.map(lv)) * 2) / 2), hi = Math.max(0.5, Math.ceil(Math.max(...all.map(lv)) * 2) / 2);
    const x = (p) => L + ((lv(p) - lo) / (hi - lo)) * (W - L - Rm);
    const H = top + blocks.reduce((t, b) => t + headH + b.rows.length * rowH, 0) + 10;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "dx-svg", role: "img", "aria-label": "Change in exports to Russia after each enforcement step, net of the other two countries, against months without a blacklisting" });
    const placed = [];
    for (const t of [0, -50, 100, -90, 300]) {
      if (lv(t) < lo || lv(t) > hi) continue;
      el("line", { x1: x(t), x2: x(t), y1: top - 4, y2: H - 4, class: t === 0 ? "dx-zero" : "uv-grid" }, svg);
      if (placed.some((p) => Math.abs(p - x(t)) < (small ? 38 : 56))) continue;
      const tx = el("text", { x: x(t), y: 12, "text-anchor": "middle", class: "uv-tick" }, svg); tx.textContent = t === 0 ? "0%" : sgnPct(t);
      placed.push(x(t));
    }
    let y = top;
    for (const b of blocks) {
      const hd = el("text", { x: 0, y: y + 15, class: "enf-country" }, svg); hd.textContent = N[b.c];
      y += headH;
      for (const [k, name] of b.rows) {
        const cy = y + rowH / 2;
        const lab = el("text", { x: small ? 0 : 12, y: cy + 4, class: "uv-lbl" }, svg); lab.textContent = name;
        for (const p of X.base[b.c].effects_pct) el("line", { x1: x(p), x2: x(p), y1: cy - 7, y2: cy + 7, class: "dx-tick" }, svg);
        const mine = steps.filter((s) => s.c === b.c && s.kind === k);
        mine.forEach((s, j) => {
          const cyw = cy + ((j % 3) - 1) * 4;
          const col = k === "wave" ? css(COL[s.list]) : css("--ink");
          if (k === "wave" && s.payment) el("circle", { cx: x(s.pct), cy: cyw, r: 8, fill: "none", stroke: css("--ink"), "stroke-width": 1.3 }, svg);
          const dot = el("circle", { cx: x(s.pct), cy: cyw, r: 4.6, fill: k === "said" ? css("--paper") : col, stroke: k === "said" ? col : css("--paper"), "stroke-width": k === "said" ? 1.6 : 1, tabindex: 0, class: "dx-dot" }, svg);
          const tip = (px, py) => showTip(px, py, `${N[s.c]}, ${s.date ? fmtD(s.date) : monthName(s.m)}`, [
            { color: col, value: sgnPct(s.pct), label: `net of the other two (own ${sgnPct(s.own)}, theirs ${sgnPct(s.others)})` },
          ], s.label);
          dot.addEventListener("pointermove", (e) => tip(e.clientX, e.clientY));
          dot.addEventListener("pointerleave", hideTip);
          dot.addEventListener("focus", () => { const q = dot.getBoundingClientRect(); tip(q.left, q.top); });
          dot.addEventListener("blur", hideTip);
        });
        y += rowH;
      }
    }
    box.replaceChildren(svg);
  }

  // ---------- sanctions events: three questions ----------
  const pctChange = (after, before, n) => {
    if (n != null && n < 3) return "under 3 months";
    if (after == null || before == null) return "no data";
    if (before < MIN_BASE_MONTH) { const d = after - before; return `${d >= 0 ? "+" : "−"}${moneyK(Math.abs(d))}`; }
    const v = Math.round(100 * (after / before - 1));
    return v === 0 ? "0%" : `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-US")}%`;
  };
  const pctOf = (c) => (c && c.before >= MIN_BASE_MONTH && c.after != null ? 100 * (c.after / c.before - 1) : null);

  function eventStudy() {
    const E = D.eventStudy, N = E.names;
    const evById = Object.fromEntries(E.events.map((e) => [e.id, e]));
    const fmtDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const list = (a) => a.map((c) => N[c]).join(", ").replace(/, ([^,]*)$/, " and $1");
    {
      const rows = E.table.map((r) => ({ r, v: pctOf(r.q1.ru) })).filter((x) => x.v != null);
      const fell = rows.filter((x) => x.v <= -30);
      document.getElementById("ev-h").textContent =
        `Sales to Russia dropped by more than 30% after ${fell.length} of ${rows.length} sanctions events`;
      // Two rules that small, noisy rows cannot win: the largest fall beyond the comparison countries
      // (events aimed at one country), and the largest fall in dollars.
      const sgn = (v) => `${v < 0 ? "−" : "+"}${Math.abs(Math.round(v))}%`;
      const SHORT_EV = { "kz-checks": "Kazakhstan's re-export checks", "eu-11": "the EU's 11th package", "dec-2023": "EO 14114 and the EU 'no Russia' clause",
        keremet: "the Keremet Bank designation", a7a5: "the UK sanctions on the A7A5 network", "eu-19": "the EU's 19th package",
        "kg-suspend": "Kyrgyzstan's suspension of 50 companies", "eu-21": "the EU's 21st package" };
      const evn = (r) => `${SHORT_EV[r.event] || evById[r.event].label} (${fmtDate(evById[r.event].date)})`;
      const beyond = rows.map((x) => ({ ...x, c: x.r.q3.ru ? pctOf(x.r.q3.ru) : null })).filter((x) => x.c != null).sort((a, b) => (a.v - a.c) - (b.v - b.c))[0];
      const dollars = rows.map((x) => ({ ...x, d: x.r.q1.ru.after - x.r.q1.ru.before })).sort((a, b) => a.d - b.d)[0];
      document.getElementById("ev-sub").textContent = [
        beyond && beyond.v - beyond.c < 0 ? `Against its benchmark, the sharpest fall came in ${N[beyond.r.country]} after ${evn(beyond.r)}: its sales to Russia ${grew(1 + beyond.v / 100)}, while those of ${list(beyond.r.q3.ru_who)} ${grew(1 + beyond.c / 100)}.` : "",
        dollars && dollars.d < 0 ? `In dollars, the biggest drop came after ${evn(dollars.r)}: ${N[dollars.r.country]}'s sales to Russia lost about ${moneyK(-dollars.d)} a month.` : "",
      ].filter(Boolean).join(" ");
    }
    const head = h("thead", {}, [
      h("tr", {}, [
        h("th", { text: "" }), h("th", { class: "spark-cell", text: "" }),
        h("th", { colspan: 3, text: "1. Listed goods" }),
        h("th", { text: "2. Neighbour codes" }),
        h("th", { colspan: 2, text: "3. Other countries" }),
      ]),
      h("tr", {}, [
        h("th", { text: "" }),
        h("th", { class: "spark-cell" }, ["Exports to Russia, a month", h("span", { class: "use", text: "12 months either side; line: the event; bright: the windows" })]),
        h("th", { text: "From the EU" }), h("th", { text: "From China" }), h("th", { text: "To Russia" }),
        h("th", { text: "Other codes, to Russia" }),
        h("th", { text: "Comparison, from the EU" }), h("th", { text: "Comparison, to Russia" }),
      ]),
    ]);
    const body = [];
    let last = null;
    for (const r of E.table) {
      const e = evById[r.event];
      if (r.event !== last) {
        body.push(h("tr", { class: "group" }, h("th", { colspan: 8, scope: "rowgroup" }, [
          `${fmtDate(e.date)}: ${e.label} `, h("a", { href: e.url, target: "_blank", rel: "noopener", text: "source" }),
        ])));
        last = r.event;
      }
      const lit = (i) => (i >= 6 && i < 12) || (i > 12 && i <= 18);
      const cmpEu = r.q3.eu ? h("td", { text: pctChange(r.q3.eu.after, r.q3.eu.before, r.q3.eu.n), title: `EU exports to ${list(r.q3.eu_who)}` }) : h("td", { text: "—" });
      const cmpRu = r.q3.ru ? h("td", { text: pctChange(r.q3.ru.after, r.q3.ru.before, r.q3.ru.n), title: `${list(r.q3.ru_who)} to Russia` }) : h("td", { text: "—", title: "The event covered all three route countries" });
      body.push(h("tr", {}, [
        h("th", { scope: "row", text: N[r.country] }),
        h("td", { class: "spark-cell" }, sparkline(r.spark, { color: "--flow-ru", lit, mark: 12, w: 125 })),
        ...["eu", "cn", "ru"].map((leg) => h("td", { class: leg === "ru" ? "chg" : "", text: r.q1[leg] ? pctChange(r.q1[leg].after, r.q1[leg].before, r.q1[leg].n) : "no data" })),
        h("td", { text: r.q2.ru ? pctChange(r.q2.ru.after, r.q2.ru.before, r.q2.ru.n) : "no data" }),
        cmpEu, cmpRu,
      ]));
    }
    document.getElementById("ev-table").replaceChildren(head, h("tbody", {}, body));
  }

  // ---------- the April 2026 ban: one supertable ----------
  const monthName = (mm) => new Date(mm + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const moneyK = (v) => (v == null ? "no data" : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);

  function banStudy() {
    const B = D.ban, S = B.summary.series;
    const group = state.banGoods;
    const get = (flow, country) => {
      const rows = B.monthly.filter((r) => r[0] === flow && r[1] === country && r[2] === group);
      return { months: rows.map((r) => r[3]), values: rows.map((r) => r[4]), s: S[`${flow}|${country}|${group}`] };
    };
    // A change in percent needs a base large enough to divide by; under MIN_BASE_MONTH the table gives
    // the change in money instead (+1,589% from $4k a month says nothing about size).
    const change = (after, base) => {
      if (after == null || base == null) return "—";
      if (base < MIN_BASE_MONTH) { const d = after - base; return `${d >= 0 ? "+" : "−"}${moneyK(Math.abs(d))}`; }
      const v = 100 * (after / base - 1);
      return `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString("en-US")}%`;
    };
    {
      // The headline uses the same months of 2025 as the comparison, so the season does not count as an effect.
      const p = (x) => (x && x.year_ago_avg >= MIN_BASE_MONTH && x.after_avg != null ? 100 * (x.after_avg / x.year_ago_avg - 1) : null);
      const a = p(S["eu|KG|banned"]), bb = p(S["cn|KG|banned"]), c = p(S["ru|KG|banned"]);
      document.getElementById("ban-h").textContent = a == null ? "The April 2026 EU ban on Kyrgyzstan"
        // Short: the comparison months and exports to Russia are in the text under it.
        : `After the ban, EU shipments to Kyrgyzstan ${grew(1 + a / 100)}` +
          (bb == null ? "" : bb >= 10 ? `; Kyrgyzstan bought about ${round10(bb)}% more of the same goods from China` : `; its purchases of the same goods from China ${grew(1 + bb / 100)}`);
      const n = (k) => (S[k] || {}).after_months;
      // Kazakhstan is the comparison: same customs union, same goods, no ban. The difference in points is
      // the change in Kyrgyzstan beyond the change that both countries had.
      const pt = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}`;
      const did = [["eu", "EU shipments"], ["cn", "imports from China"], ["ru", "exports to Russia"]]
        .map(([f, what]) => ({ what, g: p(S[`${f}|KG|${group}`]), z: p(S[`${f}|KZ|${group}`]) }))
        .filter((x) => x.g != null && x.z != null);
      // The three checks as a text-table, not three paragraphs of figures: one sentence says what they show.
      const NB = D.eventStudy && D.eventStudy.ban_neighbours;
      const nb = (leg, c, g) => { const x = NB && NB[`${leg}|${c}|${g}`]; return x ? pctChange(x.after, x.year_ago) : null; };
      const BU = D.unitValues && D.unitValues.ban && D.unitValues.ban.prices;
      const pk = (leg, c, w) => { const x = BU && BU[`${leg}|${c}|851762`]; return x && x[w].usd_per_kg != null && x[w].kg >= 1000 ? x[w].usd_per_kg : null; };
      const pr = (leg, c) => { const x = pk(leg, c, "before"), y = pk(leg, c, "after"); return [x == null ? "too little weight" : `$${Math.round(x)}`, y == null ? "too little weight" : `$${Math.round(y)}`]; };
      const dd = Object.fromEntries(did.map((x) => [x.what, x]));
      const ptCell = (k) => (dd[k] ? `${pt(dd[k].g - dd[k].z)} points` : "—");
      const worse = did.filter((x) => x.g - x.z < -10).map((x) => x.what), better = did.filter((x) => x.g - x.z > 10).map((x) => x.what);
      const andW = (q) => q.join(", ").replace(/, ([^,]*)$/, " and $1");
      document.getElementById("ban-did").textContent = did.length
        ? `Kazakhstan, which the ban does not cover, serves as the control.` +
          (worse.length ? ` Against it, Kyrgyzstan's ${andW(worse)} did worse` : "") +
          (better.length ? `${worse.length ? ", and its" : " Against it, Kyrgyzstan's"} ${andW(better)} did better` : "") + (worse.length || better.length ? "." : "")
        : "";
      const T = [
        ["Kyrgyzstan against Kazakhstan, same months of 2025", ptCell("EU shipments"), ptCell("imports from China"), ptCell("exports to Russia")],
        ...(NB && nb("eu", "KG", "ban") != null ? [["Other codes under 8457 and 8517, Kyrgyzstan, same months of 2025", nb("eu", "KG", "bansib"), nb("cn", "KG", "bansib"), nb("ru", "KG", "bansib")]] : []),
      ];
      const P = pk("ru", "KG", "before") != null ? [
        ["Kyrgyzstan to Russia", ...pr("ru", "KG")], ["Kazakhstan to Russia", ...pr("ru", "KZ")],
        ["EU to Kyrgyzstan", ...pr("eu", "KG")], ["China to Kyrgyzstan (Kyrgyz records)", ...pr("cn", "KG")],
      ] : [];
      document.getElementById("ban-nb").replaceChildren(
        h("table", { class: "supertable text-table" }, [
          h("thead", {}, h("tr", {}, ["", "EU to Kyrgyzstan", "China to Kyrgyzstan", "Kyrgyzstan to Russia"].map((t) => h("th", { text: t })))),
          h("tbody", {}, T.map((r) => h("tr", {}, [h("th", { scope: "row", text: r[0] }), ...r.slice(1).map((v) => h("td", { text: v == null ? "—" : v }))]))),
        ]),
        ...(P.length ? [h("table", { class: "supertable text-table" }, [
          h("thead", {}, h("tr", {}, ["Price per kg, routers and data transmitters (8517.62)", "Before the ban", "After"].map((t) => h("th", { text: t })))),
          h("tbody", {}, P.map((r) => h("tr", {}, [h("th", { scope: "row", text: r[0] }), h("td", { text: r[1] }), h("td", { text: r[2] })]))),
        ])] : []),
      );
      document.getElementById("ban-uv").textContent = "";
      document.getElementById("ban-months").textContent =
        `Post-ban data are still thin: ${n("eu|KG|banned")} months of EU exports, ${n("cn|KG|banned")} of China's and ${n("ru|KG|banned")} of exports to Russia. ` +
        `Flows under ${moneyK(MIN_BASE_MONTH)} a month beforehand show the change in dollars, not percent.`;
    }
    const name = (c) => B.summary.names[c];
    const flows = [["eu", "From the EU", "--flow-eu"], ["cn", "From China", "--text-primary"], ["ru", "To Russia", "--flow-ru"]];
    const allMonths = B.monthly.filter((r) => r[0] === "eu" && r[1] === "KG" && r[2] === group).map((r) => r[3]);
    const first = allMonths[0], lastM = allMonths[allMonths.length - 1];
    const lit = (months) => (i) => (months[i] >= D.ban.before[0] && months[i] <= D.ban.before[1]) || months[i] >= "2026-05";
    const row = (label, d, color, extraClass) => {
      const cells = [
        h("th", { scope: "row", text: label }),
        h("td", { class: "spark-cell" }, d.months.length ? sparkline(d.values, { color, lit: lit(d.months), mark: d.months.indexOf(D.ban.transition) }) : null),
        h("td", { text: d.s && d.s.before_avg != null ? moneyK(d.s.before_avg) : "no data" }),
        h("td", { text: d.s && d.s.after_avg != null ? moneyK(d.s.after_avg) : "no data" }),
        h("td", { text: d.s && d.s.after_months != null ? String(d.s.after_months) : "—" }),
        h("td", { class: "chg", text: d.s ? change(d.s.after_avg, d.s.year_ago_avg) : "—" }),
        h("td", { text: d.s ? change(d.s.after_avg, d.s.before_avg) : "—" }),
      ];
      const tr = h("tr", { class: extraClass || "" }, cells);
      const sp = tr.querySelector(".spark");
      if (sp) {
        sp.addEventListener("pointermove", (e) => {
          const r = sp.getBoundingClientRect(), i = Math.max(0, Math.min(d.months.length - 1, Math.floor(((e.clientX - r.left) / r.width) * d.months.length)));
          showTip(e.clientX, e.clientY, monthName(d.months[i]), [{ color: css(color), value: moneyK(d.values[i]), label }]);
        });
        sp.addEventListener("pointerleave", hideTip);
      }
      return tr;
    };
    const head = h("thead", {}, h("tr", {}, [
      h("th", { text: "" }),
      h("th", { class: "spark-cell" }, [`${monthName(first)} – ${monthName(lastM)}`, h("span", { class: "use", text: "bright: months in the averages; line: the ban" })]),
      h("th", { text: "Before, a month" }), h("th", { text: "After, a month" }), h("th", { text: "Months after" }),
      h("th", { text: "Against the same months of 2025" }), h("th", { text: "Against the 12 months before" }),
    ]));
    const body = [];
    for (const c of B.summary.rows) {
      body.push(h("tr", { class: "group" }, h("th", { colspan: 7, scope: "rowgroup", text: name(c) })));
      for (const [f, label, color] of flows) body.push(row(label, get(f, c), color));
    }
    const others = Object.keys(B.summary.neighbours).filter((c) => !B.summary.rows.includes(c));
    body.push(h("tr", { class: "group" }, h("th", { colspan: 7, scope: "rowgroup", text: "Other neighbours, EU exports only" })));
    for (const c of others) body.push(row(`To ${name(c)}`, get("eu", c), "--flow-eu"));
    document.getElementById("ban-super").replaceChildren(head, h("tbody", {}, body));
  }

  // ---------- section 3 ----------
  // Short plain names for the codes (the customs descriptions are long).
  const SHORT = {
    "854231": "Processors and controllers", "854232": "Memory chips", "854233": "Amplifier chips", "854239": "Other chips",
    "851762": "Routers, switches, data transmitters", "852691": "Radio navigation receivers", "853221": "Tantalum capacitors",
    "853224": "Ceramic capacitors", "854800": "Other electrical parts", "847150": "Computer processing units", "850440": "Power converters",
    "851769": "Other radio and data transmitters", "852589": "Cameras", "852910": "Antennas", "852990": "Parts of radio and TV equipment",
    "853669": "Plugs and sockets", "853690": "Other connectors", "854110": "Diodes", "854121": "Small transistors",
    "854129": "Other transistors", "854130": "Thyristors", "854149": "Light sensors", "854151": "Semiconductor sensors",
    "854159": "Other semiconductor devices", "854160": "Quartz crystals", "848210": "Ball bearings", "848220": "Tapered roller bearings",
    "848230": "Spherical roller bearings", "848250": "Cylindrical roller bearings", "880730": "Parts of aircraft and drones",
    "901310": "Telescopic sights and periscopes", "901380": "Other optical devices", "901420": "Aircraft navigation instruments",
    "901480": "Other navigation instruments", "847180": "Computer units", "848610": "Wafer-making machines",
    "848620": "Chip-making machines", "848640": "Other chip-industry machines", "853400": "Printed circuit boards",
    "854320": "Signal generators", "902750": "Optical measuring instruments", "903020": "Oscilloscopes", "903032": "Multimeters",
    "903039": "Electrical test instruments", "903082": "Wafer and chip testers", "845710": "CNC machining centres",
    "845811": "CNC horizontal lathes", "845891": "Other CNC lathes", "845961": "CNC milling machines", "846693": "Machine-tool parts",
  };
  // What each tier is used for (EU list, Feb 2024), and the two codes of the April 2026 ban (Regulation 2026/506).
  const TIER_USE = {
    "1": "Chips found in Russian missiles and drones", "2": "Radio links and satellite navigation",
    "3A": "Electronic parts, cameras, navigation", "3B": "Bearings and optics", "4A": "Tools to make and test electronics",
    "4B": "Machine tools for metal parts",
  };
  const CODE_USE = { "845710": "Precision metal parts for arms", "851762": "Field networks, drone telemetry" };

  function goods() {
    const { goodsCountry: c, goodsFlow: f } = state;
    const ly = YEARS.length - 1;
    const vals = {};
    for (const r of D.codes) {
      if (r[0] !== f || r[1] !== c || !inBasket(r[3], state.basket)) continue;
      (vals[r[3]] = vals[r[3]] || YEARS.map(() => 0))[YEARS.indexOf(r[2])] += r[4] || 0;
    }
    const avail = YEARS.map((y) => isAvail(f, c, y));
    const rowsByTier = {};
    for (const [code, v] of Object.entries(vals)) {
      const series_ = v.map((x, i) => (avail[i] ? conv(x, YEARS[i]) : null));
      if (!series_.some((x) => x)) continue;
      const tier = (chplByCode[code] || {}).tier;
      (rowsByTier[tier] = rowsByTier[tier] || []).push({ code, v: series_ });
    }
    const total = Object.values(rowsByTier).flat().reduce((t, r) => t + (r.v[ly] || 0), 0);
    const all = Object.values(rowsByTier).flat().sort((a, b) => (b.v[ly] || 0) - (a.v[ly] || 0));
    document.getElementById("goods-h").textContent = all.length && all[0].v[ly]
      ? (all[0].v[ly] / total >= 0.2
        ? `${(SHORT[all[0].code] || all[0].code).toLowerCase().replace(/^./, (x) => x.toUpperCase())} alone made up ${shareW(all[0].v[ly] / total)} of the ${YEARS[ly]} total`
        : `${(SHORT[all[0].code] || all[0].code).toLowerCase().replace(/^./, (x) => x.toUpperCase())} led the ${YEARS[ly]} list, with ${shareW(all[0].v[ly] / total)} of the total`)
      : "Which goods";
    document.getElementById("goods-sub").textContent =
      `${FLOW[f].label(c)} by code, in millions of ${priceLabel()}. Codes sit in the tiers of the EU list, with each tier's use given in its own row. Within a tier, the trend lines share a scale. Codes worth less than ${cur()}${MIN_BASE}M a year before the war get no multiple (—).`;

    const fmt = (x) => (x == null ? "—" : x === 0 ? "" : x < 0.05 ? "<0.1" : x >= 100 ? x.toFixed(0) : x.toFixed(1));
    const cell = (x) => h("td", { class: x != null && x > 0 && x < 0.05 ? "tiny" : "", text: fmt(x) });
    const head = h("thead", {}, h("tr", {}, [h("th", { text: "Code" }), h("th", { text: "Goods" }), ...YEARS.map((y) => h("th", { text: String(y) })),
      h("th", { class: "spark-cell", text: "Trend" }),
      h("th", {}, [`×${baseLabel().replace(" average", "")}`, h("span", { class: "use", text: `—: base under ${cur()}${MIN_BASE}M` })])]));
    const body = [];
    for (const t of Object.keys(TIER_NAMES)) {
      const rows = (rowsByTier[t] || []).sort((a, b) => (b.v[ly] || 0) - (a.v[ly] || 0));
      if (!rows.length) continue;
      const [tname, what] = TIER_NAMES[t].split(": ");
      body.push(h("tr", { class: "group" }, h("th", { colspan: YEARS.length + 4, scope: "rowgroup" }, [`${tname}, ${what}`, h("span", { class: "use", text: TIER_USE[t] })])));
      // one scale for every sparkline in the tier, so a tall line is a large flow
      const tierMax = Math.max(...rows.flatMap((r) => r.v).filter((x) => x != null), 1e-9);
      for (const r of rows) {
        const b0 = usableBase(r.v), anyBase = rawBase(r.v) != null;
        const tr = h("tr", { tabindex: 0 }, [
          h("td", { class: "code" }, h("a", { href: "#explorer", class: "xp-link", "data-code": r.code, text: fmtCode(r.code), title: "Open in the code explorer" })),
          h("th", { scope: "row" }, [SHORT[r.code] || (chplByCode[r.code] || {}).description,
            D.art12f.includes(r.code) ? h("span", { class: "ban-key", text: "EU ban" }) : null,
            (D.weapons || []).some((w) => w[0] === r.code) ? h("span", { class: "weapon-key", text: "in weapons", title: (D.weapons || []).filter((w) => w[0] === r.code).map((w) => `${w[1]}: ${w[2]}`).join("; ") + " (IISS/CAR 2025)" }) : null,
            CODE_USE[r.code] ? h("span", { class: "use", text: CODE_USE[r.code] }) : null]),
          ...r.v.map(cell),
          h("td", { class: "spark-cell" }, sparkline(r.v, { kind: "line", color: FLOW[f].color, w: 90, h: 22, max: tierMax })),
          b0 && r.v[ly] != null ? h("td", { class: "chg", text: fmtX(r.v[ly] / b0) })
            : h("td", { class: "chg small", title: anyBase ? smallBaseNote(r.v) : "", text: "—" }),
        ]);
        const show = (x, y) => showTip(x, y, `${fmtCode(r.code)}: ${(chplByCode[r.code] || {}).description}`, [
          { color: css(FLOW[f].color), value: fmtMoney(r.v[ly]), label: `${YEARS[ly]}, ${total ? ((100 * (r.v[ly] || 0)) / total).toFixed(1) : 0}% of total` },
        ], noteFor(r.code));
        tr.addEventListener("pointermove", (e) => show(e.clientX, e.clientY));
        tr.addEventListener("pointerleave", hideTip);
        body.push(tr);
      }
    }
    body.push(h("tr", { class: "total" }, [h("td"), h("th", { scope: "row", text: "All codes shown" }),
      ...YEARS.map((_, i) => h("td", { text: avail[i] ? fmt(Object.values(rowsByTier).flat().reduce((tt, r) => tt + (r.v[i] || 0), 0)) : "—" })), h("td"), h("td")]));
    document.getElementById("goods-super").replaceChildren(head, h("tbody", {}, body));
  }

  // ---------- cross-checks (always full basket, USD) ----------
  function crossChecks() {
    const at = (vals, y) => vals[YEARS.indexOf(y)];
    const kzru = series("ru", "Kazakhstan", "all", true);
    const kgru = series("ru", "Kyrgyzstan", "all", true);
    const kgeu = series("eu", "Kyrgyzstan", "all", true);
    const pctV = (a, b) => (a == null || !b ? null : Math.round(100 * (a / b - 1)));
    const pct = (a, b) => { const v = pctV(a, b); return v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("en-US")}%`; };
    // "Match" only within 2 points of the published figure; otherwise say how far off we are.
    const verdict = (ours, published) => {
      if (ours == null) return "—";
      const d = ours - published;
      return Math.abs(d) <= 2 ? "Match" : `Close (${Math.abs(d)} points ${d < 0 ? "lower" : "higher"})`;
    };
    const x = (a, b) => (a == null || !b ? "—" : `×${(a / b).toFixed(1)}`);
    const avg = (v) => baseOf(v, "avg"), y21 = (v) => baseOf(v, "2021");
    // The rest of the page uses 2025 prices; give that value too, so one flow does not show two unexplained multiples.
    const real = (v) => v.map((q, i) => (q == null ? null : deflate(q, YEARS[i], "USD")));
    const kgeuR = real(kgeu), kgruR = real(kgru);
    const kgmi = series("mi", "Kyrgyzstan", "all", true);
    const kgRatio = (y) => { const e = at(kgeu, y), m = at(kgmi, y); return e && m != null ? (100 * m) / e : null; };
    const kgPre = (() => { let se = 0, sm = 0; for (const y of D.baselineYears) { const e = at(kgeu, y), m = at(kgmi, y); if (e && m != null) { se += e; sm += m; } } return se ? (100 * sm) / se : null; })();
    const rows = [
      ["Mirror ratio, Kyrgyzstan: 2022 vs pre-war", "about −50 points (Armenia and Kyrgyzstan, sanctioned goods)", "EBRD, “The Eurasian roundabout” (2023)", "https://users.ox.ac.uk/~econ0247/Roundabout.pdf",
        kgRatio(2022) == null || kgPre == null ? "—" : `${String(Math.round(kgRatio(2022) - kgPre)).replace("-", "−")} points (${Math.round(kgPre)}% → ${Math.round(kgRatio(2022))}%)`,
        "Same direction. EBRD covers a wider list of sanctioned goods and only March to December."],
      ["Kazakhstan → Russia, 2022 vs 2021", "+401%", "The Moscow Times, from Comtrade", "https://www.themoscowtimes.com/2024/09/16/should-the-west-sanction-russias-neighbors-in-central-asia-a86310/pdf",
        pct(at(kzru, 2022), at(kzru, 2021)), verdict(pctV(at(kzru, 2022), at(kzru, 2021)), 401)],
      ["Kazakhstan → Russia, 2023 vs 2022", "−5%", "The Moscow Times, from Comtrade", "https://www.themoscowtimes.com/2024/09/16/should-the-west-sanction-russias-neighbors-in-central-asia-a86310/pdf",
        pct(at(kzru, 2023), at(kzru, 2022)), verdict(pctV(at(kzru, 2023), at(kzru, 2022)), -5)],
      ["EU → Kyrgyzstan, Jan–Oct 2025 vs pre-war", "almost +800% (×9)", "Regulation (EU) 2026/506, recital 34", "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R0506",
        `2025: ${x(at(kgeu, 2025), avg(kgeu))} vs 2019–21 (${x(at(kgeuR, 2025), avg(kgeuR))} in 2025 prices), ${x(at(kgeu, 2025), y21(kgeu))} vs 2021`, "Ours comes out lower. The regulation states neither its baseline nor its exact codes."],
      ["Kyrgyzstan → Russia, Jan–Oct 2025 vs pre-war", "+1,200% (×13)", "Regulation (EU) 2026/506, recital 34", "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R0506",
        `2025: ${x(at(kgru, 2025), avg(kgru))} vs 2019–21 (${x(at(kgruR, 2025), avg(kgruR))} in 2025 prices), ${x(at(kgru, 2025), y21(kgru))} vs 2021`,
        `Ours comes out lower. Our pre-war base is just $${fmtM(avg(kgru))}M a year ($${fmtM(avg(kgruR))}M in 2025 prices), so small moves swing the multiple.`],
      ["Kyrgyz companies' sales to Russia, 2023", "$98M (Jan–Oct, by country of seller)", "KSE, Russian customs records, earlier 45-code version of the list", "https://sanctions.kse.ua/wp-content/uploads/2024/01/Challenges-of-Export-Controls-Enforcement.pdf",
        `$${fmtM(at(kgru, 2023))}M (full year, Kyrgyzstan's exports to Russia)`, "A different measure. KSE counts sales by Kyrgyz companies, mostly of goods shipped from elsewhere; by country of dispatch, Kyrgyzstan is outside KSE's top ten (the tenth is $75M)."],
    ];
    // Monthly exports to Russia of the three countries (from the designations data), for the Commission's check.
    const FL = D.designations && D.designations.flows;
    if (FL) {
      const sumM = (ms) => { let t = 0; for (const c of ["KZ", "KG", "UZ"]) for (const m of ms) { const r = (FL[c] || []).find((x) => x[0] === m); if (!r || r[1] == null) return null; t += r[1]; } return t / ms.length; };
      const y23 = sumM(Array.from({ length: 12 }, (_, i) => `2023-${String(i + 1).padStart(2, "0")}`)), e25 = sumM(["2025-01", "2025-02", "2025-03", "2025-04"]);
      rows.push(["Kazakhstan, Kyrgyzstan and Uzbekistan → Russia, Jan–Apr 2025 vs the 2023 average", "−32%", "European Commission, answer to Parliament question E-10-2025-004532",
        "https://www.europarl.europa.eu/doceo/document/E-10-2025-004532-ASW_EN.html", pct(e25, y23), verdict(pctV(e25, y23), -32)]);
    }
    const kzru25 = at(kzru, 2025), kzru24 = at(kzru, 2024);
    rows.push(["Kazakhstan → Russia, 2024 and 2025", "$229M and $77M (“controlled” high-priority goods)", "CISES (Sep 2026)",
      "https://cises.org/2026/09/24/why-kyrgyzstan-is-central-asias-most-persistent-sanctions-evasion-pathway/",
      kzru24 == null ? "—" : `$${fmtM(kzru24)}M and $${fmtM(kzru25)}M`,
      "2024 matches, 2025 does not. CISES does not publish its codes, and bearings alone make up a third of our 2025 value."]);
    const MC = D.mirrorCn;
    if (MC) {
      const tot = (side) => { const r = MC.rows.find((q) => q[0] === "KG" && q[1] === 2025 && q[2] === side); return r ? r[4] : null; };
      const cnT = tot("cn"), imT = tot("imp");
      rows.push(["China → Kyrgyzstan, all goods, 2025: China's records against Kyrgyzstan's", "nearly $22bn against $4.8bn", "Kharon", "https://www.kharon.com/brief/eu-russia-sanctions-kyrgyzstan-ukraine-war-trade",
        cnT && imT ? `$${(cnT / 1000).toFixed(1)}bn against $${(imT / 1000).toFixed(2)}bn` : "—", cnT && imT ? "Match" : "—"]);
    }
    const t = document.getElementById("xc-table");
    t.replaceChildren(
      h("thead", {}, h("tr", {}, ["Check", "Published", "Source", "Ours", "Result"].map((c) => h("th", { text: c })))),
      h("tbody", {}, rows.map((r) => h("tr", {}, [
        h("td", { text: r[0], "data-label": "Check" }), h("td", { text: r[1], "data-label": "Published" }),
        h("td", { "data-label": "Source" }, h("a", { href: r[3], target: "_blank", rel: "noopener", text: r[2] })),
        h("td", { text: r[4], "data-label": "Ours" }), h("td", { text: r[5], "data-label": "Result" }),
      ])))
    );
  }

  // ---------- wire up ----------
  const basketSel = document.getElementById("f-basket");
  basketSel.replaceChildren(
    h("option", { value: "all", text: "All 49 codes" }),
    ...Object.entries(TIER_NAMES).map(([k, v]) => h("option", { value: k, text: v })),
    h("option", { value: "art12f", text: "The two EU-ban codes (8457.10, 8517.62)" }),
  );
  basketSel.addEventListener("change", () => { state.basket = basketSel.value; renderFiltered(); });
  seg(document.getElementById("f-currency"), [{ value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }], () => state.currency, (v) => { state.currency = v; renderFiltered(); });
  seg(document.getElementById("f-prices"), [{ value: "real", label: `${REF_YEAR} prices` }, { value: "nominal", label: "Current prices" }], () => state.prices, (v) => { state.prices = v; renderFiltered(); });
  seg(document.getElementById("f-baseline"), [{ value: "avg", label: "Base 2019–21" }, { value: "2021", label: "Base 2021" }], () => state.baseline, (v) => { state.baseline = v; renderFiltered(); });

  seg(document.getElementById("route-years"), YEARS.map((y) => ({ value: y, label: String(y) })), () => state.routeYear, (v) => { state.routeYear = v; routeAll(); });

  const countryOpts = D.countries.map((c) => ({ value: c, label: c }));
  seg(document.getElementById("flows-country"), countryOpts, () => state.flowsCountry, (v) => { state.flowsCountry = v; flows(); });
  {
    // the explorer's code list: grouped by tier, short names
    const sel = document.getElementById("xp-code");
    if (sel) {
      const byTier = {};
      for (const r of D.chpl) if (!D.excluded.includes(r.hs6)) (byTier[r.tier] = byTier[r.tier] || []).push(r);
      for (const t of Object.keys(TIER_NAMES)) {
        if (!byTier[t]) continue;
        const g = h("optgroup", { label: TIER_NAMES[t] });
        for (const r of byTier[t]) g.appendChild(h("option", { value: r.hs6, text: `${fmtCode(r.hs6)} ${SHORT[r.hs6] || r.description}` }));
        sel.appendChild(g);
      }
      sel.value = state.xpCode;
      sel.addEventListener("change", () => { state.xpCode = sel.value; codeExplorer(); });
      // a code in the goods table opens it here
      document.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest("a.xp-link");
        if (!a) return;
        state.xpCode = a.dataset.code; sel.value = state.xpCode; codeExplorer();
      });
    }
  }
  if (D.unitValues) seg(document.getElementById("uv-year"), [2021, 2022, 2023, 2024, 2025].map((y) => ({ value: y, label: String(y) })), () => state.uvYear, (v) => { state.uvYear = v; uvStudy(); });
  if (D.ban) seg(document.getElementById("ban-goods"), [{ value: "banned", label: "The two banned codes" }, { value: "other", label: "The other 47 codes" }], () => state.banGoods, (v) => { state.banGoods = v; banStudy(); });
  if (D.members) seg(document.getElementById("mem-dest"), [{ value: "all", label: "All three" }, { value: "KZ", label: "Kazakhstan" }, { value: "KG", label: "Kyrgyzstan" }, { value: "UZ", label: "Uzbekistan" }], () => state.memDest, (v) => { state.memDest = v; membersStudy(); });
  seg(document.getElementById("tiers-country"), countryOpts, () => state.tiersCountry, (v) => { state.tiersCountry = v; tiers(); });
  seg(document.getElementById("goods-country"), countryOpts, () => state.goodsCountry, (v) => { state.goodsCountry = v; goods(); });
  seg(document.getElementById("goods-flow"), [{ value: "eu", label: FLOW.eu.short }, { value: "mi", label: "Recorded imports" }, { value: "ru", label: FLOW.ru.short }], () => state.goodsFlow, (v) => { state.goodsFlow = v; goods(); });

  {
    const dd = document.getElementById("data-dates");
    const B = D.ban && D.ban.summary;
    const mn = (m) => (m ? monthName(m) : "—");
    if (dd) dd.textContent = `Data: yearly ${YEARS[0]}–${YEARS[YEARS.length - 1]}` +
      (B ? `; monthly, EU exports to ${mn(B.comext_last_month)}, exports to Russia to ${mn(B.comtrade_last_month.KZ)} (Kazakhstan), ` +
        `${mn(B.comtrade_last_month.KG)} (Kyrgyzstan), ${mn(B.comtrade_last_month.UZ)} (Uzbekistan)` : "") +
      (B && B.comext_updated ? `. EU data as Eurostat published it on ${new Date(B.comext_updated + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : "") +
      `. Built ${D.built}.`;
  }
  document.getElementById("built").textContent =
    `Site built ${D.built}. Sources: Eurostat Comext (DS-045409), UN Comtrade, Kazakhstan Bureau of National Statistics, OpenSanctions (CC BY-NC 4.0), ECB exchange rates, European Commission CHPL list (Feb 2024). Code: MIT licence.`;

  // A line above each chart that the filters change, so the reader sees what it shows.
  function scopes() {
    const goods = basketLabel(), money = priceLabel(), base = `against the ${baseLabel()}`;
    const set = (id, parts) => { const n = document.getElementById(id); if (n) n.textContent = parts.filter(Boolean).join(" · "); };
    set("scope-legs", [goods, money, base]);
    set("scope-sup", [goods, money, "one log scale for all three"]);
    set("scope-cmp", [goods, money, base]);
    set("scope-mirror", [goods, `pre-war ratio: ${baseLabel()}`]);
    set("scope-ctl", [goods, `pre-war share: ${baseLabel()}`]);
    set("scope-exc", ["All 49 codes (goods and price filters do not apply)", `against the ${baseLabel()}`, "one log scale"]);
    set("scope-tiers", ["Each tier separately (goods filter does not apply)", money, base]);
    set("scope-goods", [goods, money, base]);
  }
  function renderFiltered() {
    document.getElementById("f-note").textContent = `The filters apply to every chart with a filter line above it. Prices: ${state.prices === "real" ? `${state.currency === "EUR" ? "euro-area HICP" : "US consumer prices (CPI-U)"}, ${REF_YEAR} = 100` : "as recorded each year"}.`;
    scopes();
    routeAll(); flows(); comparison(); mirror(); tiers(); goods();
    if (D.mirrorCn) mirrorChina();
    if (D.unitValues) uvStudy();
    if (D.designations) designationStudy();
    if (D.responses) responsesStudy();
    if (D.cases) casesStudy();
    if (D.members) membersStudy();
    if (D.designationEffect) designationEffect();
    enforcementStrip();
    if (D.estimate) estimateStudy();
    codeExplorer();
    if (D.eventStudy) eventStudy();
    if (D.ban) banStudy();
    if (D.control) controlStudy();
    if (D.excess) excessStudy();
    if (D.suppliers) supplierStudy();
    summaryBox();
  }
  function renderAll() { renderFiltered(); crossChecks(); }
  renderAll();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { route.paths = null; routeAll(); flows(); comparison(); mirror(); tiers(); if (D.mirrorCn) mirrorChina(); if (D.unitValues) uvStudy(); if (D.designations) designationStudy(); if (D.responses) responsesStudy(); if (D.cases) casesStudy(); if (D.members) membersStudy(); if (D.designationEffect) designationEffect(); enforcementStrip(); if (D.estimate) estimateStudy(); codeExplorer(); if (D.eventStudy) eventStudy(); if (D.ban) banStudy(); if (D.control) controlStudy(); if (D.excess) excessStudy(); if (D.suppliers) supplierStudy(); }, 120); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { route.paths = null; renderAll(); });
  window.addEventListener("scroll", hideTip, { passive: true });
})();
