// Crash test: 16 awkward datasets, every screen exercised on each. Nothing may throw.
var DATA = {
  'header only (no rows)': H + '\n',
  'only two columns': 'match_number,robot_number\n1,111\n2,111\n3,222',
  'no robot_number column': 'match_number,auto_shots\n1,5\n2,6',
  'one team, one row': csv([row(1, '111')]),
  'all zeros': csv(many(teamIds(101, 10), 4, { auto_shots: 0, teleop_shots: 0, auto_accuracy: 0, robot_accuracy: 0, robot_speed: 0, robot_agility: 0, robot_defense: 0, passed_shots: 0 })),
  'junk values': csv(many(teamIds(101, 10), 4, { auto_shots: 'abc', teleop_shots: -50, robot_accuracy: '1e9', robot_speed: 'NaN', passed_shots: '', auto_accuracy: 'NaN%', match_number: 'SF1' })),
  'team ids with letters/quotes/spaces': csv(many(['254B', 'frc1678', "9'9", '12 34', '', '0'], 5)),
  'prototype-name teams': csv(many(['constructor', '__proto__', 'toString', 'hasOwnProperty', '111', '222'], 5)),
  'BOM + CRLF + quoted commas': '﻿' + csv(many(teamIds(101, 6), 4, { notes: 'a, b, "quoted", and\nnewline' })).replace(/\n/g, '\r\n'),
  'huge notes and emoji': csv(many(teamIds(101, 4), 3, { notes: 'x'.repeat(20000) + ' 🔥🤖 <3' })),
  'stray quote in a comment (expect 20 rows)': (function () { var r = []; for (var m = 1; m <= 20; m++) r.push(row(m, '10' + (m % 4), { notes: m === 5 ? '6" wheels, fast' : m === 6 ? 'say "hi" there' : 'ok' }).replace(/"6"" wheels, fast"/, '6" wheels, fast')); return csv(r); })(),
  'quoted field then spaces before comma': H + '\n' + '1,1,111,Red,"Sam" ,e,5,5,5,5,50,3,3,0,over,0,0,0,0,"fine"',
  'duplicates only': (function () { var r = row(1, '111'); return csv([r, r, r, r, r]); })(),
  'many teams (100 x 30)': csv(many(teamIds(1000, 100), 30)),
  'one match scouted by 3 scouts': csv([row(1, '111'), row(1, '111'), row(1, '111'), row(2, '111'), row(2, '222'), row(3, '222')]),
  'negative and huge shots': csv(many(teamIds(101, 5), 6, { teleop_shots: 99999999, auto_shots: -5 })),
};

function exercise() {
  var fails = [], teams = Object.keys(teamStats);
  var T = function (name, fn) { try { fn(); } catch (e) { fails.push(name + ': ' + (e && e.message)); } };
  ['rankings', 'teams', 'compare', 'charts', 'notes', 'predict', 'rotation', 'picklist', 'schedule', 'import'].forEach(function (p) { T('page ' + p, function () { showPage(p); }); });
  T('rankings sorts', function () { [].slice.call(document.querySelectorAll('.sort-chip')).forEach(function (c) { c.click(); }); });
  T('team search', function () { E('team-search').value = '1'; renderTeamSearch(); E('team-search').value = ''; renderTeamSearch(); });
  teams.slice(0, 3).forEach(function (x) { T('team detail ' + x, function () { showDetail(x); closeDetail(); }); });
  T('team compare', function () { E('compare-a').value = teams[0] || ''; E('compare-b').value = teams[1] || ''; renderCompare(); });
  T('notes', function () { renderNotes(); if (teams[0]) { openNotesTeam(teams[0]); openNoteDetail(teams[0], 0); } });
  T('picklist', function () { renderPicklist(); ['all', 'available', 'taken', 'dnp'].forEach(setPlFilter); if (teams[0]) cycleFlag(teams[0]); renderPicklist(); });
  var ms = []; for (var i = 0; i < Math.min(12, Math.max(0, teams.length - 5)); i++) ms.push({ match: i + 1, red: teams.slice(i, i + 3), blue: teams.slice(i + 3, i + 6) });
  matchSchedule = ms;
  T('schedule views', function () { showPage('schedule'); ['all', 'mine', 'compare'].forEach(setSchedFilter); schedCmpA = teams[0] || ''; schedCmpB = teams[1] || ''; renderSchedule(); setSchedFilter('all'); });
  T('strength view', function () { showPage('schedule'); setSchedFilter('strength'); sosCache = null; schedStrength(); renderSchedule(); schedPickSos(teams[0] || ''); schedPickSos('nope'); setSchedFilter('all'); });
  T('next view', function () { showPage('schedule'); setMyTeam(teams[0] || ''); setSchedFilter('next'); schedSetCurrent('1'); schedPickMatch('3'); schedSetCurrent(''); setSchedFilter('all'); setMyTeam(''); });
  T('picklist fit', function () { showPage('picklist'); setMyTeam(teams[0] || ''); renderPicklist(); teams.slice(1, 3).forEach(function (x) { setTeamStatus(x, 'mine'); }); renderPicklist(); setPlSort('epa'); setPlFilter('mine'); setPlFilter('all'); setPlSort('fit'); resetPicklistStatuses(); setMyTeam(''); renderPicklist(); });
  T('data quality', function () { predRenderDataNotes(); predQualitySummary(); renderLoadedFiles(); predScoutAudit(); predColumnReport(); });
  T('honest backtest', function () { var res = {}; matchSchedule.slice(0, 12).forEach(function (m, i) { res[m.match] = { match: m.match, red: 20 + i * 7, blue: 90 - i * 3 }; }); predBacktest(res, true); predBacktest(res, false); predForecast(); });
  T('rotation', function () { E('rot-scouts').value = Array.from({ length: 12 }, function (_, i) { return 'S' + i; }).join('\n'); generateRotation(); });
  T('predict', function () { showPage('predict'); ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'].forEach(function (id, k) { E(id).value = teams[k] || ''; }); runPrediction(); });
  T('predict one-v-one + unknown', function () { E('red1').value = teams[0] || '1'; E('red2').value = ''; E('red3').value = ''; E('blue1').value = '99999'; E('blue2').value = ''; E('blue3').value = ''; runPrediction(); });
  T('what-if', function () { E('whatif-slot').value = '0'; E('whatif-team').value = teams[1] || '5'; predWhatIf(); });
  T('forecast', function () { E('pred-forecast-card').open = true; predForecast(); });
  T('calibration (typed)', function () { var s = 'Match,Red Score,Blue Score\n'; for (var k = 1; k <= 12; k++) s += k + ',' + ri(20, 200) + ',' + ri(20, 200) + '\n'; E('results-paste').value = s; predRunCalibration(); if (predReport && predReport.fit) predApplyCalibration(); predResetCalibration(); });
  T('calibration from OCR text', function () { var p = predParseOCRResults('Quals 1 1 2 3 4 5 6 10 20\nQuals 2 1 2 3 4 5 6 30 40'); predIngestOCRRows(p.rows, p.unreadable); });
  T('charts: every mode x every metric', function () {
    showPage('charts'); chClearTeams();
    ['compare', 'multi', 'top', 'match'].forEach(function (md) { chSetMode(md); chAddTop(5); chAvailable().forEach(function (m) { chSetMetric(m.key); ['desc', 'asc', 'team'].forEach(chSetSort); }); chAvailable().forEach(function (m) { chToggleMulti(m.key, true); }); });
    chBuildMatchSelect(); chSetMode('match');
  });
  T('charts: add/remove teams', function () { chClearTeams(); teams.slice(0, 12).forEach(chAddTeam); chRemoveTeam(chTeams[0]); chAddTeam('does-not-exist'); });
  T('export CSV', function () { exportAllCSV(); });
  T('reload from cache', function () { var before = Object.keys(teamStats).length; loadedFiles = {}; loadFromCache(); var after = Object.keys(teamStats).length; if (before !== after) throw new Error('teams ' + before + ' -> ' + after + ' after reload from cache'); });
  return fails;
}

Object.keys(DATA).forEach(function (name) {
  var fails;
  try {
    clearAllData(); predResetCalibration(); predResults = {}; chTeams = []; sosCache = null;
    addFile('f_' + name.replace(/\W+/g, '_') + '.csv', DATA[name]);
    fails = exercise();
  } catch (e) { fails = ['load threw: ' + e.message]; }
  t.check(name, fails.length === 0, fails.join(' | '));
});
t.check('no uncaught errors anywhere', t.errors.length === 0, t.errors.slice(0, 3).join(' | '));
t.check('the stray-quote dataset keeps all 20 rows', (function () { clearAllData(); addFile('q.csv', DATA['stray quote in a comment (expect 20 rows)']); return rawData.length === 20; })(), rawData.length);
