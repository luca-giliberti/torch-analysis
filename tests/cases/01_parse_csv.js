// CSV reading: quotes, stray quotes, line breaks inside comments, BOM, hostile ids.
var p = parseCSV('a,b\n1,"x, y"\n2,"line1\nline2"\n3,plain');
t.check('quoted comma stays in one field', p.length === 3 && p[0].b === 'x, y', JSON.stringify(p[0]));
t.check('line break inside quotes stays in its row', p[1].b === 'line1\nline2', JSON.stringify(p[1]));

var stray = parseCSV('a,b\n1,6" wheels, fast\n2,say "hi" there\n3,ok');
t.check('a stray quote does not swallow the next rows', stray.length === 3, 'rows=' + stray.length);

var bom = parseCSV('﻿a,b\r\n1,2\r\n3,4\r\n');
t.check('BOM + CRLF', bom.length === 2 && Object.keys(bom[0]).join() === 'a,b', Object.keys(bom[0]).join());

var spaced = parseCSV('a,b\n1,"Sam" ,x');
t.check('quoted field followed by spaces', spaced.length === 1 && spaced[0].a === '1', JSON.stringify(spaced));

var hostile = parseCSV('match_number,robot_number\n1,constructor\n2,__proto__\n3,toString\n4,254B\n5,<img src=x>');
t.check('ids that collide with built-in object names are made safe', hostile[0].robot_number === '_constructor' && hostile[1].robot_number === '___proto__' && hostile[2].robot_number === '_toString', hostile.map(function (r) { return r.robot_number; }).join());
t.check('letters are kept, markup is stripped from ids', hostile[3].robot_number === '254B' && hostile[4].robot_number === 'img_srcx', hostile[3].robot_number + ' / ' + hostile[4].robot_number);
t.check('esc() escapes markup', esc('<b onclick="x">&\'') === '&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;', esc('<b onclick="x">&\''));

// hostile scout comment must be shown as text, never run
clearAllData();
addFile('xss.csv', csv([row(1, '111', { notes: '<img src=x onerror="window.__pwned=1">' }), row(2, '111', { username: '<scr' + 'ipt>window.__pwned=1</scr' + 'ipt>' })]));
openNotesTeam('111'); showDetail('111');
t.check('scout comments and names cannot inject script', !window.__pwned && !document.querySelector('img[src="x"]'), 'pwned=' + window.__pwned);
