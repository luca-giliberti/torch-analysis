// Torch Analysis: Picklist (first-pick and second-pick lists, live draft board, draft simulation)
// Classic script, loaded in order by index.html (all files share one global scope).

// ── STATE ──────────────────────────────────────────────────────────────────
let picklistMyTeam = '';
let teamStatus = {};      // team -> 'taken' (on an alliance) | 'dnp' (avoid). Rebuilt from pk below; the Schedule tab reads it for its badges.
// pk is everything the Picklist remembers: which tab, the captains and recorded picks of the live draft,
// your own list orders, the teams you avoid, and the first pick you are planning around.
let pk = { tab: 'first', captains: [], log: [], started: false, order1: null, order2: null, avoid: [], plan1: '', more1: false, more2: false };
let pkMsg = '', pkProj = null;     // a message under the pick box; the last simulation result (cleared whenever the board changes)

// ── WHO ADDS THE MOST TO AN ALLIANCE ───────────────────────────────────────
// Each candidate is dropped into the alliance (captain + picks so far, empty slots filled with an average robot) and
// the match is simulated against the strongest alliance in the field (the three best teams by EPA that aren't in it).
// The gain is how much better that goes than with an average robot in the same slot. Same random draws for every
// candidate, so the gaps between teams are real, not noise.
let plFitMemo = { ver: '', map: new Map() };
// base = the alliance so far (1 or 2 teams, or PRED.AVG standing in for a captain). Results are kept per base.
function plFitFor(base) {
  if (base.length >= 3 || !Object.keys(teamStats).length) return null;
  const ver = predVersion + '|' + rawData.length + (PRED.cal ? 'c' : 'u'), key = base.join(',') + '|' + ver;
  if (plFitMemo.ver !== ver) plFitMemo = { ver, map: new Map() };
  if (plFitMemo.map.has(key)) return plFitMemo.map.get(key);
  const fill = Array(2 - base.length).fill(PRED.AVG);
  const byEpa = Object.values(teamStats).sort((a, b) => b.epa - a.epa).map(s => s.team);
  const bench = skip => byEpa.filter(t => !base.includes(t) && t !== skip).slice(0, 3);
  const seed = predHash('pl|' + key), N = 1000;
  const refs = {};
  const ref = b => { const k = b.join(','); if (!refs[k]) { const s = predSimulate([...base, PRED.AVG, ...fill], b, N, seed); refs[k] = { s, margin: s.red.mean - s.blue.mean, win: predWinProb(s) }; } return refs[k]; };
  const byTeam = {};
  byEpa.filter(t => !base.includes(t)).forEach(t => {
    const b = bench(t), r = ref(b);
    const s = predSimulate([...base, t, ...fill], b, N, seed);
    const comps = PRED.COMPS.map(k => ({ k, d: s.red.comps[k] - r.s.red.comps[k] })).filter(x => x.d >= 1).sort((a, c) => c.d - a.d).slice(0, 2);
    const defense = r.s.blue.defLoss - s.blue.defLoss;     // how much more of the opponents' scoring this robot's defense removes
    const why = comps.map(x => `${PRED.LABELS[x.k]} +${Math.round(x.d)}`);
    if (-defense >= 2) why.push(`slows their top scorer (−${Math.round(-defense)})`);
    byTeam[t] = { gain: (s.red.mean - s.blue.mean) - r.margin, winGain: predWinProb(s) - r.win, why };
  });
  const fit = { base, byTeam, bench: bench(null) };
  plFitMemo.map.set(key, fit);
  return fit;
}

// ── THE DRAFT ENGINE ───────────────────────────────────────────────────────
// How the real draft works, which this follows: seeds 1-8 are the captains. Round 1 goes seed 1 to 8, round 2 goes
// seed 8 to 1. In round 1 a captain may pick ANY team not yet on an alliance, including a lower-seeded captain; if it
// does, that alliance disappears, the alliances below move up and the best-ranked unaligned team becomes the new last
// captain. In round 2 only unaligned teams are left. (At 2026 vabla, seed 3 picked seed 4.)
// How a captain chooses: fitted on the 32 real picks at 2026 vabla and chcmp (each pick against everyone still
// eligible). The chance of picking a team is proportional to (strength + 5) ^ A, with A = 5.5. The picked team was
// among the 3 strongest available in 24 of 32 picks, and only 14 were THE strongest, so it is far from a strict
// "best available". Qualification rank added almost nothing once strength is known, so it is not used.
// Checked against the real selections: docs/model-notes.md.
const DRAFT = { N: 200, A: 5.5, ALLIANCES: 8 };

// R = each team's strength, order = teams strongest first (the estimate of the seeds), captains = the first nA of
// order unless the real captains are given (an array of team numbers).
function draftSetup(myRank, captains) {
  const me = picklistMyTeam;
  const teams = Object.keys(teamStats);
  if (me && !teamStats[me]) teams.push(me);                                   // an unscouted team of yours still takes part, as an average robot
  (captains || []).forEach(c => { if (!teams.includes(c)) teams.push(c); });
  const R = {}; teams.forEach(t => { R[t] = predRating(t); });
  const byStrength = teams.slice().sort((a, b) => (R[b] - R[a]) || (n(a) - n(b)));
  const order = byStrength.slice();
  if (!captains && me && myRank >= 1) {                                       // your real seed beats the estimate
    const i = order.indexOf(me); if (i > -1) order.splice(i, 1);
    order.splice(Math.min(myRank, order.length) - 1, 0, me);
  }
  const nA = captains ? captains.length : Math.min(DRAFT.ALLIANCES, Math.floor(order.length / 3));
  const caps = captains ? captains.slice() : order.slice(0, nA);
  return { me, R, order, nA, captains: caps, pool: (captains ? byStrength : order).filter(t => !caps.includes(t)), strengthRank: byStrength.indexOf(me) + 1 };
}

const draftGumbel = rng => -Math.log(-Math.log(Math.max(rng.rand(), 1e-12)));
// One captain's choice among the eligible teams (rng = null: the single most likely choice)
function draftChoose(S, eligible, rng) {
  let best = null, bv = -Infinity;
  eligible.forEach(t => { const v = DRAFT.A * Math.log((S.R[t] != null ? S.R[t] : 0) + 5) + (rng ? draftGumbel(rng) : 0); if (v > bv) { bv = v; best = t; } });
  return best;
}

// A draft in progress: alliances (arrays, captain first), the teams not on any alliance (strongest first), and which pick is next.
function draftNew(S) { return { S, alliances: S.captains.map(c => [c]), unaligned: S.pool.slice(), step: 0, log: [], meTaken: 0 }; }
function draftClone(st) { return { S: st.S, alliances: st.alliances.map(a => a.slice()), unaligned: st.unaligned.slice(), step: st.step, log: st.log.slice(), meTaken: st.meTaken }; }
function draftInfo(st) {                                                       // whose turn it is: { round, index } or null when the draft is over
  const k = st.alliances.length;
  if (st.step < k) return { round: 1, index: st.step };
  if (st.step < 2 * k) return { round: 2, index: 2 * k - 1 - st.step };
  return null;
}
function draftEligible(st, info) {                                             // who can be picked right now
  const eligible = st.unaligned.slice();
  if (info.round === 1) for (let j = info.index + 1; j < st.alliances.length; j++) eligible.push(st.alliances[j][0]);
  return eligible;
}
// Record a pick for whoever's turn it is. Returns true when it was a lower captain (the alliances shifted).
function draftApply(st, pick) {
  const info = draftInfo(st), al = st.alliances[info.index];
  const j = info.round === 1 ? st.alliances.findIndex((a, k) => k > info.index && a[0] === pick) : -1;
  if (j > -1) {
    st.alliances.splice(j, 1);
    if (pick === st.S.me) st.meTaken = info.index + 1;
    if (st.unaligned.length) st.alliances.push([st.unaligned.shift()]);        // the best unaligned team becomes the last captain
  } else { const k = st.unaligned.indexOf(pick); if (k > -1) st.unaligned.splice(k, 1); }
  al.push(pick); st.log.push({ team: pick, seed: info.index + 1, round: info.round }); st.step++;
  return j > -1;
}
// Play the rest of the draft in place. mePick(allianceSoFar, eligibleTeams) -> team, or null to choose like everyone else.
function draftContinue(st, rng, mePick) {
  const atMe = []; let info;
  while ((info = draftInfo(st))) {
    const eligible = draftEligible(st, info);
    if (!eligible.length) break;
    const al = st.alliances[info.index];
    let pick = null;
    if (st.S.me && al[0] === st.S.me) { atMe.push({ round: info.round, avail: new Set(eligible) }); if (mePick) pick = mePick(al, eligible); }
    if (pick == null || !eligible.includes(pick)) pick = draftChoose(st.S, eligible, rng);
    draftApply(st, pick);
  }
  return atMe;
}
function draftPicked(st) {                                                     // team -> { seed, round } for the picks on the final alliances
  const picked = {};
  st.alliances.forEach((al, k) => { if (al[1]) picked[al[1]] = { seed: k + 1, round: 1 }; if (al[2]) picked[al[2]] = { seed: k + 1, round: 2 }; });
  return picked;
}
// A whole draft from the start
function draftOnce(S, rng, mePick) {
  const st = draftNew(S), atMe = draftContinue(st, rng, mePick);
  return { alliances: st.alliances, picked: draftPicked(st), atMe, log: st.log, meTaken: st.meTaken };
}

// ── SAVING ─────────────────────────────────────────────────────────────────
function pkSave() {
  try { localStorage.setItem('frc_pk2', JSON.stringify(pk)); localStorage.setItem('frc_team_status', JSON.stringify(teamStatus)); } catch (e) {}
}
function pkLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem('frc_pk2') || 'null');
    if (saved && typeof saved === 'object') pk = Object.assign(pk, saved);
    else {                                                                     // from the old picklist: keep the teams marked do-not-pick
      const old = JSON.parse(localStorage.getItem('frc_team_status') || '{}');
      pk.avoid = Object.keys(old).filter(t => old[t] === 'dnp');
    }
  } catch (e) {}
  if (!Array.isArray(pk.captains)) pk.captains = [];
  if (!Array.isArray(pk.log)) pk.log = [];
  if (!Array.isArray(pk.avoid)) pk.avoid = [];
  pkSyncStatus();
}
function pkSyncStatus() {                                                      // the badges other tabs show
  teamStatus = {};
  pk.avoid.forEach(t => { teamStatus[t] = 'dnp'; });
  if (pk.started) pkReplay().alliances.forEach(al => al.forEach(t => { if (teamStatus[t] !== 'dnp') teamStatus[t] = 'taken'; }));
}
function pkChanged() { pkProj = null; pkSyncStatus(); pkSave(); renderPicklist(); }

// ── THE LIVE BOARD'S STATE ─────────────────────────────────────────────────
// The recorded picks are replayed from the captains each time, so undo is just removing the last one.
// A log entry is { team } (a pick) or { cap } (you corrected the captain who took the empty seat after a captain was picked).
function pkReplay() {
  const S = draftSetup(0, pk.captains.length ? pk.captains : null);
  const st = draftNew(S);
  pk.log.forEach((e, i) => {
    if (e.cap) {                                                               // swap the auto-chosen new captain for the real one
      const a = st.alliances[st.alliances.length - 1];
      if (a && a.length === 1) { st.unaligned.unshift(a[0]); const k = st.unaligned.indexOf(e.cap, 1); if (k > -1) st.unaligned.splice(k, 1); a[0] = e.cap; }
      return;
    }
    if (!draftInfo(st)) return;
    const shifted = draftApply(st, e.team);
    if (shifted) st.alliances[st.alliances.length - 1].cascadeAt = i;           // so the new captain can be corrected
  });
  return st;
}
const pkId = t => String(t == null ? '' : t).replace(/[^\w-]/g, '');

// teams that can still be picked now (everything, before the draft starts)
function pkAvailable() {
  const avoid = new Set(pk.avoid);
  if (!pk.started) return new Set(Object.keys(teamStats).filter(t => !avoid.has(t) && t !== picklistMyTeam));
  const st = pkReplay(), info = draftInfo(st);
  const elig = info ? draftEligible(st, info) : [];
  return new Set(elig.filter(t => !avoid.has(t) && t !== picklistMyTeam));
}

// ── THE LISTS ──────────────────────────────────────────────────────────────
// ranked(base): the teams that would add the most to this alliance, best first, with the numbers to show
function pkRanked(base, available) {
  const fit = plFitFor(base);
  if (!fit) return [];
  return Object.keys(fit.byTeam).filter(t => available.has(t)).map(t => {
    const s = teamStats[t], f = fit.byTeam[t];
    return { team: t, gain: f.gain, winGain: f.winGain, why: f.why, epa: s ? s.epa : null, shots: s ? s.avgTotalShots : null, acc: s ? s.avgAccuracy : 0, matches: s ? s.matches : 0 };
  }).sort((a, b) => b.gain - a.gain);
}
// your own order wins over the suggested one; teams you never placed follow in the suggested order
function pkApplyOrder(items, order) {
  if (!order) return items;
  const at = {}; order.forEach((t, i) => { at[t] = i; });
  return items.map((x, i) => ({ x, i })).sort((a, b) => ((a.x.team in at ? at[a.x.team] : 1e6 + a.i) - (b.x.team in at ? at[b.x.team] : 1e6 + b.i))).map(o => o.x);
}
// +12 units / −3 units
const pkGain = (g, unit) => `${g < -0.5 ? '−' + Math.abs(Math.round(g)) : '+' + Math.max(0, Math.round(g))} ${unit}`;
function pkMe() { return picklistMyTeam || PRED.AVG; }
// the first pick the second-pick list is built around: your pick if the board has one, else the one you starred, else the top of list 1
function pkFirstPick(list1) {
  if (pk.started) { const mine = pkReplay().alliances.find(al => al[0] === picklistMyTeam); if (mine && mine[1]) return mine[1]; }
  if (pk.plan1 && list1.some(x => x.team === pk.plan1)) return pk.plan1;
  return list1.length ? list1[0].team : '';
}
function pkLists() {
  const avail = pkAvailable();
  const list1 = pkApplyOrder(pkRanked([pkMe()], avail), pk.order1);
  const first = pkFirstPick(list1);
  const base2 = first ? [pkMe(), first] : [pkMe()];
  const avail2 = new Set([...avail]); avail2.delete(first);
  const list2 = base2.length === 2 ? pkApplyOrder(pkRanked(base2, avail2), pk.order2) : [];
  return { list1, list2, first };
}
function pkMove(which, team, dir) {
  const L = pkLists(), items = which === 'first' ? L.list1 : L.list2;
  const order = items.map(x => x.team), i = order.indexOf(team), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  pk[which === 'first' ? 'order1' : 'order2'] = order;
  pkSave(); renderPicklist();
}
function pkResetOrder(which) { pk[which === 'first' ? 'order1' : 'order2'] = null; pkSave(); renderPicklist(); }
function pkAvoid(team) { if (!pk.avoid.includes(team)) pk.avoid.push(team); pkChanged(); }
function pkRestore(team) { pk.avoid = pk.avoid.filter(t => t !== team); pkChanged(); }
function pkPlan(team) { pk.plan1 = pk.plan1 === team ? '' : team; pk.order2 = null; pkSave(); renderPicklist(); }
function pkShowMore(which) { pk[which === 'first' ? 'more1' : 'more2'] = true; renderPicklist(); }

// ── THE BOARD'S ACTIONS ────────────────────────────────────────────────────
// the captains as typed in the setup boxes (a box left empty keeps the estimate)
function pkInputCaptains() {
  const est = draftSetup(0).captains;
  return est.map((e, i) => { const el = document.getElementById('pk-cap-' + i); return normTeam(el ? el.value : '') || e; });
}
function pkStart() {
  const caps = pkInputCaptains(), dup = caps.find((c, i) => caps.indexOf(c) !== i);
  if (dup) { pkMsg = `T${dup} is in the list twice.`; renderPicklist(); return; }
  pk.captains = caps; pk.log = []; pk.started = true; pkMsg = '';
  pkChanged();
}
// before the draft starts: the draft as it would begin with the captains typed so far
function pkPreviewState() {
  const caps = pkInputCaptains();
  return draftNew(draftSetup(0, new Set(caps).size === caps.length ? caps : null));
}
function pkRecord(team) {
  team = normTeam(team);
  if (!team) return;
  const st = pkReplay(), info = draftInfo(st);
  if (!info) { pkMsg = 'The draft is over.'; renderPicklist(); return; }
  if (st.alliances.some(al => al.includes(team)) && !draftEligible(st, info).includes(team)) { pkMsg = `T${team} is already on an alliance.`; renderPicklist(); return; }
  pkMsg = '';
  pk.log.push({ team });
  pkChanged();
}
function pkRecordInput() { const el = document.getElementById('pk-pick'); const v = el ? el.value : ''; pkRecord(v); }
function pkUndo() {
  if (!pk.log.length) return;
  pk.log.pop();
  pkMsg = ''; pkChanged();
}
function pkRestart() { pk.started = false; pk.log = []; pkMsg = ''; pkChanged(); }
function pkEditCaptain(cascadeAt) {
  const t = normTeam(window.prompt('Who is the new captain for that seat? (team number)') || '');
  if (!t) return;
  pk.log = pk.log.filter((e, i) => !(e.cap && i === cascadeAt + 1));
  pk.log.splice(cascadeAt + 1, 0, { cap: t });
  pkChanged();
}
function pkTab(tab) { pk.tab = tab; pkSave(); renderPicklist(); }

// ── DRAWING ────────────────────────────────────────────────────────────────
const PK_CARD = 'background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;';
const PK_BTN = 'background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:5px 9px;color:var(--muted);font-size:12px;cursor:pointer;';
const PK_HEAD = 'font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:0 0 6px;';

function renderPicklist() {
  const body = document.getElementById('pk-body');
  if (!body) return;
  const page = document.getElementById('page-picklist');
  if (!page || !page.classList.contains('active')) return;                     // simulating every team takes a moment, so only while the tab shows
  ['first', 'second', 'board'].forEach(t => { const el = document.getElementById('pk-tab-' + t); if (el) el.classList.toggle('active', pk.tab === t); });
  const myInput = document.getElementById('picklist-my-team');
  if (myInput && picklistMyTeam && !myInput.value) myInput.value = picklistMyTeam;
  if (!Object.keys(teamStats).length) { body.innerHTML = '<div class="empty"><p>Import scouting data to build a picklist</p></div>'; return; }
  body.innerHTML = pk.tab === 'board' ? pkRenderBoard() : pkRenderList(pk.tab);
}

function pkRow(x, i, which, plan, mine) {
  const id = pkId(x.team), unit = PRED.cal ? 'pts' : 'units';
  const star = which === 'first' ? `<button title="Plan my first pick around this team" onclick="pkPlan('${id}')" style="${PK_BTN}${plan === x.team ? 'color:var(--accent);border-color:var(--accent);' : ''}">★</button>` : '';
  return `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)">
    <div style="width:22px;text-align:right;font-size:13px;font-weight:700;color:var(--muted)">${i + 1}</div>
    <div style="flex:1;min-width:0;cursor:pointer" onclick="showDetail('${id}')">
      <div style="font-size:16px;font-weight:800;color:${plan === x.team ? 'var(--accent)' : 'var(--text)'}">${flagEmoji(x.team)}T${esc(x.team)} <span style="font-size:12px;font-weight:700;color:${x.gain < -0.5 ? 'var(--red)' : 'var(--green)'}">${pkGain(x.gain, unit)}</span>${plan === x.team ? ' <span style="font-size:10px;color:var(--accent)">YOUR PLAN</span>' : ''}</div>
      <div style="font-size:12px;color:var(--muted)">${x.epa != null ? `EPA ${x.epa} · ${x.shots} shots${x.acc ? ' · ' + x.acc + '%' : ''} · ${x.matches} matches` : 'no scouting data'}</div>
      ${x.why.length ? `<div style="font-size:11px;color:var(--muted)">${esc(x.why.join(', '))}</div>` : ''}
    </div>
    <div style="display:flex;gap:5px">${star}<button onclick="pkMove('${which}','${id}',-1)" style="${PK_BTN}">▲</button><button onclick="pkMove('${which}','${id}',1)" style="${PK_BTN}">▼</button><button title="Do not pick" onclick="pkAvoid('${id}')" style="${PK_BTN}color:var(--red);">✕</button></div>
  </div>`;
}

function pkRenderList(tab) {
  const which = tab === 'first' ? 'first' : 'second', L = pkLists(), me = picklistMyTeam;
  const items = which === 'first' ? L.list1 : L.list2, order = which === 'first' ? pk.order1 : pk.order2;
  const more = which === 'first' ? pk.more1 : pk.more2, shown = more ? items : items.slice(0, 15);
  const unit = PRED.cal ? 'pts' : 'units';
  let h = '';
  const picked = pk.started ? Object.keys(teamStatus).filter(t => teamStatus[t] === 'taken').length : 0;
  h += `<div style="font-size:12px;color:var(--muted);line-height:1.5;margin:0 2px 10px">${which === 'first'
    ? `Teams that add the most to your alliance (extra ${unit} of margin against the strongest alliance in the field).${me ? '' : ' <strong style="color:var(--yellow)">Enter your team number above</strong> so it fits your robot; for now an average robot is your captain.'} Use ▲ ▼ to put them in your order, ✕ to drop a team, ★ to plan your first pick around it.`
    : (L.first ? `Built around your first pick, <strong style="color:var(--accent)">T${esc(L.first)}</strong>${pk.started && pkReplay().alliances.some(al => al[0] === me && al[1]) ? ' (already made)' : pk.plan1 ? ' (your ★)' : ' (the top of your first-pick list). Star a different team on the First pick tab to change it'}. Who fills the last slot best?` : 'Make your first pick (or star one on the First pick tab) and this list builds around it.')}${picked ? ` ${picked} team${picked === 1 ? ' is' : 's are'} already on an alliance and left out.` : ''}</div>`;
  if (!items.length) h += `<div class="empty"><p>${which === 'second' && !L.first ? 'No first pick yet' : 'No teams left to suggest'}</p></div>`;
  else h += `<div style="${PK_CARD}padding:4px 14px">${shown.map((x, i) => pkRow(x, i, which, L.first, me)).join('')}</div>`;
  if (items.length > shown.length) h += `<button onclick="pkShowMore('${which}')" style="${PK_BTN}width:100%;padding:9px;margin-bottom:10px">Show all ${items.length} teams</button>`;
  if (order) h += `<button onclick="pkResetOrder('${which}')" style="${PK_BTN}width:100%;padding:9px;margin-bottom:10px">Back to the suggested order</button>`;
  if (pk.avoid.length) h += `<div style="${PK_CARD}"><div style="${PK_HEAD}">Avoiding (tap to put back)</div><div style="display:flex;flex-wrap:wrap;gap:6px">${pk.avoid.map(t => `<button onclick="pkRestore('${pkId(t)}')" style="${PK_BTN}">T${esc(t)} ↩</button>`).join('')}</div></div>`;
  return h;
}

function pkRenderBoard() {
  const me = picklistMyTeam, unit = PRED.cal ? 'pts' : 'units';
  let h = '';
  if (!pk.started) {
    const est = draftSetup(0).captains;
    h += `<div style="${PK_CARD}">
      <div style="${PK_HEAD}">Set up the draft</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:8px">Type the eight captains in seed order (seed 1 first). These are guesses from team strength; replace them with the real top eight from the rankings. Then start, and record each pick as it happens.${me ? '' : ' <strong style="color:var(--yellow)">Enter your team number above first.</strong>'}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${est.map((c, i) => `<div><div style="font-size:10px;color:var(--muted);text-align:center">Seed ${i + 1}</div><input id="pk-cap-${i}" type="text" inputmode="numeric" value="${esc(pk.captains[i] || c)}" style="width:100%;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px 4px;color:var(--text);font-size:14px;font-weight:700;text-align:center;outline:none;-webkit-appearance:none"></div>`).join('')}</div>
      ${pkMsg ? `<div style="color:var(--red);font-size:12px;margin-top:8px">${esc(pkMsg)}</div>` : ''}
      <button class="btn" style="margin-top:12px" onclick="pkStart()">Start the draft</button>
    </div>`;
    h += pkProjectionCard(pkPreviewState(), true);
    return h;
  }
  const st = pkReplay(), info = draftInfo(st), myIdx = st.alliances.findIndex(al => al[0] === me);
  const avail = pkAvailable(), L = pkLists();
  const turnAl = info ? st.alliances[info.index] : null, myTurn = !!info && info.index === myIdx;

  // whose turn
  h += `<div style="${PK_CARD}${myTurn ? 'border-color:var(--accent);' : ''}">`;
  if (!info) h += `<div style="font-size:15px;font-weight:800;color:var(--green)">The draft is over</div>`;
  else {
    h += `<div style="${PK_HEAD}">Round ${info.round} · pick ${info.round === 1 ? info.index + 1 : st.alliances.length - info.index} of ${st.alliances.length}</div>
      <div style="font-size:16px;font-weight:800;margin-bottom:8px;color:${myTurn ? 'var(--accent)' : 'var(--text)'}">${myTurn ? 'Your turn to pick' : `Alliance ${info.index + 1} (T${esc(turnAl[0])}) is picking`}</div>`;
    const base = myTurn ? turnAl.slice() : null;
    const recs = myTurn ? pkApplyOrder(pkRanked(base, avail), info.round === 1 ? pk.order1 : pk.order2).slice(0, 5) : [];
    if (myTurn) h += `<div style="font-size:12px;color:var(--muted);margin-bottom:4px">Best fits right now (tap to record the pick):</div>` + recs.map(x => `<div onclick="pkRecord('${pkId(x.team)}')" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);cursor:pointer"><span style="font-size:16px;font-weight:800">${flagEmoji(x.team)}T${esc(x.team)}</span><span style="font-size:12px;color:var(--muted);flex:1;margin:0 10px">${esc(x.why.join(', '))}</span><span style="color:${x.gain < -0.5 ? 'var(--red)' : 'var(--green)'};font-weight:700">${pkGain(x.gain, unit)}</span></div>`).join('');
    else {
      const likely = [...draftEligible(st, info)].sort((a, b) => st.S.R[b] - st.S.R[a]).slice(0, 6);
      h += `<div style="font-size:12px;color:var(--muted);margin-bottom:4px">Strongest still available (tap to record the pick):</div><div style="display:flex;flex-wrap:wrap;gap:6px">${likely.map(t => `<button onclick="pkRecord('${pkId(t)}')" style="${PK_BTN}color:var(--text)">${flagEmoji(t)}T${esc(t)}</button>`).join('')}</div>`;
    }
    h += `<div style="display:flex;gap:8px;margin-top:10px"><input id="pk-pick" type="text" inputmode="numeric" placeholder="Or type the team they picked" onkeydown="if(event.key==='Enter')pkRecordInput()" style="flex:1;min-width:0;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--text);font-size:14px;outline:none;-webkit-appearance:none"><button class="btn" style="margin:0;width:auto;flex:0 0 auto;padding:9px 16px" onclick="pkRecordInput()">Record</button></div>`;
  }
  if (pkMsg) h += `<div style="color:var(--red);font-size:12px;margin-top:8px">${esc(pkMsg)}</div>`;
  h += `<div style="display:flex;gap:8px;margin-top:10px"><button onclick="pkUndo()" style="${PK_BTN}">↶ Undo last</button><button onclick="if(confirm('Start the draft over? Recorded picks are cleared.'))pkRestart()" style="${PK_BTN}">Start over</button></div></div>`;

  // the board
  const th = 'padding:6px;font-size:10px;color:var(--muted);text-align:center;background:var(--card2);border-bottom:2px solid var(--border);';
  h += `<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);margin-bottom:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${['Alliance', 'Captain', 'Pick 1', 'Pick 2'].map(x => `<th style="${th}">${x}</th>`).join('')}</tr></thead><tbody>` +
    st.alliances.map((al, i) => `<tr style="${i === myIdx || al.includes(me) ? 'background:rgba(240,165,0,.12);' : ''}"><td style="padding:7px;text-align:center;color:var(--muted);border-bottom:1px solid var(--border)">${i + 1}</td>` +
      [0, 1, 2].map(k => {
        const cur = info && info.index === i && ((info.round === 1 && k === 1) || (info.round === 2 && k === 2));
        const v = al[k] ? `<span style="font-weight:${k === 0 ? 800 : 600};${al[k] === me ? 'color:var(--accent)' : ''}">T${esc(al[k])}</span>${k === 0 && al.cascadeAt != null && al.length === 1 ? ` <span title="This seat was filled automatically after a captain was picked. Tap to change it." onclick="pkEditCaptain(${al.cascadeAt})" style="cursor:pointer;color:var(--yellow)">✎</span>` : ''}` : (cur ? '<span style="color:var(--accent)">▸ picking</span>' : '<span style="color:var(--muted)">—</span>');
        return `<td style="padding:7px;text-align:center;border-bottom:1px solid var(--border);${cur ? 'background:rgba(240,165,0,.18);' : ''}">${v}</td>`;
      }).join('') + `</tr>`).join('') + `</tbody></table></div>`;

  h += pkProjectionCard(st, false);
  return h;
}

// ── THE SIMULATION ─────────────────────────────────────────────────────────
// Plays out the rest of the draft from where the board is, 200 times. Before anyone has picked, that is the whole draft.
function pkProjectionCard(st, preview) {
  const me = picklistMyTeam;
  const info = draftInfo(st);
  let h = `<div style="${PK_CARD}"><div style="${PK_HEAD}">${preview ? 'Try it first: simulate the draft' : 'What happens next'}</div>`;
  if (!me) return h + `<div style="font-size:12px;color:var(--muted)">Enter your team number above to simulate.</div></div>`;
  if (!info) return h + pkProjectionBody(st) + '</div>';
  if (pkProj && pkProj.key === pkProjKey(st)) return h + pkProj.html + '</div>';
  return h + `<div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:8px">${preview ? 'Plays the draft out 200 times with the captains above.' : 'Plays the rest of the draft out 200 times from the picks recorded so far.'} Captains choose mostly by strength; you pick the best fit for your alliance.</div><button class="btn" style="margin:0" onclick="pkSimulate()">Simulate${preview ? '' : ' the rest'}</button></div>`;
}
function pkProjKey(st) { return st.S.captains.join(',') + '|' + JSON.stringify(pk.log) + '|' + picklistMyTeam + '|' + rawData.length + '|' + pk.started; }
function pkSimulate() {
  const st = pk.started ? pkReplay() : pkPreviewState();
  if (!pk.started) { pk.captains = st.S.captains.slice(); pkSave(); }     // so the boxes keep what was simulated
  pkProj = { key: pkProjKey(st), html: '<div style="font-size:13px;color:var(--muted)">Simulating…</div>' };
  renderPicklist();
  setTimeout(() => {
    try { pkProj = { key: pkProjKey(st), html: pkProjectionBody(st) }; }
    catch (e) { pkProj = { key: pkProjKey(st), html: `<div style="color:var(--red);font-size:13px">Could not run the simulation: ${esc(e.message)}</div>` }; throw e; }
    finally { renderPicklist(); }
  }, 30);
}

// the numbers and sentences for a draft in progress (or not started)
function pkProjectionBody(st) {
  const S = st.S, me = S.me, unit = PRED.cal ? 'pts' : 'units';
  const rng = predRng(predHash('draft|' + me + '|' + st.log.map(x => x.team).join(',') + '|' + S.captains.join(',') + '|' + rawData.length));
  const strength = al => al.reduce((s, t) => s + (S.R[t] != null ? S.R[t] : 0), 0);
  const pct = (c, N) => Math.round(100 * c / N) + '%';
  const wrap = x => `<div style="margin-top:8px;font-size:13px;line-height:1.55">${x}</div>`;
  const head = x => `<div style="${PK_HEAD}margin-top:12px">${x}</div>`;
  const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
  const N = DRAFT.N;
  const smart = (al, eligible) => {
    const fit = plFitFor(al.slice());
    if (!fit) return null;
    let best = null, bg = -Infinity;
    eligible.forEach(t => { const f = fit.byTeam[t]; if (f && f.gain > bg) { bg = f.gain; best = t; } });
    return best;
  };
  const myAlliance = x => x.alliances.find(al => al[0] === me);
  const onAlliance = x => x.alliances.findIndex(al => al.includes(me));
  let html = '';
  const done = !draftInfo(st);

  if (!done) {
    const stillCaptain = !!myAlliance(st);
    if (stillCaptain) {
      const mineNow = myAlliance(st), nextIsFirst = mineNow.length === 1;
      const first = {}, second = {}, availAt = {}; let taken = 0;
      for (let i = 0; i < N; i++) {
        const sim = draftClone(st), atMe = draftContinue(sim, rng, smart);
        if (sim.meTaken && !st.meTaken) { taken++; continue; }
        const mine = myAlliance(sim) || [];
        if (nextIsFirst && mine[1]) first[mine[1]] = (first[mine[1]] || 0) + 1;
        if (mine[2]) second[mine[2]] = (second[mine[2]] || 0) + 1;
        const turn = atMe[0]; if (turn) turn.avail.forEach(t => { availAt[t] = (availAt[t] || 0) + 1; });
      }
      const stay = N - taken, seat = st.alliances.indexOf(mineNow) + 1;
      html += wrap(`You are alliance <strong style="color:var(--accent)">${seat}</strong> of ${st.alliances.length}. Your next pick is your <strong>${nextIsFirst ? 'first' : 'second'}</strong> pick.`);
      if (taken) html += wrap(`<span style="color:var(--yellow)">A higher alliance picks you in <strong>${pct(taken, N)}</strong> of simulated drafts</span> (it really happens: at 2026 vabla, seed 3 picked seed 4). The rest covers the ${pct(stay, N)} where you stay a captain.`);
      if (stay) {
        const base = mineNow.slice(), seat0 = st.alliances.indexOf(mineNow);
        // who you could pick at your turn: anyone not on an alliance, plus (in round 1) the captains below you
        const canPick = new Set([...st.unaligned, ...(nextIsFirst ? st.alliances.slice(seat0 + 1).map(a => a[0]) : [])].filter(t => t !== me && !pk.avoid.includes(t)));
        const cands = pkApplyOrder(pkRanked(base, canPick), nextIsFirst ? pk.order1 : pk.order2).slice(0, 6);
        html += head(`Your best ${nextIsFirst ? 'first' : 'second'}-pick targets: will they still be there?`);
        html += cands.map(x => { const a = (availAt[x.team] || 0) / stay; return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span><strong>T${esc(x.team)}</strong> <span style="color:${x.gain < -0.5 ? 'var(--red)' : 'var(--green)'}">${pkGain(x.gain, unit)}</span></span><span style="color:${a >= 0.7 ? 'var(--green)' : a >= 0.3 ? 'var(--yellow)' : 'var(--red)'}">${Math.round(a * 100)}% still there</span></div>`; }).join('') || '<div style="color:var(--muted)">No suggestions.</div>';
        if (Object.keys(first).length || Object.keys(second).length) html += head('Your likely alliance') + (nextIsFirst ? `<div>First pick: ${top(first, 3).map(([t, c]) => `<strong>T${esc(t)}</strong> ${pct(c, stay)}`).join(' · ')}</div>` : '') + `<div>Second pick: ${top(second, 3).map(([t, c]) => `<strong>T${esc(t)}</strong> ${pct(c, stay)}`).join(' · ')}</div>`;
      }
    } else if (onAlliance(st) > -1) {
      html += wrap(`You are already on alliance ${onAlliance(st) + 1}.`);
    } else {
      const r1 = {}, r2 = {}, bySeed = {}; let none = 0, promoted = 0;
      for (let i = 0; i < N; i++) {
        const sim = draftClone(st); draftContinue(sim, rng, smart);
        const p = draftPicked(sim)[me];
        if (sim.alliances.some(al => al[0] === me)) promoted++;
        else if (!p) none++;
        else { (p.round === 1 ? r1 : r2)[p.seed] = ((p.round === 1 ? r1 : r2)[p.seed] || 0) + 1; bySeed[p.seed] = (bySeed[p.seed] || 0) + 1; }
      }
      const c1 = Object.values(r1).reduce((a, b) => a + b, 0), c2 = Object.values(r2).reduce((a, b) => a + b, 0);
      const byStrength = Object.keys(S.R).sort((a, b) => S.R[b] - S.R[a]), sRank = byStrength.indexOf(me) + 1;
      html += wrap(`You are not a captain, and rate <strong>#${sRank}</strong> of ${byStrength.length} by strength, so a captain would have to pick you.`);
      html += head('Chance of being picked');
      html += `<div>Round 1: <strong>${pct(c1, N)}</strong> · Round 2: <strong>${pct(c2, N)}</strong>${promoted ? ` · Becomes a captain: <strong>${pct(promoted, N)}</strong>` : ''} · Not picked: <strong style="color:${none / N > 0.5 ? 'var(--red)' : 'var(--text)'}">${pct(none, N)}</strong></div>`;
      const by = Object.entries(bySeed).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (by.length) html += `<div style="color:var(--muted)">Most likely picked by: ${by.map(([s, c]) => `alliance ${s} (${pct(c, N)})`).join(', ')}</div>`;
      if (none / N >= 0.5) html += wrap(`<span style="color:var(--muted)">Why so low: only ${2 * st.alliances.length} robots get picked, and captains almost always take one of the strongest still available (in real drafts, 24 of 32 picks were among the 3 strongest left). If your scouted numbers undersell your robot, this will too.</span>`);
    }
  }

  // a typical way it ends (the single most likely choice at every pick, you picking best fit)
  const sim0 = draftClone(st); draftContinue(sim0, null, smart);
  const ranked = sim0.alliances.map((al, i) => ({ al, i, s: strength(al) })).sort((a, b) => b.s - a.s);
  const myIdx = onAlliance(sim0);
  html += head(done ? 'How it ended' : 'A typical ending');
  html += `<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${['Alliance', 'Captain', 'Pick 1', 'Pick 2', 'Strength'].map(x => `<th style="padding:6px;color:var(--muted);text-align:center;background:var(--card2);border-bottom:2px solid var(--border)">${x}</th>`).join('')}</tr></thead><tbody>` +
    sim0.alliances.map((al, i) => `<tr style="${i === myIdx ? 'background:rgba(240,165,0,.12);' : ''}">${[i + 1, ...[0, 1, 2].map(k => al[k] ? 'T' + esc(al[k]) : '—'), Math.round(strength(al))].map((v, k) => `<td style="padding:6px;text-align:center;border-bottom:1px solid var(--border);${k === 0 ? 'color:var(--muted)' : ''}${String(v).replace(/^T/, '') === me ? ';color:var(--accent);font-weight:800' : ''}">${v}</td>`).join('')}</tr>`).join('') + `</tbody></table></div>`;
  if (myIdx > -1) {
    const rank = ranked.findIndex(x => x.i === myIdx) + 1, best = ranked.find(x => x.i !== myIdx), mine = sim0.alliances[myIdx];
    let win = '';
    if (best && best.al.length && mine.length) { const sim = predSimulate(mine, best.al, 3000, predHash('draftwin|' + mine.join())); win = ` Against the strongest other alliance (alliance ${best.i + 1}) your win chance is about <strong>${Math.round(predWinProb(sim) * 100)}%</strong>.`; }
    html += wrap(`Your alliance (${mine.map(t => 'T' + esc(t)).join(' + ')}) is the <strong>#${rank}</strong> strongest of ${sim0.alliances.length}.${win}`);
  } else html += wrap(`<span style="color:var(--yellow)">Nobody picks you in a typical ending.</span>`);
  html += `<div style="font-size:11px;color:var(--muted);margin-top:8px">Strength is the sum of each robot's expected output from the scouting. Real captains also weigh fit and relationships. Seeds come from team strength unless you typed the real captains.</div>`;
  return html;
}

(window.APP_PARTS = window.APP_PARTS || []).push('picklist');
