// Torch Analysis: lock screens and team flags
// Classic script, loaded in order by index.html (all files share one global scope).

// ── LOCK SCREENS ───────────────────────────────────────────────────────────
var aiUnlocked = false;


function requestImportPage() {
  if (aiUnlocked) { showPage('import'); return; }
  document.getElementById('ai-lock').classList.remove('hidden');
  document.getElementById('ai-lock-input').value = '';
  document.getElementById('ai-lock-err').textContent = '';
  document.getElementById('ai-lock').dataset.target = 'import';
  document.getElementById('ai-lock-title').textContent = 'Import Access Password';
  document.getElementById('ai-lock-logo').innerHTML = 'Import <span>Access</span>';
  setTimeout(function(){ document.getElementById('ai-lock-input').focus(); }, 50);
}


function submitAILock() {
  var val = document.getElementById('ai-lock-input').value;
  if (val === 'Lg121609!') {
    aiUnlocked = true;
    var target = document.getElementById('ai-lock').dataset.target || 'ai';
    document.getElementById('ai-lock').classList.add('hidden');
    showPage(target);
  } else {
    var inp = document.getElementById('ai-lock-input');
    inp.classList.remove('shake');
    void inp.offsetWidth;
    inp.classList.add('shake');
    document.getElementById('ai-lock-err').textContent = 'Incorrect password.';
    inp.value = '';
  }
}

// ── FEATURE 1: TEAM FLAGS ──────────────────────────────────────────────────
let teamFlags = {};

function saveFlags() {
  localStorage.setItem('frc_flags', JSON.stringify(teamFlags));
}

function loadFlags() {
  try { teamFlags = JSON.parse(localStorage.getItem('frc_flags') || '{}'); } catch(e) { teamFlags = {}; }
}

function flagEmoji(team) {
  const f = teamFlags[team]?.flag;
  return f === 'target' ? '🎯' : f === 'watch' ? '⚠️' : f === 'avoid' ? '❌' : '';
}

function cycleFlag(team) {
  const cur = teamFlags[team]?.flag;
  if (!cur) teamFlags[team] = { flag: 'target', note: teamFlags[team]?.note || '' };
  else if (cur === 'target') teamFlags[team].flag = 'watch';
  else if (cur === 'watch') teamFlags[team].flag = 'avoid';
  else delete teamFlags[team];
  saveFlags();
}

function setFlag(team, flag) {
  const cur = teamFlags[team]?.flag;
  const note = teamFlags[team]?.note || '';
  if (cur === flag) delete teamFlags[team];
  else teamFlags[team] = { flag, note };
  saveFlags();
  const section = document.getElementById('flag-section-' + team);
  if (section) section.innerHTML = buildFlagSection(team);
  document.querySelectorAll('[data-flag-team="' + team + '"]').forEach(el => {
    el.textContent = flagEmoji(team) || '·';
  });
}

function buildFlagSection(team) {
  const cur = teamFlags[team]?.flag;
  const note = teamFlags[team]?.note || '';
  const btn = (flag, emoji) => {
    const active = cur === flag;
    return `<button onclick="setFlag('${team}','${flag}')" style="font-size:22px;padding:8px 14px;border-radius:10px;border:2px solid ${active ? 'var(--accent)' : 'var(--border)'};background:${active ? 'var(--card2)' : 'transparent'};cursor:pointer;line-height:1;-webkit-appearance:none;">${emoji}</button>`;
  };
  return `
    <div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Flag</div>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      ${btn('target','🎯')}
      ${btn('watch','⚠️')}
      ${btn('avoid','❌')}
      ${cur ? `<span style="align-self:center;font-size:13px;color:var(--muted);margin-left:2px;">${cur.charAt(0).toUpperCase()+cur.slice(1)}</span>` : '<span style="align-self:center;font-size:13px;color:var(--muted);margin-left:2px;">No flag</span>'}
    </div>
    <input type="text" placeholder="Add a note…" value="${note.replace(/"/g,'&quot;')}"
      style="width:100%;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:13px;outline:none;-webkit-appearance:none;"
      oninput="if(!teamFlags['${team}'])teamFlags['${team}']={flag:'',note:''};teamFlags['${team}'].note=this.value;saveFlags();">`;
}

(window.APP_PARTS = window.APP_PARTS || []).push('flags');
