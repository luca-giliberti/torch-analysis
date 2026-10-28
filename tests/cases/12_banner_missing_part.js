// variant: missingpart
// One of the app's script files is missing (an old cached copy, a bad deploy): the banner must say which part.
setTimeout(function () {
  var el = E('error-banner'), txt = el ? el.innerText.replace(/\s+/g, ' ') : '';
  t.check('banner appears', !!el && getComputedStyle(el).display !== 'none', '');
  t.check('it names the missing part and how to fix it', /did not load \(rotation\)/.test(txt) && /Ctrl\+Shift\+R/.test(txt), txt.slice(0, 220));
}, 100);
