// The error banner must stay hidden when nothing is wrong, and appear for real errors (each listed once).
t.check('a fresh start with no data tells you to import (not a blank page)', /Import a CSV/.test(E('rankings-list').textContent) && /Import a CSV/.test(E('team-search-results').textContent), E('rankings-list').textContent.slice(0, 60));
t.check('no banner on a normal load', !E('error-banner'), E('error-banner') ? E('error-banner').innerText.replace(/\s+/g, ' ') : '');

setTimeout(function () { throw new Error('boom from a timer'); }, 0);
var b1 = document.createElement('button'); b1.setAttribute('onclick', 'undefinedFunction()'); document.body.appendChild(b1); b1.click();
var b2 = document.createElement('button'); b2.setAttribute('onclick', 'null.x'); document.body.appendChild(b2); b2.click(); b2.click();
Promise.reject(new Error('rejected promise'));

setTimeout(function () {
  var el = E('error-banner');
  t.check('banner appears', !!el && getComputedStyle(el).display !== 'none', '');
  var txt = el ? el.innerText.replace(/\s+/g, ' ') : '';
  t.check('lists a timer error', txt.indexOf('boom from a timer') > -1, txt.slice(0, 200));
  t.check('lists a button-handler error', txt.indexOf('undefinedFunction is not defined') > -1, txt.slice(0, 200));
  t.check('lists a rejected promise', txt.indexOf('rejected promise') > -1, txt.slice(0, 200));
  t.check('the same error is listed once', (txt.match(/Cannot read properties of null/g) || []).length === 1, txt);
  t.check('has a copy button and a hide button', !!el && /Copy details/.test(txt) && /✕/.test(txt), '');
}, 250);
// the harness waits 350 ms before it finishes, so the checks above are recorded in time
