(function () {
  "use strict";

  const D = window.CHPL_DATA;
  const YEARS = D.years;
  const SVGNS = "http://www.w3.org/2000/svg";
  const tip = document.getElementById("tooltip");

  const FLOW = {
    eu: { label: (c) => `EU-27 exports to ${c}`, short: "From the EU", color: "--flow-eu" },
    ru: { label: (c) => `${c} exports to Russia`, short: "To Russia", color: "--flow-ru" },
  };
  const COUNTRY = {
    Kazakhstan: { color: "--kz", marker: "circle" },
    Kyrgyzstan: { color: "--kg", marker: "square" },
  };
  const TIER_NAMES = {
    "1": "Tier 1 · integrated circuits",
    "2": "Tier 2 · communication, navigation, capacitors",
    "3A": "Tier 3.A · discrete parts, connectors, cameras",
    "3B": "Tier 3.B · bearings, optics, aircraft parts",
    "4A": "Tier 4.A · electronics production and test",
    "4B": "Tier 4.B · CNC machine tools",
  };
  const chplByCode = Object.fromEntries(D.chpl.map((r) => [r.hs6, r]));
  const fmtCode = (c) => c.replace(/^(\d{4})(\d{2})$/, "$1.$2");

  // ---------- state (filters at the top apply to every chart) ----------
  const state = {
    basket: "all", currency: "USD", baseline: "avg",
    flowsCountry: "Kazakhstan", goodsCountry: "Kazakhstan", goodsFlow: "ru", goodsYear: 2023,
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
  const basketLabel = () => (state.basket === "all" ? "CHPL basket (49 codes)" : state.basket === "art12f" ? "EU ban codes (8457.10, 8517.62)" : TIER_NAMES[state.basket]);
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
  const fmtMoney = (v) => (v == null ? "no data" : `${cur()}${fmtM(v)}M`);
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

  function showTip(x, y, title, rows) {
    tip.replaceChildren(h("div", { class: "t", text: title }));
    for (const r of rows) {
      tip.appendChild(h("div", { class: "r" }, [
        h("i", { style: { background: r.color } }),
        h("b", { text: r.value }),
        h("span", { text: r.label }),
      ]));
    }
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
    const m = { top: opts.events ? 30 : 22, right: small ? 48 : 60, bottom: 26, left: small ? 40 : 50 };
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
      const lo = Math.min(...all, opts.baseline || Infinity) * 0.8, hi = Math.max(...all, opts.baseline || 0) * 1.15;
      ticks = logTicks(lo, hi);
      const l0 = Math.log10(lo), l1 = Math.log10(hi);
      y = (v) => m.top + ih - ((Math.log10(Math.max(v, lo)) - l0) / (l1 - l0)) * ih;
    } else {
      ticks = niceTicks(Math.max(...all) * 1.05);
      const top = ticks[ticks.length - 1];
      y = (v) => m.top + ih - (v / top) * ih;
    }
    const x = (i) => m.left + (iw * i) / (YEARS.length - 1);
    const surface = css("--surface-1");

    for (const t of ticks) {
      el("line", { x1: m.left, x2: W - m.right + 8, y1: y(t), y2: y(t), stroke: css("--grid"), "stroke-width": 1 }, svg);
      const lab = el("text", { x: m.left - 8, y: y(t) + 4, "text-anchor": "end" }, svg);
      lab.textContent = opts.tickFmt ? opts.tickFmt(t) : t.toLocaleString("en-US");
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
      if (li >= 0) ends.push({ x: x(li), y: y(s.values[li]), text: opts.fmt(s.values[li]) });
    }
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    for (const e of ends) {
      const t = el("text", { x: e.x + 9, y: e.y + 4, class: "end" }, svg);
      t.textContent = e.text;
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

  // ---------- tiles ----------
  function tiles() {
    const last = YEARS.length - 1;
    const items = [];
    for (const c of D.countries) {
      const ru = series("ru", c), b = baseOf(ru);
      items.push({ c, v: fmtX(ru[last] != null && b ? ru[last] / b : null), k: `exports to Russia, ${YEARS[last]} vs ${baseLabel()}` });
    }
    for (const c of D.countries) {
      const eu = series("eu", c), b = baseOf(eu);
      const vals = eu.filter((v) => v != null);
      const peak = vals.length ? Math.max(...vals) : null;
      const py = peak == null ? "" : YEARS[eu.indexOf(peak)];
      items.push({ c, v: fmtX(peak != null && b ? peak / b : null), k: `EU exports at peak (${py}) vs ${baseLabel()}` });
    }
    document.getElementById("tiles").replaceChildren(...items.map((it) =>
      h("div", { class: "tile" }, [
        h("div", { class: "who" }, [h("span", { class: "dot", style: { background: css(COUNTRY[it.c].color) } }), it.c]),
        h("div", { class: "v", text: it.v }),
        h("div", { class: "k", text: it.k }),
      ])
    ));
  }

  // ---------- section 1 ----------
  function flows() {
    const c = state.flowsCountry;
    document.getElementById("flows-sub").textContent =
      `${basketLabel()}, ${state.currency} million. Exports to Russia as reported by ${c}.`;
    const s = ["eu", "ru"].map((f) => ({ label: FLOW[f].label(c), color: FLOW[f].color, values: series(f, c) }));
    legend(document.getElementById("flows-legend"), s);
    const ev = eventsFor(c);
    lineChart(document.getElementById("flows-chart"), {
      series: s, fmt: fmtMoney, events: ev,
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
        eu: indexOf(eu), ru: indexOf(ru),
        ratio: YEARS.map((_, i) => (eu[i] && ru[i] != null ? (100 * ru[i]) / eu[i] : null)),
      };
    }
    const mk = (key) => D.countries.map((c) => ({ label: c, color: COUNTRY[c].color, marker: COUNTRY[c].marker, values: data[c][key] }));
    const cap = `index, ${baseLabel()} = 100, log scale`;
    document.getElementById("cmp-eu-cap").textContent = cap;
    document.getElementById("cmp-ru-cap").textContent = cap;
    legend(document.getElementById("cmp-legend"), mk("eu"));
    lineChart(document.getElementById("cmp-eu"), { series: mk("eu"), fmt: fmtIdx, log: true, baseline: 100, aria: `Index of EU-27 exports, ${baseLabel()} = 100` });
    lineChart(document.getElementById("cmp-ru"), { series: mk("ru"), fmt: fmtIdx, log: true, baseline: 100, aria: `Index of exports to Russia, ${baseLabel()} = 100` });
    lineChart(document.getElementById("cmp-ratio"), { series: mk("ratio"), fmt: fmtPct, tickFmt: (t) => t + "%", aria: "Scale ratio: exports to Russia as percent of EU-27 exports" });
    const head = ["Year"];
    for (const c of D.countries) head.push(`${c}: EU idx`, `${c}: RU idx`, `${c}: ratio`);
    table(document.getElementById("cmp-table"), head, YEARS.map((yr, i) => {
      const row = [String(yr)];
      for (const c of D.countries) row.push(fmtIdx(data[c].eu[i]), fmtIdx(data[c].ru[i]), fmtPct(data[c].ratio[i]));
      return row;
    }));
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
      const show = (cx, cy) => showTip(cx, cy, `${fmtCode(r.code)} · Tier ${info.tier}`, [
        { color, value: fmtMoney(r.v), label: `${(sh * 100).toFixed(1)}% of total` },
      ]);
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
    const rows = [
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

  // ---------- data availability ----------
  function availability() {
    const s = D.sources;
    const kz = s.comtrade.Kazakhstan, kg = s.comtrade.Kyrgyzstan;
    const lastRel = (o) => { const y = Object.keys(o.released).filter((k) => o.released[k]).sort().pop(); return y ? `${y} data released ${o.released[y]}` : "no data"; };
    document.getElementById("asof").textContent =
      `Data as of: Comext updated ${s.comext.Kazakhstan.updated}. Comtrade: Kazakhstan ${lastRel(kz)}, Kyrgyzstan ${lastRel(kg)}. Downloaded ${s.comext.Kazakhstan.downloaded}. CHPL version: ${D.chplVersion}.`;
    const head = ["Source", ...YEARS.map(String)];
    const rows = [];
    for (const f of ["eu", "ru"]) {
      for (const c of D.countries) {
        rows.push([`${f === "eu" ? "Comext" : "Comtrade"}: ${FLOW[f].label(c)}`, ...YEARS.map((y) => {
          const a = avail[`${f}|${c}|${y}`];
          return a && a.available ? `${a.hs.replace("HS ", "HS").replace("CN ", "CN")} · ${a.codes} traded` : "no data";
        })]);
      }
    }
    table(document.getElementById("avail-table"), head, rows);
  }

  // ---------- wire up ----------
  const basketSel = document.getElementById("f-basket");
  basketSel.replaceChildren(
    h("option", { value: "all", text: "All CHPL (49 codes)" }),
    ...Object.entries(TIER_NAMES).map(([k, v]) => h("option", { value: k, text: v })),
    h("option", { value: "art12f", text: "EU ban codes on Kyrgyzstan (8457.10, 8517.62)" }),
  );
  basketSel.addEventListener("change", () => { state.basket = basketSel.value; renderFiltered(); });
  seg(document.getElementById("f-currency"), [{ value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }], () => state.currency, (v) => { state.currency = v; renderFiltered(); });
  seg(document.getElementById("f-baseline"), [{ value: "avg", label: "Base 2019–21" }, { value: "2021", label: "Base 2021" }], () => state.baseline, (v) => { state.baseline = v; renderFiltered(); });

  const countryOpts = D.countries.map((c) => ({ value: c, label: c }));
  seg(document.getElementById("flows-country"), countryOpts, () => state.flowsCountry, (v) => { state.flowsCountry = v; flows(); });
  seg(document.getElementById("goods-country"), countryOpts, () => state.goodsCountry, (v) => { state.goodsCountry = v; goods(); });
  seg(document.getElementById("goods-flow"), [{ value: "eu", label: FLOW.eu.short }, { value: "ru", label: FLOW.ru.short }], () => state.goodsFlow, (v) => { state.goodsFlow = v; goods(); });
  const sel = document.getElementById("goods-year");
  sel.replaceChildren(...YEARS.map((y) => h("option", { value: y, text: String(y) })));
  sel.value = String(state.goodsYear);
  sel.addEventListener("change", () => { state.goodsYear = +sel.value; goods(); });

  document.getElementById("built").textContent =
    `Site built ${D.built}. Sources: Eurostat Comext (DS-045409), UN Comtrade, ECB exchange rates, European Commission CHPL list (Feb 2024). Code: MIT licence.`;

  function renderFiltered() {
    document.getElementById("f-note").textContent = `${basketLabel()} · ${state.currency} · baseline ${baseLabel()}`;
    tiles(); flows(); comparison(); goods();
  }
  function renderAll() { renderFiltered(); crossChecks(); availability(); }
  renderAll();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { flows(); comparison(); }, 120); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
  window.addEventListener("scroll", hideTip, { passive: true });
})();
