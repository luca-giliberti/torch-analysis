// Torch Analysis: Rankings, Teams, team page, Compare
// Classic script, loaded in order by index.html (all files share one global scope).

// ── RENDER RANKINGS ────────────────────────────────────────────────────────
function setSort(key) {
  currentSort = key;
  document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  renderRankings();
}

function sortKey(s) {
  const map = { epa:'epa', passing:'avgPassed', totalShots:'avgTotalShots', autoShots:'avgAutoShots', speed:'avgSpeed', accuracy:'avgAccuracy', defense:'avgDefense' };
  return map[s] || 'epa';
}

function epaClass(epa) {
  if (epa >= 60) return 'epa-high';
  if (epa >= 30) return 'epa-mid';
  return 'epa-low';
}

function renderRankings() {
  const list = document.getElementById('rankings-list');
  if (!Object.keys(teamStats).length) {
    list.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Import a CSV to see rankings</p></div>`;
    return;
  }
  const sorted = Object.values(teamStats).sort((a,b) => b[sortKey(currentSort)] - a[sortKey(currentSort)]);
  list.innerHTML = sorted.map((s, i) => `
    <div class="team-card" onclick="showDetail('${s.team}')">
      <div class="team-card-top">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="rank-num">#${i+1}</span>
          <span class="team-num">${s.team}</span>
          <span style="cursor:pointer;font-size:13px;" onclick="event.stopPropagation();cycleFlag('${s.team}');renderRankings();" title="Click to flag team">${flagEmoji(s.team) || '·'}</span>
        </div>
        <span class="epa-badge ${epaClass(s.epa)}">EPA ${s.epa}</span>
      </div>
      <div class="team-stats" style="grid-template-columns:repeat(6,1fr)">
        <div class="stat"><div class="stat-val">${s.avgTotalShots}</div><div class="stat-lbl">Shots/Match</div></div>
        <div class="stat"><div class="stat-val color-accent">${s.avgAutoShots}</div><div class="stat-lbl">Auto</div></div>
        <div class="stat"><div class="stat-val">${s.avgPassed > 0 ? s.avgPassed : '—'}</div><div class="stat-lbl">Passing</div></div>
        <div class="stat"><div class="stat-val">${speedBar(s.avgSpeed)}</div><div class="stat-lbl">Speed ${s.avgSpeed}</div></div>
        <div class="stat"><div class="stat-val">${s.avgAccuracy > 0 ? s.avgAccuracy+'%' : '—'}</div><div class="stat-lbl">Accuracy</div></div>
        <div class="stat"><div class="stat-val">${s.avgDefense > 0 ? speedBar(s.avgDefense) : '—'}</div><div class="stat-lbl">Def ${s.avgDefense > 0 ? s.avgDefense : ''}</div></div>
      </div>
    </div>
  `).join('');
}

function speedBar(v) {
  const filled = Math.round(v);
  return '●'.repeat(filled) + '○'.repeat(Math.max(0, 5-filled));
}

// ── TEAM SEARCH ────────────────────────────────────────────────────────────
function renderTeamSearch() {
  const q = document.getElementById('team-search').value.trim();
  const results = document.getElementById('team-search-results');
  const all = Object.values(teamStats).sort((a,b)=>n(a.team)-n(b.team));
  const filtered = q ? all.filter(s => s.team.includes(q)) : all;
  if (!filtered.length && !Object.keys(teamStats).length) {
    results.innerHTML = `<div class="empty"><p>Import a CSV first</p></div>`;
    return;
  }
  if (!filtered.length) {
    results.innerHTML = `<div class="empty"><p>No team found</p></div>`;
    return;
  }
  results.innerHTML = `<div class="team-list">${filtered.map(s => `
    <div class="team-card" onclick="showDetail('${s.team}')">
      <div class="team-card-top">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="team-num">${s.team}</span>
          <span style="cursor:pointer;font-size:13px;" onclick="event.stopPropagation();cycleFlag('${s.team}');renderTeamSearch();" title="Click to flag team">${flagEmoji(s.team) || '·'}</span>
        </div>
        <span class="epa-badge ${epaClass(s.epa)}">EPA ${s.epa}</span>
      </div>
      <div class="team-stats" style="grid-template-columns:repeat(5,1fr)">
        <div class="stat"><div class="stat-val">${s.avgTotalShots}</div><div class="stat-lbl">Avg Shots</div></div>
        <div class="stat"><div class="stat-val color-accent">${s.avgAutoShots}</div><div class="stat-lbl">Auto</div></div>
        <div class="stat"><div class="stat-val">${speedBar(s.avgSpeed)}</div><div class="stat-lbl">Speed ${s.avgSpeed}</div></div>
        <div class="stat"><div class="stat-val">${s.avgAccuracy > 0 ? s.avgAccuracy+'%' : '—'}</div><div class="stat-lbl">Accuracy</div></div>
        <div class="stat"><div class="stat-val">${s.avgDefense > 0 ? speedBar(s.avgDefense) : '—'}</div><div class="stat-lbl">Def ${s.avgDefense > 0 ? s.avgDefense : ''}</div></div>
      </div>
    </div>`).join('')}</div>`;
}

// ── TEAM DETAIL ────────────────────────────────────────────────────────────
function showDetail(team) {
  const s = teamStats[team];
  if (!s) return;

  const incidents = [];
  if (s.incLostComms)     incidents.push(`${s.incLostComms}× comms loss`);
  if (s.incStuck)         incidents.push(`${s.incStuck}× piece stuck`);
  if (s.incDamagedOthers) incidents.push(`${s.incDamagedOthers}× damaged others`);
  if (s.incDamagedSelf)   incidents.push(`${s.incDamagedSelf}× damaged self`);
  if (s.incFoul)          incidents.push(`${s.incFoul}× foul`);
  if (s.incTipped)        incidents.push(`${s.incTipped}× tipped`);

  const matchRows = [...s.rows].sort((a,b)=>n(a.match_number)-n(b.match_number));
  const badCols = predGet().bad;
  // an entry flagged as a typo is shown struck through and is not counted in the averages above
  const shotVal = (r, col, label) => { const v = n(r[col]); return badCols.has(r) && badCols.get(r).has(col) ? `<s style="color:var(--yellow)" title="Ignored: far above this team's other ${label} shots">${v}</s>` : v; };

  const flagSection = `<div id="flag-section-${team}" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin:8px 0;">${buildFlagSection(team)}</div>`;

  document.getElementById('team-detail-content').innerHTML = `
    <div class="detail-hero">
      <div class="detail-team-num">Team ${s.team}</div>
      <div class="detail-matches">${s.matches} matches scouted · EPA ${s.epa}</div>
      ${s.scoutEntries > s.matches || s.ignoredEntries ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">${s.scoutEntries} scout entries${s.scoutEntries > s.matches ? ', averaged so each match counts once' : ''}${s.ignoredEntries ? ` · <span style="color:var(--yellow)">${s.ignoredEntries} suspicious entr${s.ignoredEntries === 1 ? 'y' : 'ies'} ignored</span>` : ''}</div>` : ''}
    </div>
    ${flagSection}

    <div class="section-title">Scoring</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card-val">${s.avgTotalShots}</div><div class="stat-card-lbl">Avg Total Shots</div></div>
      <div class="stat-card"><div class="stat-card-val color-accent">${s.avgAutoShots}</div><div class="stat-card-lbl">Avg Auto Shots</div></div>
      <div class="stat-card"><div class="stat-card-val">${s.avgTeleShots}</div><div class="stat-card-lbl">Avg Teleop Shots</div></div>
      <div class="stat-card"><div class="stat-card-val">${s.autoAccuracy !== null ? s.autoAccuracy+'%' : '—'}</div><div class="stat-card-lbl">Auto Accuracy</div></div>
      <div class="stat-card"><div class="stat-card-val">${s.avgAccuracy > 0 ? s.avgAccuracy+'%' : '—'}</div><div class="stat-card-lbl">Robot Accuracy</div></div>
      <div class="stat-card"><div class="stat-card-val">${s.avgPassed > 0 ? s.avgPassed : '—'}</div><div class="stat-card-lbl">Avg Passing</div></div>
    </div>

    <div class="section-title">Attributes</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card-val">${s.avgSpeed || '—'}</div><div class="stat-card-lbl">Avg Speed</div></div>
      <div class="stat-card"><div class="stat-card-val">${s.avgAgility || '—'}</div><div class="stat-card-lbl">Avg Agility</div></div>
      <div class="stat-card"><div class="stat-card-val" style="font-size:14px">${s.avgDefense > 0 ? speedBar(s.avgDefense) : '—'}</div><div class="stat-card-lbl">Defense ${s.avgDefense > 0 ? s.avgDefense : ''}</div></div>
    </div>

    <div class="section-title">Abilities</div>
    <div class="ability-row">
      <span class="ability-chip ${s.abilityBump !== 'didnt' ? 'chip-yes' : 'chip-no'}">Bump: ${esc(s.abilityBump)}</span>
      <span class="ability-chip ${s.abilityTrench !== 'didnt' ? 'chip-yes' : 'chip-no'}">Trench: ${esc(s.abilityTrench)}</span>
      <span class="ability-chip ${s.abilityOutpost !== 'didnt' ? 'chip-yes' : 'chip-no'}">Outpost: ${esc(s.abilityOutpost)}</span>
    </div>

    ${incidents.length ? `
    <div class="section-title">Incidents</div>
    <div class="incident-row">${incidents.map(i=>`<span class="incident-chip">${i}</span>`).join('')}</div>` : ''}

    <div class="section-title">Match Log</div>
    ${matchRows.map(r => `
      <div class="match-row">
        <span class="match-num">Q${r.match_number}</span>
        <span class="match-alliance alliance-${(r.alliance||'').toLowerCase() === 'red' ? 'red' : 'blue'}">${esc(r.alliance||'?')}</span>
        <div class="match-details">
          <div class="match-detail-item"><span class="match-detail-val">${badCols.has(r) && (badCols.get(r).has('auto_shots') || badCols.get(r).has('teleop_shots')) ? `<s style="color:var(--yellow)" title="Ignored: far above this team's other matches">${n(r.auto_shots)+n(r.teleop_shots)}</s>` : n(r.auto_shots)+n(r.teleop_shots)}</span><span class="match-detail-lbl">shots</span></div>
          <div class="match-detail-item"><span class="match-detail-val color-accent">${shotVal(r, 'auto_shots', 'auto')}</span><span class="match-detail-lbl">auto</span></div>
          <div class="match-detail-item"><span class="match-detail-val">${n(r.robot_accuracy)>0?n(r.robot_accuracy)+'%':'—'}</span><span class="match-detail-lbl">acc</span></div>
          <div class="match-detail-item"><span class="match-detail-val">${n(r.robot_speed)||'—'}</span><span class="match-detail-lbl">spd</span></div>
        </div>
        <span class="tag">${r.username ? esc(r.username.split(' ')[0]) : ''}</span>
      </div>
    `).join('')}
  `;

  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('team-detail').style.display = 'block';
}

function closeDetail() {
  document.getElementById('team-detail').style.display = 'none';
  showPage(activePage, true);
}

// ── COMPARE ────────────────────────────────────────────────────────────────
function renderCompare() {
  const a = normTeam(document.getElementById('compare-a').value);
  const b = normTeam(document.getElementById('compare-b').value);
  const el = document.getElementById('compare-results');
  if (!a || !b) { el.innerHTML = ''; return; }
  const sa = teamStats[a], sb = teamStats[b];
  if (!sa || !sb) {
    el.innerHTML = `<p style="color:var(--muted);font-size:14px;margin-top:12px;">Team not found in data.</p>`;
    return;
  }

  const metrics = [
    { key: 'epa',          label: 'EPA' },
    { key: 'avgTotalShots', label: 'Avg Total Shots' },
    { key: 'avgAutoShots',  label: 'Avg Auto Shots' },
    { key: 'avgTeleShots',  label: 'Avg Teleop Shots' },
    { key: 'avgAccuracy',   label: 'Avg Accuracy (%)' },
    { key: 'avgSpeed',      label: 'Avg Speed' },
    { key: 'avgAgility',    label: 'Avg Agility' },
    { key: 'avgDefense',    label: 'Avg Defense' },
  ];

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;margin-bottom:12px;padding:0 4px">
      <div style="font-size:20px;font-weight:800;text-align:center;color:var(--accent)">${a}</div>
      <div style="font-size:13px;color:var(--muted);font-weight:600;align-self:center">vs</div>
      <div style="font-size:20px;font-weight:800;text-align:center;color:var(--accent2)">${b}</div>
    </div>
    <div class="compare-grid">
      ${metrics.map(m => {
        const va = sa[m.key], vb = sb[m.key];
        const aWins = va > vb, tie = va === vb;
        const lblColor = aWins ? 'var(--accent)' : tie ? 'var(--muted)' : 'var(--accent2)';
        return `
          <div class="compare-row">
            <div class="compare-val ${aWins ? 'compare-winner' : tie ? '' : 'compare-loser'}">${va}</div>
            <div class="compare-lbl" style="color:${lblColor}">${m.label}</div>
            <div class="compare-val ${!aWins && !tie ? 'compare-winner' : tie ? '' : 'compare-loser'}">${vb}</div>
          </div>`;
      }).join('')}
    </div>`;
}

(window.APP_PARTS = window.APP_PARTS || []).push('views');
