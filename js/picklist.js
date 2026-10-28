// Torch Analysis: Picklist, alliance suggestions, alliance selection simulation
// Classic script, loaded in order by index.html (all files share one global scope).

// ── FEATURE 2: ALLIANCE PICKLIST ───────────────────────────────────────────
let picklistMyTeam = '';
let teamStatus = {};
let plFilter = 'all';

function setPlFilter(f) {
  plFilter = f;
  ['all','available','taken','dnp','mine'].forEach(x => document.getElementById('pl-filter-'+x)?.classList.toggle('active', x===f));
  renderPicklist();
}

function setTeamStatus(team, status) {
  if (teamStatus[team] === status) delete teamStatus[team];
  else teamStatus[team] = status;
  localStorage.setItem('frc_team_status', JSON.stringify(teamStatus));
  renderPicklist();
}

function resetPicklistStatuses() {
  teamStatus = {};
  localStorage.setItem('frc_team_status', JSON.stringify(teamStatus));
  renderPicklist();
}

function setPlSort(s) {
  plSort = s;
  ['fit', 'epa'].forEach(x => document.getElementById('pl-sort-' + x)?.classList.toggle('active', x === s));
  renderPicklist();
}

// ── Who adds the most to my alliance? ──────────────────────────────────────
// Each candidate is dropped into your alliance (you + the partners you've marked "mine", empty slots filled
// with an average robot) and the match is simulated against the strongest alliance in the field (the three
// best teams by EPA that aren't yours). The gain is how much better that goes than with an average robot in the
// same slot. Same random draws for every candidate, so the gaps between teams are real, not noise.
let plSort = 'fit', plFitMemo = { ver: '', map: new Map() };
function plAllianceSoFar() {
  const mine = Object.keys(teamStatus).filter(t => teamStatus[t] === 'mine' && t !== picklistMyTeam);
  return [picklistMyTeam || PRED.AVG, ...mine];
}
function plFit() { return plFitFor(plAllianceSoFar()); }
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

function renderPicklist() {
  const list = document.getElementById('picklist-list');
  const suggestion = document.getElementById('picklist-suggestion');
  if (!list) return;

  const allTeams = Object.entries(teamStats)
    .map(([t, s]) => ({ team: t, epa: s.epa, matches: s.matches, shots: s.avgTotalShots }))
    .sort((a, b) => b.epa - a.epa);

  if (!allTeams.length) {
    list.innerHTML = '<div class="empty"><p>Import scouting data to build a picklist</p></div>';
    if (suggestion) suggestion.style.display = 'none';
    return;
  }

  // simulating every team takes a moment, so only do it while the Picklist tab is showing
  const live = document.getElementById('page-picklist').classList.contains('active');
  const fit = live ? plFit() : null;
  const unit = PRED.cal ? 'pts' : 'units';
  const base = plAllianceSoFar();
  const available = allTeams.filter(t => !teamStatus[t.team] && t.team !== picklistMyTeam);

  if (suggestion) {
    suggestion.style.display = 'block';
    const mineTeams = base.filter(t => t !== PRED.AVG);
    const lineup = mineTeams.length ? mineTeams.map(t => 'T' + esc(t)).join(' + ') : 'no team yet';
    if (live && !fit) {
      suggestion.innerHTML = `<div style="font-size:11px;color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Your alliance is full</div>
        <div style="font-size:13px;color:var(--text)">${lineup}. Tap ★ again on a pick to free a slot and see suggestions.</div>`;
    } else if (fit && available.length) {
      const top = available.filter(t => fit.byTeam[t.team]).sort((a, b) => fit.byTeam[b.team].gain - fit.byTeam[a.team].gain).slice(0, 3);
      const slot = base.length === 1 ? 'first pick' : 'second pick';
      suggestion.innerHTML = `
        <div style="font-size:11px;color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">⭐ Best ${slot} for your alliance</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">${picklistMyTeam ? `Alliance so far: ${lineup}.` : 'Enter your team number above so suggestions fit your robot (for now, measured with an average robot as captain).'} Gain = extra ${unit} of margin against the strongest alliance in the field (${fit.bench.map(t => esc(t)).join(', ')}).</div>
        ${top.map((t, i) => { const f = fit.byTeam[t.team]; return `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;${i ? 'border-top:1px solid var(--border);' : ''}">
          <div style="font-size:${i ? 18 : 24}px;font-weight:800;color:var(--accent);min-width:${i ? 64 : 84}px">T${esc(t.team)}</div>
          <div style="flex:1;font-size:12px;color:var(--muted);line-height:1.4">
            <span style="color:var(--green);font-weight:700">+${Math.round(f.gain)} ${unit}</span> · ${f.winGain >= 0 ? '+' : ''}${Math.round(f.winGain * 100)}% win chance${flagEmoji(t.team) ? ' · ' + flagEmoji(t.team) : ''}<br>
            EPA ${t.epa} · ${t.matches} matches${f.why.length ? ' · ' + esc(f.why.join(', ')) : ''}
          </div>
          <button onclick="setTeamStatus('${esc(t.team)}','mine')" style="background:var(--card2);border:1px solid var(--accent);border-radius:8px;padding:5px 9px;color:var(--accent);font-size:12px;cursor:pointer;font-weight:700;">★ Pick</button>
          <button onclick="setTeamStatus('${esc(t.team)}','taken')" style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:5px 9px;color:var(--muted);font-size:12px;cursor:pointer;">Taken</button>
        </div>`; }).join('')}`;
    } else {
      suggestion.style.display = 'none';
    }
  }

  // Restore input value if it got wiped by a re-render
  const myInput = document.getElementById('picklist-my-team');
  if (myInput && picklistMyTeam && !myInput.value) myInput.value = picklistMyTeam;

  let rows = allTeams.filter(t => {
    if (t.team === picklistMyTeam) return false; // always hide your own team
    const status = teamStatus[t.team] || 'available';
    if (plFilter === 'all') return true;
    return status === plFilter;
  });
  if (fit && plSort === 'fit') {
    const g = t => (!teamStatus[t.team] && fit.byTeam[t.team]) ? fit.byTeam[t.team].gain : -Infinity;
    rows = rows.map((t, i) => ({ t, i })).sort((a, b) => (g(b.t) - g(a.t)) || (a.i - b.i)).map(x => x.t);
  }

  list.innerHTML = rows.map((t, i) => {
    const status = teamStatus[t.team] || 'available';
    const flag = flagEmoji(t.team);
    const f = fit && status === 'available' ? fit.byTeam[t.team] : null;
    const statusColor = status === 'taken' ? 'var(--muted)' : status === 'dnp' ? 'var(--red)' : status === 'mine' ? 'var(--accent)' : 'var(--text)';
    const cardOpacity = status === 'dnp' ? '0.5' : '1';
    const id = esc(t.team);
    const btn = (st, label, color) => `<button onclick="setTeamStatus('${id}','${st}')" style="background:var(--card2);border:1px solid ${status === st ? color : 'var(--border)'};border-radius:8px;padding:5px 8px;color:${status === st ? color : 'var(--muted)'};font-size:11px;cursor:pointer;font-weight:600">${label}</button>`;
    return `
      <div style="background:var(--card);border:1px solid ${status === 'mine' ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;opacity:${cardOpacity}">
        <div style="font-size:13px;font-weight:700;color:var(--muted);width:24px;text-align:right">${i+1}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:16px;font-weight:800;color:${statusColor}">T${id}</span>
            <span style="font-size:13px">${flag}</span>
            ${status === 'taken' ? '<span style="font-size:10px;color:var(--muted);background:var(--card2);border-radius:6px;padding:1px 6px">TAKEN</span>' : ''}
            ${status === 'dnp' ? '<span style="font-size:10px;color:var(--red);background:var(--card2);border-radius:6px;padding:1px 6px">DNP</span>' : ''}
            ${status === 'mine' ? '<span style="font-size:10px;color:var(--accent);background:var(--card2);border-radius:6px;padding:1px 6px">MY ALLIANCE</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">EPA ${t.epa} · ${t.shots} shots · ${t.matches} matches${f ? ` · <span style="color:var(--green);font-weight:700">+${Math.round(f.gain)} ${unit}</span>` : ''}</div>
        </div>
        <div style="display:flex;gap:6px">
          ${btn('mine', '★', 'var(--accent)')}${btn('taken', '✓', 'var(--muted)')}${btn('dnp', '✕', 'var(--red)')}
        </div>
      </div>`;
  }).join('');
}

// ── ALLIANCE SELECTION SIMULATION ──────────────────────────────────────────
// How the real draft works, which this follows: seeds 1-8 are the captains. Round 1 goes seed 1 to 8, round 2 goes
// seed 8 to 1. In round 1 a captain may pick ANY team not yet on an alliance, including a lower-seeded captain; if it
// does, that alliance disappears, the alliances below move up and the best-ranked unaligned team becomes the new last
// captain. In round 2 only unaligned teams are left. (At 2026 vabla, seed 3 picked seed 4, who was 346.)
// How a captain chooses: fitted on the 32 real picks at 2026 vabla and chcmp (each pick against everyone still
// eligible). The chance of picking a team is proportional to (strength + 5) ^ A, with A = 5.5. The picked team was
// among the 3 strongest available in 24 of 32 picks, and only 14 were THE strongest, so it is far from a strict
// "best available". Qualification rank added almost nothing once strength is known, so it is not used for picking.
// You take the robot that adds the most to your alliance (the same "gain" as the picklist suggestions).
const DRAFT = { N: 200, A: 5.5, ALLIANCES: 8 };

function draftSetup(myRank) {
  const me = picklistMyTeam;
  const teams = Object.keys(teamStats);
  if (me && !teamStats[me]) teams.push(me);                                   // an unscouted team of yours still takes part, as an average robot
  const R = {}; teams.forEach(t => { R[t] = predRating(t); });
  const order = teams.slice().sort((a, b) => (R[b] - R[a]) || (n(a) - n(b)));
  if (me && myRank >= 1) {                                                    // your real seed beats the estimate
    const i = order.indexOf(me); if (i > -1) order.splice(i, 1);
    order.splice(Math.min(myRank, order.length) - 1, 0, me);
  }
  const nA = Math.min(DRAFT.ALLIANCES, Math.floor(order.length / 3));
  const byStrength = teams.slice().sort((a, b) => (R[b] - R[a]) || (n(a) - n(b)));
  return { me, R, order, nA, captains: order.slice(0, nA), pool: order.slice(nA), strengthRank: byStrength.indexOf(me) + 1 };
}

const draftGumbel = rng => -Math.log(-Math.log(Math.max(rng.rand(), 1e-12)));
// One captain's choice among the eligible teams (rng = null: the single most likely choice)
function draftChoose(S, eligible, rng) {
  let best = null, bv = -Infinity;
  eligible.forEach(t => { const v = DRAFT.A * Math.log(S.R[t] + 5) + (rng ? draftGumbel(rng) : 0); if (v > bv) { bv = v; best = t; } });
  return best;
}

// One draft. mePick(allianceSoFar, eligibleTeams) -> team, or null to choose like everyone else.
function draftOnce(S, rng, mePick) {
  const alliances = S.captains.map(c => [c]), unaligned = S.pool.slice(), log = [], atMe = [];
  let meTaken = 0;                                                             // the seed that picked YOU, when you were a captain
  const turn = (i, round) => {
    const al = alliances[i];
    const eligible = unaligned.slice();
    if (round === 1) for (let j = i + 1; j < alliances.length; j++) eligible.push(alliances[j][0]);
    if (!eligible.length) return;
    let pick = null;
    if (S.me && al[0] === S.me) { atMe.push({ round, avail: new Set(eligible) }); if (mePick) pick = mePick(al, eligible); }
    if (pick == null || !eligible.includes(pick)) pick = draftChoose(S, eligible, rng);
    const j = round === 1 ? alliances.findIndex((a, k) => k > i && a[0] === pick) : -1;
    if (j > -1) {                                                              // a lower captain was picked: its alliance disappears
      alliances.splice(j, 1);
      if (pick === S.me) meTaken = i + 1;
      if (unaligned.length) alliances.push([unaligned.shift()]);               // the best unaligned team becomes the last captain
    } else unaligned.splice(unaligned.indexOf(pick), 1);
    al.push(pick); log.push({ team: pick, seed: i + 1, round });
  };
  for (let i = 0; i < alliances.length; i++) turn(i, 1);
  for (let i = alliances.length - 1; i >= 0; i--) turn(i, 2);
  const picked = {};
  alliances.forEach((al, k) => { if (al[1]) picked[al[1]] = { seed: k + 1, round: 1 }; if (al[2]) picked[al[2]] = { seed: k + 1, round: 2 }; });
  return { alliances, picked, atMe, log, meTaken };
}

function draftRun() {
  const out = document.getElementById('draft-output');
  const rankIn = document.getElementById('draft-rank').value.replace(/\D/g, '');
  try { localStorage.setItem('frc_my_rank', rankIn); } catch (e) {}
  const msg = (t, c) => { out.innerHTML = `<div style="font-size:13px;color:var(${c || '--muted'});margin-top:10px">${t}</div>`; };
  if (!Object.keys(teamStats).length) { msg('Load scouting data on the Import tab first.'); return; }
  if (!picklistMyTeam) { msg('Enter your team number at the top of this tab first.'); return; }
  const S = draftSetup(rankIn ? +rankIn : 0);
  if (S.nA < 2) { msg('There are not enough teams in the data to run a draft (need at least 6).'); return; }
  msg('Simulating…');
  setTimeout(() => { try { draftRender(S, rankIn); } catch (e) { msg('Could not run the draft: ' + esc(e.message), '--red'); throw e; } }, 30);
}

function draftRender(S, rankIn) {
  const out = document.getElementById('draft-output'), me = S.me, mySeed = S.captains.indexOf(me) + 1, isCaptain = mySeed > 0;
  const rng = predRng(predHash('draft|' + me + '|' + rankIn + '|' + rawData.length));
  const unit = PRED.cal ? 'pts' : 'units';
  const strength = al => al.reduce((s, t) => s + S.R[t], 0);
  const wrap = h => `<div style="margin-top:10px;font-size:13px;line-height:1.55">${h}</div>`;
  const pct = (c, N) => Math.round(100 * c / N) + '%';
  const head = t => `<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 4px">${t}</div>`;
  const N = DRAFT.N, top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
  let html = '';

  // a smart "me": the robot with the biggest gain for the alliance so far (from the picklist fit)
  const smart = (al, eligible) => {
    const fit = plFitFor(al.slice());
    if (!fit) return null;
    let best = null, bg = -Infinity;
    eligible.forEach(t => { const f = fit.byTeam[t]; if (f && f.gain > bg) { bg = f.gain; best = t; } });
    return best;
  };

  if (isCaptain) {
    const first = {}, second = {}, availAt = {}; let taken = 0;
    for (let i = 0; i < N; i++) {
      const d = draftOnce(S, rng, smart);
      if (d.meTaken) { taken++; continue; }
      const mine = d.alliances.find(al => al[0] === me) || [];
      if (mine[1]) first[mine[1]] = (first[mine[1]] || 0) + 1; if (mine[2]) second[mine[2]] = (second[mine[2]] || 0) + 1;
      const r1 = d.atMe.find(x => x.round === 1); if (r1) r1.avail.forEach(t => { availAt[t] = (availAt[t] || 0) + 1; });
    }
    const stay = N - taken;
    const fit1 = plFitFor([me]);
    const higher = new Set(S.captains.slice(0, mySeed - 1));                   // seeds above you can't be picked by you
    const cands = fit1 ? Object.entries(fit1.byTeam).filter(([t]) => !higher.has(t)).sort((a, b) => b[1].gain - a[1].gain).slice(0, 6) : [];
    html += wrap(`You are seed <strong style="color:var(--accent)">${mySeed}</strong> of ${S.nA}: a captain${rankIn ? '' : ' (estimated from your strength)'}. Your first pick is number ${mySeed} in round 1 and your second is number ${S.nA - mySeed + 1} in round 2.`);
    if (taken) html += wrap(`<span style="color:var(--yellow)">A higher seed picks you in <strong>${pct(taken, N)}</strong> of drafts</span>, which moves the alliances below up (it really happens: at 2026 vabla, seed 3 picked seed 4). The rest of this section covers the ${pct(stay, N)} where you stay a captain.`);
    if (stay) {
      html += head('Your best first-pick targets and whether they will still be there');
      html += cands.map(([t, f]) => { const a = (availAt[t] || 0) / stay; return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span><strong>T${esc(t)}</strong> <span style="color:var(--green)">+${Math.round(f.gain)} ${unit}</span></span><span style="color:${a >= 0.7 ? 'var(--green)' : a >= 0.3 ? 'var(--yellow)' : 'var(--red)'}">${Math.round(a * 100)}% still available</span></div>`; }).join('') || '<div style="color:var(--muted)">No suggestions.</div>';
      html += head('Your likely alliance');
      html += `<div>First pick: ${top(first, 3).map(([t, c]) => `<strong>T${esc(t)}</strong> ${pct(c, stay)}`).join(' · ')}</div><div>Second pick: ${top(second, 3).map(([t, c]) => `<strong>T${esc(t)}</strong> ${pct(c, stay)}`).join(' · ')}</div>`;
    }
  } else {
    const r1 = {}, r2 = {}, bySeed = {}; let none = 0, promoted = 0;
    for (let i = 0; i < N; i++) {
      const d = draftOnce(S, rng, smart), p = d.picked[me];
      if (d.alliances.some(al => al[0] === me)) promoted++;                    // you became a captain when a higher captain was picked
      else if (!p) none++;
      else { (p.round === 1 ? r1 : r2)[p.seed] = ((p.round === 1 ? r1 : r2)[p.seed] || 0) + 1; bySeed[p.seed] = (bySeed[p.seed] || 0) + 1; }
    }
    const c1 = Object.values(r1).reduce((a, b) => a + b, 0), c2 = Object.values(r2).reduce((a, b) => a + b, 0);
    const poolSize = S.order.length - S.nA, picksMade = 2 * S.nA;
    html += wrap(`You are ranked about <strong style="color:var(--accent)">${S.order.indexOf(me) + 1}</strong>${rankIn ? '' : ' (estimated from your strength)'}, outside the top ${S.nA}, and rated <strong>#${S.strengthRank}</strong> of ${S.order.length} by strength, so a captain would have to pick you.`);
    html += head('Chance of being picked');
    html += `<div>Round 1: <strong>${pct(c1, N)}</strong> · Round 2: <strong>${pct(c2, N)}</strong>${promoted ? ` · Becomes a captain: <strong>${pct(promoted, N)}</strong>` : ''} · Not picked: <strong style="color:${none / N > 0.5 ? 'var(--red)' : 'var(--text)'}">${pct(none, N)}</strong></div>`;
    const by = Object.entries(bySeed).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (by.length) html += `<div style="color:var(--muted)">Most likely picked by: ${by.map(([s, c]) => `seed ${s} (${pct(c, N)})`).join(', ')}</div>`;
    if (none / N >= 0.5) html += wrap(`<span style="color:var(--muted)">Why so low: only ${picksMade} of the other ${poolSize + S.nA - 1} robots get picked, and captains almost always take one of the strongest still available (in real drafts, 24 of 32 picks were among the 3 strongest left). At #${S.strengthRank} by strength, a pick is unlikely. If your scouted numbers undersell your robot, this will too.</span>`);
  }

  // one typical draft (the single most likely choice at every pick)
  const d0 = draftOnce(S, null, isCaptain ? smart : null);
  const ranked = d0.alliances.map((al, i) => ({ al, i, s: strength(al) })).sort((a, b) => b.s - a.s);
  const myIdx = d0.alliances.findIndex(al => al.includes(me));
  html += head('A typical draft');
  html += `<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--card)"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>${['Seed', 'Captain', 'Pick 1', 'Pick 2', 'Strength'].map(h => `<th style="padding:6px;color:var(--muted);text-align:center;background:var(--card2);border-bottom:2px solid var(--border)">${h}</th>`).join('')}</tr></thead><tbody>` +
    d0.alliances.map((al, i) => `<tr style="${i === myIdx ? 'background:rgba(240,165,0,.12);' : ''}">${[i + 1, ...[0, 1, 2].map(k => al[k] ? 'T' + esc(al[k]) : '—'), Math.round(strength(al))].map((v, k) => `<td style="padding:6px;text-align:center;border-bottom:1px solid var(--border);${k === 0 ? 'color:var(--muted)' : ''}${String(v).replace(/^T/, '') === me ? ';color:var(--accent);font-weight:800' : ''}">${v}</td>`).join('')}</tr>`).join('') + `</tbody></table></div>`;
  if (myIdx > -1) {
    const rank = ranked.findIndex(x => x.i === myIdx) + 1, best = ranked.find(x => x.i !== myIdx), mine = d0.alliances[myIdx];
    let win = '';
    if (best && best.al.length && mine.length) { const sim = predSimulate(mine, best.al, 3000, predHash('draftwin|' + mine.join())); win = ` Against the strongest other alliance (seed ${best.i + 1}) your win chance is about <strong>${Math.round(predWinProb(sim) * 100)}%</strong>.`; }
    html += wrap(`In this typical draft your alliance (${mine.map(t => 'T' + esc(t)).join(' + ')}) is the <strong>#${rank}</strong> strongest of ${S.nA}.${win}`);
  } else {
    html += wrap(`<span style="color:var(--yellow)">In this typical draft nobody picks you.</span>`);
  }
  html += `<div style="font-size:11px;color:var(--muted);margin-top:10px">Strength here is the sum of each robot's expected output from the scouting. Captains choose mostly by strength but not always the strongest (fitted on 32 real picks); real picks also depend on fit, relationships and strategy. Seeds come from each team's strength unless you enter your real rank, and the other teams' real ranks are not known to the app.</div>`;
  out.innerHTML = html;
}

(window.APP_PARTS = window.APP_PARTS || []).push('picklist');
