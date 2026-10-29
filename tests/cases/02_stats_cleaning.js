// Team numbers on every tab come from cleaned per-match values. The expected numbers below are worked out by hand.
clearAllData();
var rows = [];
// Team 111: six ordinary matches (10 auto + 40 tele at 80%), then match 7 with a 365-shot typo in auto
for (var m = 1; m <= 6; m++) rows.push(row(m, '111', { auto_shots: 10, teleop_shots: 40, robot_accuracy: 80, passed_shots: 0, robot_speed: 3, robot_agility: 3 }));
rows.push(row(7, '111', { auto_shots: 365, teleop_shots: 40, robot_accuracy: 80, passed_shots: 0, robot_speed: 3, robot_agility: 3 }));
rows.push(rows[0]);      // an exact duplicate of match 1 (the same file loaded twice, say)
// Team 222: match 1 scouted by two people (averaged), matches 2-4 by one
rows.push(row(1, '222', { username: 'A', auto_shots: 0, teleop_shots: 60, robot_accuracy: 70, passed_shots: 0 }));
rows.push(row(1, '222', { username: 'B', auto_shots: 10, teleop_shots: 100, robot_accuracy: 90, passed_shots: 0 }));
for (m = 2; m <= 4; m++) rows.push(row(m, '222', { auto_shots: 5, teleop_shots: 80, robot_accuracy: 80, passed_shots: 0 }));
// Team 333: accuracy never recorded (0) -> left out, not counted as 0%
for (m = 1; m <= 3; m++) rows.push(row(m, '333', { auto_shots: 0, teleop_shots: 20, robot_accuracy: 0, passed_shots: 0 }));
addFile('hand.csv', csv(rows));

var near = function (a, b) { return Math.abs(a - b) < 0.051; };
var a = teamStats['111'], b = teamStats['222'], c = teamStats['333'];
t.check('exact duplicate row ignored', dupRowsRemoved === 1, 'dupRowsRemoved=' + dupRowsRemoved);
t.check('111: 7 matches', a.matches === 7, a.matches);
t.check('111: typo ignored, auto = 10', near(a.avgAutoShots, 10), a.avgAutoShots);
t.check('111: teleop = 40, total = 50', near(a.avgTeleShots, 40) && near(a.avgTotalShots, 50), a.avgTeleShots + ' / ' + a.avgTotalShots);
t.check('111: EPA = 50 x 80% = 40', near(a.epa, 40), a.epa);
t.check('111: one suspicious entry reported', a.ignoredEntries === 1 && predGet().flags.length === 1, a.ignoredEntries + ' / ' + predGet().flags.length);
t.check('222: two scouts in one match count as one match', b.matches === 4 && b.scoutEntries === 5, b.matches + ' matches, ' + b.scoutEntries + ' entries');
t.check('222: scouts averaged (auto 5, tele 80, acc 80)', near(b.avgAutoShots, 5) && near(b.avgTeleShots, 80) && near(b.avgAccuracy, 80), b.avgAutoShots + ' / ' + b.avgTeleShots + ' / ' + b.avgAccuracy);
t.check('222: EPA = 85 x 80% = 68', near(b.epa, 68), b.epa);
t.check('333: unrecorded accuracy is not 0%', c.avgAccuracy === 0 && near(c.epa, 20), c.avgAccuracy + ' / ' + c.epa);

// the Rankings tab, team page, Compare and Picklist show these same numbers
showPage('rankings');
t.check('Rankings tab shows the cleaned EPA', E('rankings-list').textContent.indexOf('EPA 68') > -1 && E('rankings-list').textContent.indexOf('EPA 40') > -1, E('rankings-list').textContent.slice(0, 120));
showDetail('111');
t.check('team page strikes through the ignored typo (in the shots total and in auto)', document.querySelectorAll('#team-detail-content s').length === 2, document.querySelectorAll('#team-detail-content s').length);
closeDetail();
E('compare-a').value = '111'; E('compare-b').value = '222'; renderCompare();
t.check('Compare tab uses cleaned numbers', E('compare-results').textContent.indexOf('68') > -1, '');
E('compare-a').value = '0111'; E('compare-b').value = '00222'; renderCompare();
t.check('Compare: leading zeros are ignored (0111 is team 111)', E('compare-results').textContent.indexOf('68') > -1, E('compare-results').textContent.slice(0, 80));
showPage('picklist'); pkTab('first'); renderPicklist();
t.check('Picklist lists the cleaned EPA', E('pk-body').textContent.indexOf('EPA 68') > -1 && E('pk-body').textContent.indexOf('EPA 40') > -1, E('pk-body').textContent.slice(0, 120));

// the charts use the same observations
var ob = chObs('111');
t.check('charts see 7 observations for team 111, one with the auto typo left out', ob.length === 7 && ob.filter(function (o) { return o.auto === null; }).length === 1, ob.length);

// ids with spaces must not merge into a different team's number
clearAllData();
addFile('ids.csv', csv([row(1, '12 34'), row(2, '12 34'), row(1, '1234')]));
t.check('"12 34" does not become team 1234', !!teamStats['12_34'] && teamStats['1234'].matches === 1, Object.keys(teamStats).join());
