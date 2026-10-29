// The draft: the rules (engine), the live board, and the simulation from a half-played draft. Synthetic league of 30 teams.
var teams = loadSynthetic(30, 8);
var body = function () { return E('pk-body').textContent.replace(/\s+/g, ' '); };
showPage('picklist'); setMyTeam('');
var byR = function (S, list) { return list.slice().sort(function (a, b) { return S.R[b] - S.R[a]; }); };

// ══ the rules of the draft ══
var S0 = draftSetup(0);
t.check('8 alliances from 30 teams, captains are the 8 strongest', S0.nA === 8 && S0.captains.length === 8 && S0.pool.length === 22 &&
  S0.captains.every(function (c) { return S0.pool.every(function (p) { return S0.R[c] >= S0.R[p] - 1e-9; }); }), S0.nA + ' / ' + S0.pool.length);
var d = draftOnce(S0, null, null);
var all = [].concat.apply([], d.alliances);
t.check('every alliance gets a captain and two picks, nobody twice', d.alliances.length === 8 && d.alliances.every(function (a) { return a.length === 3; }) && new Set(all).size === 24, d.alliances.length + ' alliances, ' + new Set(all).size + ' distinct');
t.check('pick order is alliances 1..8 then 8..1', d.log.map(function (x) { return x.seed; }).join() === '1,2,3,4,5,6,7,8,8,7,6,5,4,3,2,1', d.log.map(function (x) { return x.seed; }).join());
var strongestOther = byR(S0, S0.order.slice(1))[0];
t.check('seed 1 can pick the strongest team left even when it is a lower captain', d.log[0].team === strongestOther && S0.captains.indexOf(strongestOther) > 0, d.log[0].team + ' vs ' + strongestOther);
t.check('the picked captain is no longer a captain; the best unaligned team took the last seat', d.alliances.map(function (a) { return a[0]; }).indexOf(strongestOther) === -1 && d.alliances.map(function (a) { return a[0]; }).indexOf(S0.pool[0]) > -1, '');
t.check('after the shuffle there are still 8 alliances with distinct captains', new Set(d.alliances.map(function (a) { return a[0]; })).size === 8, '');
var S8 = draftSetup(0); S8.R = Object.assign({}, S8.R); S8.order.forEach(function (x, i) { S8.R[x] = 150 * Math.pow(0.9, i); });      // a realistic spread
var hits = 0, N = 300, rng = predRng(11), top8 = S8.order[1];
for (var i = 0; i < N; i++) { if (draftOnce(S8, rng, null).log[0].team === top8) hits++; }
t.check('seed 1 picks the strongest team most of the time but not always', hits / N > 0.15 && hits / N < 0.97, Math.round(100 * hits / N) + '%');
var d2 = draftOnce(S0, predRng(5), null), d3 = draftOnce(S0, predRng(5), null);
t.check('same random seed, same draft', JSON.stringify(d2.alliances) === JSON.stringify(d3.alliances), '');
t.check('real captains can be given; they become seats 1..8 and everyone else the pool', (function () { var caps = S0.order.slice(10, 18), S = draftSetup(0, caps); return S.captains.join() === caps.join() && S.pool.length === 22 && S.pool.every(function (p) { return caps.indexOf(p) === -1; }); })(), '');
var st0 = draftNew(S0), part = draftClone(st0); draftApply(part, S0.pool[0]);
t.check('a half-played draft can be copied and continued without touching the original', st0.step === 0 && part.step === 1 && draftContinue(draftClone(part), predRng(1), null) !== undefined && part.step === 1, '');
var eng = draftNew(S0); draftContinue(eng, null, null);
t.check('continuing from the start gives the same draft as playing it whole', JSON.stringify(eng.alliances) === JSON.stringify(d.alliances), '');

// ══ the live board ══
var me = S0.captains[2];                                     // you are the seed-3 captain
setMyTeam(me); pkTab('board');
t.check('before the draft: eight captain boxes filled with the estimate', E('pk-cap-0') && E('pk-cap-7') && E('pk-cap-0').value === S0.captains[0] && E('pk-cap-7').value === S0.captains[7], '');
E('pk-cap-1').value = '0' + S0.captains[1]; E('pk-cap-3').value = S0.captains[2];
pkStart(); t.check('two seats with the same team is refused', !pk.started && /twice/.test(body()), body().slice(0, 160));
E('pk-cap-3').value = S0.captains[3]; pkStart();
t.check('start: the board shows whose turn it is', pk.started && /Round 1 · pick 1 of 8/.test(body()) && /Alliance 1 \(T/.test(body()), body().slice(0, 160));
t.check('the board has 8 alliances', E('pk-body').querySelectorAll('tbody tr').length === 8, '');

var st = pkReplay(), first = draftChoose(st.S, draftEligible(st, draftInfo(st)), null);
var pool0 = S0.pool[0];
pkRecord(S0.captains[0]); t.check('a team already on an alliance cannot be picked again', /already on an alliance/.test(body()) && pk.log.length === 0, body().slice(0, 100));
pkRecord(pool0); t.check('a pick is recorded and the turn moves on', pk.log.length === 1 && /pick 2 of 8/.test(body()), body().slice(0, 100));
t.check('the picked team shows as taken for the Schedule tab', teamStatus[pool0] === 'taken', teamStatus[pool0]);
pkUndo(); t.check('undo takes the last pick back', pk.log.length === 0 && !teamStatus[pool0] && /pick 1 of 8/.test(body()), '');

// picking a lower captain: that alliance disappears and the best unaligned team takes the last seat
var lower = S0.captains[5];
pkRecord(lower);
st = pkReplay();
t.check('picking a lower captain removes that alliance; still 8 alliances', st.alliances.length === 8 && st.alliances.every(function (a) { return a[0] !== lower; }) && st.alliances[0][1] === lower, st.alliances.map(function (a) { return a[0]; }).join());
t.check('the new last captain is the best unaligned team and can be corrected (✎)', st.alliances[7][0] === S0.pool[0] && st.alliances[7].cascadeAt === 0 && /✎/.test(E('pk-body').innerHTML), st.alliances[7][0]);
var realNew = S0.pool[3]; window.prompt = function () { return realNew; };
pkEditCaptain(0);
t.check('correcting the new captain replaces them (and the old one goes back to the pool)', pkReplay().alliances[7][0] === realNew && pkReplay().unaligned.indexOf(S0.pool[0]) > -1, pkReplay().alliances[7][0]);
pkUndo(); pkUndo(); t.check('undo works through a correction', pk.log.length === 0, JSON.stringify(pk.log));

// play to my turn
pkRecord(S0.pool[0]); pkRecord(S0.pool[1]);
t.check('on your own turn it says so and recommends teams by fit', /Your turn to pick/.test(body()) && /Best fits right now/.test(body()) && E('pk-body').querySelectorAll('div[onclick^="pkRecord"]').length === 5, body().slice(0, 140));
var rec = E('pk-body').querySelector('div[onclick^="pkRecord"]').getAttribute('onclick').match(/'(\w+)'/)[1];
pkRecord(rec); t.check('tapping a recommendation records it, and you are the one who picked', pkReplay().alliances[2][1] === rec && pkReplay().alliances[2][0] === me, rec);
for (var k = 0; k < 5; k++) { var s = pkReplay(); var inf = draftInfo(s); pkRecord(draftEligible(s, inf)[0]); }
t.check('round 1 ends and round 2 starts at alliance 8', /Round 2 · pick 1 of 8/.test(body()) && /Alliance 8 \(T/.test(body()), body().slice(0, 100));

// ── simulation from here
var html = pkProjectionBody(pkReplay());
t.check('the simulation knows you are a captain with a pick to come', /alliance <strong[^>]*>3<\/strong>/.test(html) && /second<\/strong> pick/.test(html), html.slice(0, 200));
t.check('it lists targets with the chance each is still there', /still there/.test(html) && /Your likely alliance/.test(html), '');
t.check('it ends with a typical ending and your alliance strength', /A typical ending/.test(html) && /strongest of 8/.test(html), '');
t.check('the same board gives the same numbers (deterministic)', pkProjectionBody(pkReplay()) === html, '');
var before = JSON.stringify(pk.log); pkProjectionBody(pkReplay());
t.check('simulating never changes the real board', JSON.stringify(pk.log) === before, '');

// ── finish the draft
var guard = 0; while (draftInfo(pkReplay()) && guard++ < 20) { var s2 = pkReplay(); pkRecord(draftEligible(s2, draftInfo(s2))[0]); }
t.check('when all 16 picks are in, the draft is over and the final table is shown', /The draft is over/.test(body()) && /How it ended/.test(body()), body().slice(0, 100));
t.check('every alliance has three teams', pkReplay().alliances.every(function (a) { return a.length === 3; }), '');
pkRestart(); t.check('start over clears the board', !pk.started && pk.log.length === 0 && /Set up the draft/.test(body()), '');

// ── you are not a captain
var weak = S0.order[S0.order.length - 1]; setMyTeam(weak); pkTab('board');
E('pk-cap-0').value = S0.captains[0]; pkStart();
var h2 = pkProjectionBody(pkReplay());
t.check('a non-captain gets the chance of being picked, and why it is low when it is', /Chance of being picked/.test(h2) && /not a captain/.test(h2) && /Why so low/.test(h2), h2.slice(0, 200));
var nums = ['Round 1', 'Round 2', 'Becomes a captain', 'Not picked'].map(function (k) { return +((h2.match(new RegExp(k + ': <strong[^>]*>(\\d+)%')) || [])[1] || 0); });
t.check('those chances add up to 100%', Math.abs(nums[0] + nums[1] + nums[2] + nums[3] - 100) <= 3, nums.join('/'));

// ── a very strong lower captain
pkRestart(); var star = S0.captains[4]; setMyTeam(star); pkTab('board'); pkStart();
var sb = pkReplay(); sb.S.R[star] = 5000;                      // by far the strongest (changes only this copy of the ratings)
t.check('a very strong lower captain is picked by alliance 1 in the engine and warned about', draftOnce(sb.S, null, null).meTaken === 1, '');
t.check('the simulation card warns when a higher alliance may pick you', (function () { return /higher alliance picks you/.test(pkProjectionBody(Object.assign(draftNew(sb.S), {}))); })(), '');

// ── edge cases
pkRestart(); setMyTeam(''); pkTab('board'); t.check('no team entered -> asks for one', /Enter your team number/.test(body()), body().slice(0, 100));
loadSynthetic(4, 4); setMyTeam('100'); pkTab('board'); t.check('too few teams still shows a board setup without crashing', /Set up the draft/.test(body()), body().slice(0, 80));
clearAllData(); t.check('no data -> asks for it', /Import scouting data/.test(E('pk-body').textContent), '');
t.check('no script errors', t.errors.length === 0, t.errors.join(' | '));
