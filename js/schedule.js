// Torch Analysis: Schedule tab: Next, Strength, Compare, schedule screenshot reading
// Classic script, loaded in order by index.html (all files share one global scope).

// ── FEATURE 3: SCHEDULE ────────────────────────────────────────────────────
let matchSchedule = [];
let scheduleMyTeam = '';
let schedFilter = 'all';
let schedCmpA = '', schedCmpB = '';

function setSchedFilter(f) {
  schedFilter = f;
  ['all','mine','next','compare','strength'].forEach(x => document.getElementById('sched-filter-'+x)?.classList.toggle('active', x===f));
  const panel = document.getElementById('sched-compare-panel');
  if (panel) panel.style.display = f === 'compare' ? 'flex' : 'none';
  const np = document.getElementById('sched-next-panel');
  if (np) np.style.display = f === 'next' ? 'flex' : 'none';
  if (f === 'next') schedPick = '';
  if (f === 'compare' && !schedCmpA && scheduleMyTeam) {
    schedCmpA = scheduleMyTeam;
    document.getElementById('sched-cmp-a').value = scheduleMyTeam;
  }
  renderSchedule();
}

// Two teams' schedules side by side: one row per match either team plays
function renderScheduleCompare() {
  const list = document.getElementById('schedule-list');
  const a = schedCmpA, b = schedCmpB;
  const msg = t => `<div class="empty"><p>${t}</p></div>`;
  if (!a || !b) { list.innerHTML = msg('Enter two team numbers to compare their schedules'); return; }
  if (a === b) { list.innerHTML = msg('Pick two different teams'); return; }

  const role = (team, m) => {
    if (m.red.includes(team))  return { color: '#e05555', partners: m.red.filter(t => t !== team),  opps: m.blue };
    if (m.blue.includes(team)) return { color: '#3b82f6', partners: m.blue.filter(t => t !== team), opps: m.red };
    return null;
  };
  const rows = matchSchedule.map(m => ({ m, ra: role(a, m), rb: role(b, m) })).filter(r => r.ra || r.rb);
  const nA = rows.filter(r => r.ra).length, nB = rows.filter(r => r.rb).length;
  if (!nA || !nB) {
    list.innerHTML = msg(`${!nA ? 'Team ' + a : ''}${!nA && !nB ? ' and ' : ''}${!nB ? 'Team ' + b : ''} not found in the schedule`);
    return;
  }
  const together = rows.filter(r => r.ra && r.rb && r.ra.color === r.rb.color).length;
  const against  = rows.filter(r => r.ra && r.rb && r.ra.color !== r.rb.color).length;

  const head = (team, color) => {
    const epa = teamStats[team]?.epa;
    return `<div style="text-align:center;background:var(--card);border:1px solid ${color};border-radius:10px;padding:8px 4px">
      <div style="font-size:16px;font-weight:800;color:${color}">${flagEmoji(team)}${team}</div>
      <div style="font-size:10px;color:var(--muted)">${epa !== undefined ? epa + ' EPA · ' : ''}${team === a ? nA : nB} matches</div>
    </div>`;
  };
  // Same match card as the All / Mine views, one per team; WITH / VS shows when both play
  const tag = r => !(r.ra && r.rb) ? ''
    : r.ra.color === r.rb.color
      ? ' · <span style="color:var(--green)">WITH</span>'
      : ' · <span style="color:var(--yellow)">VS</span>';
  const cell = (r, team, plays, accent) => plays
    ? schedMatchCard(r.m, team, { compact: true, accent, label: `Q${r.m.match}${tag(r)}` })
    : `<div style="border:1px dashed var(--border);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;padding:8px;text-align:center">Q${r.m.match} · not playing</div>`;

  const grid = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:stretch;';
  list.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin:0 2px 8px">
      Together in <strong style="color:var(--green)">${together}</strong> · facing each other in <strong style="color:var(--yellow)">${against}</strong>
    </div>
    <div style="${grid}margin-bottom:6px">${head(a, 'var(--accent)')}${head(b, 'var(--accent2)')}</div>
    ${rows.map(r => `<div style="${grid}margin-bottom:6px">
      ${cell(r, a, !!r.ra, 'var(--accent)')}${cell(r, b, !!r.rb, 'var(--accent2)')}
    </div>`).join('')}`;
}

// ── NEXT MATCH ─────────────────────────────────────────────────────────────
// Everything for your next match in one place: who is on each side, the prediction, what to watch for, and
// what scouts wrote about the robots. "Your team" is shared with the Picklist.
let schedCurrent = '', schedPick = '';   // the match being played now (blank = the one after the last entered result), and a match chosen from the list
function setMyTeam(v) {
  v = normTeam(v);
  scheduleMyTeam = picklistMyTeam = v;
  ['schedule-my-team', 'picklist-my-team'].forEach(id => { const el = document.getElementById(id); if (el && el.value !== v && document.activeElement !== el) el.value = v; });
  try { localStorage.setItem('frc_picklist_myteam', v); } catch (e) {}
  if (activePage === 'schedule') renderSchedule();
  if (activePage === 'picklist') renderPicklist();
}
function schedSetCurrent(v) {
  schedCurrent = String(v || '').replace(/\D/g, '');
  schedPick = '';
  try { localStorage.setItem('frc_sched_current', schedCurrent); } catch (e) {}
  renderSchedule();
}
function schedPickMatch(num) { schedPick = String(num); renderSchedule(); window.scrollTo(0, 0); }

function schedCurrentMatch() {
  if (schedCurrent !== '') return n(schedCurrent);
  const ks = Object.keys(predResults).map(Number).filter(Number.isFinite);     // from real results, if any were entered
  return ks.length ? Math.max(...ks) + 1 : 0;
}
// your matches from the current one onward (the current match itself counts if you're in it)
function schedUpcoming() {
  const me = scheduleMyTeam, cur = schedCurrentMatch();
  if (!me) return [];
  return matchSchedule.filter(m => (m.red.includes(me) || m.blue.includes(me)) && n(m.match) >= cur);
}

// Short facts about a robot that matter in the next match
function schedTeamTags(t) {
  const p = predParams(t), s = teamStats[t], lg = predGet().lg, tags = [];
  const add = (text, color) => tags.push(`<span style="${PRED_CHIP}color:${color};">${text}</span>`);
  if (!p.known) { add('no scouting data', 'var(--yellow)'); return tags.join(''); }
  if (p.n < 3) add(`only ${p.n} match${p.n === 1 ? '' : 'es'} scouted`, 'var(--yellow)');
  const ranked = Object.values(teamStats).sort((a, b) => b.epa - a.epa).map(x => x.team);
  const rank = ranked.indexOf(t) + 1;
  if (rank && rank <= Math.max(3, Math.round(ranked.length * 0.1))) add(`#${rank} by EPA`, 'var(--green)');
  if (p.defRate >= 0.25 && p.defRating >= 2.5) add(`plays defense (${predRound(p.defRating, 1)}/5, ${Math.round(p.defRate * 100)}% of matches)`, 'var(--red)');
  if (p.auto >= Math.max(10, lg.auto * 1.5)) add(`strong auto (${predRound(p.auto, 0)} shots)`, 'var(--accent)');
  if (p.passed >= Math.max(12, lg.passed * 2)) add(`passes a lot (${predRound(p.passed, 0)})`, 'var(--text)');
  if (p.acc >= 80) add(`accurate (${Math.round(p.acc)}%)`, 'var(--green)');
  else if (p.acc && p.acc < 55) add(`inaccurate (${Math.round(p.acc)}%)`, 'var(--yellow)');
  if (p.incPerMatch >= 0.4) add('often has problems (comms / stuck / tipped)', 'var(--red)');
  if (s && s.ignoredEntries) add(`${s.ignoredEntries} typo ignored`, 'var(--muted)');
  return tags.join('');
}

// The last couple of things scouts wrote about each robot
function schedScoutNotes(teams) {
  const C = predGet();
  const out = teams.map(t => {
    const rows = (C.rows[t] || []).filter(r => r.notes && r.notes.trim()).sort((a, b) => n(b.match_number) - n(a.match_number)).slice(0, 2);
    if (!rows.length) return '';
    return `<div style="margin-top:6px"><span style="font-weight:700;color:var(--text)">${esc(t)}</span>` + rows.map(r => {
      const txt = r.notes.trim(), who = (r.username || '').split(' ')[0];
      return `<div style="color:var(--muted);font-size:12px;line-height:1.45;padding-left:10px;border-left:2px solid var(--border);margin:3px 0">Q${esc(r.match_number)}${who ? ' · ' + esc(who) : ''}: ${esc(txt.length > 170 ? txt.slice(0, 170) + '…' : txt)}</div>`;
    }).join('') + `</div>`;
  }).filter(Boolean).join('');
  return out;
}

function renderScheduleNext() {
  const list = document.getElementById('schedule-list');
  const msg = t => `<div class="empty"><p>${t}</p></div>`;
  const me = scheduleMyTeam;
  if (!me) { list.innerHTML = msg('Enter your team number above to see your next match'); return; }
  if (!schedMatchesFor(me).length) { list.innerHTML = msg(`Team ${esc(me)} isn't in the loaded schedule`); return; }
  const up = schedUpcoming();
  if (!up.length) { list.innerHTML = msg(`No matches left for ${esc(me)} from Q${schedCurrentMatch()} on. Change "Current match" above if that's wrong.`); return; }

  const m = up.find(x => String(x.match) === schedPick) || up[0];
  const usSide = m.red.includes(me) ? 'red' : 'blue', themSide = usSide === 'red' ? 'blue' : 'red';
  const us = m[usSide], them = m[themSide];
  const col = { red: '#e05555', blue: '#60a5fa' };
  const hasData = Object.keys(predGet().models).length > 0;

  let predHtml = '', watch = '';
  if (hasData && m.red.length && m.blue.length) {
    const sim = predSimulate(m.red, m.blue, 10000, predSeed(m.red, m.blue));     // the same run the Predict tab shows
    const pRed = predWinProb(sim), pUs = usSide === 'red' ? pRed : 1 - pRed;
    const level = predLevel(sim), us$ = sim[usSide], them$ = sim[themSide];
    const usPct = Math.round(pUs * 100);
    const verdict = pUs > 0.53 ? 'You are favoured' : pUs < 0.47 ? 'You are the underdog' : 'Too close to call';
    predHtml = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <div style="font-size:15px;font-weight:800;color:${pUs > 0.53 ? 'var(--green)' : pUs < 0.47 ? 'var(--red)' : 'var(--muted)'}">${verdict}</div>
        <div style="font-size:12px;color:var(--muted)">${level} confidence</div>
      </div>
      <div style="position:relative;height:26px;border-radius:13px;overflow:hidden;background:${col[themSide]}55;border:1px solid var(--border)">
        <div style="position:absolute;left:0;top:0;bottom:0;width:${usPct}%;background:${col[usSide]}"></div>
        <div style="position:absolute;inset:0;display:flex;justify-content:space-between;align-items:center;padding:0 12px;font-size:12px;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5)"><span>You ${usPct}%</span><span>${100 - usPct}% Them</span></div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Projected ${PRED.cal ? 'score' : 'strength'}: you <strong style="color:var(--text)">${Math.round(us$.mean + sim.a)}</strong> – them <strong style="color:var(--text)">${Math.round(them$.mean + sim.a)}</strong></div>`;

    // what to watch
    const bullets = [];
    const top = (side, teams) => { const r = sim[side].robots, i = r.indexOf(Math.max(...r)); return { team: teams[i], units: r[i], share: r[i] / Math.max(1e-9, r.reduce((a, b) => a + b, 0)) }; };
    const theirTop = top(themSide, them), ourTop = top(usSide, us);
    if (them.length >= 2 && predParams(theirTop.team).known) bullets.push(`Their biggest scorer is <strong>${esc(theirTop.team)}</strong> (about ${Math.round(theirTop.share * 100)}% of their output). Slowing that robot down is the biggest swing available.`);
    them.filter(t => { const p = predParams(t); return p.known && p.defRate >= 0.25 && p.defRating >= 2.5; }).forEach(t => {
      const p = predParams(t);
      bullets.push(`<strong>${esc(t)}</strong> often plays defense (${predRound(p.defRating, 1)}/5, ${Math.round(p.defRate * 100)}% of matches). Expect it to go after your top scorer${predParams(ourTop.team).known ? ' (' + esc(ourTop.team) + ')' : ''}.`);
    });
    const thin = [...us.filter(t => t !== me), ...them].filter(t => !predParams(t).known || predParams(t).n < 3);
    if (thin.length) bullets.push(`Little or no data on ${thin.map(esc).join(', ')}, so treat the prediction with care.`);
    const why = predExplain(sim);
    watch = (bullets.length || why.length) ? `
      <div style="${CARD_STYLE}">
        <div style="${CARD_H}">What to watch</div>
        ${bullets.map(b => `<div style="padding:5px 0;font-size:13px;line-height:1.5">• ${b}</div>`).join('')}
        ${why.length ? `<div style="font-size:11px;color:var(--muted);margin:8px 0 2px">Where the match is decided</div>` + why.map(l => `<div style="padding:3px 0;font-size:12px;color:var(--text)"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${l.side === 'red' ? '#e05555' : '#60a5fa'};margin-right:8px"></span>${l.text}</div>`).join('') : ''}
      </div>` : '';
  } else if (!hasData) {
    predHtml = `<div style="font-size:13px;color:var(--muted)">Load scouting data on the Import tab to see a prediction.</div>`;
  }

  const robotRows = (teams, side) => teams.map(t => {
    const s = teamStats[t], id = esc(String(t).replace(/[^\w-]/g, ''));
    return `<div onclick="showDetail('${id}')" style="cursor:pointer;padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <span style="font-size:16px;font-weight:800;color:${col[side]}">${flagEmoji(t)}${esc(t)}${t === me ? ' <span style="font-size:10px;color:var(--muted);font-weight:600">YOU</span>' : ''}</span>
        <span style="font-size:12px;color:var(--muted);text-align:right">${s ? `EPA ${s.epa} · ${s.avgTotalShots} shots${s.avgAccuracy ? ' · ' + s.avgAccuracy + '%' : ''}` : 'no scouting data'}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;font-size:11px">${schedTeamTags(t)}</div>
    </div>`;
  }).join('');

  const notes = schedScoutNotes([...them, ...us.filter(t => t !== me)]);
  const later = up.filter(x => x !== m).slice(0, 3);
  const me$ = String(m.match);
  list.innerHTML = `
    <div style="${CARD_STYLE}border-color:${col[usSide]}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div><span style="font-size:20px;font-weight:800;color:var(--accent)">Q${esc(me$)}</span>
          <span style="font-size:13px;color:var(--muted)"> · you are on <strong style="color:${col[usSide]}">${usSide === 'red' ? 'Red' : 'Blue'}</strong>${up[0] === m ? (n(m.match) === schedCurrentMatch() ? ' · current match' : ' · next up') : ''}</span></div>
        <button onclick="predictFromSchedule('${esc(me$)}');runPrediction()" style="background:var(--card2);border:1px solid var(--border);color:var(--accent);border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">Full prediction →</button>
      </div>
      ${predHtml}
    </div>
    ${watch}
    <div style="${CARD_STYLE}">
      <div style="${CARD_H};color:${col[usSide]}">Your alliance</div>${robotRows(us, usSide)}
    </div>
    <div style="${CARD_STYLE}">
      <div style="${CARD_H};color:${col[themSide]}">Opponents</div>${robotRows(them, themSide)}
    </div>
    ${notes ? `<div style="${CARD_STYLE}"><div style="${CARD_H}">What scouts wrote</div>${notes}</div>` : ''}
    ${later.length ? `<div style="${CARD_STYLE}"><div style="${CARD_H}">Your matches after this</div>${later.map(x => {
      const side = x.red.includes(me) ? 'red' : 'blue', mates = x[side].filter(t => t !== me), opp = x[side === 'red' ? 'blue' : 'red'];
      return `<div onclick="schedPickMatch('${esc(String(x.match))}')" style="cursor:pointer;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
        <strong style="color:var(--accent)">Q${esc(x.match)}</strong> <span style="color:${col[side]}">${side === 'red' ? 'Red' : 'Blue'}</span>
        <span style="color:var(--muted)"> · with ${mates.map(esc).join(', ') || '—'} · vs ${opp.map(esc).join(', ')}</span></div>`; }).join('')}</div>` : ''}`;
}
function schedMatchesFor(team) { return matchSchedule.filter(m => m.red.includes(team) || m.blue.includes(team)); }
const CARD_STYLE = 'background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;';
const CARD_H = 'font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px';

// ── STRENGTH OF SCHEDULE ───────────────────────────────────────────────────
// How hard is each team's schedule? Every scheduled match is simulated with the real alliances, and again with
// each team swapped for an exactly average robot. The average robot's expected wins on that team's schedule
// measure the schedule alone (partners and opponents), without the team's own ability. "Schedule effect" is how
// many wins that is above or below a typical schedule: negative = harder.
let sosCache = null, sosFocus = '';
function sosKey() { return predVersion + ':' + rawData.length + ':' + (PRED.cal ? 'c' : 'u') + ':' + matchSchedule.length + ':' + (matchSchedule[0] ? matchSchedule[0].red.join(',') : ''); }

function schedStrength() {
  const key = sosKey();
  if (sosCache && sosCache.key === key) return sosCache.val;
  const ms = matchSchedule.filter(m => m.red.length && m.blue.length);
  const C = predGet();
  const rate = predRating;
  const all = new Set(), known = new Set();
  ms.forEach(m => [...m.red, ...m.blue].forEach(t => { all.add(t); if (C.models[t]) known.add(t); }));
  const ratings = {}; all.forEach(t => { ratings[t] = rate(t); });
  const kv = [...known].map(t => ratings[t]);
  const field = (kv.length ? avg(kv) : rate(PRED.AVG)) || 1;
  // Strength score 0-100: where a robot ranks among the scouted robots at this event (50 = middle of the pack).
  // Ranks rather than raw output, so a couple of elite teams don't make everything else look weak. Unscouted = 50.
  const sortedR = kv.slice().sort((a, b) => a - b);
  const score = t => {
    if (!known.has(t) || sortedR.length < 2) return 50;
    let less = 0, eq = 0; sortedR.forEach(v => { if (v < ratings[t]) less++; else if (v === ratings[t]) eq++; });
    return 100 * (less + 0.5 * (eq - 1)) / (sortedR.length - 1);
  };
  const rel = list => list.length ? avg(list.map(score)) : 50;
  const N = 400, teams = {};
  ms.forEach(m => {
    const seed = predHash('sos|' + m.match + '|' + rawData.length);
    const pRed = predWinProb(predSimulate(m.red, m.blue, N, seed));
    ['red', 'blue'].forEach(side => {
      const mine = m[side], opp = m[side === 'red' ? 'blue' : 'red'];
      mine.forEach((t, i) => {
        const swapped = mine.slice(); swapped[i] = PRED.AVG;
        const pBaseRed = predWinProb(side === 'red' ? predSimulate(swapped, opp, N, seed) : predSimulate(opp, swapped, N, seed));
        const p = side === 'red' ? pRed : 1 - pRed, pb = side === 'red' ? pBaseRed : 1 - pBaseRed;
        const T = teams[t] = teams[t] || { team: t, known: known.has(t), rows: [] };
        const partners = mine.filter((_, j) => j !== i);
        T.rows.push({ match: m.match, side, p, pb, partners, opps: opp, partnerScore: rel(partners), oppScore: rel(opp) });
      });
    });
  });
  const list = Object.values(teams);
  let sumBase = 0, sumN = 0;
  list.forEach(T => { T.n = T.rows.length; T.E = T.rows.reduce((s, r) => s + r.p, 0); T.base = T.rows.reduce((s, r) => s + r.pb, 0); sumBase += T.base; sumN += T.n; });
  const rate0 = sumN ? sumBase / sumN : 0.5;                                                  // an average robot's win chance on a typical schedule
  list.forEach(T => {
    T.effect = T.base - T.n * rate0;
    T.partnerScore = avg(T.rows.map(r => r.partnerScore)); T.oppScore = avg(T.rows.map(r => r.oppScore));
    T.unscouted = T.rows.reduce((s, r) => s + r.opps.filter(t => !known.has(t)).length, 0);
  });
  list.sort((a, b) => (a.effect - b.effect) || (n(a.team) - n(b.team)));
  list.forEach((T, i) => { T.rank = i + 1; });
  const val = { teams: list, by: Object.fromEntries(list.map(T => [T.team, T])), field, matches: ms.length, known: known.size };
  sosCache = { key, val };
  return val;
}

function schedPickSos(team) { sosFocus = String(team); renderSchedule(); window.scrollTo(0, 0); }

function renderScheduleStrength() {
  const list = document.getElementById('schedule-list');
  const msg = t => `<div class="empty"><p>${t}</p></div>`;
  if (!Object.keys(predGet().models).length) { list.innerHTML = msg('Load scouting data on the Import tab to rate the schedule'); return; }
  if (!sosCache || sosCache.key !== sosKey()) {         // simulating every match takes a moment, so say so first
    list.innerHTML = msg('Working out every team’s schedule…');
    setTimeout(() => { schedStrength(); if (schedFilter === 'strength') renderSchedule(); }, 30);
    return;
  }
  const S = sosCache.val;
  if (!S.teams.length) { list.innerHTML = msg('The schedule has no matches to rate'); return; }
  // strength score out of 100 (50 = an average robot); green when it favours the team, red when it doesn't
  const rel = (v, goodWhenHigh) => {
    const d = v - 50, c = Math.abs(d) < 5 ? 'var(--muted)' : ((d > 0) === goodWhenHigh ? 'var(--green)' : 'var(--red)');
    return `<span style="color:${c}">${Math.round(v)}</span>`;
  };
  const eff = v => { const w = Math.round(v * 10) / 10, c = Math.abs(w) < 0.3 ? 'var(--muted)' : w > 0 ? 'var(--green)' : 'var(--red)'; return `<span style="color:${c};font-weight:700">${w > 0 ? '+' : w < 0 ? '−' : ''}${Math.abs(w).toFixed(1)}</span>`; };
  const col = { red: '#e05555', blue: '#60a5fa' };

  // focus card: the team picked from the table, else your team
  const focus = (sosFocus && S.by[sosFocus]) ? S.by[sosFocus] : (scheduleMyTeam && S.by[scheduleMyTeam]) ? S.by[scheduleMyTeam] : null;
  let card = '';
  if (focus) {
    const T = focus, verdict = T.effect <= -0.3 ? 'harder than a typical schedule' : T.effect >= 0.3 ? 'easier than a typical schedule' : 'about a typical schedule';
    const sorted = [...T.rows].sort((a, b) => a.p - b.p);
    const hard = new Set(sorted.slice(0, 3).map(r => r.match)), easy = new Set(sorted.slice(-3).map(r => r.match));
    card = `
      <div style="${CARD_STYLE}border-color:var(--accent)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <div style="font-size:20px;font-weight:800;color:var(--accent)">${flagEmoji(T.team)}${esc(T.team)}</div>
          <div style="font-size:12px;color:var(--muted)">#${T.rank} hardest of ${S.teams.length}</div>
        </div>
        <div style="font-size:14px;font-weight:700;margin-bottom:6px">${eff(T.effect)} wins: ${verdict}</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.6">
          Partners <strong>${rel(T.partnerScore, true)}</strong>/100 · Opponents <strong>${rel(T.oppScore, false)}</strong>/100 <span style="color:var(--muted)">(50 = an average robot, higher = stronger)</span><br>
          Expected wins: <strong style="color:var(--text)">${T.E.toFixed(1)}</strong> of ${T.n}${T.known ? '' : ' <span style="color:var(--yellow)">(no scouting data for this team, so it is treated as average)</span>'}
          · an average robot would get ${T.base.toFixed(1)}${T.unscouted ? `<br><span style="color:var(--yellow)">${T.unscouted} opposing robot${T.unscouted === 1 ? '' : 's'} on this schedule ${T.unscouted === 1 ? 'has' : 'have'} no scouting data (treated as average).</span>` : ''}
        </div>
        <div style="margin-top:10px">${T.rows.map(r => `
          <div onclick="predictFromSchedule('${esc(String(r.match))}');runPrediction()" style="cursor:pointer;padding:7px 0;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:12px">
            <span style="font-weight:800;color:var(--accent);min-width:34px">Q${esc(r.match)}</span>
            <span style="color:${col[r.side]};min-width:34px">${r.side === 'red' ? 'Red' : 'Blue'}</span>
            <span style="flex:1;color:var(--muted);min-width:0">with ${r.partners.map(esc).join(', ') || '—'} (${rel(r.partnerScore, true)}) · vs ${r.opps.map(esc).join(', ')} (${rel(r.oppScore, false)})</span>
            <span style="font-weight:700;min-width:62px;text-align:right;color:${r.p >= 0.55 ? 'var(--green)' : r.p <= 0.45 ? 'var(--red)' : 'var(--muted)'}">${Math.round(r.p * 100)}%${hard.has(r.match) && r.p < 0.5 ? ' ↓' : easy.has(r.match) && r.p > 0.5 ? ' ↑' : ''}</span>
          </div>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px">Win chances use the team's own scouting. Tap a match for its full prediction.</div>
      </div>`;
  }

  const th = 'padding:7px 6px;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);background:var(--card2);border-bottom:2px solid var(--border);text-align:center;white-space:nowrap;';
  const td = 'padding:7px 6px;border-bottom:1px solid var(--border);text-align:center;font-size:12px;';
  const rows = S.teams.map(T => `
    <tr onclick="schedPickSos('${esc(String(T.team).replace(/[^\w-]/g, ''))}')" style="cursor:pointer;${T.team === scheduleMyTeam ? 'background:rgba(240,165,0,.10)' : ''}">
      <td style="${td}color:var(--muted)">${T.rank}</td>
      <td style="${td}font-weight:800;color:var(--text)">${flagEmoji(T.team)}${esc(T.team)}</td>
      <td style="${td}">${T.n}</td>
      <td style="${td}">${rel(T.partnerScore, true)}</td>
      <td style="${td}">${rel(T.oppScore, false)}</td>
      <td style="${td}">${T.E.toFixed(1)}</td>
      <td style="${td}">${eff(T.effect)}</td>
    </tr>`).join('');
  list.innerHTML = card + `
    <div style="font-size:12px;color:var(--muted);line-height:1.5;margin:0 2px 8px">Hardest schedule first. <strong>Partners</strong> and <strong>Opponents</strong> rate the average robot a team plays with or against, out of 100: 50 is an average robot, higher is stronger. <strong>Schedule effect</strong> = wins an average robot would gain or lose on this team's schedule compared with a typical one, so it ignores how good the team is (− = harder). Tap a team for its matches.</div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--card)">
      <table style="width:100%;border-collapse:collapse"><thead><tr>
        <th style="${th}">#</th><th style="${th}">Team</th><th style="${th}">Matches</th><th style="${th}">Partners</th><th style="${th}">Opponents</th><th style="${th}">Exp. wins</th><th style="${th}">Schedule effect</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

// ── SCHEDULE IMAGE OCR ──────────────────────────────────────────────────────
function schedHandleDrop(e) {
  e.preventDefault();
  document.getElementById('sched-img-zone').style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) schedHandleFile(file);
}

function schedHandleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => schedExtractFromImage(ev.target.result);
  reader.readAsDataURL(file);
}

document.addEventListener('paste', e => {
  const onImport = document.getElementById('page-import')?.classList.contains('active');
  const onPredict = document.getElementById('page-predict')?.classList.contains('active');
  if (!onImport && !onPredict) return;
  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  if (onImport) schedHandleFile(item.getAsFile());
  else predHandleImages([item.getAsFile()]);       // a pasted screenshot on the Predict tab is a results picture
});

async function schedExtractFromImage(dataUrl) {
  const statusEl = document.getElementById('sched-img-status');
  statusEl.innerHTML = '<span style="color:var(--muted)">Loading OCR engine…</span>';
  try {
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    statusEl.innerHTML = '<span style="color:var(--muted)">Reading image… 0%</span>';
    const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text')
          statusEl.innerHTML = `<span style="color:var(--muted)">Reading image… ${Math.round(m.progress * 100)}%</span>`;
      }
    });
    const csv = parseOCRSchedule(text);
    if (!csv) {
      statusEl.innerHTML = '<span style="color:var(--red)">Could not find a schedule in the image. Try pasting the text manually.</span>';
      return;
    }
    const ta = document.getElementById('schedule-paste');
    if (ta) { ta.value = csv; parseSchedulePaste(); }
    statusEl.innerHTML = '<span style="color:var(--green)">✅ Schedule extracted from screenshot</span>';
  } catch(e) {
    statusEl.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
  }
}

function parseOCRSchedule(text) {
  const rows = [];
  let autoMatch = 1;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\D*(?:match|red|blue|alliance|team|qual)\D*$/i.test(line)) continue;
    // Drop start times ("10:42 AM") and dates ("3/28") so they aren't read as team numbers
    const cleaned = line.replace(/\b\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?/gi, ' ').replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ');
    const nums = (cleaned.match(/\d+/g) || []).map(Number);
    if (nums.length < 6) continue;
    let matchNum = autoMatch;
    const qualM = line.match(/(?:qual(?:ification)?\.?\s*|^q\s*)(\d+)/i);
    if (qualM) {
      matchNum = parseInt(qualM[1]);
      // The first number is the one in the "Qualification N" label itself — always drop it,
      // otherwise a row with a missing team would read the match number as a team.
      if (nums[0] === matchNum) nums.shift();
      // The OCR may also repeat the match number from a separate match-number column.
      while (nums.length > 6 && nums[0] === matchNum) nums.shift();
    } else if (nums.length >= 7) {
      matchNum = nums[0];
      nums.shift();
    }
    const teams = nums.slice(0, 6);
    if (teams.length < 6) continue;
    rows.push([matchNum, ...teams].join(','));
    autoMatch = matchNum + 1;
  }
  if (!rows.length) return null;
  return 'Match,Red 1,Red 2,Red 3,Blue 1,Blue 2,Blue 3\n' + rows.join('\n');
}

function parseSchedulePaste() {
  predSchedFromImage = false;      // a schedule typed or pasted by hand isn't one a screenshot should overwrite
  const text = document.getElementById('schedule-paste')?.value || '';
  const statusEl = document.getElementById('schedule-status');
  if (!text.trim()) {
    matchSchedule = [];
    localStorage.removeItem('frc_schedule');
    localStorage.removeItem('frc_schedule_raw');
    if (statusEl) statusEl.innerHTML = '';
    renderSchedule();
    return;
  }

  const lines = text.trim().replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim());
  if (lines.length < 1) { if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No data found.</span>'; return; }

  // Auto-detect delimiter: tab if first line has tabs, else comma
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const splitLine = l => delim === '\t' ? l.split('\t').map(v => v.trim()) : parseCSVLine(l);

  // Detect whether first line is a header (contains text like match/red/blue/qual)
  // or a data row (all numbers). Handle both cases.
  const firstVals = splitLine(lines[0]);
  // A row that holds six or more plain team numbers is data even if its label says "Qualification 1" or "Quals 1"
  // (that is what you get copying rows from an event page without the header line).
  const isTeamNumber = v => /^(?:frc)?\d{1,5}$/i.test(String(v).trim());
  const teamCols = firstVals.map((v, i) => isTeamNumber(v) ? i : -1).filter(i => i >= 0);
  const isHeaderRow = teamCols.length < 6 && firstVals.some(v => /match|red|blue|qual|alliance|team/i.test(v));

  let dataLines, matchCol, r1, r2, r3, b1, b2, b3;

  if (isHeaderRow) {
    const headers = firstVals.map(h => h.toLowerCase().replace(/[^a-z0-9]/g,' ').trim());
    const find = (...patterns) => {
      for (const p of patterns) {
        const i = headers.findIndex(h => h.includes(p));
        if (i >= 0) return i;
      }
      return -1;
    };
    matchCol = find('match number','match num','match #','match','qualification','qual','#');
    r1 = find('red 1','red1','red alliance 1','red team 1');
    r2 = find('red 2','red2','red alliance 2','red team 2');
    r3 = find('red 3','red3','red alliance 3','red team 3');
    b1 = find('blue 1','blue1','blue alliance 1','blue team 1');
    b2 = find('blue 2','blue2','blue alliance 2','blue team 2');
    b3 = find('blue 3','blue3','blue alliance 3','blue team 3');
    // Positional fallback for r3/b3 if not found by name
    if (r3 < 0 && r2 >= 0) r3 = r2 + 1;
    if (b3 < 0 && b2 >= 0) b3 = b2 + 1;
    dataLines = lines.slice(1);
  } else {
    // No header — the six teams are the last six plain numbers in the row (so an extra Start Time or label column
    // doesn't matter). A plain "Match, Red1..Blue3" row has the same six at columns 1-6.
    matchCol = 0;
    const firstIsMatchNumber = teamCols.length === 6 && teamCols[0] === 0;   // "12, t1..t5": a match number and only five teams
    if (teamCols.length >= 6 && !firstIsMatchNumber) [r1, r2, r3, b1, b2, b3] = teamCols.slice(-6);
    else { r1 = 1; r2 = 2; r3 = 3; b1 = 4; b2 = 5; b3 = 6; }
    dataLines = lines;
  }

  if (r1 < 0 || b1 < 0) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Couldn\'t detect Red/Blue columns. Make sure your header includes "Red 1", "Blue 1", etc.</span>';
    return;
  }

  const parseRows = (ir1, ir2, ir3, ib1, ib2, ib3) => dataLines.map((line, rowIdx) => {
    const vals = splitLine(line);
    const get = i => {
      if (i < 0 || i >= vals.length) return '';
      const v = (vals[i] || '').replace(/^frc/i, '').trim();
      return /^\d+$/.test(v) ? v : '';
    };
    const matchRaw = matchCol >= 0 ? (vals[matchCol] || '') : '';
    const matchNum = parseInt(matchRaw) || parseInt((matchRaw.match(/\d+/) || [])[0]) || (rowIdx + 1);
    return {
      match: matchNum,
      red: [get(ir1), get(ir2), get(ir3)].filter(Boolean),
      blue: [get(ib1), get(ib2), get(ib3)].filter(Boolean),
    };
  }).filter(m => m.red.length || m.blue.length);

  let rawRows = parseRows(r1, r2, r3, b1, b2, b3);

  // Filter rows that look like alliance-slot position markers (all 6 values are 1-6)
  // e.g. some schedule UIs show "1 2 3 | 1 2 3" as a sub-header
  const filtered = rawRows.filter(m => {
    const all = [...m.red, ...m.blue].map(Number);
    if (all.length === 6 && all.every(t => t >= 1 && t <= 6)) return false;
    return true;
  });

  // Deduplicate: if same match number appears twice keep the row with the
  // higher team-number sum (real FRC team numbers >> slot-marker numbers)
  const matchMap = new Map();
  filtered.forEach(m => {
    const existing = matchMap.get(m.match);
    if (!existing) {
      matchMap.set(m.match, m);
    } else {
      const sumE = [...existing.red, ...existing.blue].reduce((s,t) => s + (parseInt(t)||0), 0);
      const sumN = [...m.red, ...m.blue].reduce((s,t) => s + (parseInt(t)||0), 0);
      if (sumN > sumE) matchMap.set(m.match, m);
    }
  });
  matchSchedule = [...matchMap.values()].sort((a,b) => a.match - b.match);

  localStorage.setItem('frc_schedule', JSON.stringify(matchSchedule));
  localStorage.setItem('frc_schedule_raw', text);

  // Detect if Blue 3 is missing from all/most rows (happens when OCR bug
  // ate one team slot — the lost data cannot be recovered from the saved CSV)
  const missingBlue3 = matchSchedule.filter(m => m.blue.length < 3).length;
  const truncated = missingBlue3 > matchSchedule.length * 0.5;

  const dbgCols = `delim:${delim==='\t'?'tab':'comma'} header:${isHeaderRow} match:${matchCol} R:${r1},${r2},${r3} B:${b1},${b2},${b3}`;
  const statusHTML = truncated
    ? `<span style="color:var(--red)">⚠️ Schedule is missing Blue 3 teams — the saved data was corrupted. Please re-scan or re-paste your schedule.</span>`
    : `<span style="color:var(--green)">✅ ${matchSchedule.length} matches loaded</span>`;
  if (statusEl) statusEl.innerHTML =
    statusHTML +
    `<details style="margin-top:6px;"><summary style="color:var(--muted);font-size:11px;cursor:pointer;">Show parsed data (click to verify)</summary>`+
    `<pre style="font-size:10px;color:var(--muted);margin:4px 0 0;">${dbgCols}\n${matchSchedule.slice(0,5).map(m=>`Q${m.match} R[${m.red.join(',')}] B[${m.blue.join(',')}]`).join('\n')}</pre></details>`;
  renderSchedule();
}

function renderSchedule() {
  const list = document.getElementById('schedule-list');
  if (!list) return;

  if (!matchSchedule.length) {
    list.innerHTML = '<div class="empty"><p>Import a match schedule CSV on the Import tab</p></div>';
    return;
  }

  if (schedFilter === 'compare') { renderScheduleCompare(); return; }
  if (schedFilter === 'next') { renderScheduleNext(); return; }
  if (schedFilter === 'strength') { renderScheduleStrength(); return; }

  let matches = matchSchedule;
  if (schedFilter === 'mine' && scheduleMyTeam) {
    matches = matches.filter(m => m.red.includes(scheduleMyTeam) || m.blue.includes(scheduleMyTeam));
  }

  list.innerHTML = matches.map(m => schedMatchCard(m, scheduleMyTeam)).join('');
}

// One match card (Red / Blue team pills). `focus` is the team to highlight.
// opts: compact (narrow two-column layout), label (header text), accent (highlight color)
function schedMatchCard(m, focus, opts = {}) {
  const compact = !!opts.compact;
  const accent = opts.accent || 'var(--accent)';
  const isFocusMatch = !!focus && (m.red.includes(focus) || m.blue.includes(focus));
  const label = opts.label !== undefined ? opts.label : `Q${m.match}${isFocusMatch ? ' ← YOUR MATCH' : ''}`;

  const teamPill = (t, alliance) => {
    const isMe = t === focus;
    const flag = flagEmoji(t);
    const status = teamStatus[t];
    const epa = teamStats[t]?.epa;
    const color = alliance === 'red' ? '#e05555' : '#3b82f6';
    return `<div style="background:var(--card2);border:1px solid ${isMe ? color : 'var(--border)'};border-radius:8px;padding:${compact ? '4px 2px' : '5px 8px'};min-width:0;flex:1;text-align:center">
      <div style="font-size:${compact ? 12 : 13}px;font-weight:${isMe?'800':'700'};color:${isMe?color:'var(--text)'}">${flag}${t}</div>
      ${epa !== undefined ? `<div style="font-size:${compact ? 9 : 10}px;color:var(--muted)">${epa} EPA</div>` : ''}
      ${status === 'taken' ? '<div style="font-size:9px;color:var(--muted)">TAKEN</div>' : status === 'dnp' ? '<div style="font-size:9px;color:var(--red)">DNP</div>' : ''}
    </div>`;
  };

  return `
    <div style="background:var(--card);border:1px solid ${isFocusMatch ? accent : 'var(--border)'};border-radius:var(--radius);padding:${compact ? '8px' : '10px 12px'};margin-bottom:${compact ? 0 : 8}px;min-width:0">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:${compact ? 6 : 8}px">
        <div style="font-size:11px;font-weight:700;color:${isFocusMatch ? accent : 'var(--muted)'}">${label}</div>
        <button onclick="predictFromSchedule('${m.match}')" style="background:var(--card2);border:1px solid var(--border);color:var(--accent);border-radius:8px;padding:${compact ? '3px 6px' : '4px 10px'};font-size:${compact ? 10 : 11}px;font-weight:700;cursor:pointer;white-space:nowrap">${compact ? 'Predict' : 'Predict →'}</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:${compact ? 4 : 6}px">
        <div>
          <div style="font-size:9px;color:#e05555;font-weight:700;margin-bottom:4px;text-transform:uppercase">Red</div>
          <div style="display:flex;flex-direction:column;gap:3px">${m.red.map(t => teamPill(t,'red')).join('')}</div>
        </div>
        <div>
          <div style="font-size:9px;color:#3b82f6;font-weight:700;margin-bottom:4px;text-transform:uppercase">Blue</div>
          <div style="display:flex;flex-direction:column;gap:3px">${m.blue.map(t => teamPill(t,'blue')).join('')}</div>
        </div>
      </div>
    </div>`;
}

// Fill the Predict tab with a scheduled match's alliances and switch to it
function predictFromSchedule(matchNum) {
  const m = matchSchedule.find(x => String(x.match) === String(matchNum));
  if (!m) return;
  ['red', 'blue'].forEach(color => {
    for (let i = 0; i < 3; i++) document.getElementById(color + (i + 1)).value = m[color][i] || '';
  });
  clearPrediction();
  showPage('predict');
  window.scrollTo(0, 0);
}

(window.APP_PARTS = window.APP_PARTS || []).push('schedule');
