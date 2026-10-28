// Torch Analysis: the Notes tab
// Classic script, loaded in order by index.html (all files share one global scope).

// ── NOTES ──────────────────────────────────────────────────────────────────
let notesSelectedTeam = null;

function notesShowLevel(level) {
  ['teams','matches','detail'].forEach(l => {
    document.getElementById(`notes-level-${l}`).style.display = l === level ? 'block' : 'none';
  });
}

function notesBack(level) {
  if (level === 'teams') { notesSelectedTeam = null; notesShowLevel('teams'); }
  if (level === 'matches') { notesShowLevel('matches'); }
}

function renderNotes() {
  const el = document.getElementById('notes-list');
  const q = (document.getElementById('notes-search')?.value || '').trim();

  if (!rawData.length) {
    el.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Import a CSV to see scout notes</p></div>`;
    return;
  }

  // Group rows by team
  const byTeam = {};
  rawData.forEach(r => {
    if (!r.robot_number) return;
    if (!byTeam[r.robot_number]) byTeam[r.robot_number] = [];
    byTeam[r.robot_number].push(r);
  });

  const teams = Object.keys(byTeam)
    .filter(t => !q || t.startsWith(q))
    .sort((a,b) => n(a)-n(b));

  if (!teams.length) {
    el.innerHTML = `<div class="empty"><p>No team found</p></div>`;
    return;
  }

  el.innerHTML = teams.map(t => {
    const rows = byTeam[t];
    const matches = [...new Set(rows.map(r => r.match_number))].length;
    const scouts = [...new Set(rows.map(r => r.username).filter(Boolean))];
    const incidents = rows.reduce((acc,r) =>
      acc + n(r.lost_comms) + n(r.game_piece_stuck) + n(r.damaged_others) + n(r.damaged_self) + n(r.foul) + n(r.tipped), 0);

    return `
      <div class="notes-team-row" onclick="openNotesTeam('${t}')">
        <div class="notes-team-row-left">
          <span class="notes-team-row-num">Team ${t}</span>
          <span class="notes-team-row-meta">${matches} match${matches!==1?'es':''} · ${scouts.length} scout${scouts.length!==1?'s':''}${incidents>0?' · ⚠️ '+incidents+' incident'+(incidents!==1?'s':''):''}</span>
        </div>
        <div class="notes-team-row-right">
          <svg class="notes-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>`;
  }).join('');
}

function openNotesTeam(team) {
  notesSelectedTeam = team;
  const rows = rawData.filter(r => r.robot_number === team)
    .sort((a,b) => n(a.match_number) - n(b.match_number));

  const commentedRows = rows.filter(r => r.notes && r.notes.trim());
  const commentsSection = commentedRows.length ? `
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:4px 0 8px;">Scout Comments</div>
    ${commentedRows.map(r => `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:8px;">
        <div style="font-size:13px;color:var(--text);line-height:1.5;margin-bottom:6px;">${esc(r.notes.trim())}</div>
        <div style="font-size:11px;color:var(--muted);">Q${r.match_number} · ${esc(r._file_event || '—')} · ${esc(r.username || '—')}</div>
      </div>`).join('')}
    <div style="height:4px;"></div>
  ` : '';

  document.getElementById('notes-matches-content').innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:22px;font-weight:800">Team ${team}</div>
      <div style="font-size:13px;color:var(--muted)">${rows.length} scouting entr${rows.length!==1?'ies':'y'}</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">AI Summary</div>
      <div id="notes-ai-summary-text" style="font-size:13px;line-height:1.6;color:var(--muted);">
        ${commentedRows.length ? 'Generating summary…' : 'No comments recorded.'}
      </div>
    </div>
    ${commentsSection}
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:4px 0 8px;">Match Log</div>
    ${rows.map((r,i) => {
      const alliance = (r.alliance||'').toLowerCase();
      const incidents = [n(r.lost_comms),n(r.game_piece_stuck),n(r.damaged_others),n(r.damaged_self),n(r.foul),n(r.tipped)].reduce((a,b)=>a+b,0);
      return `
        <div class="match-row-note" onclick="openNoteDetail('${team}', ${i})">
          <div class="match-row-note-left">
            <div class="match-row-note-title">
              <span>Q${r.match_number}</span>
              <span class="match-alliance alliance-${alliance==='red'?'red':'blue'}">${esc(r.alliance||'?')}</span>
            </div>
            <div class="match-row-note-sub">
              ${esc(r.username || '—')} · <strong>${esc(r._file_event || '—')}</strong> · ${n(r.auto_shots)+n(r.teleop_shots)} shots · ${n(r.robot_accuracy)>0?n(r.robot_accuracy)+'% acc · ':''}spd ${n(r.robot_speed)||'—'}${incidents>0?' · ⚠️ '+incidents+' incident'+(incidents!==1?'s':''):''}
            </div>
            ${r.notes && r.notes.trim() ? `<div style="font-size:12px;color:var(--text);opacity:.75;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;">"${esc(r.notes.trim())}"</div>` : ''}
          </div>
          <svg class="notes-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`;
    }).join('')}`;

  notesShowLevel('matches');

  if (commentedRows.length) {
    summarizeNotesComments(commentedRows.map(r => r.notes.trim()));
  }
}

let _notesSummaryAbort = null;
async function summarizeNotesComments(comments) {
  if (_notesSummaryAbort) { _notesSummaryAbort.abort(); }
  const controller = new AbortController();
  _notesSummaryAbort = controller;

  const key = localStorage.getItem('anthropic_key') || '';
  const el = document.getElementById('notes-ai-summary-text');
  if (!el) return;
  if (!key) {
    el.textContent = 'Add an Anthropic API key in Settings to enable AI summaries.';
    return;
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: 'You are a concise FRC scouting assistant. Summarize the qualitative scout comments provided. Focus only on observations about robot behavior, strategy, strengths, and weaknesses. Do not include or reference any numerical data. Keep it to 2-4 sentences.',
        messages: [{ role: 'user', content: comments.map((c, i) => `Comment ${i+1}: ${c}`).join('\n') }]
      })
    });
    const data = await res.json();
    const live = document.getElementById('notes-ai-summary-text');
    if (live) live.textContent = (data.content && data.content[0] && data.content[0].text) || 'Could not generate summary.';
  } catch(err) {
    if (err.name === 'AbortError') return;
    const live = document.getElementById('notes-ai-summary-text');
    if (live) live.textContent = 'Error generating summary: ' + err.message;
  }
}

function openNoteDetail(team, rowIndex) {
  const rows = rawData.filter(r => r.robot_number === team)
    .sort((a,b) => n(a.match_number) - n(b.match_number));
  const r = rows[rowIndex];
  if (!r) return;

  document.getElementById('notes-detail-back-label').textContent = `Team ${team}`;

  const alliance = (r.alliance||'').toLowerCase();

  const abilities = [];
  if (r.ability_bump    && r.ability_bump    !== 'didnt') abilities.push(`Bump: <strong>${esc(r.ability_bump)}</strong>`);
  if (r.ability_trench  && r.ability_trench  !== 'didnt') abilities.push(`Trench: <strong>${esc(r.ability_trench)}</strong>`);
  if (r.ability_outpost && r.ability_outpost !== 'didnt') abilities.push(`Outpost: <strong>${esc(r.ability_outpost)}</strong>`);

  const incidents = [];
  if (n(r.lost_comms))       incidents.push('Lost comms');
  if (n(r.game_piece_stuck)) incidents.push('Piece stuck');
  if (n(r.damaged_others))   incidents.push('Damaged others');
  if (n(r.damaged_self))     incidents.push('Damaged self');
  if (n(r.foul))             incidents.push('Foul');
  if (n(r.knocked_teammate)) incidents.push('Knocked teammate');
  if (n(r.almost_tipped))    incidents.push('Almost tipped');
  if (n(r.tipped))           incidents.push('Tipped');

  document.getElementById('notes-detail-content').innerHTML = `
    <div class="note-card">
      <div class="note-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="note-team">Team ${r.robot_number}</span>
          <span class="match-alliance alliance-${alliance==='red'?'red':'blue'}">Q${r.match_number}</span>
        </div>
        <div class="note-meta">
          ${r._file_event ? `<span class="tag">${esc(r._file_event)}</span>` : ''}
        </div>
      </div>

      <div class="note-section">
        <div class="note-section-title">Scouted by</div>
        <div class="note-line">${esc(r.username || '—')} &nbsp;·&nbsp; <strong>${esc(r._file_event || 'unknown event')}</strong></div>
      </div>

      <div class="note-section">
        <div class="note-section-title">Scoring</div>
        <div class="note-body">
          <div class="note-line"><span>Auto shots:</span><strong>${n(r.auto_shots)}</strong> (${n(r.auto_accuracy)>0?n(r.auto_accuracy)+'% acc':'acc unknown'})</div>
          <div class="note-line"><span>Teleop shots:</span><strong>${n(r.teleop_shots)}</strong></div>
          <div class="note-line"><span>Total shots:</span><strong>${n(r.auto_shots)+n(r.teleop_shots)}</strong></div>
          ${n(r.robot_accuracy)>0?`<div class="note-line"><span>Robot accuracy:</span><strong>${n(r.robot_accuracy)}%</strong></div>`:''}
          ${n(r.passed_shots)>0?`<div class="note-line"><span>Passed shots:</span>${n(r.passed_shots)}</div>`:''}
        </div>
      </div>

      <div class="note-section">
        <div class="note-section-title">Robot</div>
        <div class="note-body">
          <div class="note-line"><span>Speed:</span>${n(r.robot_speed)||'—'} &nbsp;·&nbsp; <span>Agility:</span>${n(r.robot_agility)||'—'}</div>
          ${n(r.robot_defense)>0?`<div class="note-line"><span>Defense:</span>${n(r.robot_defense)}</div>`:''}
          ${n(r.robot_climbing_speed)>0?`<div class="note-line"><span>Climbing speed:</span>${n(r.robot_climbing_speed)}</div>`:''}
        </div>
      </div>

      <div class="note-section">
        <div class="note-section-title">Scout Observations</div>
        <div class="note-body">
          <div class="note-line"><span>Bump:</span><strong>${esc(r.ability_bump || '—')}</strong></div>
          <div class="note-line"><span>Trench:</span><strong>${esc(r.ability_trench || '—')}</strong></div>
          <div class="note-line"><span>Outpost:</span><strong>${esc(r.ability_outpost || '—')}</strong></div>
          ${r.endgame_climb_pos && r.endgame_climb_pos !== '0' ? `<div class="note-line"><span>Climb position:</span><strong>${esc(r.endgame_climb_pos)}</strong></div>` : ''}
          ${n(r.ball_starving_duration_ms) > 0 ? `<div class="note-line"><span>Ball starved for:</span><strong>${(n(r.ball_starving_duration_ms)/1000).toFixed(1)}s</strong></div>` : ''}
          ${n(r.refueled_duration_ms) > 0 ? `<div class="note-line"><span>Time refueling:</span><strong>${(n(r.refueled_duration_ms)/1000).toFixed(1)}s</strong></div>` : ''}
        </div>
      </div>

      <div class="note-section">
        <div class="note-section-title">Field Position</div>
        <div class="note-body">
          <div class="note-line"><span>Time in alliance zone:</span>${r.time_alliance_ms>0?(n(r.time_alliance_ms)/1000).toFixed(1)+'s':'—'}</div>
          <div class="note-line"><span>Time in neutral:</span>${r.time_neutral_ms>0?(n(r.time_neutral_ms)/1000).toFixed(1)+'s':'—'}</div>
          <div class="note-line"><span>Time in enemy zone:</span>${n(r.time_enemy_ms)>0?(n(r.time_enemy_ms)/1000).toFixed(1)+'s':'—'}</div>
        </div>
      </div>

      ${incidents.length ? `
      <div class="note-section">
        <div class="note-section-title">Incidents</div>
        <div class="note-incidents">${incidents.map(i=>`<span class="incident-chip">${i}</span>`).join('')}</div>
      </div>` : ''}

      ${r.notes && r.notes.trim() ? `
      <div class="note-section">
        <div class="note-section-title">Scout Comments</div>
        <div style="font-size:14px;color:var(--text);line-height:1.6;padding:10px 12px;background:var(--card2);border-radius:8px;border-left:3px solid var(--accent);">${esc(r.notes.trim())}</div>
      </div>` : ''}
    </div>`;

  notesShowLevel('detail');
}

(window.APP_PARTS = window.APP_PARTS || []).push('notes');
