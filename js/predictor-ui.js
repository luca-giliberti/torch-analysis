// Torch Analysis: Predict tab, forecast, calibration, results screenshots, data quality card
// Classic script, loaded in order by index.html (all files share one global scope).

// ── MATCH PREDICTOR ────────────────────────────────────────────────────────
var predictCharts = [];
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' || !document.getElementById('page-predict').classList.contains('active')) return;
  const id = e.target && e.target.id;
  if (/^(red|blue)[123]$/.test(id)) runPrediction();      // the six team boxes
  else if (id === 'whatif-team') predWhatIf();
});
function clearAllTeams() {
  ['red1','red2','red3','blue1','blue2','blue3'].forEach(id => document.getElementById(id).value = '');
  clearPrediction();
}
function clearPrediction() {
  predLast = null;
  document.getElementById('predict-result').style.display = 'none';
  document.getElementById('predict-err').textContent = '';
  predictCharts.forEach(c => c.destroy());
  predictCharts = [];
  document.getElementById('predict-charts').innerHTML = '';
}

// ═══ PREDICTOR UI BEGIN ════════════════════════════════════════════════════
let predLast = null;          // the prediction on screen: { red, blue, seed, sim }
let predResults = {};         // real scores: { match: { match, red, blue } }
let predReport = null;        // last backtest report
const predRound = (v, d = 0) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };
const predEl = id => document.getElementById(id);
const PRED_CHIP = 'background:var(--card2);border-radius:5px;padding:2px 7px;';

function predTeamsFromInputs() {
  const vals = ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'].map(id => predEl(id).value.replace(/\D/g, ''));
  return { red: vals.slice(0, 3).filter(Boolean), blue: vals.slice(3).filter(Boolean) };
}
// The seed depends on the data itself (not on how many times it was loaded), so the same teams and the
// same data always give the same prediction, even after reloading the page.
function predSeed(red, blue) { return predHash(red.join(',') + '|' + blue.join(',') + '|' + rawData.length + '|' + (PRED.cal ? 'c' : 'u')); }

function runPrediction() {
  const { red, blue } = predTeamsFromInputs();
  if (!red.length || !blue.length) { predEl('predict-err').textContent = 'Enter at least one team per alliance.'; return; }
  predEl('predict-err').textContent = '';
  const seed = predSeed(red, blue);
  const sim = predSimulate(red, blue, 10000, seed);
  predLast = { red, blue, seed, sim };
  renderPrediction(sim);
}

// Plain-language reasons: where one alliance is ahead, defense, and reliability
function predExplain(sim) {
  const lines = [], R = sim.red, B = sim.blue;
  PRED.COMPS.map(k => ({ k, d: R.comps[k] - B.comps[k] })).filter(x => Math.abs(x.d) >= 0.5)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3)
    .forEach(x => lines.push({ side: x.d > 0 ? 'red' : 'blue', text: `${PRED.LABELS[x.k]}: ${x.d > 0 ? 'Red' : 'Blue'} ahead by ${Math.round(Math.abs(x.d))}` }));
  ['red', 'blue'].forEach(side => {      // side's top scorer is being defended by the other alliance
    const S = sim[side], opp = side === 'red' ? 'blue' : 'red', tg = sim.target[side];
    const top = Object.entries(tg).sort((a, b) => b[1] - a[1])[0];
    if (S.defLoss >= 1 && top) lines.push({ side: opp, text: `${opp === 'red' ? 'Red' : 'Blue'}'s defense costs ${side === 'red' ? 'Red' : 'Blue'} about ${Math.round(S.defLoss)} (mostly on ${top[0]})` });
  });
  if (Math.abs(R.relLoss - B.relLoss) >= 1.5) {
    const worse = R.relLoss > B.relLoss ? 'red' : 'blue';
    lines.push({ side: worse === 'red' ? 'blue' : 'red', text: `Reliability: ${worse === 'red' ? 'Red' : 'Blue'} loses about ${Math.round(Math.max(R.relLoss, B.relLoss))} to incidents vs ${Math.round(Math.min(R.relLoss, B.relLoss))}` });
  }
  return lines;
}

function predRobotDetail(team, mean) {
  const p = predParams(team), st = teamStats[team];
  return { team, known: p.known, adjustedScore: Math.round(mean), score: mean, n: p.n,
    epa: st ? st.epa : null, shots: st ? st.avgTotalShots : null,
    auto: predRound(p.auto, 1), acc: Math.round(p.acc), passed: predRound(p.passed, 1), speed: predRound(p.speed, 1),
    defense: predRound(p.defRating, 1), climbAvg: predRound(p.climb, 1),
    reliability: p.known ? Math.round(p.relMult * 100) : null, consistency: p.known ? Math.round(p.cvPenalty * 100) : null, dataQuality: p.quality };
}

// Low / Medium / High: how far apart the alliances are, and how much scouting backs the numbers
function predLevel(sim) {
  const pRed = predWinProb(sim), pWin = Math.max(pRed, 1 - pRed);
  const ps = [...sim.redTeams, ...sim.blueTeams].map(predParams);
  const minN = Math.min(...ps.map(p => p.n)), unknown = ps.filter(p => !p.known).length;
  if (pWin < 0.6 || minN < 3 || unknown) return 'Low';
  if (pWin >= 0.75 && minN >= 6) return 'High';
  return 'Medium';
}
function renderPrediction(sim) {
  const pRed = predWinProb(sim);
  const winner = pRed > 0.5 ? 'red' : 'blue', pWin = Math.max(pRed, 1 - pRed);
  const allTeams = [...sim.redTeams, ...sim.blueTeams], ps = allTeams.map(predParams);
  const level = predLevel(sim);

  const banner = predEl('predict-banner'), isRed = winner === 'red';
  if (pWin < 0.53) {
    banner.style.background = 'rgba(136,136,136,.12)'; banner.style.border = '1px solid rgba(136,136,136,.3)';
    predEl('predict-winner-label').textContent = 'Prediction';
    predEl('predict-winner-name').style.color = '#888'; predEl('predict-winner-name').textContent = 'Too Close to Call';
  } else {
    banner.style.background = isRed ? 'rgba(224,85,85,.12)' : 'rgba(59,130,246,.12)';
    banner.style.border = `1px solid ${isRed ? 'rgba(224,85,85,.4)' : 'rgba(59,130,246,.4)'}`;
    predEl('predict-winner-label').textContent = 'Predicted Winner';
    predEl('predict-winner-name').style.color = isRed ? '#e05555' : '#60a5fa';
    predEl('predict-winner-name').textContent = isRed ? 'Red Alliance' : 'Blue Alliance';
  }
  // Confidence bar: red's win chance fills from the left, blue's from the right
  const redPct = Math.round(pRed * 100), bluePct = 100 - redPct;
  predEl('predict-confidence').textContent = `${level} confidence`;
  predEl('bar-red').style.width = redPct + '%';
  predEl('bar-red-label').textContent = `Red ${redPct}%`;
  predEl('bar-blue-label').textContent = `Blue ${bluePct}%`;

  predEl('pred-red-score').textContent = Math.round(sim.red.mean + sim.a);
  predEl('pred-blue-score').textContent = Math.round(sim.blue.mean + sim.a);

  // why
  const why = predExplain(sim);
  predEl('predict-why-content').innerHTML = why.length
    ? why.map(l => `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text)"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${l.side === 'red' ? '#e05555' : '#60a5fa'};margin-right:8px"></span>${l.text}</div>`).join('')
    : '<div style="font-size:13px;color:var(--muted)">The alliances are almost identical on every measure.</div>';

  // notes about data
  const notes = [];
  ps.filter(p => !p.known).forEach(p => notes.push(`Team ${p.team} has no scouting data — estimated as an average robot with a wide spread.`));
  ps.filter(p => p.known && p.n < 3).forEach(p => notes.push(`Team ${p.team} has only ${p.n} scouted match${p.n === 1 ? '' : 'es'} — treat its numbers with caution.`));
  const C = predGet();
  allTeams.forEach(t => C.flags.filter(f => f.team === t).forEach(f => notes.push(`Ignored a suspicious scout entry for ${t}: Q${f.match} ${f.col} = ${Math.round(f.value)} (their other matches peak far lower).`)));
  if (!C.stats.climbSeen) notes.push('The scouting data has no climb information, so climbing is not part of this prediction.');
  predEl('predict-notes').innerHTML = notes.length
    ? `<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Data notes</div>` + notes.map(t => `<div style="font-size:12px;color:var(--yellow);padding:3px 0">⚠ ${t}</div>`).join('')
    : '';
  predEl('predict-notes').style.display = notes.length ? 'block' : 'none';

  // per-team breakdown + charts
  const redD = sim.redTeams.map((t, i) => predRobotDetail(t, sim.red.robots[i]));
  const blueD = sim.blueTeams.map((t, i) => predRobotDetail(t, sim.blue.robots[i]));
  predEl('predict-breakdown-content').innerHTML = predBreakdownRows(redD, '#e05555') + predBreakdownRows(blueD, '#60a5fa');
  predRenderCharts(redD, blueD);

  predRenderImpact(sim);
  const opts = [...sim.redTeams.map((t, i) => `Red ${i + 1} · ${t}`), ...sim.blueTeams.map((t, i) => `Blue ${i + 1} · ${t}`)];
  predEl('whatif-slot').innerHTML = opts.map((o, i) => `<option value="${i}">${o}</option>`).join('');
  predEl('whatif-team').value = ''; predEl('whatif-result').innerHTML = '';
  predEl('predict-result').style.display = 'block';
}

function predBreakdownRows(details, color) {
  return details.map(d => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
        <div style="font-size:14px;font-weight:700;color:${color};">Team ${d.team}${!d.known ? ' <span style="font-size:10px;color:var(--muted);">(estimated)</span>' : ''}</div>
        <div style="font-size:12px;color:var(--muted);">Contribution: <strong style="color:var(--text);">${d.adjustedScore}</strong></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;">
        ${d.epa !== null ? `<span style="${PRED_CHIP}color:var(--text);">EPA ${d.epa}</span>` : ''}
        ${d.shots !== null ? `<span style="${PRED_CHIP}color:var(--text);">Shots ${d.shots}</span>` : ''}
        ${d.auto ? `<span style="${PRED_CHIP}color:var(--accent);">Auto ${d.auto}</span>` : ''}
        ${d.acc ? `<span style="${PRED_CHIP}color:var(--text);">Acc ${d.acc}%</span>` : ''}
        ${d.passed ? `<span style="${PRED_CHIP}color:var(--text);">Pass ${d.passed}</span>` : ''}
        ${d.speed ? `<span style="${PRED_CHIP}color:var(--text);">Spd ${d.speed}/5</span>` : ''}
        ${d.defense ? `<span style="${PRED_CHIP}color:var(--red);">Def ${d.defense}/5</span>` : ''}
        ${d.climbAvg ? `<span style="${PRED_CHIP}color:var(--green);">Climb ${d.climbAvg}</span>` : ''}
        ${d.reliability !== null ? `<span style="${PRED_CHIP}color:${d.reliability >= 90 ? 'var(--green)' : d.reliability >= 75 ? 'var(--yellow)' : 'var(--red)'};">Reliability ${d.reliability}%</span>` : ''}
        ${d.consistency !== null ? `<span style="${PRED_CHIP}color:${d.consistency >= 90 ? 'var(--green)' : d.consistency >= 75 ? 'var(--yellow)' : 'var(--red)'};">Consistency ${d.consistency}%</span>` : ''}
        ${d.known ? `<span style="${PRED_CHIP}color:${d.n >= 6 ? 'var(--green)' : d.n >= 3 ? 'var(--yellow)' : 'var(--red)'};">${d.n} match${d.n === 1 ? '' : 'es'} scouted</span>` : ''}
      </div>
    </div>`).join('');
}

function predRenderCharts(redD, blueD) {
  predictCharts.forEach(c => c.destroy());
  predictCharts = [];
  if (typeof Chart === 'undefined') {     // the chart library didn't load: the prediction itself doesn't need it
    predEl('predict-charts').innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 2px">The charts could not load (chart.umd.min.js is missing or blocked), but the prediction above is complete.</div>';
    return;
  }
  const all = [...redD, ...blueD], labels = all.map(d => 'T' + d.team);
  const bg = [...redD.map(() => 'rgba(224,85,85,.7)'), ...blueD.map(() => 'rgba(59,130,246,.7)')];
  const border = [...redD.map(() => '#e05555'), ...blueD.map(() => '#60a5fa')];
  const defs = [
    { label: 'Score Contribution', data: all.map(d => d.adjustedScore) },
    { label: 'EPA', data: all.map(d => typeof d.epa === 'number' ? d.epa : 0) },
    { label: 'Avg Total Shots', data: all.map(d => d.shots !== null ? d.shots : 0) },
    { label: 'Auto Shots', data: all.map(d => d.auto || 0) },
    { label: 'Accuracy %', data: all.map(d => d.acc || 0) },
    { label: 'Passing', data: all.map(d => d.passed || 0) },
    { label: 'Speed (1–5)', data: all.map(d => d.speed || 0) },
    { label: 'Defense (1–5)', data: all.map(d => d.defense || 0) },
    { label: 'Avg Climb Level', data: all.map(d => d.climbAvg || 0) },
    { label: 'Reliability %', data: all.map(d => d.reliability !== null ? d.reliability : 0) },
    { label: 'Consistency %', data: all.map(d => d.consistency !== null ? d.consistency : 0) },
    { label: 'Matches Scouted', data: all.map(d => d.n || 0) },
  ].filter(def => def.data.some(v => v > 0));
  const box = predEl('predict-charts'); box.innerHTML = '';
  const opts = () => ({ responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1c1c1c', titleColor: '#f0f0f0', bodyColor: '#888', borderColor: '#2e2e2e', borderWidth: 1 } },
    scales: { x: { ticks: { color: '#888', font: { size: 11 } }, grid: { color: '#2e2e2e' } }, y: { min: 0, ticks: { color: '#888', font: { size: 11 } }, grid: { color: '#2e2e2e' } } } });
  defs.forEach(def => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;';
    wrap.innerHTML = `<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">${def.label}</div><div style="position:relative;height:160px;"><canvas></canvas></div>`;
    box.appendChild(wrap);
    predictCharts.push(new Chart(wrap.querySelector('canvas'), { type: 'bar',
      data: { labels, datasets: [{ data: def.data, backgroundColor: bg, borderColor: border, borderWidth: 2, borderRadius: 5 }] }, options: opts() }));
  });
}

// ── what each robot adds, and "what if" swaps ─────────────────────────────
// Same random seed for the baseline and every swap, so the differences are real effects, not noise.
function predRenderImpact(sim) {
  const N = 3000, seed = predSeed(sim.redTeams, sim.blueTeams) ^ 0x5bd1e995;
  const base = predWinProb(predSimulate(sim.redTeams, sim.blueTeams, N, seed));
  const rows = [];
  sim.redTeams.forEach((t, i) => { const r = sim.redTeams.slice(); r[i] = PRED.AVG; rows.push({ team: t, side: 'red', delta: base - predWinProb(predSimulate(r, sim.blueTeams, N, seed)) }); });
  sim.blueTeams.forEach((t, i) => { const b = sim.blueTeams.slice(); b[i] = PRED.AVG; rows.push({ team: t, side: 'blue', delta: (1 - base) - (1 - predWinProb(predSimulate(sim.redTeams, b, N, seed))) }); });
  rows.sort((a, b) => b.delta - a.delta);
  predEl('predict-impact-content').innerHTML = rows.map(r => {
    const pts = Math.round(r.delta * 100);
    return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
      <span style="color:${r.side === 'red' ? '#e05555' : '#60a5fa'};font-weight:700">Team ${r.team}</span>
      <span style="color:${pts > 0 ? 'var(--green)' : pts < 0 ? 'var(--red)' : 'var(--muted)'};font-weight:700">${pts > 0 ? '+' : ''}${pts}% win chance</span></div>`;
  }).join('');
}

function predWhatIf() {
  if (!predLast) return;
  const team = predEl('whatif-team').value.replace(/\D/g, ''), out = predEl('whatif-result');
  if (!team) { out.innerHTML = '<div style="font-size:12px;color:var(--red);margin-top:8px">Enter a team number to swap in.</div>'; return; }
  const idx = +predEl('whatif-slot').value, red = predLast.red.slice(), blue = predLast.blue.slice();
  if (idx < red.length) red[idx] = team; else blue[idx - red.length] = team;
  const s2 = predSimulate(red, blue, 10000, predLast.seed), p0 = predWinProb(predLast.sim), p1 = predWinProb(s2);
  const d = Math.round((p1 - p0) * 100), a = s2.a;
  out.innerHTML = `<div style="margin-top:10px;font-size:13px;line-height:1.6">
    <div>Red win chance: <strong>${Math.round(p0 * 100)}%</strong> → <strong style="color:${d > 0 ? '#e05555' : d < 0 ? '#60a5fa' : 'var(--muted)'}">${Math.round(p1 * 100)}%</strong> (${d > 0 ? '+' : ''}${d})</div>
    <div style="color:var(--muted)">Projected: Red ${Math.round(s2.red.mean + a)} · Blue ${Math.round(s2.blue.mean + a)}${predParams(team).known ? '' : ' · team ' + team + ' has no data (estimated)'}</div>
    <button class="btn secondary" style="margin-top:8px" onclick="predUseLineup('${red.join(',')}','${blue.join(',')}')">Use this lineup</button></div>`;
}
function predUseLineup(red, blue) {
  const r = red.split(','), b = blue.split(',');
  ['red1', 'red2', 'red3'].forEach((id, i) => { predEl(id).value = r[i] || ''; });
  ['blue1', 'blue2', 'blue3'].forEach((id, i) => { predEl(id).value = b[i] || ''; });
  runPrediction();
}

// ── forecast the whole schedule ────────────────────────────────────────────
function predForecast() {
  const out = predEl('forecast-output');
  if (!matchSchedule.length) { out.innerHTML = '<div class="empty"><p>Load a match schedule on the Import tab first</p></div>'; return; }
  if (!Object.keys(predGet().models).length) { out.innerHTML = '<div class="empty"><p>Load scouting data on the Import tab first</p></div>'; return; }
  const onlyOpen = predEl('forecast-open').checked;
  let judged = 0, right = 0;
  const body = matchSchedule.filter(m => m.red.length && m.blue.length).map(m => {
    const res = predResults[m.match];
    if (onlyOpen && res) return '';
    const run = () => predSimulate(m.red, m.blue, 1500, predHash('f' + m.match + '|' + rawData.length + (PRED.cal ? 'c' : 'u')));
    const sim = res ? predWithout(n(m.match), run) : run();      // a match that was already played is predicted without its own scouting
    const pRed = predWinProb(sim), side = pRed >= 0.5 ? 'red' : 'blue', pw = Math.max(pRed, 1 - pRed);
    let actual = '', mark = '';
    if (res) {
      actual = `${res.red}–${res.blue}`;
      if (res.red !== res.blue) { judged++; const ok = (res.red > res.blue ? 'red' : 'blue') === side; if (ok) right++; mark = ok ? '✓' : '✗'; }
    }
    const td = 'padding:7px 6px;border-bottom:1px solid var(--border);text-align:center;font-size:12px;';
    return `<tr onclick="predForecastOpen('${m.match}')" style="cursor:pointer">
      <td style="${td}color:var(--accent);font-weight:700">Q${m.match}</td>
      <td style="${td}color:${side === 'red' ? '#e05555' : '#60a5fa'};font-weight:700">${side === 'red' ? 'Red' : 'Blue'} ${Math.round(pw * 100)}%</td>
      <td style="${td}">${Math.round(sim.red.mean + sim.a)} – ${Math.round(sim.blue.mean + sim.a)}</td>
      <td style="${td}color:var(--muted)">${actual}</td>
      <td style="${td}font-weight:800;color:${mark === '✓' ? 'var(--green)' : 'var(--red)'}">${mark}</td></tr>`;
  }).join('');
  const th = 'padding:7px 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);background:var(--card2);border-bottom:2px solid var(--border);text-align:center;';
  out.innerHTML = (judged ? `<div style="font-size:13px;margin:8px 2px"><strong>${right}/${judged}</strong> winners picked correctly (${Math.round(right / judged * 100)}%) <span style="color:var(--muted)">— each match predicted without its own scouting</span></div>` : '') +
    (body ? `<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);margin-top:8px"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="${th}">Match</th><th style="${th}">Pick</th><th style="${th}">Projected${PRED.cal ? '' : ' (units)'}</th><th style="${th}">Actual</th><th style="${th}"></th></tr></thead><tbody>${body}</tbody></table></div>`
      : '<div class="empty"><p>No matches to show</p></div>');
}
function predForecastOpen(match) { predictFromSchedule(match); runPrediction(); window.scrollTo(0, 0); }

// ── calibrate with real results ────────────────────────────────────────────
function predRunCalibration() {
  const text = predEl('results-paste').value;
  const parsed = predParseResults(text);
  predResults = parsed.results;
  try { localStorage.setItem('frc_results_raw', text); } catch (e) {}
  predReport = predBacktest(predResults);
  predRenderCalibration(parsed.skipped);
}
function predRenderCalibration(skipped) {
  const out = predEl('pred-cal-output'), r = predReport, cal = PRED.cal;
  const pct = h => h.t ? `${h.c}/${h.t} (${Math.round(h.c / h.t * 100)}%)` : 'n/a';
  let html = '';
  if (cal) html += `<div style="background:rgba(76,175,125,.12);border:1px solid rgba(76,175,125,.35);border-radius:10px;padding:10px 12px;margin-top:10px;font-size:13px">✅ Calibration applied — fitted on ${cal.n} matches, typical error ±${Math.round(cal.sigma)} points. Predictions are now in points. <button class="remove-btn" style="color:var(--red);font-size:12px" onclick="predResetCalibration()">Remove</button></div>`;
  if (!r) { out.innerHTML = html; return; }
  html += `<div style="font-size:13px;margin-top:10px;line-height:1.6">Read <strong>${r.loaded}</strong> results${skipped ? ` (skipped ${skipped} unreadable line${skipped === 1 ? '' : 's'})` : ''}; <strong>${r.usable}</strong> matched to your loaded schedule.`;
  if (r.usable < 4) { out.innerHTML = html + '<div style="color:var(--yellow);margin-top:6px">Load the match schedule (Import tab) and make sure match numbers line up, then try again.</div></div>'; return; }
  if (!Object.keys(predGet().models).length) { out.innerHTML = html + '<div style="color:var(--yellow);margin-top:6px">Load your scouting data (Import tab) first. The model needs it to make predictions to compare with these scores.</div></div>'; return; }
  html += `<div style="margin-top:6px">Untuned model picks the winner in <strong>${pct(r.defaultAcc)}</strong>; a plain sum of team EPAs picks <strong>${pct(r.epaAcc)}</strong>.</div>`;
  if (!r.fit) { out.innerHTML = html + `<div style="color:var(--muted);margin-top:6px">Add at least 10 results to fit the model to them (have ${r.usable}).</div></div>`; return; }
  const f = r.fit, good = f.cvRmse < 0.9 * r.naiveRmse;
  html += `<div style="margin-top:6px">Tuned model, tested on matches it wasn't fitted to: winner <strong>${f.cvAcc === null ? '—' : Math.round(f.cvAcc * 100) + '%'}</strong>, typical score error <strong>±${Math.round(f.cvRmse)}</strong> points (guessing the average would be ±${Math.round(r.naiveRmse)}).</div>`;
  const tr = k => { const i = PRED.COMPS.indexOf(k), shown = r.compSd[i] >= 0.05 * r.totalSd; return `<tr><td style="padding:3px 8px 3px 0">${PRED.LABELS[k]}</td><td style="padding:3px 0;text-align:right">${shown ? f.u[k].toFixed(2) + ' pts per unit' : '<span style="color:var(--muted)">too little variation to tell</span>'}</td></tr>`; };
  html += `<table style="margin-top:8px;font-size:12px;border-collapse:collapse">${PRED.COMPS.map(tr).join('')}</table>`;
  html += `<div style="color:var(--muted);margin-top:6px;font-size:11px">Every match above was predicted without its own scouting, the way it would have been before it was played.</div></div>`;
  if (good) html += `<button class="btn" onclick="predApplyCalibration()">Apply calibration</button>`;
  else html += `<div style="color:var(--yellow);margin-top:8px;font-size:13px">⚠ The tuned model isn't clearly better than guessing on these results, so I won't apply it. More matches or better-matched results may help.</div>`;
  out.innerHTML = html;
}
function predApplyCalibration() {
  if (!predReport || !predReport.fit) return;
  PRED.cal = predReport.fit;
  try { localStorage.setItem('frc_pred_cal', JSON.stringify(PRED.cal)); } catch (e) {}
  predRenderCalibration(0);
  if (predLast) runPrediction();
}
function predResetCalibration() {
  PRED.cal = null;
  try { localStorage.removeItem('frc_pred_cal'); } catch (e) {}
  predRenderCalibration(0);
  if (predLast) runPrediction();
}
function predLoadSaved() {
  try { const c = JSON.parse(localStorage.getItem('frc_pred_cal') || 'null'); if (c && c.u && c.sigma > 0) PRED.cal = c; } catch (e) {}
  try {
    const raw = localStorage.getItem('frc_results_raw');
    if (raw) { predEl('results-paste').value = raw; predResults = predParseResults(raw).results; }
  } catch (e) {}
  predRenderCalibration(0);
}

// ── results from a screenshot ──────────────────────────────────────────────
// Read the same way the schedule screenshot is read (same OCR engine). A results row looks like
// "Quals 12  617 540 4472  1731 6802 3258  97  62": the match, the six teams, then the red and blue scores.
let predSchedFromImage = false;   // true while the loaded schedule came from a screenshot (so more pictures extend it)

function predParseOCRResults(text) {
  const rows = []; let unreadable = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const lab = line.match(/(?:^|\s)(?:qual(?:ification)?s?\.?|q)\s*(\d+)/i);
    if (!lab) continue;
    const nums = (line.slice(lab.index + lab[0].length).match(/\d+/g) || []).map(Number);
    let teams = null, red, blue;
    if (nums.length >= 8) {
      teams = nums.slice(0, 6);
      [red, blue] = nums.slice(-2);      // anything extra (the little ranking-point dots can come out as digits) sits before the scores
      if (!teams.every(t => t >= 1 && t <= 30000)) { unreadable++; continue; }
    } else if (nums.length === 2) {
      [red, blue] = nums;                // a table with only the scores
    } else { unreadable++; continue; }
    if (!(red <= 999 && blue <= 999)) { unreadable++; continue; }
    rows.push({ match: +lab[1], teams, red, blue });
  }
  return { rows, unreadable };
}

// Small screenshots are read far more accurately once enlarged. Tested on a 525px-wide results table with
// little score icons: 2 of 10 rows fully correct as-is, 10 of 10 at 2x and 3x. Images already wider than
// about 1000px are left alone.
function predEnlarge(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let k = Math.max(1, Math.min(3, Math.round(1500 / img.width)));
      while (k > 1 && img.height * k > 12000) k--;
      if (k === 1) return resolve(dataUrl);
      const c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function predOcr(dataUrl, onProgress) {
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('could not load the screenshot reader (it needs an internet connection)'));
      document.head.appendChild(s);
    });
  }
  const { data: { text } } = await Tesseract.recognize(await predEnlarge(dataUrl), 'eng', {
    logger: m => { if (m.status === 'recognizing text') onProgress(m.progress); }
  });
  return text;
}

function predDropImages(e) {
  e.preventDefault();
  predEl('results-img-zone').style.borderColor = 'var(--border)';
  predHandleImages([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
}

async function predHandleImages(fileList) {
  const files = [...fileList].filter(Boolean);
  if (!files.length) return;
  const st = predEl('results-img-status');
  const say = (msg, color) => { st.innerHTML = `<span style="color:var(--${color || 'muted'})">${msg}</span>`; };
  predEl('pred-cal-card').open = true;
  const rows = []; let unreadable = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      const tag = files.length > 1 ? ` (picture ${i + 1} of ${files.length})` : '';
      say('Loading the screenshot reader…' + tag);
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(files[i]); });
      const text = await predOcr(dataUrl, p => say(`Reading picture… ${Math.round(p * 100)}%` + tag));
      const parsed = predParseOCRResults(text);
      rows.push(...parsed.rows); unreadable += parsed.unreadable;
    }
  } catch (e) { say('Error: ' + e.message, 'red'); return; }
  predIngestOCRRows(rows, unreadable);
}

// What happens with the rows once they're read: scores go into the box, teams are checked against (or
// loaded as) the schedule, and the test runs unless the picture looks like a different event.
function predIngestOCRRows(rows, unreadable) {
  const st = predEl('results-img-status');
  if (!rows.length) {
    st.innerHTML = '<span style="color:var(--red)">Couldn\'t find any match rows in the picture. Make sure the whole table (match, teams and scores) is visible, or type the scores in below.</span>';
    return;
  }
  const notes = [];
  const withTeams = rows.filter(r => r.teams);
  const key = ts => [...ts].map(String).sort().join(',');
  // How well do this picture's teams agree with the schedule that is already loaded?
  let same = 0, compared = 0;
  withTeams.forEach(r => {
    const m = matchSchedule.find(x => x.match === r.match);
    if (!m) return;
    compared++;
    if (key(r.teams.slice(0, 3)) === key(m.red) && key(r.teams.slice(3)) === key(m.blue)) same++;
  });
  const different = compared >= 3 && same / compared < 0.8;
  // Earlier pictures set the schedule and this one is a different event: start over instead of mixing two events
  const startOver = predSchedFromImage && different;
  if (startOver) {
    predEl('results-paste').value = '';
    matchSchedule = [];
    notes.push('<span style="color:var(--yellow)">This picture looks like a different event than the earlier pictures, so I started over with it (the earlier scores and schedule were replaced).</span>');
  }

  const cur = predParseResults(predEl('results-paste').value).results;     // merge with anything already in the box
  rows.forEach(r => { cur[r.match] = { match: r.match, red: r.red, blue: r.blue }; });
  predEl('results-paste').value = 'Match,Red Score,Blue Score\n' +
    Object.values(cur).sort((a, b) => a.match - b.match).map(r => `${r.match},${r.red},${r.blue}`).join('\n');
  notes.push(`<span style="color:var(--green)">✅ Read ${rows.length} match${rows.length === 1 ? '' : 'es'} from the picture${unreadable ? ` (${unreadable} line${unreadable === 1 ? '' : 's'} couldn't be read)` : ''}. Check the numbers in the box below.</span>`);

  let mismatch = false;
  if (withTeams.length) {
    if (!matchSchedule.length || predSchedFromImage) {
      const byMatch = {}; matchSchedule.forEach(m => { byMatch[m.match] = m; });
      withTeams.forEach(r => { byMatch[r.match] = { match: r.match, red: r.teams.slice(0, 3).map(String), blue: r.teams.slice(3).map(String) }; });
      const all = Object.values(byMatch).sort((a, b) => a.match - b.match);
      predEl('schedule-paste').value = 'Match,Red 1,Red 2,Red 3,Blue 1,Blue 2,Blue 3\n' + all.map(m => [m.match, ...m.red, ...m.blue].join(',')).join('\n');
      parseSchedulePaste();
      predSchedFromImage = true;
      notes.push(`<span style="color:var(--green)">✅ The picture also shows the teams, so I loaded the match schedule from it (${all.length} matches).</span>`);
    } else {
      if (compared && same / compared < 0.8) {
        mismatch = true;
        notes.push(`<span style="color:var(--yellow)">⚠ The teams in this picture match your loaded schedule in only ${same} of ${compared} matches, so these scores probably belong to a different event. I haven't run the test. Check that the schedule and the pictures are from the same event.</span>`);
      } else if (compared) {
        notes.push(`<span style="color:var(--green)">✅ The teams match your loaded schedule (${same} of ${compared} matches).</span>`);
      }
    }
  }
  st.innerHTML = notes.map(n => `<div style="margin-bottom:4px">${n}</div>`).join('');
  if (!mismatch) predRunCalibration();
}

// ── what the data looks like ───────────────────────────────────────────────
let dupRowsRemoved = 0, fileDups = {};
function predOpenDataQuality() {
  showPage('predict');
  const d = predEl('pred-data-card'); d.open = true;
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function predRenderDataNotes() {
  const out = predEl('pred-data-output');
  if (!out) return;
  if (!rawData.length) { out.innerHTML = '<div style="font-size:13px;color:var(--muted)">No scouting data loaded.</div>'; return; }
  const C = predGet(), A = predScoutAudit(), K = predColumnReport();
  const li = (t, c) => `<div style="font-size:12px;padding:3px 0;color:${c || 'var(--text)'}">${t}</div>`;
  const head = t => `<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 4px">${t}</div>`;
  let h = li(`${rawData.length} scout entries covering ${Object.keys(C.models).length} teams and ${C.stats.teamMatches} team-matches.`);
  if (dupRowsRemoved) h += li(`${dupRowsRemoved} exact duplicate entries were ignored (the same file loaded twice, or two files with identical rows).`, 'var(--yellow)');
  h += li(`${C.stats.multiScout} team-matches were scouted by 2 or more people; their numbers are averaged so each match counts once.`);
  if (C.flags.length) h += li(`Ignored ${C.flags.length} suspicious entr${C.flags.length === 1 ? 'y' : 'ies'} (far above that team's other matches): ` + C.flags.map(f => `${esc(String(f.team).replace(/[^\w-]/g, ''))} Q${f.match} ${f.col} ${Math.round(f.value)}`).join(', '), 'var(--yellow)');

  // columns with nothing in them
  if (K.empty.length || K.stuck.length) {
    h += head('Columns with no data');
    if (K.empty.length) h += li(`The same value in every entry, so they carry no information: ` + K.empty.map(e => `<strong>${esc(e.col)}</strong> (always “${esc(e.value) || 'blank'}”${e.hint ? ' — ' + esc(e.hint) : ''})`).join('; ') + '.', 'var(--yellow)');
    K.stuck.forEach(s => { h += li(`<strong>${esc(s.col)}</strong> is “${esc(s.value)}” in ${Math.round(s.share * 100)}% of entries. It may have been left at its default.`, 'var(--yellow)'); });
  }

  // do the scouts agree?
  h += head('Do the scouts agree?');
  if (!A.multi) h += li('No robot was watched by two scouts in the same match, so there is nothing to compare.', 'var(--muted)');
  else {
    h += li(`${A.multi} robot-matches were watched by 2+ scouts. Their shot counts typically differ by about <strong>${Math.round(A.noise * 100)}%</strong>${A.noise > 0.3 ? ', so single-match numbers are rough and averages over many matches matter more.' : '.'}`);
    if (A.scouts.length) {
      h += li('Scouts who are consistently off (compared with other scouts of the same robot):', 'var(--muted)');
      A.scouts.slice(0, 8).forEach(s => { h += li(`• <strong>${esc(s.who)}</strong> (${s.n} comparisons): ${s.why.map(w => esc(w.text)).join('; ')}`, 'var(--yellow)'); });
      if (A.scouts.length > 8) h += li(`…and ${A.scouts.length - 8} more.`, 'var(--muted)');
      h += li('This is a comparison, not proof: the other scouts could be the ones who are off. A quick chat or a refresher on what counts as a shot usually helps.', 'var(--muted)');
    } else h += li(A.scoutsJudged ? 'No scout is consistently higher or lower than the others.' : `Not enough overlap to judge individual scouts (each needs ${AUDIT.MIN_COMPARED}+ shared robot-matches).`, 'var(--green)');
    if (A.disputes.length) {
      h += li(`${A.disputes.length} robot-match${A.disputes.length === 1 ? '' : 'es'} where scouts disagree wildly (biggest first):`, 'var(--muted)');
      A.disputes.slice(0, 6).forEach(d => { h += li(`• Team ${esc(d.team)} Q${esc(d.match)}${d.ev ? ' (' + esc(d.ev) + ')' : ''}: ` + d.entries.map(e => `${esc(e.who)} ${e.v}`).join(' · '), 'var(--yellow)'); });
    }
  }
  if (!C.stats.climbSeen) h += li('No climb data: endgame_climb_level is 0 in every entry, so climbing is not modelled.', 'var(--yellow)');
  out.innerHTML = h;
}
function predRenderPageExtras() { predRenderDataNotes(); }
// ═══ PREDICTOR UI END ══════════════════════════════════════════════════════

(window.APP_PARTS = window.APP_PARTS || []).push('predictor-ui');
