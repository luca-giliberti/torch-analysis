// variant: syntax
// The main app script is broken on purpose: the banner (its own script) must still tell you why.
setTimeout(function () {
  var el = E('error-banner'), txt = el ? el.innerText.replace(/\s+/g, ' ') : '';
  t.check('banner shows even though the app script failed to run', !!el && getComputedStyle(el).display !== 'none', '');
  t.check('it names the syntax error', /SyntaxError/.test(txt), txt.slice(0, 200));
}, 100);
