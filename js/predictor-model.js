// Torch Analysis: match predictor logic (no DOM): observations, models, simulation, calibration, data-quality audit
// Classic script, loaded in order by index.html (all files share one global scope).

// ═══ PREDICTOR MODEL BEGIN ═════════════════════════════════════════════════
// Match predictor v3. Everything between the MODEL markers is pure logic (no DOM) so the
// match prediction, the schedule forecast, the what-if tools and the calibration all share it.
//
// Pipeline: raw scouting rows -> one observation per team per match (scouts averaged, obvious
// typos masked) -> per-team model -> Monte Carlo of the match -> optional calibration to real scores.

const PRED = {
  FULL_SAMPLE: 12,                 // matches needed before a team's own numbers fully replace the league average
  EVENT_WEIGHT: { '2026vagle': 1, '2026vabla': 2, '2026chcmp': 3 },   // newer events count more
  COMPS: ['shoot', 'auto', 'pass', 'speed', 'climb', 'agility'],
  LABELS: { shoot: 'Shooting', auto: 'Auto', pass: 'Passing', speed: 'Speed', climb: 'Climbing', agility: 'Agility' },
  DEF_CUT: 0.25,                   // share of an opponent's top scorer a rating-5 defender removes
  OUTLIER_MIN: 60,                 // a single scout entry is only suspect at/above this ...
  OUTLIER_RATIO: 3,                // ... and when it is this many times the team's biggest value in other matches
  AVG: '__avg__',                  // stand-in for an exactly average robot (what-if / impact)
  TEMP: 2.3,                       // win-chance tempering when the scouting is from OTHER events. Tested on 234 real matches
                                   // from 3 events, the raw simulated chance was overconfident (said 90%+, right ~75%); dividing
                                   // its z-score by 2.3 fixed that (the best value was 1.8–2.8 when each event was left out in turn).
  TEMP_SAME: 1.2,                  // ... and when the scouting is from the SAME event as the match. Tested on 166 real matches
                                   // (2026vabla + 2026chcmp, each match predicted without its own scouting): robots don't change
                                   // between the scouting and the match, so the simulation is far less overconfident (best 1.2
                                   // pooled; 1.4 and 1.0 for the two events).
  cal: null,                       // calibration from real results: { a, u:{comp:weight}, sigma, defCut, n, ... }
};
let predVersion = 0, predCache = null;

// ── helpers ────────────────────────────────────────────────────────────────
function predRng(seed) {           // seeded, so the same inputs always give the same prediction
  let a = seed >>> 0;
  const rand = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const randn = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-10))) * Math.cos(2 * Math.PI * rand());
  return { rand, randn };
}
function predHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function normCdf(x) {              // standard normal CDF (Abramowitz–Stegun erf approximation)
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
function predMedian(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function predSd(v) { if (v.length < 2) return 0; const m = avg(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); }

// ── 1. scouting rows -> observations ───────────────────────────────────────
// A single scout entry that is huge compared with that team's other matches is almost always a typo
// (e.g. 365 auto shots for a team whose other autos are 0–75). Such entries are masked, not deleted.
function predFindOutliers(rows, team, flags) {
  const bad = new Map();
  [['auto_shots', 'auto'], ['teleop_shots', 'tele'], ['passed_shots', 'passed']].forEach(([col, label]) => {
    rows.forEach(r => {
      const v = n(r[col]);
      if (v < PRED.OUTLIER_MIN) return;
      const others = rows.filter(p => p.match_number !== r.match_number || p._file_event !== r._file_event).map(p => n(p[col]));
      if (others.length >= 4 && v > PRED.OUTLIER_RATIO * Math.max(...others)) {
        if (!bad.has(r)) bad.set(r, new Set());
        bad.get(r).add(col);
        flags.push({ team, match: n(r.match_number), ev: r._file_event || '', col: label, value: v, typical: predMedian(others) });
      }
    });
  });
  return bad;
}

// One observation per (event, match): several scouts watching the same robot are averaged, so a
// well-covered match no longer counts as several matches.
function predObservations(rows, bad) {
  const groups = new Map();
  rows.forEach(r => { const k = (r._file_event || r.event || '') + '|' + r.match_number; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const val = (r, col) => (bad.get(r) && bad.get(r).has(col)) ? null : n(r[col]);
  const mean = (rs, col) => { const v = rs.map(r => val(r, col)).filter(x => x !== null); return v.length ? avg(v) : null; };
  const meanPos = (rs, col) => { const v = rs.map(r => n(r[col])).filter(x => x > 0); return v.length ? avg(v) : null; };
  return [...groups.values()].map(rs => {
    const defVotes = rs.filter(r => n(r.robot_defense) > 0).length;
    const auto = mean(rs, 'auto_shots');
    return {
      ev: rs[0]._file_event || '', match: n(rs[0].match_number), scouts: rs.length,
      auto, tele: mean(rs, 'teleop_shots'), passed: mean(rs, 'passed_shots'),
      acc: meanPos(rs, 'robot_accuracy'), autoAcc: auto > 0 ? meanPos(rs, 'auto_accuracy') : null,
      speed: meanPos(rs, 'robot_speed'), agility: meanPos(rs, 'robot_agility'),
      defended: defVotes * 2 >= rs.length, defense: meanPos(rs, 'robot_defense'),
      climb: avg(rs.map(r => n(r.endgame_climb_level))),
      inc: avg(rs.map(r => n(r.lost_comms) + n(r.game_piece_stuck) + n(r.tipped))),
      // incident counts for the team pages: if scouts disagree, the majority view of that match wins
      incs: Object.fromEntries(STAT_INCIDENTS.map(c => [c, Math.round(avg(rs.map(r => n(r[c]))))])),
    };
  });
}

// ── 2. observations -> per-team model ──────────────────────────────────────
function predModelFor(obs) {
  const evW = o => PRED.EVENT_WEIGHT[o.ev] || 1;
  const wmean = (col, only) => { let sw = 0, s = 0; obs.forEach(o => { if (o[col] == null || (only && !only(o))) return; const w = evW(o); sw += w; s += w * o[col]; }); return sw ? s / sw : null; };
  const sd = col => { const v = obs.map(o => o[col]).filter(x => x != null); return v.length < 3 ? null : predSd(v); };
  const defObs = obs.filter(o => o.defended);
  const totals = obs.filter(o => o.tele != null && o.auto != null).map(o => o.tele + o.auto);
  const mT = avg(totals);
  const defVals = defObs.map(o => o.defense || 0).filter(x => x > 0);
  return {
    n: obs.length,
    tele: wmean('tele'), auto: wmean('auto'), acc: wmean('acc'), autoAcc: wmean('autoAcc'), passed: wmean('passed'),
    speed: wmean('speed'), agility: wmean('agility'), climb: wmean('climb') || 0,
    sdTele: sd('tele'), sdAuto: sd('auto'), sdAcc: sd('acc'), sdPassed: sd('passed'),
    // scoring while playing defense vs not: a defender gives up shots, and the data shows how many
    teleDef: defObs.length >= 2 ? wmean('tele', o => o.defended) : null, teleDefN: defObs.length,
    teleNoDef: obs.length - defObs.length >= 2 ? wmean('tele', o => !o.defended) : null, teleNoDefN: obs.length - defObs.length,
    defRate: obs.length ? defObs.length / obs.length : 0,
    defRating: defVals.length ? avg(defVals) : 0,
    incPerMatch: avg(obs.map(o => o.inc)),
    cv: mT > 0 ? predSd(totals) / mT : 0,
  };
}

function predLeague(models) {
  const ms = Object.values(models);
  const col = (k, min = 1) => ms.filter(m => m.n >= min && m[k] != null).map(m => m[k]);
  const mean = (k, d) => { const v = col(k); return v.length ? avg(v) : d; };
  const spread = (k, d) => { const v = col(k, 3); return v.length < 3 ? d : predSd(v); };
  const within = (k, d) => { const v = ms.filter(m => m.n >= 4 && m[k] != null).map(m => m[k]); return v.length ? predMedian(v) : d; };
  return {
    tele: mean('tele', 20), auto: mean('auto', 5), acc: mean('acc', 60), autoAcc: mean('autoAcc', 70),
    passed: mean('passed', 2), speed: mean('speed', 3), agility: mean('agility', 3), inc: mean('incPerMatch', 0.1),
    sdTeamTele: spread('tele', 12), sdTeamAuto: spread('auto', 4),
    sdTele: within('sdTele', 10), sdAuto: within('sdAuto', 3), sdAcc: within('sdAcc', 15), sdPassed: within('sdPassed', 4),
  };
}

// Rebuilt whenever the loaded data changes (predVersion is bumped by rebuildFromFiles)
function predGet() {
  if (predCache && predCache.version === predVersion) return predCache;
  const byTeam = {};
  rawData.forEach(r => { const t = r.robot_number; if (t) (byTeam[t] = byTeam[t] || []).push(r); });
  const flags = [], models = {}, obsByTeam = {}, badAll = new Map();
  let teamMatches = 0, multiScout = 0, climbSeen = false;
  Object.entries(byTeam).forEach(([team, rows]) => {
    const bad = predFindOutliers(rows, team, flags);
    bad.forEach((cols, row) => badAll.set(row, cols));
    const obs = predObservations(rows, bad);
    obsByTeam[team] = obs;       // the charts use these same cleaned per-match numbers
    obs.forEach(o => { teamMatches++; if (o.scouts > 1) multiScout++; if (o.climb > 0) climbSeen = true; });
    models[team] = predModelFor(obs);
  });
  predCache = { version: predVersion, models, obs: obsByTeam, rows: byTeam, bad: badAll, lg: predLeague(models), flags, params: {}, stats: { teamMatches, multiScout, climbSeen } };
  return predCache;
}

// Final numbers the simulation draws from: the team's own averages, blended toward the league
// average until FULL_SAMPLE matches are scouted. Unknown teams get the league average and a wide spread.
// While predExcl is set, that match's scouting is ignored, so a match that has already been played can be
// predicted the way it would have been before it happened (used by the accuracy test and the forecast table).
let predExcl = null;
function predWithout(match, fn) { const old = predExcl; predExcl = match; try { return fn(); } finally { predExcl = old; } }
function predParams(team) {
  const C = predGet(), ckey = predExcl == null ? team : team + '|' + predExcl;
  if (C.params[ckey]) return C.params[ckey];
  const lg = C.lg;
  let m = C.models[team];
  if (predExcl != null) {
    const all = C.obs[team] || [], rest = all.filter(o => o.match !== predExcl);
    if (rest.length !== all.length) m = rest.length ? predModelFor(rest) : null;
  }
  const sdOr = (s, mean, frac) => s != null ? s : frac * mean;
  let p;
  if (!m) {
    const exact = team === PRED.AVG;
    p = { team, known: false, n: 0, quality: 0, tele: lg.tele, teleDef: null, teleNoDef: null, defRate: 0, defRating: 0,
      sdTele: lg.sdTele, muSdTele: exact ? 0 : lg.sdTeamTele, auto: lg.auto, sdAuto: lg.sdAuto, muSdAuto: exact ? 0 : lg.sdTeamAuto,
      acc: lg.acc, sdAcc: lg.sdAcc, autoAcc: lg.autoAcc, passed: lg.passed, sdPassed: lg.sdPassed,
      speed: lg.speed, agility: lg.agility, climb: 0, incPerMatch: lg.inc, cv: 0 };
  } else {
    const w = Math.min(m.n / PRED.FULL_SAMPLE, 1);
    const mix = (v, l) => v == null ? l : w * v + (1 - w) * l;
    const tele = mix(m.tele, lg.tele), auto = mix(m.auto, lg.auto);
    const state = (v, cnt) => v == null ? null : (cnt * v + 3 * tele) / (cnt + 3);   // shrink per-state means toward the team's own
    const nEff = Math.max(m.n, 1);
    const sdTele = sdOr(m.sdTele, tele, 0.45), sdAuto = sdOr(m.sdAuto, auto, 0.45);
    p = { team, known: true, n: m.n, quality: Math.round(w * 100), tele,
      teleDef: state(m.teleDef, m.teleDefN), teleNoDef: state(m.teleNoDef, m.teleNoDefN),
      defRate: m.defRate, defRating: m.defRating,
      sdTele, muSdTele: sdTele / Math.sqrt(nEff), auto, sdAuto, muSdAuto: sdAuto / Math.sqrt(nEff),
      acc: mix(m.acc, lg.acc), sdAcc: sdOr(m.sdAcc, m.acc != null ? m.acc : lg.acc, 0.2),
      autoAcc: m.autoAcc != null ? m.autoAcc : 70,
      passed: mix(m.passed, lg.passed), sdPassed: sdOr(m.sdPassed, m.passed != null ? m.passed : lg.passed, 1),
      speed: mix(m.speed, lg.speed), agility: mix(m.agility, lg.agility), climb: m.climb, incPerMatch: m.incPerMatch, cv: m.cv };
  }
  p.relMult = Math.max(0.7, 1 - p.incPerMatch * 0.15);
  p.cvPenalty = p.cv > 0 ? Math.max(0.75, 1 - p.cv * 0.25) : 1;   // shown as "consistency"; not applied to the score (the simulation already carries the variance)
  C.params[ckey] = p;
  return p;
}
// EPA from a team's observations (same recipe as the Rankings tab), optionally leaving one match out
function predEpaOf(team, excludeMatch) {
  const obs = (predGet().obs[team] || []).filter(o => o.match !== excludeMatch);
  if (!obs.length) return 0;
  const mean = f => { const v = obs.map(f).filter(x => x != null); return v.length ? avg(v) : null; };
  const tot = mean(o => (o.auto != null && o.tele != null) ? o.auto + o.tele : null);
  const shots = tot != null ? tot : (mean(o => o.auto) || 0) + (mean(o => o.tele) || 0), acc = mean(o => o.acc);
  return shots * (acc != null ? acc / 100 : 1);
}

// ── 3. one robot in one match ──────────────────────────────────────────────
// rng = null gives the expected value; otherwise a random draw. Every draw consumes the same number
// of random numbers whatever happens, so two scenarios with the same seed line up (what-if / impact).
function predRobot(p, rng) {
  let u0 = 0.5, u1 = 1, z = [0, 0, 0, 0, 0, 0];
  if (rng) { u0 = rng.rand(); u1 = rng.rand(); z = [rng.randn(), rng.randn(), rng.randn(), rng.randn(), rng.randn(), rng.randn()]; }
  const hasState = p.teleDef != null && p.teleNoDef != null;
  let teleMean = p.tele, defPower;
  if (rng) {
    const defending = p.defRate > 0 && u0 < p.defRate;
    if (hasState) teleMean = defending ? p.teleDef : p.teleNoDef;
    defPower = defending ? PRED.DEF_CUT * p.defRating / 5 : 0;
  } else {
    if (hasState) teleMean = p.defRate * p.teleDef + (1 - p.defRate) * p.teleNoDef;
    defPower = p.defRate * PRED.DEF_CUT * p.defRating / 5;
  }
  const tele = Math.max(0, teleMean + z[0] * p.muSdTele + z[1] * p.sdTele);
  const auto = Math.max(0, p.auto + z[2] * p.muSdAuto + z[3] * p.sdAuto);
  const acc = Math.min(100, Math.max(10, p.acc + z[4] * p.sdAcc));
  const passed = Math.max(0, p.passed + z[5] * p.sdPassed);
  let rel = p.relMult;
  if (rng && u1 < p.incPerMatch * 0.3) rel *= 0.6;       // an incident this match
  return { team: p.team, defPower, rel, comps: {
    shoot: tele * acc / 100, auto: auto * 1.5 * p.autoAcc / 100, pass: passed * 0.4,
    speed: p.speed / 5 * 3, climb: p.climb * 2, agility: p.agility / 5 * 1.5 } };
}

// One robot's expected output in an average context (its own components, times reliability). Used to rank robots
// against each other: strength of schedule and the alliance-selection simulation.
function predRating(t) { const r = predRobot(predParams(t), null); return PRED.COMPS.reduce((s, k) => s + r.comps[k], 0) * r.rel; }

// An alliance: the opposing defenders cut the alliance's top scorer. w = per-component weights (null = 1).
function predAlliance(draws, oppDraws, w) {
  const wt = k => (w ? w[k] : 1);
  const unitsOf = c => PRED.COMPS.reduce((s, k) => s + wt(k) * c[k], 0);
  const pre = draws.map(d => unitsOf(d.comps) * d.rel);
  let target = -1, best = -Infinity;
  pre.forEach((v, i) => { if (v > best) { best = v; target = i; } });
  const cut = Math.min(0.5, oppDraws.reduce((s, o) => s + o.defPower, 0));
  const comps = {}; PRED.COMPS.forEach(k => { comps[k] = 0; });
  let total = 0, relLoss = 0, defLoss = 0;
  const robots = draws.map((d, i) => {
    const f = i === target ? 1 - cut : 1;
    PRED.COMPS.forEach(k => { comps[k] += wt(k) * d.comps[k] * d.rel * f; });
    relLoss += unitsOf(d.comps) * (1 - d.rel);
    if (i === target) defLoss += pre[i] * cut;
    total += pre[i] * f;
    return { team: d.team, units: pre[i] * f };
  });
  return { total, comps, robots, relLoss, defLoss, cut, target: target >= 0 ? draws[target].team : null };
}

// ── 4. Monte Carlo of a whole match ────────────────────────────────────────
function predSimulate(redTeams, blueTeams, nSim, seed) {
  const w = PRED.cal ? PRED.cal.u : null;
  const rng = predRng(seed);
  const rp = redTeams.map(predParams), bp = blueTeams.map(predParams);
  const blank = teams => ({ comps: Object.fromEntries(PRED.COMPS.map(k => [k, 0])), relLoss: 0, defLoss: 0, robots: teams.map(() => 0), tot: [] });
  const R = blank(redTeams), B = blank(blueTeams), margins = [];
  let redWins = 0, ties = 0;
  const target = { red: {}, blue: {} };
  for (let i = 0; i < nSim; i++) {
    const rd = rp.map(p => predRobot(p, rng)), bd = bp.map(p => predRobot(p, rng));
    const ra = predAlliance(rd, bd, w), ba = predAlliance(bd, rd, w);
    R.tot.push(ra.total); B.tot.push(ba.total); margins.push(ra.total - ba.total);
    if (ra.total > ba.total) redWins++; else if (ra.total === ba.total) ties++;
    [[R, ra, 'red'], [B, ba, 'blue']].forEach(([S, a, side]) => {
      PRED.COMPS.forEach(k => { S.comps[k] += a.comps[k]; });
      S.relLoss += a.relLoss; S.defLoss += a.defLoss;
      a.robots.forEach((r, j) => { S.robots[j] += r.units; });
      if (a.target) target[side][a.target] = (target[side][a.target] || 0) + 1;
    });
  }
  const pct = (arr, q) => { const s = Float64Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };
  const fin = S => ({ comps: Object.fromEntries(PRED.COMPS.map(k => [k, S.comps[k] / nSim])), relLoss: S.relLoss / nSim, defLoss: S.defLoss / nSim,
    robots: S.robots.map(v => v / nSim), mean: avg(S.tot), p10: pct(S.tot, 0.1), p90: pct(S.tot, 0.9) });
  const red = fin(R), blue = fin(B);
  const a = PRED.cal ? PRED.cal.a : 0;      // points not explained by the modelled parts (same for both sides)
  return { n: nSim, redTeams, blueTeams, red, blue, a,
    redWin: (redWins + ties / 2) / nSim, marginMean: red.mean - blue.mean, marginP10: pct(margins, 0.1), marginP90: pct(margins, 0.9), target };
}

// Inverse of normCdf (bisection); p is kept away from 0 and 1 so a clean sweep doesn't become infinite
function normInv(p) {
  p = Math.min(Math.max(p, 1e-3), 1 - 1e-3);
  let lo = -8, hi = 8;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (normCdf(mid) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// Probability that red wins. With a calibration it comes from the real error of past predictions.
// Without one it is the share of simulated matches red won, tempered because that share alone is
// overconfident: the simulation can't see everything that makes real matches unpredictable.
function predWinProb(sim) {
  if (PRED.cal && PRED.cal.sigma > 0) return normCdf(sim.marginMean / (PRED.cal.sigma * Math.SQRT2));
  return normCdf(normInv(sim.redWin) / predTempFor([...sim.redTeams, ...sim.blueTeams]));
}

// Which scouted event does the loaded schedule belong to? The one where the scheduled teams were actually
// scouted in the scheduled match numbers. null when none lines up (schedule from another event, or none loaded).
function predScheduleEvent() {
  const C = predGet(), key = matchSchedule.length + ':' + (matchSchedule[0] ? matchSchedule[0].red.join(',') : '');
  if (C.schedEvKey === key) return C.schedEv;
  const have = new Set(); let maxMatch = {};
  Object.entries(C.obs).forEach(([t, obs]) => obs.forEach(o => { have.add(t + '|' + o.ev + '|' + o.match); maxMatch[o.ev] = Math.max(maxMatch[o.ev] || 0, o.match); }));
  let best = null, bestHits = 0;
  Object.keys(maxMatch).forEach(ev => {
    const upTo = matchSchedule.filter(m => n(m.match) <= maxMatch[ev]);
    const hits = upTo.filter(m => [...m.red, ...m.blue].filter(t => have.has(t + '|' + ev + '|' + n(m.match))).length >= 3).length;
    if (hits >= 3 && hits >= 0.6 * upTo.length && hits > bestHits) { best = ev; bestHits = hits; }
  });
  C.schedEvKey = key; C.schedEv = best;
  return best;
}
// How much to temper the win chance: the more of these robots' scouting comes from this match's own event
// (8+ matches = fully), the closer to TEMP_SAME; otherwise TEMP.
function predTempFor(teams) {
  const ev = predScheduleEvent();
  if (!ev || !teams.length) return PRED.TEMP;
  const C = predGet();
  const f = avg(teams.map(t => Math.min(1, (C.obs[t] || []).filter(o => o.ev === ev && o.match !== predExcl).length / 8)));
  return PRED.TEMP - f * (PRED.TEMP - PRED.TEMP_SAME);
}

// ── 5. calibration against real results ────────────────────────────────────
// Results text -> { match: {match, red, blue} }. Accepts a header row (Match, Red Score, Blue Score)
// or bare rows like "12, 87, 74" / "Q12 87 74".
function predParseResults(text) {
  const out = {}; let skipped = 0;
  const lines = (text || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return { results: out, skipped };
  const delim = lines[0].includes('\t') ? '\t' : (lines[0].includes(',') ? ',' : null);
  const split = l => (delim ? l.split(delim) : l.trim().split(/\s+/)).map(s => s.trim());
  let mi = 0, ri = -1, bi = -1, start = 0;
  // a first line with words like Red / Blue / Score is a header; find the columns by name
  if (/red|blue|score|total|points|pts/i.test(lines[0]) && !/^\s*q?\d/i.test(lines[0])) {
    const h = split(lines[0]).map(s => s.toLowerCase());
    const find = re => h.findIndex(x => re.test(x));
    ri = find(/^red\b.*(score|total|points|pts)|^red$/); bi = find(/^blue\b.*(score|total|points|pts)|^blue$/);
    const m = find(/match|qual|^#$/); mi = m >= 0 ? m : 0;
    start = 1;
  }
  for (let i = start; i < lines.length; i++) {
    const cells = split(lines[i]);
    let match, red, blue;
    if (ri >= 0 && bi >= 0) {
      match = parseInt((cells[mi] || '').replace(/\D/g, ''), 10); red = parseFloat(cells[ri]); blue = parseFloat(cells[bi]);
    } else {
      const nums = (lines[i].match(/\d+(?:\.\d+)?/g) || []).map(Number);
      if (nums.length >= 3) { match = nums[0]; red = nums[1]; blue = nums[2]; }
    }
    if (Number.isFinite(match) && Number.isFinite(red) && Number.isFinite(blue) && red >= 0 && blue >= 0) out[match] = { match, red, blue };
    else skipped++;
  }
  return { results: out, skipped };
}

// Small linear solver (Gaussian elimination with partial pivoting)
function predSolve(A, b) {
  const N = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < N; c++) {
    let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = c + 1; r < N; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= N; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(N).fill(0);
  for (let r = N - 1; r >= 0; r--) { let s = M[r][N]; for (let k = r + 1; k < N; k++) s -= M[r][k] * x[k]; x[r] = Math.abs(M[r][r]) < 1e-12 ? 0 : s / M[r][r]; }
  return x;
}

// Fit points ≈ a + Σ u_k·component_k. Stage 1 finds one overall scale (units -> points). Stage 2 lets each
// component's weight move away from that scale, held back by a ridge penalty (lambda, relative to the
// data) so a few matches can't produce wild weights. lambda = Infinity means stage 1 only.
function predFit(samples, lambda) {
  const K = PRED.COMPS.length, N = samples.length;
  const T = s => s.c.reduce((x, y) => x + y, 0);
  const mT = avg(samples.map(T)), mY = avg(samples.map(s => s.y));
  const mC = PRED.COMPS.map((_, k) => avg(samples.map(s => s.c[k])));
  let cov = 0, varT = 0;
  samples.forEach(s => { cov += (T(s) - mT) * (s.y - mY); varT += (T(s) - mT) ** 2; });
  const s0 = varT > 1e-9 ? Math.max(cov / varT, 1e-6) : 1e-6;
  let u = new Array(K).fill(s0);
  if (Number.isFinite(lambda) && N > K + 1) {
    const S = Array.from({ length: K }, () => new Array(K).fill(0)), g = new Array(K).fill(0);
    samples.forEach(s => {
      const xc = s.c.map((v, k) => v - mC[k]), r = (s.y - mY) - s0 * (T(s) - mT);
      for (let i = 0; i < K; i++) { g[i] += xc[i] * r; for (let j = 0; j < K; j++) S[i][j] += xc[i] * xc[j]; }
    });
    const A = S.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v)));
    const d = predSolve(A, g);
    u = u.map((v, k) => Math.min(Math.max(v + d[k], 0), 3 * s0));
  }
  const a = mY - u.reduce((s, v, k) => s + v * mC[k], 0);
  return { a, u: Object.fromEntries(PRED.COMPS.map((k, i) => [k, u[i]])), s: s0 };
}
const predApply = (fit, c) => fit.a + PRED.COMPS.reduce((s, k, i) => s + fit.u[k] * c[i], 0);

// honest = each match is predicted from scouting that leaves that match out (as it would have been before it was played)
function predFeatures(rows, defCut, honest) {
  const old = PRED.DEF_CUT; PRED.DEF_CUT = defCut;
  try {
    return rows.map(r => {
      const one = () => {
        const rd = r.red.map(t => predRobot(predParams(t), null)), bd = r.blue.map(t => predRobot(predParams(t), null));
        const ra = predAlliance(rd, bd, null), ba = predAlliance(bd, rd, null);
        const ex = honest ? r.match : null;
        const epa = ts => ts.reduce((s, t) => s + predEpaOf(t, ex), 0);
        return { ...r, rc: PRED.COMPS.map(k => ra.comps[k]), bc: PRED.COMPS.map(k => ba.comps[k]), redEpa: epa(r.red), blueEpa: epa(r.blue) };
      };
      return honest ? predWithout(r.match, one) : one();
    });
  } finally { PRED.DEF_CUT = old; }
}

function predCV(feats, lambda, folds = 5) {      // matches are dealt into folds; both alliances of a match stay together
  let se = 0, cnt = 0, correct = 0, total = 0;
  for (let f = 0; f < folds; f++) {
    const train = [], test = [];
    feats.forEach((r, i) => (i % folds === f ? test : train).push(r));
    if (train.length < 4 || !test.length) continue;
    const fit = predFit(train.flatMap(r => [{ c: r.rc, y: r.redY }, { c: r.bc, y: r.blueY }]), lambda);
    test.forEach(r => {
      const pr = predApply(fit, r.rc), pb = predApply(fit, r.bc);
      se += (pr - r.redY) ** 2 + (pb - r.blueY) ** 2; cnt += 2;
      const am = r.redY - r.blueY;
      if (am !== 0) { total++; if (Math.sign(pr - pb) === Math.sign(am)) correct++; }
    });
  }
  return { rmse: cnt ? Math.sqrt(se / cnt) : Infinity, acc: total ? correct / total : null };
}

// Backtest the model on real results and (with enough matches) fit calibration. Each match is predicted
// with its own scouting left out (honest = true), so the accuracy is what you'd have got before the match.
function predBacktest(results, honest = true) {
  const rows = [];
  Object.values(results).forEach(r => {
    const m = matchSchedule.find(x => x.match === r.match);
    if (m && m.red.length && m.blue.length) rows.push({ match: r.match, red: m.red, blue: m.blue, redY: r.red, blueY: r.blue });
  });
  rows.sort((a, b) => a.match - b.match);
  const rep = { loaded: Object.keys(results).length, usable: rows.length };
  if (rows.length < 4) return rep;

  const hit = (feats, f) => { let c = 0, t = 0; feats.forEach(r => { const am = r.redY - r.blueY; if (am === 0) return; const pm = f(r); if (pm === 0) return; t++; if (Math.sign(pm) === Math.sign(am)) c++; }); return { c, t }; };
  const base = predFeatures(rows, 0.25, honest);
  const sumC = c => c.reduce((a, b) => a + b, 0);
  rep.defaultAcc = hit(base, r => sumC(r.rc) - sumC(r.bc));
  rep.epaAcc = hit(base, r => r.redEpa - r.blueEpa);
  const ys = rows.flatMap(r => [r.redY, r.blueY]);
  rep.naiveRmse = predSd(ys);
  const allC = base.flatMap(r => [r.rc, r.bc]);          // how much each component actually varies (tiny = weight can't be learned)
  rep.compSd = PRED.COMPS.map((_, k) => predSd(allC.map(c => c[k])));
  rep.totalSd = predSd(allC.map(c => sumC(c)));
  if (rows.length < 10) return rep;                      // too few results to fit anything

  // choose the defense strength, then the ridge strength, by cross-validated error
  let best = { cut: 0.25, cv: { rmse: Infinity }, feats: base };
  [0, 0.15, 0.25, 0.4].forEach(cut => {
    const feats = cut === 0.25 ? base : predFeatures(rows, cut, honest), cv = predCV(feats, Infinity);
    if (cv.rmse < best.cv.rmse) best = { cut, cv, feats };
  });
  let lam = Infinity, lamCv = best.cv;
  [0.1, 0.5, 2, 8, 32].forEach(l => { const cv = predCV(best.feats, l); if (cv.rmse < lamCv.rmse - 1e-9) { lam = l; lamCv = cv; } });
  const fit = predFit(best.feats.flatMap(r => [{ c: r.rc, y: r.redY }, { c: r.bc, y: r.blueY }]), lam);
  rep.fit = { ...fit, defCut: best.cut, lambda: lam, sigma: lamCv.rmse, cvRmse: lamCv.rmse, cvAcc: lamCv.acc, scaleOnlyAcc: best.cv.acc, scaleOnlyRmse: best.cv.rmse, n: rows.length };
  return rep;
}
// ── 6. data quality: do scouts agree, and which columns are empty ─────────
// Where two or more scouts watched the same robot in the same match, compare each scout's shot count
// (auto + teleop) with the others'. Flags scouts who are consistently high or low, scouts who often log
// zero when others saw plenty, and the individual matches where the scouts disagree wildly.
const AUDIT = {
  MIN_COMPARED: 8,        // comparisons needed before a scout is judged
  BIAS: 20,               // average shots above/below the other scouts that counts as consistent bias ...
  Z: 2.5,                 // ... and it must also be this many standard errors from zero (the other scouts are noisy too)
  SIDE: 0.5,              // ... and the share of comparisons that must lean the same way
  BLANK_MIN: 3,           // zero entries (where others saw 30+ shots) needed to flag a scout for blanks
  BLANK_SHARE: 0.12,
  DISPUTE: 30, DISPUTE_FRAC: 0.6,   // a match is "disputed" when the scouts' totals differ by this many shots AND this share of their average
};
function predScoutAudit() {
  const C = predGet();
  if (C.audit) return C.audit;
  const groups = new Map();
  Object.entries(C.rows).forEach(([team, rows]) => rows.forEach(r => {
    const k = team + '|' + (r._file_event || r.event || '') + '|' + r.match_number;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }));
  const shots = r => { const b = C.bad.get(r); return (b && (b.has('auto_shots') || b.has('teleop_shots'))) ? null : n(r.auto_shots) + n(r.teleop_shots); };
  const per = {}, disputes = [], rel = [];
  let multi = 0;
  groups.forEach(rs => {
    const items = rs.map(r => ({ who: (r.username || '').trim() || 'unknown', v: shots(r) })).filter(x => x.v != null);
    if (items.length < 2) return;
    multi++;
    const vals = items.map(x => x.v), mean = avg(vals), spread = Math.max(...vals) - Math.min(...vals);
    if (spread >= Math.max(AUDIT.DISPUTE, AUDIT.DISPUTE_FRAC * mean)) {
      disputes.push({ team: rs[0].robot_number, match: rs[0].match_number, ev: rs[0]._file_event || '', spread, entries: items.map(x => ({ who: x.who, v: Math.round(x.v) })) });
    }
    items.forEach((x, i) => {
      const m = avg(vals.filter((_, j) => j !== i)), d = x.v - m;
      rel.push(Math.abs(d) / Math.max(15, (x.v + m) / 2));
      const p = per[x.who] = per[x.who] || { who: x.who, n: 0, diff: 0, sq: 0, up: 0, down: 0, blank: 0 };
      p.n++; p.diff += d; p.sq += d * d;
      if (d >= 15) p.up++; else if (d <= -15) p.down++;
      if (x.v === 0 && m >= 30) p.blank++;
    });
  });
  const scouts = [];
  Object.values(per).forEach(p => {
    if (p.n < AUDIT.MIN_COMPARED) return;
    const bias = p.diff / p.n, why = [];
    const se = Math.sqrt(Math.max(0, p.sq / p.n - bias * bias) / (p.n - 1));
    const sure = Math.abs(bias) >= AUDIT.Z * se;
    if (sure && bias <= -AUDIT.BIAS && p.down / p.n >= AUDIT.SIDE) why.push({ kind: 'low', text: `reads about ${Math.round(-bias)} shots lower than other scouts of the same robot` });
    else if (sure && bias >= AUDIT.BIAS && p.up / p.n >= AUDIT.SIDE) why.push({ kind: 'high', text: `reads about ${Math.round(bias)} shots higher than other scouts of the same robot` });
    if (p.blank >= AUDIT.BLANK_MIN && p.blank / p.n >= AUDIT.BLANK_SHARE) why.push({ kind: 'blank', text: `logged zero shots ${p.blank} times when other scouts saw 30 or more` });
    if (why.length) scouts.push({ who: p.who, n: p.n, bias, blank: p.blank, why });
  });
  scouts.sort((a, b) => Math.max(Math.abs(b.bias), b.blank * 8) - Math.max(Math.abs(a.bias), a.blank * 8));
  disputes.sort((a, b) => b.spread - a.spread);
  return (C.audit = { multi, noise: rel.length ? predMedian(rel) : null, scouts, disputes, scoutsJudged: Object.values(per).filter(p => p.n >= AUDIT.MIN_COMPARED).length });
}

// Columns that carry no information. A column that's the same in every entry was probably never filled in
// (or the form doesn't record it), so nothing downstream can use it.
const COL_HINTS = {
  endgame_climb_level: 'climbing is not part of the predictions, charts or picklist',
  endgame_climb_pos: 'climb position is not recorded', endgame_climb_time: 'climb time is not recorded',
  auto_climb: 'auto climbing is not recorded', ability_outpost: 'outpost ability is not recorded',
};
const COL_SKIP = new Set(['event', '_file_event', 'id', 'username', 'notes', 'match_number', 'robot_number', 'alliance', 'timestamp', 'created_at']);
const COL_MODEL = new Set(['robot_accuracy', 'robot_speed', 'robot_agility', 'auto_accuracy', 'auto_shots', 'teleop_shots']);
function predColumnReport() {
  const C = predGet();
  if (C.cols) return C.cols;
  const empty = [], stuck = [];
  if (rawData.length >= 5) {
    const cols = []; rawData.forEach(r => Object.keys(r).forEach(c => { if (!cols.includes(c)) cols.push(c); }));
    cols.filter(c => !COL_SKIP.has(c)).forEach(c => {
      const cnt = {}; rawData.forEach(r => { const v = String(r[c] == null ? '' : r[c]).trim().toLowerCase(); cnt[v] = (cnt[v] || 0) + 1; });
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0], share = top[1] / rawData.length;
      if (Object.keys(cnt).length === 1) empty.push({ col: c, value: top[0], hint: COL_HINTS[c] || '' });
      else if (COL_MODEL.has(c) && share >= 0.9) stuck.push({ col: c, value: top[0], share });
    });
  }
  return (C.cols = { empty, stuck });
}

// One line for the Import tab: is there anything worth looking at?
function predQualitySummary() {
  if (!rawData.length) return '';
  const C = predGet(), A = predScoutAudit(), K = predColumnReport();
  const bits = [];
  if (C.flags.length) bits.push(`${C.flags.length} suspicious entr${C.flags.length === 1 ? 'y' : 'ies'} ignored`);
  if (A.scouts.length) bits.push(`${A.scouts.length} scout${A.scouts.length === 1 ? '' : 's'} who read consistently off`);
  if (A.disputes.length) bits.push(`${A.disputes.length} match${A.disputes.length === 1 ? '' : 'es'} where scouts disagree a lot`);
  if (K.empty.length) bits.push(`${K.empty.length} column${K.empty.length === 1 ? '' : 's'} with no data`);
  if (!bits.length) return '';
  return `<div style="font-size:12px;color:var(--muted);padding:6px 2px;line-height:1.5">Data check: ${bits.join(' · ')}. <a href="#" style="color:var(--accent)" onclick="predOpenDataQuality();return false">See details</a></div>`;
}
// ═══ PREDICTOR MODEL END ═══════════════════════════════════════════════════

(window.APP_PARTS = window.APP_PARTS || []).push('predictor-model');
