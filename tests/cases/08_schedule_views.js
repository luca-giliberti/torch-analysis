// Schedule tab: Next (current match), Strength of schedule, Compare. Synthetic league of 18 teams, 24 matches.
var teams = loadSynthetic(18, 10);
matchSchedule = makeSchedule(teams, 24);
var me = matchSchedule[1].red[0];                       // a team that plays Q2
showPage('schedule'); setMyTeam(me);
var mine = matchSchedule.filter(function (m) { return m.red.concat(m.blue).indexOf(me) > -1; }).map(function (m) { return m.match; });
var list = function () { return E('schedule-list').textContent.replace(/\s+/g, ' '); };

// ── "your team" is one setting shared with the Picklist tab
t.check('your team is shared between Schedule and Picklist', E('schedule-my-team').value === me && E('picklist-my-team').value === me && picklistMyTeam === me, '');

// ── Next view
setSchedFilter('next');
t.check('Next: defaults to your first match', new RegExp('Q' + mine[0] + ' · you are on').test(list()), list().slice(0, 80));
schedSetCurrent(String(mine[0]));
t.check('Next: a match you are in, when it is the current match, is labelled "current match"', /current match/.test(list()), list().slice(0, 100));
schedSetCurrent(String(mine[0] + 1));
t.check('Next: moving the current match on shows your next one', mine[1] ? new RegExp('Q' + mine[1] + ' · you are on').test(list()) : true, list().slice(0, 80));
schedSetCurrent('999');
t.check('Next: nothing left -> a message', /No matches left/.test(list()), list().slice(0, 80));
schedSetCurrent('');
setMyTeam(''); t.check('Next: no team entered -> asks for one', /Enter your team number/.test(list()), '');
setMyTeam('77777'); t.check('Next: team not in the schedule -> says so', /isn't in the loaded schedule/.test(list()), '');
setMyTeam(me); schedSetCurrent('');
var nextPct = (list().match(/You (\d+)%/) || [])[1];
predictFromSchedule(String(mine[0])); runPrediction();
t.check('Next shows the same win chance as the Predict tab', nextPct && E('bar-red-label').textContent.indexOf(nextPct) > -1 || (100 - +nextPct) + '' === (E('bar-blue-label').textContent.match(/\d+/) || [])[0], 'next=' + nextPct + ' predict=' + E('bar-red-label').textContent);
showPage('schedule'); setSchedFilter('next');
t.check('Next lists scout notes section only when notes exist (none here)', !/What scouts wrote/.test(list()), '');

// ── Strength of schedule
setSchedFilter('strength'); sosCache = null;
t.check('Strength: shows a "working" message first', /Working out/.test(list()), list().slice(0, 60));
var S = schedStrength(); renderSchedule();
var sumE = S.teams.reduce(function (s, x) { return s + x.E; }, 0), sumEff = S.teams.reduce(function (s, x) { return s + x.effect; }, 0);
t.check('Strength: expected wins add up to 3 per match', Math.abs(sumE - 3 * 24) < 1e-6, sumE);
t.check('Strength: schedule effects add up to zero', Math.abs(sumEff) < 1e-6, sumEff);
t.check('Strength: every team in the schedule is in the table', E('schedule-list').querySelectorAll('tbody tr').length === S.teams.length && S.teams.length === 18, S.teams.length);
t.check('Strength: sorted hardest first', S.teams.every(function (x, i, a) { return i === 0 || a[i - 1].effect <= x.effect + 1e-12; }), '');
t.check('Strength: strength scores are 0-100', S.teams.every(function (x) { return x.partnerScore >= 0 && x.partnerScore <= 100 && x.oppScore >= 0 && x.oppScore <= 100; }), '');
t.check('Strength: your team gets a detail card', new RegExp('hardest of 18').test(list()), list().slice(0, 100));
var again = schedStrength(); t.check('Strength: cached, identical on repeat', again === S, '');
sosCache = null; var S2 = schedStrength();
t.check('Strength: deterministic', S2.teams[0].team === S.teams[0].team && Math.abs(S2.teams[3].effect - S.teams[3].effect) < 1e-9, '');
matchSchedule[0].red[0] = '88888'; sosCache = null; schedStrength(); schedPickSos('88888');
t.check('Strength: an unscouted team is handled and labelled', /no scouting data/.test(list()), list().slice(0, 100));

// ── Compare two teams' schedules
matchSchedule = makeSchedule(teams, 24);
setSchedFilter('compare'); schedCmpA = teams[0]; schedCmpB = teams[1]; E('sched-cmp-a').value = teams[0]; E('sched-cmp-b').value = teams[1]; renderSchedule();
t.check('Compare: shows both teams', list().indexOf(teams[0]) > -1 && list().indexOf(teams[1]) > -1 && /Together in/.test(list()), list().slice(0, 100));
schedCmpB = teams[0]; renderSchedule(); t.check('Compare: same team twice -> message', /different teams/.test(list()), '');
var boxB = E('sched-cmp-b'); boxB.value = '0' + teams[1]; boxB.dispatchEvent(new Event('input'));
t.check('Compare: a team typed with a leading zero is recognised', schedCmpB === teams[1] && !/different teams/.test(list()) && /Together in/.test(list()), 'cmpB=' + schedCmpB);
setMyTeam('0' + teams[2]);
t.check('Your team: leading zeros are dropped', scheduleMyTeam === teams[2], scheduleMyTeam);
t.check('no script errors', t.errors.length === 0, t.errors.join(' | '));
