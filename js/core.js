// Torch Analysis: storage fallback, CSV reading, team stats, loading files
// Classic script, loaded in order by index.html (all files share one global scope).

// ── STORAGE FALLBACK ───────────────────────────────────────────────────────
// Some views (data: URLs, embedded browsers, private modes) block localStorage and
// throw on access, and a full store throws on writes. Use real storage whenever it
// works; any call that fails falls back to memory (lasts until the page closes).
function makeSafeStorage(getReal) {
  const mem = {};
  const real = () => { try { return getReal(); } catch (e) { return null; } };
  return {
    getItem(k) {
      if (k in mem) return mem[k];
      try { const v = real().getItem(k); return v === undefined ? null : v; } catch (e) { return null; }
    },
    setItem(k, v) {
      try { real().setItem(k, v); delete mem[k]; } catch (e) { mem[k] = String(v); }
    },
    removeItem(k) {
      delete mem[k];
      try { real().removeItem(k); } catch (e) {}
    }
  };
}
let nativeStorage = null;
try { nativeStorage = window.localStorage; } catch (e) {} // throws when storage is blocked
try { Object.defineProperty(window, 'localStorage', { configurable: true, value: makeSafeStorage(() => nativeStorage) }); } catch (e) {}

// ── STATE ──────────────────────────────────────────────────────────────────
let rawData = [];
let loadedFiles = {}; // { filename: { rows, text } }
let teamStats = {};
let currentSort = 'epa';
let activePage = 'rankings';

// ── CSV PARSE ──────────────────────────────────────────────────────────────
// Quotes follow the usual CSV rules: a quote only opens a quoted field at the START of a field, "" inside quotes
// is a literal quote, and a quote closes the field only when a comma or the end of the line follows. So a stray
// quote in the middle of a plain field (6" wheels) is just text and can't swallow the rows after it.
const CSV_CLOSE = /^[ \t]*(?:,|\n|$)/;
function parseCSVLine(line) {
  const fields = []; let cur = '', inQ = false, fieldStart = true;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"' && CSV_CLOSE.test(line.slice(i + 1, i + 41))) inQ = false;
      else cur += c;
    } else if (c === ',') { fields.push(cur.trim()); cur = ''; fieldStart = true; continue; }
    else if (c === '"' && fieldStart) inQ = true;
    else cur += c;
    fieldStart = false;
  }
  fields.push(cur.trim());
  return fields;
}
function parseCSV(text) {
  // Split into records on line breaks that are NOT inside quotes, so a scout comment
  // containing a line break stays part of its own row instead of becoming junk rows.
  // (Uses exactly the same quote rules as parseCSVLine.)
  const lines = [];
  let cur = '', inQ = false, fieldStart = true;
  const t = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') { cur += '""'; i++; continue; }
      if (c === '"' && CSV_CLOSE.test(t.slice(i + 1, i + 41))) inQ = false;
      cur += c; fieldStart = false; continue;
    }
    if (c === '\n') { lines.push(cur); cur = ''; fieldStart = true; continue; }
    if (c === ',') fieldStart = true;
    else { if (c === '"' && fieldStart) inQ = true; fieldStart = false; }
    cur += c;
  }
  lines.push(cur);
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    // Team and match numbers are used as ids inside clickable attributes, so keep them to safe characters
    if ('robot_number' in obj) obj.robot_number = safeId(obj.robot_number);
    if ('match_number' in obj) obj.match_number = safeId(obj.match_number);
    return obj;
  });
}

// Text that comes from a CSV (scout comments, usernames, event and file names...) must be escaped before it
// goes into the page. Otherwise anything in it that looks like HTML would run as code.
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeId(v) {
  const id = String(v == null ? '' : v).trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');   // "12 34" stays its own id instead of becoming team 1234
  return id in Object.prototype ? '_' + id : id;     // "constructor", "__proto__"... would collide with built-in object properties
}

function n(v) { const x = parseFloat(v); return isNaN(x) ? 0 : x; }
function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function pct(v) { return Math.round(v * 10) / 10; }
// A team number typed with leading zeros ("0617") means team 617
function normTeam(v) { v = String(v == null ? '' : v).trim(); return /^\d+$/.test(v) ? String(+v) : v; }

// ── BUILD TEAM STATS ───────────────────────────────────────────────────────
// Rankings, team pages, Compare and the Picklist all read the same cleaned numbers as the predictor and the
// charts: one observation per team per match (several scouts are averaged), obvious typos ignored, and
// "not recorded" left out instead of counted as zero. (See predGet.)
const STAT_INCIDENTS = ['lost_comms', 'game_piece_stuck', 'damaged_others', 'damaged_self', 'foul', 'tipped'];
function buildTeamStats() {
  const C = predGet(), stats = {};
  Object.entries(C.obs).forEach(([team, obs]) => {
    if (!obs.length) return;
    const rs = C.rows[team];
    const mean = f => { const v = obs.map(f).filter(x => x != null); return v.length ? avg(v) : null; };
    const auto = mean(o => o.auto), tele = mean(o => o.tele);
    const total = mean(o => (o.auto != null && o.tele != null) ? o.auto + o.tele : null);
    const totalShots = total != null ? total : (auto || 0) + (tele || 0);
    const acc = mean(o => o.acc), autoAcc = mean(o => o.autoAcc);

    // Abilities — most common non-"didnt" value
    const abilityMode = (col) => {
      const counts = {};
      rs.forEach(r => { const v = (r[col]||'').toLowerCase(); if(v && v!=='didnt' && v!=='') counts[v]=(counts[v]||0)+1; });
      const best = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
      return best ? best[0] : 'didnt';
    };
    const inc = col => obs.reduce((acc, o) => acc + o.incs[col], 0);
    let ignored = 0;
    rs.forEach(r => { if (C.bad.has(r)) ignored++; });

    stats[team] = {
      team,
      matches: obs.length,
      scoutEntries: rs.length,
      ignoredEntries: ignored,
      avgAutoShots: pct(auto || 0),
      avgTeleShots: pct(tele || 0),
      avgTotalShots: pct(totalShots),
      avgPassed: pct(mean(o => o.passed) || 0),
      autoAccuracy: autoAcc != null ? pct(autoAcc) : null,
      avgSpeed: pct(mean(o => o.speed) || 0),
      avgAgility: pct(mean(o => o.agility) || 0),
      avgDefense: pct(mean(o => o.defense) || 0),
      avgAccuracy: acc != null ? pct(acc) : 0,
      // EPA = average total shots weighted by accuracy
      epa: pct(totalShots * (acc != null ? acc / 100 : 1)),
      abilityBump: abilityMode('ability_bump'),
      abilityTrench: abilityMode('ability_trench'),
      abilityOutpost: abilityMode('ability_outpost'),
      climbRate: obs.filter(o => o.climb > 0).length / obs.length,
      incLostComms: inc('lost_comms'),
      incStuck: inc('game_piece_stuck'),
      incDamagedOthers: inc('damaged_others'),
      incDamagedSelf: inc('damaged_self'),
      incFoul: inc('foul'),
      incTipped: inc('tipped'),
      rows: rs
    };
  });
  return stats;
}

// ── LOAD DATA ──────────────────────────────────────────────────────────────
function rebuildFromFiles() {
  // Ignore exact duplicates (identical in every column), e.g. the same export loaded twice,
  // so those entries aren't counted double in averages and match counts. When two files hold the same
  // rows, keep the copy from the file whose name matches the event written inside it, so the data is
  // credited to the right event whichever file was loaded first.
  const agree = f => { const k = f.rows.filter(r => r.event && r.event === r._file_event).length; return f.rows.length ? k / f.rows.length : 0; };
  const files = Object.entries(loadedFiles).map(([name, f], i) => ({ name, f, i, a: agree(f) })).sort((x, y) => (y.a - x.a) || (x.i - y.i));
  const seen = new Map();            // row -> the file that has it first
  fileDups = {}; rawData = []; dupRowsRemoved = 0;
  files.forEach(({ name, f }) => {
    const d = fileDups[name] = { n: 0, from: {} };
    f.rows.forEach(r => {
      const key = Object.keys(r).filter(c => c !== '_file_event').map(c => r[c]).join('\u0001');
      if (seen.has(key)) { d.n++; const o = seen.get(key); d.from[o] = (d.from[o] || 0) + 1; dupRowsRemoved++; return; }
      seen.set(key, name); rawData.push(r);
    });
  });
  predVersion++; predCache = null;   // predictor models are rebuilt from the new data
  teamStats = buildTeamStats();
  const count = Object.keys(teamStats).length;
  document.getElementById('team-count-badge').textContent = count + ' teams';
  renderRankings();
  renderTeamSearch();
  renderCompare();
  renderNotes();
  buildChartSelectors();
  renderLoadedFiles();
  renderPicklist();
  predRenderDataNotes();
  saveToCache();
}

function addFile(name, text) {
  const rows = parseCSV(text);
  // Tag each row with the source filename as _file_event so we don't rely
  // on the internal event field (which can be mislabeled)
  const fileEvent = name.replace('.csv','').replace('_scouting_data','');
  rows.forEach(r => r._file_event = fileEvent);
  loadedFiles[name] = { rows, text, count: rows.length };
  rebuildFromFiles();
}

function removeFile(name) {
  delete loadedFiles[name];
  rebuildFromFiles();
  if (Object.keys(loadedFiles).length === 0) {
    showStatus('All files removed.', 'muted');
  }
}

function clearAllData() {
  loadedFiles = {};
  rawData = [];
  teamStats = {};
  dupRowsRemoved = 0; fileDups = {};
  predVersion++; predCache = null;
  localStorage.removeItem('frc_files');
  document.getElementById('team-count-badge').textContent = '0 teams';
  renderRankings();
  renderTeamSearch();
  renderLoadedFiles();
  predRenderDataNotes();
  buildChartSelectors();
  showStatus('Data cleared.', 'muted');
}

function handleFiles(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      addFile(file.name, ev.target.result);
      loaded++;
      showStatus(`✅ Loaded ${loaded}/${files.length} file(s) — ${rawData.length} total rows`, 'green');
    };
    reader.readAsText(file);
  });
}

function exportAllCSV() {
  const files = Object.values(loadedFiles);
  if (!files.length) return;
  // Collect all unique headers across every file
  const allHeaders = [];
  const headerSet = new Set();
  files.forEach(f => {
    const firstLine = f.text.trim().split(/\r?\n/)[0];
    parseCSVLine(firstLine).forEach(h => { if (!headerSet.has(h)) { headerSet.add(h); allHeaders.push(h); } });
  });
  // Build combined rows, quoting fields that contain commas/quotes/newlines
  function csvField(val) {
    const s = val == null ? '' : String(val);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }
  const lines = [allHeaders.join(',')];
  rawData.forEach(r => {
    lines.push(allHeaders.map(h => csvField(r[h])).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'frc_all_data.csv'; a.click();
  URL.revokeObjectURL(url);
}

function renderLoadedFiles() {
  const list = document.getElementById('loaded-files-list');
  const clearBtn = document.getElementById('clear-btn');
  const exportBtn = document.getElementById('export-all-btn');
  const files = Object.entries(loadedFiles);
  if (!files.length) { list.innerHTML = ''; clearBtn.style.display = 'none'; exportBtn.style.display = 'none'; return; }
  clearBtn.style.display = 'block';
  exportBtn.style.display = 'block';
  // Say what each file actually adds: a file whose rows are all copies of another file's adds nothing
  const dupNote = name => {
    const d = fileDups[name];
    if (!d || !d.n) return '';
    const src = Object.entries(d.from).filter(([o]) => o !== name).sort((a, b) => b[1] - a[1])[0];
    const of = src ? ` of <strong>${esc(src[0])}</strong>` : '';
    return d.n >= loadedFiles[name].count
      ? `<div style="font-size:12px;color:var(--yellow);padding:0 2px 8px">⚠ Every row in this file is an exact copy${of}, so it adds no new data. Is it the right export?</div>`
      : `<div style="font-size:12px;color:var(--yellow);padding:0 2px 8px">${d.n} of its rows are exact copies${of} and are ignored.</div>`;
  };
  list.innerHTML = files.map(([name, f]) => `
    <div class="loaded-file">
      <div class="loaded-file-info">
        <span class="loaded-file-name">${esc(name)}</span>
        <span class="loaded-file-meta">${f.count} rows</span>
      </div>
      <button class="remove-btn" data-name="${esc(name)}" onclick="removeFile(this.dataset.name)">✕</button>
    </div>${dupNote(name)}
  `).join('') + predQualitySummary();
}

function saveToCache() {
  try {
    const data = Object.fromEntries(Object.entries(loadedFiles).map(([k,v]) => [k, { text: v.text, count: v.count }]));
    localStorage.setItem('frc_files', JSON.stringify(data));
  } catch(e) {}
}

function loadFromCache() {
  try {
    const cached = localStorage.getItem('frc_files');
    if (!cached) {
      // fallback to old single-file cache
      const old = localStorage.getItem('frc_csv');
      if (old) { addFile('cached_data.csv', old); }
      return;
    }
    const data = JSON.parse(cached);
    Object.entries(data).forEach(([name, f]) => {
      const rows = parseCSV(f.text);
      const fileEvent = name.replace('.csv','').replace('_scouting_data','');
      rows.forEach(r => r._file_event = fileEvent);
      loadedFiles[name] = { rows, text: f.text, count: f.count };
    });
    rebuildFromFiles();
  } catch(e) {}
}

function showStatus(msg, color) {
  const el = document.getElementById('import-status');
  el.innerHTML = `<p style="color:var(--${color || 'text'}); font-size:14px;">${msg}</p>`;
}

(window.APP_PARTS = window.APP_PARTS || []).push('core');
