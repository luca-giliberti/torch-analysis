// Torch Analysis: start-up
// Classic script, loaded in order by index.html (all files share one global scope).

// ── INIT───────────────────────────────────────────────────────────────────

// All parts must have loaded. A browser holding an old cached copy of one file next to a newer index.html would leave the
// app half-working, so say so (the error banner shows it) instead of failing in confusing ways.
setTimeout(() => {
  const need = ['core', 'views', 'charts', 'notes', 'navigation', 'predictor-model', 'predictor-ui', 'flags', 'picklist', 'rotation', 'schedule'];
  const missing = need.filter(p => !(window.APP_PARTS || []).includes(p));
  if (missing.length) throw new Error('Part of the app did not load (' + missing.join(', ') + '). Refresh with Ctrl+Shift+R; if it persists, a file is missing from the site.');
}, 0);
loadFromCache();
if (!Object.keys(teamStats).length) { renderRankings(); renderTeamSearch(); }     // a fresh start says what to do instead of showing a blank page
loadFlags();
predLoadSaved();
pkLoad();       // the Picklist's saved lists, draft board and avoided teams
picklistMyTeam = localStorage.getItem('frc_picklist_myteam') || '';
if (picklistMyTeam) {
  scheduleMyTeam = picklistMyTeam;      // "your team" is one setting shared by the Schedule and Picklist tabs
  ['picklist-my-team', 'schedule-my-team'].forEach(id => { const el = document.getElementById(id); if (el) el.value = picklistMyTeam; });
}
try { schedCurrent = localStorage.getItem('frc_sched_current') || ''; const _sd = document.getElementById('sched-done'); if (_sd) _sd.value = schedCurrent; } catch (e) {}
// Always re-parse from raw text so any parser improvements take effect immediately
const _savedScheduleRaw = localStorage.getItem('frc_schedule_raw');
if (_savedScheduleRaw) {
  const _ta = document.getElementById('schedule-paste');
  if (_ta) { _ta.value = _savedScheduleRaw; parseSchedulePaste(); }
} else {
  try { matchSchedule = JSON.parse(localStorage.getItem('frc_schedule') || '[]'); } catch(e) { matchSchedule = []; }
}
