// Picklist: alliance suggestions ("who adds the most to my alliance") and the statuses.
var teams = loadSynthetic(14, 10), me = teams[0];
showPage('picklist'); setMyTeam(me);
var sug = function () { return E('picklist-suggestion').textContent.replace(/\s+/g, ' '); };

var fit = plFit();
t.check('a fit exists for a not-yet-full alliance', !!fit && Object.keys(fit.byTeam).length === 13, fit && Object.keys(fit.byTeam).length);
t.check('suggestion card shows the first pick', /Best first pick/.test(sug()) && E('picklist-suggestion').style.display !== 'none', sug().slice(0, 80));
var best = Object.entries(fit.byTeam).sort(function (a, b) { return b[1].gain - a[1].gain; })[0][0];
t.check('the top suggestion is the team with the biggest gain', new RegExp('T' + best + ' ').test(sug()), 'best=' + best + ' card=' + sug().slice(0, 120));
t.check('your own team is never suggested or listed', !new RegExp('T' + me + '(?!\\d)').test(E('picklist-list').textContent), '');
t.check('list is sorted by gain (best fit first) by default', E('picklist-list').children[0].textContent.indexOf('T' + best) > -1, E('picklist-list').children[0].textContent.slice(0, 40));

setTeamStatus(best, 'mine');
t.check('marking a pick moves the card on to the second pick', /Best second pick/.test(sug()) && /T/.test(sug()) && sug().indexOf('Alliance so far: T' + me + ' + T' + best) > -1, sug().slice(0, 140));
var second = Object.keys(plFit().byTeam).filter(function (x) { return x !== best; })[0];
setTeamStatus(second, 'mine');
t.check('full alliance -> "alliance is full" message', /alliance is full/i.test(sug()), sug().slice(0, 100));
setPlFilter('mine');
t.check('"Mine" filter shows the two picks', E('picklist-list').children.length === 2, E('picklist-list').children.length);
setPlFilter('all'); setPlSort('epa');
t.check('EPA sort works', E('picklist-list').children.length === 13, '');
setTeamStatus(second, 'mine'); setTeamStatus(best, 'mine');       // tapping again un-picks
t.check('tapping a pick again frees the slot', /Best first pick/.test(sug()), sug().slice(0, 60));
setTeamStatus(teams[3], 'taken'); setTeamStatus(teams[4], 'dnp'); setPlSort('fit');
setPlFilter('available'); var avail = E('picklist-list').children.length;
setPlFilter('taken'); var taken = E('picklist-list').children.length;
setPlFilter('dnp'); var dnp = E('picklist-list').children.length;
t.check('Available / Taken / DNP filters', avail === 11 && taken === 1 && dnp === 1, avail + '/' + taken + '/' + dnp);
t.check('taken and do-not-pick teams are not suggested', !/T104 /.test(sug()) && !/T103 /.test(sug()), sug().slice(0, 140));
resetPicklistStatuses(); setPlFilter('all');
t.check('reset clears every status', E('picklist-list').children.length === 13, '');
setMyTeam(''); t.check('without your team it still suggests (against an average captain)', /Enter your team number/.test(sug()), sug().slice(0, 100));
t.check('no script errors', t.errors.length === 0, t.errors.join(' | '));
