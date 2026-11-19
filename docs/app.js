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
    basket: "all", currency: "USD", baseline: "avg",
    flowsCountry: "Kazakhstan", goodsCountry: "Kazakhstan", goodsFlow: "ru", goodsYear: 2023,
    routeYear: YEARS[YEARS.length - 1], tiersCountry: "Kazakhstan", banGoods: "banned",
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
  const conv = (usdM, year) => (state.currency === "EUR" ? usdM / D.fx[String(year)] : usdM);

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
  const baseLabel = (mode = state.baseline) => (mode === "avg" ? "2019–21 average" : "2021");
  const indexOf = (vals, mode) => { const b = baseOf(vals, mode); return vals.map((v) => (v == null || b == null ? null : (100 * v) / b)); };
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
  const fmtX = (v) => (v == null ? "—" : `×${v >= 10 ? v.toFixed(0) : v.toFixed(1)}`);

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
    return out.length > 8 ? out.filter((v) => /^1/.test(String(v))) : out;
  }

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
    const m = { top: opts.events ? 30 : 22, right, bottom: 26, left: small ? 42 : 52 };
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
      const l0 = Math.log10(lo), l1 = Math.log10(hi);
      y = (v) => m.top + ih - ((Math.log10(Math.max(v, lo)) - l0) / (l1 - l0)) * ih;
    } else {
      ticks = niceTicks((opts.ymax != null ? opts.ymax : Math.max(...all, ...(opts.refs || []).map((r) => r.value || 0))) * 1.05);
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
      el("line", { x1: m.left, x2: W - m.right + 8, y1: y(r.value), y2: y(r.value), stroke: css(r.color), "stroke-width": 1, "stroke-dasharray": "2 4", "stroke-opacity": 0.9 }, svg);
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
      for (const e of opts.events) {
        if (!(e.pos >= -0.5 && e.pos <= YEARS.length - 0.5)) continue;
        const ex = x(e.pos);
        el("line", { x1: ex, x2: ex, y1: m.top - 10, y2: m.top + ih, stroke: css("--axis"), "stroke-dasharray": "3 3" }, svg);
        el("circle", { cx: ex, cy: m.top - 18, r: 8, fill: css("--surface-2"), stroke: css("--axis") }, svg);
        const t = el("text", { x: ex, y: m.top - 14, "text-anchor": "middle", class: "evn" }, svg);
        t.textContent = e.n;
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
      el("path", { d, fill: "none", stroke: col, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      s.values.forEach((v, i) => {
        if (v == null || (opts.log && v <= 0)) return;
        if (s.marker === "square") el("rect", { x: x(i) - 4, y: y(v) - 4, width: 8, height: 8, rx: 1, fill: col, stroke: surface, "stroke-width": 2, "paint-order": "stroke" }, svg);
        else el("circle", { cx: x(i), cy: y(v), r: 4, fill: col, stroke: surface, "stroke-width": 2, "paint-order": "stroke" }, svg);
      });
      let li = s.values.length - 1;
      while (li >= 0 && (s.values[li] == null || (opts.log && s.values[li] <= 0))) li--;
      if (li >= 0) ends.push({ x: x(li), y: y(s.values[li]), text: opts.fmt(s.values[li]), name: s.endName || s.label });
    }
    ends.sort((a, b) => a.y - b.y);
    const step = opts.endNames ? 32 : 16;
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < step) ends[i].y = ends[i - 1].y + step;
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
      `In ${yr} the EU exported `, h("b", { text: g(kz, "eu") }), ` of ${state.basket === "all" ? "these goods" : "the selected goods"} to ${kz} and `,
      h("b", { text: g(kg, "eu") }), ` to ${kg}. ${kz} reported `, h("b", { text: g(kz, "ru") }), ` of the same goods exported to Russia, and ${kg} `,
      h("b", { text: g(kg, "ru") }), ". Band widths are to scale. The two legs are measured separately: the second leg also carries goods from China and other suppliers, so it is not only EU goods passing through.",
    );
  }
  function routeAll() { routeCaption(); routeDiagram(); }

  function summaryBox() {
    const el = document.getElementById("summary");
    if (!el) return;
    const ly = YEARS.length - 1, yr = YEARS[ly];
    const items = [];
    const usd = (v) => (v == null ? "no data" : v >= 1000 ? `$${(v / 1000).toFixed(2)}bn` : `$${fmtM(v)}M`);
    if (D.suppliers) {
      const sum = (sup, dest, i) => {
        if (D.suppliers.meta.missing.includes(`${sup}|${dest}|${YEARS[i]}`)) return null;
        let t = 0;
        for (const r of D.suppliers.rows) if (r[0] === sup && r[1] === dest && r[2] === YEARS[i] && !D.excluded.includes(r[3]) && r[4] != null) t += r[4];
        return t;
      };
      const e0 = sum("eu", "RU", 0), e1 = sum("eu", "RU", ly), c0 = sum("cn", "RU", 0), c1 = sum("cn", "RU", ly);
      items.push([`EU exports of these goods directly to Russia fell from `, usd(e0), ` in ${YEARS[0]} to `, usd(e1), ` in ${yr}.`]);
      items.push([`China's rose from `, usd(c0), ` to `, usd(c1), `.`]);
    }
    const [kz, kg] = D.countries;
    const mult = (c) => { const v = series("ru", c, "all", true), b = baseOf(v, "avg"); return b && v[ly] != null ? v[ly] / b : null; };
    items.push([`Kyrgyzstan's exports of these goods to Russia are `, fmtX(mult(kg)), ` their 2019–21 level; Kazakhstan's `, fmtX(mult(kz)), `.`]);
    // Mirror gap above the pre-war ratio, all codes, 2022 onwards, both countries.
    let excess = 0;
    for (const c of D.countries) {
      const eu = series("eu", c, "all", true), mi = series("mi", c, "all", true);
      let se = 0, sm = 0;
      for (const y of D.baselineYears) { const i = YEARS.indexOf(y); if (eu[i] && mi[i] != null) { se += eu[i]; sm += mi[i]; } }
      if (!se) continue;
      const pre = sm / se;
      YEARS.forEach((y, i) => { if (y >= 2022 && eu[i] && mi[i] != null) excess += Math.max(0, eu[i] * pre - mi[i]); });
    }
    if (excess > 0) {
      items.push([`Since 2022, at least `, usd(excess), ` of EU shipments to the two countries is missing from their import records, above the pre-war gap.`]);
    }
    el.replaceChildren(...items.map((parts) => h("li", {}, parts.map((x, i) => (i % 2 ? h("b", { text: x }) : x)))));
  }

  // ---------- section 1 ----------
  function flows() {
    const c = state.flowsCountry;
    const s = ["eu", "ru"].map((f) => ({ label: FLOW[f].label(c), endName: f === "eu" ? "from the EU" : "to Russia", color: FLOW[f].color, values: series(f, c) }));
    // The finding, from the data: the pre-war level against the latest year, for each leg.
    const last = YEARS.length - 1, ly = YEARS[last];
    const say = (vals, what) => {
      const b = baseOf(vals), l = vals[last];
      if (b == null || l == null) return `${what}: not enough data for this selection.`;
      return `${what} went from ${fmtMoney(b)} a year (${baseLabel()}) to ${fmtMoney(l)} in ${ly}, ${fmtX(l / b)}.`;
    };
    {
      const ru = s[1].values, b = baseOf(ru), l = ru[last];
      document.getElementById("flows-h").textContent = b && l != null
        ? `${c}'s exports of these goods to Russia are ${fmtX(l / b)} their pre-war level`
        : "Both legs, year by year";
    }
    document.getElementById("flows-sub").textContent =
      `${say(s[0].values, `EU exports to ${c}`)} ${say(s[1].values, `${c}'s exports to Russia`)}`;
    document.getElementById("flows-legend").replaceChildren();
    const ev = eventsFor(c);
    lineChart(document.getElementById("flows-chart"), {
      series: s, fmt: fmtMoney, events: ev, endNames: true,
      topTickFmt: (t) => `${cur()}${t.toLocaleString("en-US")}M`,
      aria: `${c}: EU-27 exports and exports to Russia, ${basketLabel()}, ${state.currency} million, 2019 to 2025`,
    });
    const lastPos = YEARS.length - 0.5;
    document.getElementById("flows-events").replaceChildren(...ev.map((e) =>
      h("li", {}, [
        h("span", { class: "evbadge", text: String(e.n) }),
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
      document.getElementById("cmp-sub").textContent =
        `In ${YEARS[ly]}, ${kz} exported ${fmtMoney(rz[ly])} of these goods to Russia` +
        (size ? `, ${fmtX(size).replace("×", "")} times ${kg}'s ${fmtMoney(rg[ly])}. ` : ". ") +
        (gz != null && gg != null ? `Against the ${baseLabel()}, ${kg}'s exports grew ${fmtX(gg)}, ${kz}'s ${fmtX(gz)}.` : "");
    }
    const mk = (key) => D.countries.map((c) => ({ label: c, color: COUNTRY[c].color, marker: COUNTRY[c].marker, values: data[c][key] }));
    const cap = `times the ${baseLabel()}, log scale`;
    document.getElementById("cmp-eu-cap").textContent = cap;
    document.getElementById("cmp-ru-cap").textContent = cap;
    legend(document.getElementById("cmp-legend"), mk("eu"));
    // One log scale for both panels, so a step up means the same growth in each.
    const allX = D.countries.flatMap((c) => [...data[c].eu, ...data[c].ru]).filter((v) => v > 0);
    const dom = [Math.min(...allX, 1) * 0.8, Math.max(...allX, 1) * 1.15];
    const xt = (t) => `×${t < 1 ? t : t.toLocaleString("en-US")}`;
    lineChart(document.getElementById("cmp-eu"), { series: mk("eu"), fmt: fmtX, tickFmt: xt, log: true, baseline: 1, domain: dom, aria: `EU-27 exports as a multiple of the ${baseLabel()}` });
    lineChart(document.getElementById("cmp-ru"), { series: mk("ru"), fmt: fmtX, tickFmt: xt, log: true, baseline: 1, domain: dom, aria: `Exports to Russia as a multiple of the ${baseLabel()}` });
    lineChart(document.getElementById("cmp-ratio"), { series: mk("ratio"), fmt: fmtPct, tickFmt: (t) => t + "%", aria: "Scale ratio: exports to Russia as percent of EU-27 exports" });
    const head = ["Year"];
    for (const c of D.countries) head.push(`${c}: EU exports, ×`, `${c}: to Russia, ×`, `${c}: ratio`);
    table(document.getElementById("cmp-table"), head, YEARS.map((yr, i) => {
      const row = [String(yr)];
      for (const c of D.countries) row.push(fmtX(data[c].eu[i]), fmtX(data[c].ru[i]), fmtPct(data[c].ratio[i]));
      return row;
    }));
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
    const s = D.countries.map((c) => ({ label: c, color: COUNTRY[c].color, marker: COUNTRY[c].marker, values: data[c].ratio }));
    const legendEl = document.getElementById("mirror-legend");
    legendEl.replaceChildren(h("span", {}, [h("i", { class: "dash" }), "Dashed: each country's pre-war level"]));
    lineChart(document.getElementById("mirror-chart"), {
      series: s, fmt: fmtPct, tickFmt: (t) => t + "%", baseline: 100, endNames: true,
      refs: D.countries.map((c) => ({ value: data[c].pre, color: COUNTRY[c].color })),
      aria: "Mirror ratio: imports from EU-27 as recorded by the country, divided by EU-27 exports, percent",
    });

    {
      let best = null;
      for (const c of D.countries) {
        const d = data[c];
        d.ratio.forEach((v, i) => {
          if (v != null && d.pre != null && YEARS[i] >= 2022 && (!best || d.pre - v > best.drop)) best = { c, i, v, drop: d.pre - v };
        });
      }
      document.getElementById("mirror-h").textContent = best && best.drop > 5
        ? `In ${YEARS[best.i]}, ${best.c}'s import records showed only ${Math.round(best.v)}% of what the EU shipped`
        : "The importers' records match the EU's shipments";
    }
    // Summary: the year with the largest excess gap for each country.
    const parts = D.countries.map((c) => {
      const d = data[c];
      let bi = -1;
      d.excess.forEach((v, i) => { if (v != null && (bi < 0 || v > d.excess[bi])) bi = i; });
      if (bi < 0 || d.pre == null) return `${c}: not enough data for this selection.`;
      const yr = YEARS[bi];
      return `${c}: in ${yr}, the import records show ${fmtPct(d.ratio[bi])} of the EU exports (pre-war: ${fmtPct(d.pre)}, ${d.used.length > 1 ? `${d.used[0]}–${String(d.used[d.used.length - 1]).slice(2)}` : d.used[0]}). ` +
        `The gap is ${fmtMoney(d.gap[bi])}, of which ${fmtMoney(Math.max(0, d.excess[bi]))} is above the pre-war level.`;
    });
    const sum = document.getElementById("mirror-summary");
    sum.replaceChildren(h("strong", { text: `${basketLabel()}. ` }), ...parts.flatMap((p, i) => (i ? [h("br"), p] : [p])));

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
      const be = baseOf(eu), br = baseOf(ru);
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
        h("figcaption", {}, [`${name}, ${what}`, h("span", { text: `${ly}: ${fmtMoney(p.eu[last])} from the EU, ${fmtMoney(p.ru[last])} to Russia` })]),
        box,
      ]);
      fig.dataset.tier = p.t;
      return fig;
    }));
    const xt = (t) => `×${t < 1 ? t : t.toLocaleString("en-US")}`;
    panels.forEach((p, i) => {
      lineChart(grid.children[i].querySelector(".chart"), {
        series: [
          { label: `from the EU`, color: FLOW.eu.color, values: p.xeu },
          { label: `to Russia`, color: FLOW.ru.color, values: p.xru },
        ],
        fmt: fmtX, tickFmt: xt, log: true, baseline: 1, domain: dom,
        aria: `${TIER_NAMES[p.t]}, ${c}: EU exports and exports to Russia as multiples of the ${baseLabel()}`,
      });
    });
    legend(document.getElementById("tiers-legend"), [
      { label: `EU exports to ${c}`, color: FLOW.eu.color }, { label: `${c}'s exports to Russia`, color: FLOW.ru.color },
    ]);
    // Finding: which tier grew most on the Russia leg.
    const ranked = panels.filter((p) => p.xru[last] != null).sort((a, b) => b.xru[last] - a.xru[last]);
    document.getElementById("tiers-h").textContent = ranked.length
      ? `${TIER_NAMES[ranked[0].t].split(": ")[1].replace(/^./, (x) => x.toUpperCase())} grew fastest on the way to Russia`
      : "Tier by tier";
    document.getElementById("tiers-sub").textContent = ranked.length
      ? `In ${ly}, ${c}'s exports to Russia grew most in ${TIER_NAMES[ranked[0].t].split(": ")[0].replace("Tier", "tier")} (${TIER_NAMES[ranked[0].t].split(": ")[1]}), ${fmtX(ranked[0].xru[last])} the ${baseLabel()}, and least in ${TIER_NAMES[ranked[ranked.length - 1].t].split(": ")[0].replace("Tier", "tier")}, ${fmtX(ranked[ranked.length - 1].xru[last])}.`
      : "Not enough data for this country.";
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
    const dests = Object.keys(meta.destinations);
    const rows = dests.map((d) => ({ d, name: meta.destinations[d], eu: ser("eu", d), cn: ser("cn", d) }));
    const ly = YEARS.length - 1, yr = YEARS[ly];

    // Heading and finding, from the data (they follow the filters).
    const route = rows.filter((r) => r.d !== "RU");
    const both = route.filter((r) => r.eu[ly] != null && r.cn[ly] != null);
    const sumEU = both.reduce((t, r) => t + r.eu[ly], 0), sumCN = both.reduce((t, r) => t + r.cn[ly], 0);
    const ru = rows.find((r) => r.d === "RU");
    const ratio = sumEU ? sumCN / sumEU : null;
    document.getElementById("sup-h").textContent = ratio == null ? "The EU and China as suppliers"
      : ratio >= 1 ? "China, not the EU, supplies most of these goods" : "The EU supplies more of these goods than China";
    const more = route.filter((r) => r.eu[ly] != null && r.cn[ly] != null && r.eu[ly] > r.cn[ly]).map((r) => r.name);
    document.getElementById("sup-sub").textContent =
      `In ${yr}, China shipped ${fmtMoney(sumCN)} of these goods to ${both.map((r) => r.name).join(", ").replace(/, ([^,]*)$/, " and $1")}` +
      (ratio ? `, ${ratio >= 1 ? `${fmtX(ratio).replace("×", "")} times as much as the EU (${fmtMoney(sumEU)})` : `against ${fmtMoney(sumEU)} from the EU`}. ` : ". ") +
      (more.length ? `${more.join(" and ")} ${more.length > 1 ? "are the exceptions" : "is the exception"}: there the EU ships more. ` : "") +
      (ru && ru.eu[ly] != null && ru.cn[ly] != null ? `Directly to Russia, China shipped ${fmtMoney(ru.cn[ly])}; the EU ${fmtMoney(ru.eu[ly])}, down from ${fmtMoney(ru.eu[0])} in ${YEARS[0]}.` : "");

    const grid = document.getElementById("sup-grid");
    grid.replaceChildren(...rows.map((r) => h("div", { class: "sup-row" }, [
      h("div", { class: "ctl-name", text: r.d === "RU" ? "Russia, directly" : r.name }),
      h("div", { class: "chart sm" }),
    ])));
    rows.forEach((r, i) => lineChart(grid.children[i].querySelector(".chart"), {
      series: [
        { label: `EU exports to ${r.name}`, endName: "from the EU", color: "--flow-eu", values: r.eu },
        { label: `China's exports to ${r.name}`, endName: "from China", color: "--text-primary", values: r.cn, marker: "square" },
      ],
      fmt: fmtMoney, endNames: true, topTickFmt: (t) => `${cur()}${t.toLocaleString("en-US")}M`,
      aria: `${r.name}: exports of the listed goods from the EU and from China, ${state.currency} million`,
    }));

    table(document.getElementById("sup-table"), ["Destination", "Supplier", ...YEARS.map(String)],
      rows.flatMap((r) => [[r.name, "EU", ...r.eu.map(fmtM)], [r.name, "China", ...r.cn.map(fmtM)]]));
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
          ? `These goods became a bigger part of trade with Russia${ur.length ? ` for ${list(ur)}` : ""}, not of trade with the EU`
          : ue.length
            ? `These goods became a bigger part of EU trade with ${list(ue)}`
            : "These goods kept pace with overall trade";
    }
    const top = (key) => Math.max(...rows.flatMap((r) => (r[key] ? r[key].share : [])).filter((v) => v != null), 0.1);
    const max = { eu: top("eu"), ru: top("ru") };
    const pf = (v) => (v == null ? "—" : `${v < 10 ? v.toFixed(1) : Math.round(v)}%`);

    const grid = document.getElementById("ctl-grid");
    const groupName = { route: "Countries on the route", comparison: "Comparison countries" };
    const kids = [];
    let lastGroup = null;
    rows.forEach((r) => {
      if (r.info.group !== lastGroup) { kids.push(h("h3", { class: "ctl-group", text: groupName[r.info.group] })); lastGroup = r.info.group; }
      kids.push(h("div", { class: "ctl-row" }, [
        h("div", { class: "ctl-name", text: r.info.name }),
        h("figure", {}, [h("figcaption", { text: "From the EU" }), h("div", { class: "chart sm" })]),
        r.ru ? h("figure", {}, [h("figcaption", { text: "To Russia" }), h("div", { class: "chart sm" })]) : h("div"),
      ]));
    });
    grid.replaceChildren(...kids);
    const rowEls = [...grid.querySelectorAll(".ctl-row")];
    rows.forEach((r, i) => {
      const charts = rowEls[i].querySelectorAll(".chart");
      const draw = (el, l, flowKey, title) => lineChart(el, {
        series: [{ label: "listed goods, % of all goods", color: FLOW[flowKey].color, values: l.share }],
        fmt: pf, tickFmt: (t) => `${t}%`, ymax: max[flowKey],
        aria: `${title}: listed goods as a percent of all goods`,
      });
      draw(charts[0], r.eu, "eu", `EU exports to ${r.info.name}`);
      if (r.ru) draw(charts[1], r.ru, "ru", `${r.info.name}'s exports to Russia`);
    });


    const ly = YEARS.length - 1;
    const trows = [];
    for (const r of rows) {
      for (const [flow, l] of [["eu", r.eu], ["ru", r.ru]]) {
        if (!l) continue;
        trows.push([flow === "eu" ? `EU to ${r.info.name}` : `${r.info.name} to Russia`,
          pf(l.pre), pf(l.share[ly]), fmtMoney(l.listed[ly] == null ? null : conv(l.listed[ly], YEARS[ly])), fmtMoney(l.total[ly] == null ? null : conv(l.total[ly], YEARS[ly]))]);
      }
    }
    table(document.getElementById("ctl-table"),
      ["Flow", `Share, ${baseLabel()}`, `Share, ${YEARS[ly]}`, `Listed goods, ${YEARS[ly]}`, `All goods, ${YEARS[ly]}`], trows);
  }

  // ---------- the April 2026 ban: one row per country, leg 1 and leg 2 on one money scale ----------
  const monthName = (mm) => new Date(mm + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  // Money with one unit for the whole axis: $0, $2M, $4M (or $0, $250k, $500k).
  const moneyFmt = (top) => {
    if (top >= 1e6) { const d = top / 1e6 < 3 ? 1 : 0; return (v) => (v === 0 ? "$0" : `$${(v / 1e6).toFixed(d)}M`); }
    if (top >= 1e3) return (v) => (v === 0 ? "$0" : `$${Math.round(v / 1e3)}k`);
    return (v) => `$${Math.round(v)}`;
  };
  const moneyShort = (v) => (v == null ? "no data" : moneyFmt(v)(v));

  function monthChart(container, opts) {
    const W = container.clientWidth, H = container.clientHeight;
    if (W < 120 || H < 80) return;
    const ms = opts.months, vals = opts.values;
    const m = { top: 18, right: 8, bottom: 24, left: 50 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const ticks = niceTicks(Math.max(opts.max, 1), 3);
    const top = ticks[ticks.length - 1];
    const tf = moneyFmt(top);
    const y = (v) => m.top + ih - (v / top) * ih;
    const bw = iw / Math.max(ms.length, 1);
    const x = (i) => m.left + i * bw;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria });
    for (const t of ticks) {
      el("line", { x1: m.left, x2: W - m.right, y1: y(t), y2: y(t), stroke: css("--grid"), "stroke-width": 1 }, svg);
      const lab = el("text", { x: m.left - 6, y: y(t) + 4, "text-anchor": "end" }, svg);
      lab.textContent = tf(t);
    }
    const col = css(opts.color);
    ms.forEach((mm, i) => {
      const v = vals[i];
      if (v == null) {
        el("line", { x1: x(i) + 2, x2: x(i) + bw - 2, y1: m.top + ih + 3, y2: m.top + ih + 3, stroke: css("--text-muted"), "stroke-width": 1, "stroke-dasharray": "1 2" }, svg);
        return;
      }
      const win = (mm >= D.ban.before[0] && mm <= D.ban.before[1]) || mm >= "2026-05";
      const r = el("rect", {
        x: x(i) + 1, y: y(v), width: Math.max(bw - 2, 1), height: Math.max(m.top + ih - y(v), 0),
        fill: col, "fill-opacity": win ? 0.9 : 0.3,
      }, svg);
      r.addEventListener("pointermove", (e) => showTip(e.clientX, e.clientY, monthName(mm), [{ color: col, value: moneyShort(v), label: opts.label }]));
      r.addEventListener("pointerleave", hideTip);
    });
    ms.forEach((mm, i) => {
      if (mm.endsWith("-01")) { const t = el("text", { x: x(i), y: H - 6 }, svg); t.textContent = mm.slice(0, 4); }
    });
    const bi = ms.indexOf(D.ban.transition);
    if (bi >= 0) {
      const bx = x(bi) + bw * (22 / 30);
      el("line", { x1: bx, x2: bx, y1: m.top - 6, y2: m.top + ih, stroke: css("--text-primary"), "stroke-width": 1.25 }, svg);
      const t = el("text", { x: bx - 4, y: m.top + 2, "text-anchor": "end", class: "ban-lbl" }, svg);
      t.textContent = "ban";
    }
    const avgLine = (a, b, v) => {
      const i0 = ms.indexOf(a), i1 = ms.indexOf(b);
      if (i0 < 0 || i1 < 0 || v == null) return;
      // a halo in the page colour keeps the line visible on dark bars
      el("line", { x1: x(i0), x2: x(i1) + bw, y1: y(v), y2: y(v), stroke: css("--surface-1"), "stroke-width": 4.5 }, svg);
      el("line", { x1: x(i0), x2: x(i1) + bw, y1: y(v), y2: y(v), stroke: css("--text-primary"), "stroke-width": 1.5 }, svg);
    };
    avgLine(D.ban.before[0], D.ban.before[1], opts.before);
    if (ms.length && ms[ms.length - 1] >= "2026-05") avgLine("2026-05", ms[ms.length - 1], opts.after);
    container.replaceChildren(svg);
  }

  function banStudy() {
    const B = D.ban, S = B.summary.series;
    const group = state.banGoods;
    const get = (flow, country) => {
      const rows = B.monthly.filter((r) => r[0] === flow && r[1] === country && r[2] === group);
      return { months: rows.map((r) => r[3]), values: rows.map((r) => r[4]), s: S[`${flow}|${country}|${group}`] };
    };
    const ch = (s) => (s && s.before_avg && s.after_avg != null ? 100 * (s.after_avg / s.before_avg - 1) : null);
    const pct = (v) => (v == null ? null : `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString("en-US")}%`);
    const capOf = (d) => {
      if (!d.months.length) return "no data";
      const c = pct(ch(d.s));
      return c ? `${c} after the ban` : "no data after the ban";
    };
    {
      const t = S["eu|KG|banned"], cn = S["cn|KG|banned"], ru = S["ru|KG|banned"];
      const p = (x) => (x && x.before_avg && x.after_avg != null ? 100 * (x.after_avg / x.before_avg - 1) : null);
      const word = (v, up, down) => (v >= 0 ? `${up} ${Math.round(v)}%` : `${down} ${Math.abs(Math.round(v))}%`);
      const a = p(t), b = p(cn), c = p(ru);
      document.getElementById("ban-h").textContent = a == null ? "The April 2026 EU ban on Kyrgyzstan"
        : `The ban ${a < 0 ? `cut EU shipments to Kyrgyzstan by ${Math.abs(Math.round(a))}%` : `did not cut EU shipments to Kyrgyzstan (${word(a, "+", "−")})`}` +
          (b != null ? `; Kyrgyz imports from China ${word(b, "rose", "fell")}` : "") +
          (c != null ? `, exports to Russia ${word(c, "rose", "fell")}` : "");
    }
    const countries = B.summary.rows;
    const name = (c) => B.summary.names[c];
    const grid = document.getElementById("ban-grid");
    const rows = countries.map((c) => {
      const eu = get("eu", c), cn = get("cn", c), ru = get("ru", c);
      const all = [eu, cn, ru].flatMap((d) => [...d.values, d.s && d.s.before_avg, d.s && d.s.after_avg]).filter((v) => v != null);
      return { c, eu, cn, ru, max: all.length ? Math.max(...all) : 1 };
    });
    grid.replaceChildren(...rows.map((r) => h("div", { class: "ban-row" }, [
      h("h3", { text: name(r.c) }),
      h("div", { class: "ban-pair" }, [
        h("figure", {}, [h("figcaption", {}, [`From the EU`, h("span", { text: capOf(r.eu) })]), h("div", { class: "chart sm" })]),
        h("figure", {}, [h("figcaption", {}, [`From China`, h("span", { text: capOf(r.cn) })]), h("div", { class: "chart sm" })]),
        h("figure", {}, [h("figcaption", {}, [`To Russia`, h("span", { text: capOf(r.ru) })]), h("div", { class: "chart sm" })]),
      ]),
    ])));
    rows.forEach((r, i) => {
      const charts = grid.children[i].querySelectorAll(".chart");
      monthChart(charts[0], { months: r.eu.months, values: r.eu.values, before: r.eu.s && r.eu.s.before_avg, after: r.eu.s && r.eu.s.after_avg,
        max: r.max, color: "--flow-eu", label: `EU exports to ${name(r.c)}`, aria: `EU exports to ${name(r.c)}, monthly, USD` });
      monthChart(charts[1], { months: r.cn.months, values: r.cn.values, before: r.cn.s && r.cn.s.before_avg, after: r.cn.s && r.cn.s.after_avg,
        max: r.max, color: "--text-primary", label: `${name(r.c)}'s imports from China`, aria: `${name(r.c)}'s imports from China, monthly, USD` });
      monthChart(charts[2], { months: r.ru.months, values: r.ru.values, before: r.ru.s && r.ru.s.before_avg, after: r.ru.s && r.ru.s.after_avg,
        max: r.max, color: "--flow-ru", label: `${name(r.c)}'s exports to Russia`, aria: `${name(r.c)}'s exports to Russia, monthly, USD` });
    });

    const cells = (s) => [s && s.before_avg != null ? moneyShort(s.before_avg) : "no data", s && s.after_avg != null ? moneyShort(s.after_avg) : "no data",
      pct(ch(s)) || "—", s && s.year_ago_avg && s.after_avg != null ? pct(100 * (s.after_avg / s.year_ago_avg - 1)) : "—"];
    const trows = [];
    for (const c of countries) {
      trows.push([`EU to ${name(c)}`, ...cells(S[`eu|${c}|${group}`])]);
      trows.push([`China to ${name(c)} (as ${name(c)} reports)`, ...cells(S[`cn|${c}|${group}`])]);
      trows.push([`${name(c)} to Russia`, ...cells(S[`ru|${c}|${group}`])]);
    }
    for (const c of Object.keys(B.summary.neighbours).filter((c) => !countries.includes(c))) {
      trows.push([`EU to ${B.summary.neighbours[c]}`, ...cells(S[`eu|${c}|${group}`])]);
    }
    table(document.getElementById("ban-table"), ["Flow", "Before, a month", "After, a month", "Change", "Against the same months of 2025"], trows);
  }

  // ---------- section 3 ----------
  function goods() {
    const { goodsCountry: c, goodsFlow: f, goodsYear: yr } = state;
    const box = document.getElementById("goods-bars");
    const totalEl = document.getElementById("goods-total");
    if (!isAvail(f, c, yr)) {
      totalEl.textContent = `${FLOW[f].label(c)}, ${yr}: the source has no data for this year.`;
      box.replaceChildren(h("div", { class: "empty", text: "No data." }));
      return;
    }
    const rows = D.codes.filter((r) => r[0] === f && r[1] === c && r[2] === yr && inBasket(r[3], state.basket) && r[4] > 0)
      .map((r) => ({ code: r[3], v: conv(r[4], yr) }));
    const total = rows.reduce((s, r) => s + r.v, 0);
    rows.sort((a, b) => b.v - a.v);
    const top = rows.slice(0, 10);
    const max = top.length ? top[0].v : 1;
    const color = css(FLOW[f].color);
    const share = total ? top.reduce((s, r) => s + r.v, 0) / total : 0;
    document.getElementById("goods-h").textContent = top.length
      ? `Largest item in ${yr}: ${(chplByCode[top[0].code] || {}).description || top[0].code}`
      : "Which goods";
    totalEl.textContent = `${FLOW[f].label(c)}, ${yr}, ${basketLabel()}: ${fmtMoney(total)} in total.` +
      (rows.length > 10 ? ` The top 10 codes are ${Math.round(share * 100)}% of it.` : "");
    if (!top.length) { box.replaceChildren(h("div", { class: "empty", text: "No trade reported for these codes." })); return; }
    box.replaceChildren(...top.map((r) => {
      const info = chplByCode[r.code] || { description: "", tier: "" };
      const sh = total ? r.v / total : 0;
      const banned = D.art12f.includes(r.code);
      const row = h("div", { class: "bar-row", tabindex: 0, role: "listitem", "aria-label": `${r.code} ${info.description}: ${fmtMoney(r.v)}, ${(sh * 100).toFixed(1)}% of total${banned ? ", in the EU export ban on Kyrgyzstan" : ""}` }, [
        h("div", { class: "bar-label" }, [
          h("b", { text: fmtCode(r.code) }),
          h("span", { class: "tier", text: "Tier " + info.tier }),
          banned ? h("span", { class: "ban-key", text: "EU ban" }) : null,
          h("span", { class: "desc", text: info.description, title: info.description }),
        ]),
        h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: { width: `${(100 * r.v) / max}%`, background: color } })),
        h("div", { class: "bar-val", text: fmtMoney(r.v) }),
      ]);
      const show = (cx, cy) => showTip(cx, cy, `${fmtCode(r.code)}, tier ${info.tier}: ${info.description}`, [
        { color, value: fmtMoney(r.v), label: `${(sh * 100).toFixed(1)}% of total` },
      ], noteFor(r.code));
      row.addEventListener("pointermove", (e) => show(e.clientX, e.clientY));
      row.addEventListener("pointerleave", hideTip);
      row.addEventListener("focus", () => { const b = row.getBoundingClientRect(); show(b.left + b.width * 0.6, b.top); });
      row.addEventListener("blur", hideTip);
      return row;
    }));
    box.setAttribute("role", "list");
  }

  // ---------- cross-checks (always full basket, USD) ----------
  function crossChecks() {
    const at = (vals, y) => vals[YEARS.indexOf(y)];
    const kzru = series("ru", "Kazakhstan", "all", true);
    const kgru = series("ru", "Kyrgyzstan", "all", true);
    const kgeu = series("eu", "Kyrgyzstan", "all", true);
    const pct = (a, b) => (a == null || !b ? "—" : `${a >= b ? "+" : "−"}${Math.abs(100 * (a / b - 1)).toFixed(1)}%`);
    const x = (a, b) => (a == null || !b ? "—" : `×${(a / b).toFixed(1)}`);
    const avg = (v) => baseOf(v, "avg"), y21 = (v) => baseOf(v, "2021");
    const kgmi = series("mi", "Kyrgyzstan", "all", true);
    const kgRatio = (y) => { const e = at(kgeu, y), m = at(kgmi, y); return e && m != null ? (100 * m) / e : null; };
    const kgPre = (() => { let se = 0, sm = 0; for (const y of D.baselineYears) { const e = at(kgeu, y), m = at(kgmi, y); if (e && m != null) { se += e; sm += m; } } return se ? (100 * sm) / se : null; })();
    const rows = [
      ["Mirror ratio, Kyrgyzstan: 2022 vs pre-war", "about −50 points (Armenia and Kyrgyzstan, sanctioned goods)", "EBRD, “The Eurasian roundabout” (2023)", "https://users.ox.ac.uk/~econ0247/Roundabout.pdf",
        kgRatio(2022) == null || kgPre == null ? "—" : `${String(Math.round(kgRatio(2022) - kgPre)).replace("-", "−")} points (${Math.round(kgPre)}% → ${Math.round(kgRatio(2022))}%)`,
        "Same direction. EBRD uses a wider list of sanctioned goods and Mar–Dec only."],
      ["Kazakhstan → Russia, 2022 vs 2021", "+401%", "The Moscow Times, from Comtrade", "https://www.themoscowtimes.com/2024/09/16/should-the-west-sanction-russias-neighbors-in-central-asia-a86310/pdf",
        pct(at(kzru, 2022), at(kzru, 2021)), "Match"],
      ["Kazakhstan → Russia, 2023 vs 2022", "−5%", "The Moscow Times, from Comtrade", "https://www.themoscowtimes.com/2024/09/16/should-the-west-sanction-russias-neighbors-in-central-asia-a86310/pdf",
        pct(at(kzru, 2023), at(kzru, 2022)), "Match"],
      ["EU → Kyrgyzstan, Jan–Oct 2025 vs pre-war", "+800% (×9)", "EU figure reported by RFE/RL (search summary only)", "https://www.globalsecurity.org/military/library/news/2026/02/mil-260226-rferl02.htm",
        `2025: ${x(at(kgeu, 2025), avg(kgeu))} vs 2019–21, ${x(at(kgeu, 2025), y21(kgeu))} vs 2021`, "Ours lower. EU baseline and code list are not known."],
      ["Kyrgyzstan → Russia, Jan–Oct 2025 vs pre-war", "+1,200% (×13)", "EU figure reported by RFE/RL (search summary only)", "https://www.globalsecurity.org/military/library/news/2026/02/mil-260226-rferl02.htm",
        `2025: ${x(at(kgru, 2025), avg(kgru))} vs 2019–21, ${x(at(kgru, 2025), y21(kgru))} vs 2021`, "Ours lower. Our base is only about $1.5M, so small changes move the multiple a lot."],
      ["Kyrgyzstan → Russia, 2023", "$98M (Jan–Oct only)", "KSE, Russian customs records, sales by Kyrgyz sellers, 45-code list", "https://sanctions.kse.ua/wp-content/uploads/2024/01/Challenges-of-Export-Controls-Enforcement.pdf",
        `$${fmtM(at(kgru, 2023))}M (full year)`, "Ours is about one third. Kyrgyz-reported exports to Russia are under-reported."],
    ];
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
  seg(document.getElementById("f-baseline"), [{ value: "avg", label: "Base 2019–21" }, { value: "2021", label: "Base 2021" }], () => state.baseline, (v) => { state.baseline = v; renderFiltered(); });

  seg(document.getElementById("route-years"), YEARS.map((y) => ({ value: y, label: String(y) })), () => state.routeYear, (v) => { state.routeYear = v; routeAll(); });

  const countryOpts = D.countries.map((c) => ({ value: c, label: c }));
  seg(document.getElementById("flows-country"), countryOpts, () => state.flowsCountry, (v) => { state.flowsCountry = v; flows(); });
  if (D.ban) seg(document.getElementById("ban-goods"), [{ value: "banned", label: "The two banned codes" }, { value: "other", label: "The other 47 codes" }], () => state.banGoods, (v) => { state.banGoods = v; banStudy(); });
  seg(document.getElementById("tiers-country"), countryOpts, () => state.tiersCountry, (v) => { state.tiersCountry = v; tiers(); });
  seg(document.getElementById("goods-country"), countryOpts, () => state.goodsCountry, (v) => { state.goodsCountry = v; goods(); });
  seg(document.getElementById("goods-flow"), [{ value: "eu", label: FLOW.eu.short }, { value: "mi", label: "Recorded imports" }, { value: "ru", label: FLOW.ru.short }], () => state.goodsFlow, (v) => { state.goodsFlow = v; goods(); });
  const sel = document.getElementById("goods-year");
  sel.replaceChildren(...YEARS.map((y) => h("option", { value: y, text: String(y) })));
  sel.value = String(state.goodsYear);
  sel.addEventListener("change", () => { state.goodsYear = +sel.value; goods(); });

  document.getElementById("built").textContent =
    `Site built ${D.built}. Sources: Eurostat Comext (DS-045409), UN Comtrade, ECB exchange rates, European Commission CHPL list (Feb 2024). Code: MIT licence.`;

  function renderFiltered() {
    document.getElementById("f-note").textContent = `Every chart shows ${basketPhrase()} in ${state.currency}, against the ${baseLabel()}.`;
    routeAll(); flows(); comparison(); mirror(); tiers(); goods();
    if (D.ban) banStudy();
    if (D.control) controlStudy();
    if (D.suppliers) supplierStudy();
    summaryBox();
  }
  function renderAll() { renderFiltered(); crossChecks(); }
  renderAll();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { route.paths = null; routeDiagram(); flows(); comparison(); mirror(); tiers(); if (D.ban) banStudy(); if (D.control) controlStudy(); if (D.suppliers) supplierStudy(); }, 120); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { route.paths = null; renderAll(); });
  window.addEventListener("scroll", hideTip, { passive: true });
})();
