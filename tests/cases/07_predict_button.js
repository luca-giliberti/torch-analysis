// The Predict Winner button in every situation a person can put it in.
var teams = loadSynthetic(10, 8);
function setTeams(v) { ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'].forEach(function (id, i) { var el = E(id); el.value = v[i] || ''; el.dispatchEvent(new Event('input')); }); }
function press(label, expectShown) {
  var before = t.errors.length; showPage('predict');
  document.querySelector('#page-predict .btn').click();
  var shown = getComputedStyle(E('predict-result')).display === 'block';
  t.check(label + (expectShown ? ': shows a result' : ': shows the "enter a team" message'), shown === expectShown && t.errors.length === before, 'shown=' + shown + ' err=' + E('predict-err').textContent + ' newErrors=' + t.errors.slice(before));
}
t.check('the button is labelled Predict Winner', /Predict Winner/.test(document.querySelector('#page-predict .btn').textContent), '');
setTeams(teams.slice(0, 6)); press('six known teams', true);
t.check('a winner and a confidence bar are filled in', /Red \d+%/.test(E('bar-red-label').textContent) && /Blue \d+%/.test(E('bar-blue-label').textContent) && /confidence/.test(E('predict-confidence').textContent), E('bar-red-label').textContent);
setTeams([teams[0], '', '', teams[1], '', '']); press('one robot against one', true);
setTeams([teams[0], teams[1], teams[2], '', '', '']); press('only one alliance entered', false);
setTeams([teams[0], teams[1], teams[2], '99991', '99992', '99993']); press('unknown opponents', true);
setTeams(teams.slice(0, 6)); E('red1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
t.check('Enter in a team box also predicts', getComputedStyle(E('predict-result')).display === 'block', '');

// the same with no scouting data at all, and with the chart library gone
clearAllData(); setTeams(['1', '2', '3', '4', '5', '6']); press('no data loaded', true);
var Real = window.Chart; window.Chart = undefined;
setTeams(['1', '2', '3', '4', '5', '6']); press('chart library missing', true);
window.Chart = Real;
