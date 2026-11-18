(function () {
  "use strict";

  const D = window.CHPL_DATA;
  const YEARS = D.years;
  const SVGNS = "http://www.w3.org/2000/svg";
  const tip = document.getElementById("tooltip");

  const FLOW = {
    eu: { label: (c) => `EU-27 exports to ${c}`, color: "--flow-eu" },
    ru: { label: (c) => `${c} exports to Russia`, color: "--flow-ru" },
  };
  const COUNTRY = {
    Kazakhstan: { color: "--kz", marker: "circle" },
    Kyrgyzstan: { color: "--kg", marker: "square" },
  };
  const chplByCode = Object.fromEntries(D.chpl.map((r) => [r.hs6, r]));

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
  const fmtM = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  const fmtUSD = (v) => `$${fmtM(v)}M`;
  const fmtIdx = (v) => Math.round(v).toLocaleString("en-US");
  const fmtPct = (v) => `${Math.round(v)}%`;

  function niceTicks(max, n = 5) {
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
    return out;
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

  // ---------- line chart ----------
  // opts: { series:[{label,color,values,marker}], fmt, log, sanctions }
  function lineChart(container, opts) {
    const W = container.clientWidth, H = container.clientHeight;
    const small = W < 420;
    const m = { top: 22, right: small ? 44 : 56, bottom: 26, left: small ? 40 : 48 };
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    const all = opts.series.flatMap((s) => s.values).filter((v) => v > 0);

    let y, ticks;
    if (opts.log) {
      const lo = Math.min(...all, 100) * 0.8, hi = Math.max(...all) * 1.15;
      ticks = logTicks(lo, hi);
      const l0 = Math.log10(lo), l1 = Math.log10(hi);
      y = (v) => m.top + ih - ((Math.log10(Math.max(v, lo)) - l0) / (l1 - l0)) * ih;
    } else {
      ticks = niceTicks(Math.max(...all) * 1.05);
      const top = ticks[ticks.length - 1];
      y = (v) => m.top + ih - (v / top) * ih;
    }
    const x = (i) => m.left + (iw * i) / (YEARS.length - 1);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" });
    const surface = css("--surface-1");

    // grid + y labels
    for (const t of ticks) {
      el("line", { x1: m.left, x2: W - m.right + 8, y1: y(t), y2: y(t), stroke: css("--grid"), "stroke-width": 1 }, svg);
      const lab = el("text", { x: m.left - 8, y: y(t) + 4, "text-anchor": "end" }, svg);
      lab.textContent = opts.tickFmt ? opts.tickFmt(t) : t.toLocaleString("en-US");
    }
    if (opts.baseline) {
      el("line", { x1: m.left, x2: W - m.right + 8, y1: y(opts.baseline), y2: y(opts.baseline), stroke: css("--axis"), "stroke-width": 1 }, svg);
    }
    // x labels
    YEARS.forEach((yr, i) => {
      const t = el("text", { x: x(i), y: H - 6, "text-anchor": "middle" }, svg);
      t.textContent = small && i > 0 ? "’" + String(yr).slice(2) : yr;
    });
    // sanctions marker between 2021 and 2022
    const iS = YEARS.indexOf(2022);
    if (iS > 0) {
      const sx = (x(iS - 1) + x(iS)) / 2 - (x(iS) - x(iS - 1)) * 0.35;
      el("line", { x1: sx, x2: sx, y1: m.top - 6, y2: m.top + ih, stroke: css("--axis"), "stroke-dasharray": "3 3" }, svg);
      if (opts.note !== false) {
        const n = el("text", { x: sx - 6, y: m.top + 4, "text-anchor": "end", class: "note" }, svg);
        n.textContent = small ? "Feb 2022" : "Feb 2022: invasion, EU sanctions";
      }
    }

    // lines + markers
    const ends = [];
    for (const s of opts.series) {
      const col = css(s.color);
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
      el("path", { d, fill: "none", stroke: col, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      s.values.forEach((v, i) => {
        if (s.marker === "square") {
          el("rect", { x: x(i) - 4, y: y(v) - 4, width: 8, height: 8, rx: 1, fill: col, stroke: surface, "stroke-width": 2, "paint-order": "stroke" }, svg);
        } else {
          el("circle", { cx: x(i), cy: y(v), r: 4, fill: col, stroke: surface, "stroke-width": 2, "paint-order": "stroke" }, svg);
        }
      });
      const last = s.values[s.values.length - 1];
      ends.push({ y: y(last), text: opts.fmt(last) });
    }
    // end labels, pushed apart when they collide
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    for (const e of ends) {
      const t = el("text", { x: x(YEARS.length - 1) + 9, y: e.y + 4, class: "end" }, svg);
      t.textContent = e.text;
    }

    // crosshair layer
    const cross = el("line", { y1: m.top - 6, y2: m.top + ih, stroke: css("--text-muted"), "stroke-width": 1, visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.left - 12, y: 0, width: iw + 24, height: H, fill: "transparent", tabindex: 0 }, svg);
    let cur = -1;
    const at = (i, cx, cy) => {
      cur = i;
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
      cross.setAttribute("visibility", "visible");
      const rows = opts.series
        .map((s) => ({ color: css(s.color), value: opts.fmt(s.values[i]), label: s.label, raw: s.values[i] }))
        .sort((a, b) => b.raw - a.raw);
      showTip(cx, cy, String(YEARS[i]), rows);
    };
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(YEARS.length - 1, Math.round(((px - m.left) / iw) * (YEARS.length - 1))));
      at(i, e.clientX, e.clientY);
    });
    const leave = () => { cross.setAttribute("visibility", "hidden"); hideTip(); cur = -1; };
    hit.addEventListener("pointerleave", leave);
    hit.addEventListener("blur", leave);
    hit.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const i = cur < 0 ? YEARS.length - 1 : Math.max(0, Math.min(YEARS.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1)));
      const r = svg.getBoundingClientRect();
      at(i, r.left + (x(i) / W) * r.width, r.top + r.height * 0.3);
    });
    hit.addEventListener("focus", () => {
      const r = svg.getBoundingClientRect();
      const i = YEARS.length - 1;
      at(i, r.left + (x(i) / W) * r.width, r.top + r.height * 0.3);
    });

    container.replaceChildren(svg);
  }

  // ---------- segmented controls ----------
  function seg(container, options, value, onChange) {
    const render = () => {
      container.replaceChildren(...options.map((o) => {
        const b = h("button", { type: "button", role: "radio", "aria-checked": String(o.value === value), text: o.label });
        b.addEventListener("click", () => { value = o.value; render(); onChange(value); });
        return b;
      }));
    };
    render();
  }

  // ---------- state ----------
  const state = { flowsCountry: "Kazakhstan", goodsCountry: "Kazakhstan", goodsFlow: "ru", goodsYear: 2023 };

  // ---------- tiles ----------
  function tiles() {
    const base = YEARS.indexOf(D.baseYear), last = YEARS.length - 1;
    const items = [];
    for (const c of D.countries) {
      const ru = D.series[c].ru;
      items.push({ c, v: `×${(ru[last] / ru[base]).toFixed(1)}`, k: `exports to Russia, ${YEARS[last]} vs ${D.baseYear}` });
    }
    for (const c of D.countries) {
      const eu = D.series[c].eu;
      const peak = Math.max(...eu), py = YEARS[eu.indexOf(peak)];
      items.push({ c, v: `×${(peak / eu[base]).toFixed(1)}`, k: `EU exports at peak (${py}) vs ${D.baseYear}` });
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
    const series = ["eu", "ru"].map((f) => ({ label: FLOW[f].label(c), color: FLOW[f].color, values: D.series[c][f] }));
    legend(document.getElementById("flows-legend"), series);
    lineChart(document.getElementById("flows-chart"), {
      series, fmt: fmtUSD, tickFmt: (t) => t.toLocaleString("en-US"),
      aria: `${c}: EU-27 exports and exports to Russia of CHPL goods, USD million, 2019 to 2025`,
    });
    table(document.getElementById("flows-table"),
      ["Year", ...series.map((s) => s.label + " (USD M)")],
      YEARS.map((yr, i) => [String(yr), ...series.map((s) => fmtM(s.values[i]))]));
  }

  // ---------- section 2 ----------
  function comparison() {
    const mk = (key) => D.countries.map((c) => ({ label: c, color: COUNTRY[c].color, marker: COUNTRY[c].marker, values: D.comparison[c][key] }));
    legend(document.getElementById("cmp-legend"), mk("eu_index"));
    lineChart(document.getElementById("cmp-eu"), { series: mk("eu_index"), fmt: fmtIdx, log: true, baseline: 100, note: false, aria: "Index of EU-27 exports, 2021 = 100" });
    lineChart(document.getElementById("cmp-ru"), { series: mk("ru_index"), fmt: fmtIdx, log: true, baseline: 100, note: false, aria: "Index of exports to Russia, 2021 = 100" });
    lineChart(document.getElementById("cmp-ratio"), { series: mk("ratio"), fmt: fmtPct, tickFmt: (t) => t + "%", note: false, aria: "Exports to Russia as percent of EU-27 exports" });
    const head = ["Year"];
    for (const c of D.countries) head.push(`${c}: EU idx`, `${c}: RU idx`, `${c}: ratio`);
    table(document.getElementById("cmp-table"), head, YEARS.map((yr, i) => {
      const row = [String(yr)];
      for (const c of D.countries) {
        const x = D.comparison[c];
        row.push(fmtIdx(x.eu_index[i]), fmtIdx(x.ru_index[i]), fmtPct(x.ratio[i]));
      }
      return row;
    }));
  }

  // ---------- section 3 ----------
  function goods() {
    const { goodsCountry: c, goodsFlow: f, goodsYear: yr } = state;
    const rows = D.codes.filter((r) => r[0] === f && r[1] === c && r[2] === yr && !D.excluded.includes(r[3]));
    const total = rows.reduce((s, r) => s + r[4], 0);
    rows.sort((a, b) => b[4] - a[4]);
    const top = rows.slice(0, 10);
    const max = top.length ? top[0][4] : 1;
    const color = css(FLOW[f].color);
    const top10share = total ? top.reduce((s, r) => s + r[4], 0) / total : 0;
    document.getElementById("goods-total").textContent =
      `${FLOW[f].label(c)}, ${yr}: ${fmtUSD(total)} in total. The top 10 codes are ${Math.round(top10share * 100)}% of it.`;

    const box = document.getElementById("goods-bars");
    if (!top.length) { box.replaceChildren(h("div", { class: "empty", text: "No trade reported." })); return; }
    box.replaceChildren(...top.map((r) => {
      const info = chplByCode[r[3]] || { description: "", tier: "" };
      const share = total ? r[4] / total : 0;
      const row = h("div", { class: "bar-row", tabindex: 0, role: "listitem", "aria-label": `${r[3]} ${info.description}: ${fmtUSD(r[4])}, ${(share * 100).toFixed(1)}% of basket` }, [
        h("div", { class: "bar-label" }, [
          h("b", { text: r[3].replace(/^(\d{4})(\d{2})$/, "$1.$2") }),
          h("span", { class: "tier", text: "Tier " + info.tier }),
          h("span", { class: "desc", text: info.description, title: info.description }),
        ]),
        h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: { width: `${(100 * r[4]) / max}%`, background: color } })),
        h("div", { class: "bar-val", text: fmtUSD(r[4]) }),
      ]);
      const show = (cx, cy) => showTip(cx, cy, `${r[3]} · Tier ${info.tier}`, [
        { color, value: fmtUSD(r[4]), label: `${(share * 100).toFixed(1)}% of basket` },
      ]);
      row.addEventListener("pointermove", (e) => show(e.clientX, e.clientY));
      row.addEventListener("pointerleave", hideTip);
      row.addEventListener("focus", () => { const b = row.getBoundingClientRect(); show(b.left + b.width * 0.6, b.top); });
      row.addEventListener("blur", hideTip);
      return row;
    }));
    box.setAttribute("role", "list");
  }

  // ---------- wire up ----------
  const countryOpts = D.countries.map((c) => ({ value: c, label: c }));
  seg(document.getElementById("flows-country"), countryOpts, state.flowsCountry, (v) => { state.flowsCountry = v; flows(); });
  seg(document.getElementById("goods-country"), countryOpts, state.goodsCountry, (v) => { state.goodsCountry = v; goods(); });
  seg(document.getElementById("goods-flow"), [{ value: "eu", label: "From the EU" }, { value: "ru", label: "To Russia" }], state.goodsFlow, (v) => { state.goodsFlow = v; goods(); });
  const sel = document.getElementById("goods-year");
  sel.replaceChildren(...YEARS.map((y) => h("option", { value: y, text: String(y) })));
  sel.value = String(state.goodsYear);
  sel.addEventListener("change", () => { state.goodsYear = +sel.value; goods(); });

  document.getElementById("built").textContent =
    `Data built ${D.built}. Sources: Eurostat Comext (DS-045409), UN Comtrade, ECB exchange rates, European Commission CHPL list (Feb 2024).`;

  function renderAll() { tiles(); flows(); comparison(); goods(); }
  renderAll();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { flows(); comparison(); }, 120); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
  window.addEventListener("scroll", hideTip, { passive: true });
})();
