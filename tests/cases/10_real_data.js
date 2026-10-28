// Real scouting + real match scores (public results in fixtures/). Needs  -Data <folder with the scouting CSVs>.
if (!t.hasData('2026vabla_scouting_data.csv') || !t.hasData('2026chcmp_scouting_data.csv')) { t.skip('no real scouting data (pass -Data <folder>)'); }
else {
  // 1. Team numbers worked out independently in Python from the same CSVs (both events loaded)
  clearAllData();
  addFile('2026vagle_scouting_data-2.csv', t.data('2026vabla_scouting_data.csv'));     // a byte-identical copy under another name, loaded first on purpose
  addFile('2026vabla_scouting_data.csv', t.data('2026vabla_scouting_data.csv'));
  addFile('2026chcmp_scouting_data.csv', t.data('2026chcmp_scouting_data.csv'));
  t.check('1635 distinct entries (658 of the copy ignored)', rawData.length === 1635 && dupRowsRemoved === 658, rawData.length + ' / ' + dupRowsRemoved);
  var credit = {}; rawData.forEach(function (r) { credit[r._file_event] = (credit[r._file_event] || 0) + 1; });
  t.check('data is credited to the right event whichever copy loaded first', credit['2026vabla'] === 658 && !credit['2026vagle_scouting_data-2'], JSON.stringify(credit));
  var expect = { // team: [matches, auto, tele, total, accuracy, epa]
    '346': [24, 11.1, 113.6, 124.8, 76.6, 95.6], '449': [11, 31.9, 143.7, 175.6, 85.9, 150.9], '617': [12, 3.2, 8.5, 11.7, 44.8, 5.3],
    '1262': [24, 10.3, 68.4, 78.7, 67.5, 53.1], '1885': [12, 3.0, 25.8, 28.8, 62.7, 18.0], '3939': [22, 8.6, 50.5, 59.1, 67.0, 39.6],
    '4472': [11, 8.8, 59.1, 67.9, 69.8, 47.3], '5804': [22, 6.4, 14.4, 20.8, 67.2, 14.0], '9072': [11, 30.1, 84.8, 115.0, 82.3, 94.6] };
  Object.keys(expect).forEach(function (k) {
    var s = teamStats[k], e = expect[k], got = [s.matches, s.avgAutoShots, s.avgTeleShots, s.avgTotalShots, s.avgAccuracy, s.epa];
    t.check('team ' + k + ' numbers match the independent calculation', got.every(function (v, i) { return Math.abs(v - e[i]) < 0.051; }), got.join(',') + ' vs ' + e.join(','));
  });
  t.check('9072: the 365-shot typo is ignored', teamStats['9072'].ignoredEntries === 1, teamStats['9072'].ignoredEntries);

  // 2. Same-event accuracy, each match predicted without its own scouting (public results from The Blue Alliance)
  [['2026vabla', 60, 0.76], ['2026chcmp', 106, 0.74]].forEach(function (ev) {
    clearAllData(); predResetCalibration(); predResults = {};
    addFile(ev[0] + '_scouting_data.csv', t.data(ev[0] + '_scouting_data.csv'));
    E('schedule-paste').value = t.fixture(ev[0] + '_schedule.csv'); parseSchedulePaste();
    var res = predParseResults(t.fixture(ev[0] + '_results.csv')).results;
    var r = predBacktest(res, true), acc = r.defaultAcc.c / r.defaultAcc.t;
    t.check(ev[0] + ': ' + r.usable + ' of ' + ev[1] + ' matches usable', r.usable === ev[1], r.usable);
    t.check(ev[0] + ': picks the winner at least ' + Math.round(ev[2] * 100) + '% (was ' + Math.round(acc * 100) + '%)', acc >= ev[2], r.defaultAcc.c + '/' + r.defaultAcc.t);
    t.check(ev[0] + ': tuned model beats guessing the average score', r.fit && r.fit.cvRmse < 0.8 * r.naiveRmse, r.fit && (Math.round(r.fit.cvRmse) + ' vs ' + Math.round(r.naiveRmse)));
    t.check(ev[0] + ': schedule recognised as this event', predScheduleEvent() === ev[0], predScheduleEvent());
  });
  t.check('no script errors', t.errors.length === 0, t.errors.join(' | '));
}
