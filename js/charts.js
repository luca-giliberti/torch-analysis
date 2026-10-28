// Torch Analysis: the Charts tab
// Classic script, loaded in order by index.html (all files share one global scope).

// ── CHARTS ─────────────────────────────────────────────────────────────────
// Every chart reads the same cleaned numbers as the predictor: one observation per team per match (several
// scouts are averaged), obvious typos are ignored, and "not recorded" is left out instead of counted as zero.

const CH_COLORS = ['#f0a500', '#e05555', '#4caf7d', '#a78bfa', '#38bdf8', '#fb923c', '#f472b6', '#34d399', '#e879f9', '#7dd3fc', '#facc15', '#94a3b8'];
const chColorOf = {};                          // a team keeps the same color in every chart
function chColor(team) {
  if (!chColorOf[team]) chColorOf[team] = CH_COLORS[Object.keys(chColorOf).length % CH_COLORS.length];
  return chColorOf[team];
}
const chAlpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const chFmt = (v, dec = 1) => v == null || !Number.isFinite(v) ? '–' : String(Number(v.toFixed(dec)));
const chEl = id => document.getElementById(id);

// ── metrics: one list for every mode ──
const CH_METRICS = [
  { key: 'total',   label: 'Total shots',            cat: 'Scoring',     get: o => (o.auto != null && o.tele != null) ? o.auto + o.tele : null },
  { key: 'tele',    label: 'Teleop shots',           cat: 'Scoring',     get: o => o.tele },
  { key: 'auto',    label: 'Auto shots',             cat: 'Scoring',     get: o => o.auto },
  { key: 'passed',  label: 'Passed shots',           cat: 'Scoring',     get: o => o.passed },
  { key: 'epa',     label: 'Output (shots × acc.)',  cat: 'Scoring',     get: o => (o.auto != null && o.tele != null && o.acc != null) ? (o.auto + o.tele) * o.acc / 100 : null },
  { key: 'climb',   label: 'Climb level',            cat: 'Scoring',     get: o => o.climb, max: 3 },
  { key: 'acc',     label: 'Robot accuracy %',       cat: 'Accuracy',    get: o => o.acc, max: 100 },
  { key: 'autoAcc', label: 'Auto accuracy %',        cat: 'Accuracy',    get: o => o.autoAcc, max: 100 },
];
const CH_CATS = ['Scoring', 'Accuracy'];
const CH_MODES = ['compare', 'multi', 'top', 'match'];
const CH_MIN_MATCHES = 3;                      // Top 10 only ranks teams with this many scouted matches

let chMode = 'compare', chMetric = 'total', chCat = 'Scoring', chSort = 'desc';
let chTeams = [];                              // up to 10 selected teams (shared by Compare and Multi-metric)
let chMulti = new Set(['total', 'acc']);
let chInstances = [];
let chMetricsCache = null;

// ── data ──
function chObs(team) { return (predGet().obs || {})[team] || []; }
function chAllTeams() { return Object.keys(predGet().obs || {}).sort((a, b) => n(a) - n(b)); }
function chMetricObj(key) { return CH_METRICS.find(m => m.key === key); }

// A metric is offered only if the data contains something for it (this hides e.g. climbing when it was never recorded)
function chAvailable() {
  const v = predVersion + ':' + rawData.length;
  if (chMetricsCache && chMetricsCache.v === v) return chMetricsCache.list;
  const all = Object.values(predGet().obs || {}).flat();
  const list = CH_METRICS.filter(m => all.some(o => { const x = m.get(o); return x != null && x > 0; }));
  chMetricsCache = { v, list };
  return list;
}

function chStat(team, m) {
  const v = chObs(team).map(m.get).filter(x => x != null);
  return { team, n: v.length, mean: v.length ? avg(v) : null, sd: v.length > 1 ? predSd(v) : 0 };
}

// ── chart plumbing ──
function chClear() { chInstances.forEach(c => c.destroy()); chInstances = []; chEl('ch-area').innerHTML = ''; }

function chEmpty(msg) { chEl('ch-area').innerHTML = `<div class="empty" style="padding:40px 0"><p>${msg}</p></div>`; }

function chCard(title, subtitle, height) {
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 14px 10px;margin-bottom:12px;';
  card.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:${subtitle ? 2 : 10}px">${esc(title)}</div>` +
    (subtitle ? `<div style="font-size:11px;color:var(--muted);margin-bottom:10px">${esc(subtitle)}</div>` : '') +
    `<div style="position:relative;height:${height || 280}px"><canvas></canvas></div>`;
  chEl('ch-area').appendChild(card);
  return card.querySelector('canvas');
}

function chNote(text) { chEl('ch-note').textContent = text || ''; }

const CH_TOOLTIP = { backgroundColor: '#1c1c1c', titleColor: '#f0f0f0', bodyColor: '#cfcfcf', borderColor: '#2e2e2e', borderWidth: 1, padding: 10 };
const CH_AXIS = { ticks: { color: '#888', font: { size: 11 } }, grid: { color: '#2e2e2e' } };

// Small marks drawn on bars: the thin line is the typical spread (±1 SD) and the number is the average
const chWhiskersPlugin = {
  id: 'chWhiskers',
  afterDatasetsDraw(chart) {
    const y = chart.scales.y, ctx = chart.ctx;
    chart.data.datasets.forEach((ds, di) => {
      if (!ds.sds) return;
      chart.getDatasetMeta(di).data.forEach((el, i) => {
        const v = ds.data[i], sd = ds.sds[i];
        if (v == null || !sd) return;
        const y1 = y.getPixelForValue(Math.max(v - sd, y.min)), y2 = y.getPixelForValue(Math.min(v + sd, y.max));
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(el.x, y1); ctx.lineTo(el.x, y2); ctx.moveTo(el.x - 5, y1); ctx.lineTo(el.x + 5, y1); ctx.moveTo(el.x - 5, y2); ctx.lineTo(el.x + 5, y2);
        ctx.stroke(); ctx.restore();
      });
    });
  }
};
const chValuesPlugin = {
  id: 'chValues',
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || !opts.show) return;
    const y = chart.scales.y, ctx = chart.ctx;
    chart.data.datasets.forEach((ds, di) => {
      chart.getDatasetMeta(di).data.forEach((el, i) => {
        const v = ds.data[i];
        if (v == null) return;
        const top = ds.sds && ds.sds[i] ? Math.min(el.y, y.getPixelForValue(Math.min(v + ds.sds[i], y.max))) : el.y;
        ctx.save(); ctx.fillStyle = '#ececec'; ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(chFmt(v, opts.dec), el.x, top - 3); ctx.restore();
      });
    });
  }
};

// One bar per team. rows: [{ team, mean, sd, n, color, label? }]. Tapping a bar opens that team.
function chBarChart(canvas, rows, m, opts = {}) {
  const dec = m.dec != null ? m.dec : 1;
  const top = Math.max(0, ...rows.map(r => (r.mean || 0) + (r.sd || 0)));
  const ds = {
    data: rows.map(r => r.mean == null ? null : Number(r.mean.toFixed(3))),
    sds: rows.map(r => r.n > 1 ? r.sd : 0),
    backgroundColor: rows.map(r => chAlpha(r.color, 0.75)),
    borderColor: rows.map(r => opts.mine && r.team === opts.mine ? '#ffffff' : r.color),
    borderWidth: rows.map(r => opts.mine && r.team === opts.mine ? 3 : 2),
    borderRadius: 6,
  };
  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: rows.map(r => ['T' + r.team, !r.n ? 'no data' : rows.length > 7 ? 'n=' + r.n : r.n + (r.n === 1 ? ' match' : ' matches')]), datasets: [ds] },
    plugins: [chWhiskersPlugin, chValuesPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      interaction: { mode: 'nearest', intersect: true },
      onClick: (e, els) => { if (els.length && rows[els[0].index].n) chOpenTeam(rows[els[0].index].team); },
      onHover: (e, els) => { if (e.native) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { display: false },
        chValues: { show: true, dec },
        tooltip: { ...CH_TOOLTIP, callbacks: {
          title: it => 'Team ' + rows[it[0].dataIndex].team,
          label: it => `${chFmt(it.raw, dec)}  ${m.label}`,
          afterLabel: it => { const r = rows[it.dataIndex]; return `${r.n} match${r.n === 1 ? '' : 'es'} · spread ±${chFmt(r.sd, dec)}`; }
        } }
      },
      scales: {
        x: { ...CH_AXIS, grid: { display: false }, ticks: { ...CH_AXIS.ticks, maxRotation: 0, minRotation: 0, autoSkip: false } },
        y: { ...CH_AXIS, min: 0, max: m.max, suggestedMax: m.max ? undefined : top * 1.12, beginAtZero: true }
      }
    }
  });
  chInstances.push(chart);
  return chart;
}

function chOpenTeam(team) { if (teamStats[team]) showDetail(team); }

// ── team picker (shared) ──
function chFilterTeams() {
  const q = chEl('ch-team-input').value.trim(), dd = chEl('ch-team-dropdown');
  if (!q) { dd.innerHTML = ''; return; }
  const list = chAllTeams().filter(t => !chTeams.includes(t) && t.startsWith(q)).slice(0, 6);
  dd.innerHTML = list.map(t => `<div class="chart-dropdown-item" onclick="chAddTeam('${esc(t)}')"><span>${esc(t)}</span><span class="item-meta">EPA ${teamStats[t] ? teamStats[t].epa : '–'} · ${chObs(t).length} matches</span></div>`).join('');
}
function chAddTeam(team) {
  if (chTeams.includes(team) || chTeams.length >= 10 || !chObs(team).length) return;
  chTeams.push(team);
  chColor(team);
  chEl('ch-team-input').value = ''; chEl('ch-team-dropdown').innerHTML = '';
  chPills(); chRender();
}
function chRemoveTeam(team) { chTeams = chTeams.filter(t => t !== team); chPills(); chRender(); }
function chClearTeams() { chTeams = []; chPills(); chRender(); }
function chAddTop(k) {   // quick start: the strongest scorers by output (or by shots if accuracy wasn't recorded)
  const avail = chAvailable();
  const m = avail.find(x => x.key === 'epa') || avail.find(x => x.key === 'total') || avail[0];
  if (!m) return;
  chAllTeams().map(t => chStat(t, m)).filter(s => s.n >= CH_MIN_MATCHES).sort((a, b) => b.mean - a.mean).slice(0, k).forEach(s => { if (!chTeams.includes(s.team) && chTeams.length < 10) { chTeams.push(s.team); chColor(s.team); } });
  chPills(); chRender();
}
function chPills() {
  chEl('ch-teams-selected').innerHTML = chTeams.map(t => `
    <div style="display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid ${chColor(t)};border-radius:20px;padding:5px 10px;">
      <span style="font-size:13px;font-weight:700;color:${chColor(t)}">Team ${esc(t)}</span>
      <button onclick="chRemoveTeam('${esc(t)}')" style="background:none;border:none;color:${chColor(t)};cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>
    </div>`).join('') +
    (chTeams.length ? `<button onclick="chClearTeams()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:5px 6px">Clear</button>` : '');
}

// ── controls ──
const chChip = (label, active, onclick) => `<div class="selector-chip ${active ? 'active' : ''}" onclick="${onclick}">${esc(label)}</div>`;

function chBuildControls() {
  const avail = chAvailable();
  if (!avail.some(m => m.key === chMetric)) { chMetric = (avail[0] || CH_METRICS[0]).key; }
  const cats = CH_CATS.filter(c => avail.some(m => m.cat === c));
  if (!cats.includes(chCat)) chCat = (avail.find(m => m.key === chMetric) || {}).cat || cats[0] || 'Scoring';
  chEl('ch-cat-bar').innerHTML = cats.map(c => chChip(c, c === chCat, `chSetCat('${c}')`)).join('');
  chEl('ch-metric-bar').innerHTML = avail.filter(m => m.cat === chCat).map(m => chChip(m.label, m.key === chMetric, `chSetMetric('${m.key}')`)).join('');
  chEl('ch-multi-grid').innerHTML = avail.map(m => {
    const on = chMulti.has(m.key);
    return `<label style="display:flex;align-items:center;gap:8px;background:var(--card2);border:1px solid ${on ? 'var(--accent)' : 'var(--border)'};border-radius:8px;padding:8px 10px;cursor:pointer;font-size:13px;">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="chToggleMulti('${m.key}',this.checked)" style="accent-color:var(--accent);flex-shrink:0">${esc(m.label)}</label>`;
  }).join('');
  chEl('ch-sort-bar').innerHTML = [['desc', 'Highest first'], ['asc', 'Lowest first']].concat(chMode === 'compare' || chMode === 'multi' ? [['team', 'By team #']] : [])
    .map(([k, l]) => chChip(l, chSort === k, `chSetSort('${k}')`)).join('');
  chBuildMatchSelect();
}
function chBuildMatchSelect() {
  const sel = chEl('ch-match'), keep = sel.value;
  sel.innerHTML = matchSchedule.length ? matchSchedule.map(m => `<option value="${m.match}">Q${m.match}</option>`).join('') : '<option value="">No schedule loaded</option>';
  if (keep && matchSchedule.some(m => String(m.match) === keep)) sel.value = keep;
}

function chSetCat(c) {
  chCat = c;
  const first = chAvailable().find(m => m.cat === c);
  if (first && !(chMetricObj(chMetric) && chMetricObj(chMetric).cat === c)) chMetric = first.key;
  chBuildControls(); chRender();
}
function chSetMetric(k) { chMetric = k; chBuildControls(); chRender(); }
function chSetSort(s) { chSort = s; chBuildControls(); chRender(); }
function chToggleMulti(k, on) { if (on) chMulti.add(k); else chMulti.delete(k); chBuildControls(); chRender(); }

const CH_BLOCKS = {
  compare: ['ch-team-block', 'ch-metric-block', 'ch-sort-block'],
  multi:   ['ch-team-block', 'ch-multi-block', 'ch-sort-block'],
  top:     ['ch-metric-block', 'ch-sort-block'],
  match:   ['ch-match-block', 'ch-metric-block'],
};
function chSetMode(mode) {
  chMode = mode;
  CH_MODES.forEach(m => { const el = chEl('chmode-' + m); if (el) el.classList.toggle('active', m === mode); });
  ['ch-team-block', 'ch-metric-block', 'ch-sort-block', 'ch-multi-block', 'ch-match-block']
    .forEach(id => { chEl(id).style.display = CH_BLOCKS[mode].includes(id) ? 'block' : 'none'; });
  if (mode === 'top' && chSort === 'team') chSort = 'desc';
  chBuildControls(); chPills(); chRender();
}

// ── render ──
function chRender() {
  const area = chEl('ch-area');
  if (!area || !chEl('page-charts').classList.contains('active')) return;     // only draw while the Charts tab is open
  chClear(); chNote('');
  if (typeof Chart === 'undefined') { chEmpty('The charts library could not load. Check your connection and reload.'); return; }
  if (!Object.keys(predGet().obs || {}).length) { chEmpty('Import scouting data to see charts'); return; }
  ({ compare: chRenderCompare, multi: chRenderMulti, top: chRenderTop, match: chRenderMatch }[chMode])();
}

function chSortRows(rows) {
  if (chSort === 'team') return rows.sort((a, b) => n(a.team) - n(b.team));
  const dir = chSort === 'asc' ? 1 : -1;
  return rows.sort((a, b) => a.mean == null ? 1 : b.mean == null ? -1 : dir * (a.mean - b.mean));   // teams with no data go last
}
const chRowsFor = (teams, m) => teams.map(t => ({ ...chStat(t, m), color: chColor(t) }));
const CH_BAR_NOTE = 'Bars are averages with each match counted once (n = matches scouted). The thin line is the typical spread (±1 SD): a short line means a consistent robot. Tap a bar to open the team.';

function chRenderCompare() {
  const m = chMetricObj(chMetric);
  if (!chTeams.length) { chEmpty('Add up to 10 teams to compare<br><button class="btn secondary" style="max-width:220px;margin:12px auto 0" onclick="chAddTop(5)">Add the top 5 scorers</button>'); return; }
  const rows = chSortRows(chRowsFor(chTeams, m));
  chBarChart(chCard(m.label, 'Average per match', 300), rows, m);
  chNote([CH_BAR_NOTE, m.note].filter(Boolean).join(' '));
}

function chRenderMulti() {
  const ms = chAvailable().filter(m => chMulti.has(m.key));
  if (!chTeams.length) { chEmpty('Add teams, then tick the metrics to compare<br><button class="btn secondary" style="max-width:220px;margin:12px auto 0" onclick="chAddTop(5)">Add the top 5 scorers</button>'); return; }
  if (!ms.length) { chEmpty('Tick at least one metric'); return; }
  ms.forEach(m => chBarChart(chCard(m.label, null, 240), chSortRows(chRowsFor(chTeams, m)), m));
  chNote(CH_BAR_NOTE);
}

function chRenderTop() {
  const m = chMetricObj(chMetric);
  const all = chAllTeams().map(t => ({ ...chStat(t, m), color: chColor(t) })).filter(s => s.n >= CH_MIN_MATCHES && s.mean != null);
  if (!all.length) { chEmpty(`No team has ${CH_MIN_MATCHES} or more scouted matches with this metric yet`); return; }
  const rows = all.sort((a, b) => (chSort === 'asc' ? a.mean - b.mean : b.mean - a.mean)).slice(0, 10);
  chBarChart(chCard(`${chSort === 'asc' ? 'Lowest' : 'Top'} 10 · ${m.label}`, `Teams with at least ${CH_MIN_MATCHES} scouted matches (${all.length} qualify)`, 300), rows, m, { mine: scheduleMyTeam });
  chNote([CH_BAR_NOTE, scheduleMyTeam ? 'Your team has a white outline.' : '', m.note].filter(Boolean).join(' '));
}

function chRenderMatch() {
  const m = chMetricObj(chMetric), num = chEl('ch-match').value;
  const mt = matchSchedule.find(x => String(x.match) === String(num));
  if (!mt) { chEmpty('Load a match schedule (Import tab) to chart a match'); return; }
  const mk = (teams, base) => teams.map(t => ({ ...chStat(t, m), color: base }));
  const red = mk(mt.red, '#e05555'), blue = mk(mt.blue, '#60a5fa');
  const mean = rs => { const v = rs.filter(r => r.mean != null).map(r => r.mean); return v.length ? avg(v) : null; };
  const card = chCard(`Q${mt.match} · ${m.label}`, `Red avg ${chFmt(mean(red), m.dec != null ? m.dec : 1)}  ·  Blue avg ${chFmt(mean(blue), m.dec != null ? m.dec : 1)}  (average per robot)`, 300);
  chBarChart(card, [...red, ...blue], m);
  chEl('ch-area').insertAdjacentHTML('beforeend', `<button class="btn" style="margin-bottom:14px" onclick="predictFromSchedule('${esc(mt.match)}')">Predict this match →</button>`);
  chNote('Red alliance on the left in red, blue alliance on the right in blue. ' + CH_BAR_NOTE);
}

// Called whenever the loaded data changes
function buildChartSelectors() {
  chMetricsCache = null;
  chTeams = chTeams.filter(t => chObs(t).length);
  chBuildControls(); chPills();
  chSetMode(chMode);
}

(window.APP_PARTS = window.APP_PARTS || []).push('charts');
