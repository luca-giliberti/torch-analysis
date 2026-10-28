// variant: nochart
// The chart library is missing: a clear notice, and the rest of the app (including predictions) still works.
setTimeout(function () {
  var el = E('error-banner'), txt = el ? el.innerText.replace(/\s+/g, ' ') : '';
  t.check('a notice about the missing chart library is shown', !!el && /chart library/.test(txt), txt.slice(0, 160));
  t.check('it is a "heads up", not an error', /Heads up/.test(txt), txt.slice(0, 60));
}, 100);

var teams = loadSynthetic(8, 6);
showPage('predict');
['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'].forEach(function (id, i) { E(id).value = teams[i]; });
document.querySelector('#page-predict .btn').click();
t.check('Predict Winner still shows its result without Chart.js', getComputedStyle(E('predict-result')).display === 'block', '');
showPage('charts');
t.check('the Charts tab explains instead of failing', /chart/i.test(E('ch-area').textContent), E('ch-area').textContent.slice(0, 100));
