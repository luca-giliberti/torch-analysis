// Picklist: first-pick and second-pick lists, your own order, avoided teams, the planned first pick, saving.
var teams = loadSynthetic(14, 10), me = teams[0];
showPage('picklist'); setMyTeam(me);
var body = function () { return E('pk-body').textContent.replace(/\s+/g, ' '); };
var rows = function () { return E('pk-body').querySelectorAll('button[onclick^="pkAvoid"]').length; };

// ── first-pick list
pkTab('first');
var L = pkLists(), fit = plFitFor([me]);
var bestByGain = Object.entries(fit.byTeam).sort(function (a, b) { return b[1].gain - a[1].gain; }).map(function (e) { return e[0]; });
t.check('the list has every other team, ranked by gain', L.list1.length === 13 && L.list1.map(function (x) { return x.team; }).join() === bestByGain.join(), L.list1.length);
t.check('your own team is never listed', L.list1.every(function (x) { return x.team !== me; }) && !new RegExp('T' + me + '(?!\\d)').test(body()), '');
t.check('the page shows the list (15 rows at first, then "show all")', rows() === 13 || rows() === 15, rows());
t.check('First pick tab is selected', E('pk-tab-first').classList.contains('active') && !E('pk-tab-board').classList.contains('active'), '');

// ── your own order
var a = L.list1[0].team, b = L.list1[1].team;
pkMove('first', b, -1);
t.check('▲ puts a team above the one before it', pkLists().list1[0].team === b && pkLists().list1[1].team === a, pkLists().list1.slice(0, 2).map(function (x) { return x.team; }).join());
pkMove('first', b, -1); t.check('the top team cannot go higher', pkLists().list1[0].team === b, '');
pkMove('first', b, 1); t.check('▼ moves it back down', pkLists().list1[0].team === a, '');
t.check('"back to the suggested order" button appears once you have reordered', /Back to the suggested order/.test(body()), '');
pkResetOrder('first'); t.check('resetting restores the suggestion', pkLists().list1[0].team === bestByGain[0] && !pk.order1, '');

// ── avoid
var victim = L.list1[2].team;
pkAvoid(victim);
t.check('an avoided team leaves the list and is shown under "Avoiding"', pkLists().list1.every(function (x) { return x.team !== victim; }) && /Avoiding/.test(body()), '');
t.check('the Schedule tab badge status is set (dnp)', teamStatus[victim] === 'dnp', teamStatus[victim]);
pkRestore(victim); t.check('putting it back restores it', pkLists().list1.some(function (x) { return x.team === victim; }) && !teamStatus[victim], '');

// ── second-pick list builds around the first pick
pkTab('second');
var L2 = pkLists();
t.check('by default it is built around the top of the first-pick list', L2.first === L.list1[0].team && /Built around your first pick/.test(body()), L2.first);
t.check('the first pick itself is not in the second-pick list', L2.list2.every(function (x) { return x.team !== L2.first; }) && L2.list2.length === 12, L2.list2.length);
var starred = L.list1[3].team; pkPlan(starred);
var L3 = pkLists();
t.check('starring a team re-builds the second-pick list around it', L3.first === starred && L3.list2.every(function (x) { return x.team !== starred; }) && L3.list2.some(function (x) { return x.team === L.list1[0].team; }), L3.first);
t.check('the second-pick gains are for a three-robot alliance (differ from the first-pick gains)', L3.list2[0].gain !== pkLists().list1[0].gain, '');
pkPlan(starred); t.check('starring again clears the plan', !pk.plan1 && pkLists().first === L.list1[0].team, '');

// ── saving
pkAvoid(teams[5]); pkMove('first', pkLists().list1[1].team, -1);
var saved = JSON.parse(JSON.stringify(pk));
pk = { tab: 'first', captains: [], log: [], started: false, order1: null, order2: null, avoid: [], plan1: '', more1: false, more2: false };
pkLoad();
t.check('avoided teams and your own order are remembered after a reload', pk.avoid.indexOf(teams[5]) > -1 && JSON.stringify(pk.order1) === JSON.stringify(saved.order1), JSON.stringify(pk.avoid));

// ── no team entered
pkResetOrder('first'); setMyTeam('');
pkTab('first'); t.check('without your team it still lists (against an average captain) and says to enter it', /Enter your team number/.test(body()) && rows() > 0, body().slice(0, 100));
t.check('no script errors', t.errors.length === 0, t.errors.join(' | '));
