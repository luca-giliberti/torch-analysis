// Alliance selection simulation. Synthetic league of 30 teams.
var teams = loadSynthetic(30, 8);
var out = function () { return E('draft-output').textContent.replace(/\s+/g, ' '); };
showPage('picklist');
var byR = function (S, list) { return list.slice().sort(function (a, b) { return S.R[b] - S.R[a]; }); };

// ── the rules of the draft itself
setMyTeam('');
var S0 = draftSetup(0);
t.check('8 alliances from 30 teams, captains are the 8 strongest', S0.nA === 8 && S0.captains.length === 8 && S0.pool.length === 22 &&
  S0.captains.every(function (c) { return S0.pool.every(function (p) { return S0.R[c] >= S0.R[p] - 1e-9; }); }), S0.nA + ' / ' + S0.pool.length);
var d = draftOnce(S0, null, null);
var all = [].concat.apply([], d.alliances);
t.check('every alliance gets a captain and two picks, nobody twice', d.alliances.length === 8 && d.alliances.every(function (a) { return a.length === 3; }) && new Set(all).size === 24, d.alliances.length + ' alliances, ' + all.length + ' / ' + new Set(all).size);
t.check('pick order is seeds 1..8 then 8..1', d.log.map(function (x) { return x.seed; }).join() === '1,2,3,4,5,6,7,8,8,7,6,5,4,3,2,1', d.log.map(function (x) { return x.seed; }).join());

// a captain may pick a lower captain (the strongest team left); that alliance disappears and the best unaligned team replaces it
var strongestOther = byR(S0, S0.order.slice(1))[0];
t.check('seed 1 can pick the strongest team left even when it is a lower captain', d.log[0].team === strongestOther && S0.captains.indexOf(strongestOther) > 0, d.log[0].team + ' vs ' + strongestOther);
t.check('the picked captain is no longer a captain; the best unaligned team took the last seat', d.alliances.map(function (a) { return a[0]; }).indexOf(strongestOther) === -1 && d.alliances.map(function (a) { return a[0]; }).indexOf(S0.pool[0]) > -1, d.alliances.map(function (a) { return a[0]; }).join());
t.check('after the shuffle there are still 8 alliances with distinct captains', new Set(d.alliances.map(function (a) { return a[0]; })).size === 8, '');
// a draft where nobody can be picked out of order: captains far stronger than the rest still follow the rules
var S5 = draftSetup(0); S5.R = Object.assign({}, S5.R); S5.pool.forEach(function (p) { S5.R[p] = 1; }); S5.captains.forEach(function (c, i) { S5.R[c] = 1000 - i * 100; });
var d5 = draftOnce(S5, null, null);
t.check('with captains far stronger than the pool, seed 1 takes seed 2, then 2 (now old seed 3) takes the next captain...', d5.log[0].team === S5.captains[1], d5.log[0].team);

// choosing is by strength but not strictly the strongest (the real picks were the strongest available only 14 of 32 times)
var S8 = draftSetup(0); S8.R = Object.assign({}, S8.R); S8.order.forEach(function (x, i) { S8.R[x] = 150 * Math.pow(0.9, i); });       // a realistic spread: each team 10% weaker than the one above
var hits = 0, N = 300, rng = predRng(11), top8 = S8.order[1];
for (var i = 0; i < N; i++) { if (draftOnce(S8, rng, null).log[0].team === top8) hits++; }
t.check('seed 1 picks the strongest team most of the time but not always', hits / N > 0.15 && hits / N < 0.97, Math.round(100 * hits / N) + '%');
var d2 = draftOnce(S0, predRng(5), null), d3 = draftOnce(S0, predRng(5), null);
t.check('same random seed, same draft', JSON.stringify(d2.alliances) === JSON.stringify(d3.alliances), '');

// ── you are a captain
var strongest = S0.captains[0]; setMyTeam(strongest);
var S1 = draftSetup(0), cap = S1.captains.indexOf(strongest) + 1;
t.check('your strongest team is seed 1', cap === 1, cap);
draftRender(S1, ''); var a1 = out();
t.check('captain view says which seed you are', /seed 1 of 8/.test(a1), a1.slice(0, 90));
t.check('seed 1 can never be picked by a higher seed, so no such warning', !/higher seed picks you/.test(a1), '');
t.check('captain view lists first-pick targets with availability', /still available/.test(a1) && /Your likely alliance/.test(a1), a1.slice(0, 260));
t.check('a typical draft table with 8 alliances is shown, yours highlighted', E('draft-output').querySelectorAll('tbody tr').length === 8, E('draft-output').querySelectorAll('tbody tr').length);
t.check('it says how strong your alliance is and its win chance against the best other', /strongest of 8/.test(a1) && /win chance is about \d+%/.test(a1), a1.slice(-330));
draftRender(S1, ''); t.check('deterministic (same numbers on a rerun)', out() === a1, '');

// ── you are a captain who a higher seed will want
var star = S0.captains[4]; setMyTeam(star);
var S6 = draftSetup(0); S6.R = Object.assign({}, S6.R); S6.R[star] = 5000;            // by far the strongest robot
var d6 = draftOnce(S6, null, null);
t.check('a very strong lower captain gets picked by seed 1, and says so', d6.meTaken === 1, d6.meTaken);
draftRender(S6, ''); t.check('the captain view warns that a higher seed picks you', /higher seed picks you/.test(out()), out().slice(0, 200));

// ── you are not a captain
var weakest = S0.order[S0.order.length - 1]; setMyTeam(weakest);
var S2 = draftSetup(0); draftRender(S2, ''); var a2 = out();
t.check('non-captain view gives the chance of being picked', /Chance of being picked/.test(a2) && /Not picked/.test(a2), a2.slice(0, 200));
var n1 = +(a2.match(/Round 1: (\d+)%/) || [])[1], n2 = +(a2.match(/Round 2: (\d+)%/) || [])[1], np = +((a2.match(/Becomes a captain: (\d+)%/) || [])[1] || 0), nn = +(a2.match(/Not picked: (\d+)%/) || [])[1];
t.check('the chances add up to 100%', Math.abs(n1 + n2 + np + nn - 100) <= 3, [n1, n2, np, nn].join('/'));
t.check('the weakest team is rarely picked, and the page explains why', nn >= 50 && /Why so low/.test(a2) && /by strength/.test(a2), [n1, n2, np, nn].join('/'));
// a strong team ranked just outside the top 8 is picked, or promoted when a captain above gets picked
var firstOut = S0.pool[0]; setMyTeam(firstOut);
var S7 = draftSetup(0), d7 = draftOnce(S7, null, null);
t.check('the best team outside the top 8 becomes a captain when a captain is picked', d7.alliances.some(function (a) { return a[0] === firstOut; }), d7.alliances.map(function (a) { return a[0]; }).join());
draftRender(S7, ''); var a7 = out();
t.check('and the view says how likely that is', /Becomes a captain: \d+%/.test(a7) || /Round 1: \d+%/.test(a7), a7.slice(0, 220));

// ── entering your real rank moves you
var mid = S0.order[15]; setMyTeam(mid);
var S3 = draftSetup(3);
t.check('entering rank 3 makes you seed 3', S3.captains[2] === mid && S3.captains.length === 8, S3.captains.join());
t.check('the rest of the order is unchanged', S3.order.filter(function (x) { return x !== mid; }).join() === S0.order.filter(function (x) { return x !== mid; }).join(), '');
draftRender(S3, '3'); t.check('rank 3 view is a captain view', /seed 3 of 8/.test(out()), out().slice(0, 90));

// ── edge cases
setMyTeam('55555'); var S4 = draftSetup(0);
t.check('an unscouted team of yours joins the draft as an average robot', S4.order.indexOf('55555') > -1 && S4.order.length === 31, S4.order.length);
setMyTeam(''); E('draft-rank').value = ''; draftRun(); t.check('no team entered -> asks for one', /Enter your team number/.test(out()), out());
loadSynthetic(4, 4); setMyTeam('100'); draftRun(); t.check('too few teams -> says so', /not enough teams/.test(out()), out());
clearAllData(); draftRun(); t.check('no data -> asks for it', /Load scouting data/.test(out()), out());
t.check('no script errors', t.errors.length === 0, t.errors.join(' | '));
