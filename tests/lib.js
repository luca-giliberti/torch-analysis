// Helpers shared by every test case (pasted in front of each case body). All data here is synthetic.
var E = function (id) { return document.getElementById(id); };
var H = 'id,match_number,robot_number,alliance,username,event,auto_shots,auto_accuracy,teleop_shots,passed_shots,robot_accuracy,robot_speed,robot_agility,robot_defense,ability_bump,endgame_climb_level,lost_comms,game_piece_stuck,tipped,notes';
var _seed = 9;
function rnd() { return (_seed = (_seed * 16807) % 2147483647) / 2147483647; }
function ri(a, b) { return Math.floor(a + rnd() * (b - a + 1)); }
function field(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
// one CSV line; any column can be overridden through `extra`
function row(m, team, extra) {
  var o = { id: m * 1000 + (+team || 0), match_number: m, robot_number: team, alliance: ri(0, 1) ? 'Red' : 'Blue', username: 'Sam', event: 'e',
    auto_shots: ri(0, 12), auto_accuracy: ri(0, 100), teleop_shots: ri(0, 60), passed_shots: ri(0, 8), robot_accuracy: ri(40, 100), robot_speed: ri(1, 5),
    robot_agility: ri(1, 5), robot_defense: ri(0, 1) ? ri(1, 5) : 0, ability_bump: 'over', endgame_climb_level: 0, lost_comms: 0, game_piece_stuck: 0, tipped: 0, notes: '' };
  for (var k in (extra || {})) o[k] = extra[k];
  return H.split(',').map(function (c) { return field(o[c]); }).join(',');
}
function csv(rows, header) { return (header || H) + '\n' + rows.join('\n'); }
function many(teams, matches, extra) { var r = []; for (var m = 1; m <= matches; m++) teams.forEach(function (x) { r.push(row(m, x, extra)); }); return r; }
function teamIds(n0, count) { return Array.from({ length: count }, function (_, i) { return String(n0 + i); }); }
// a schedule built from team numbers: match i has teams [i*6 .. i*6+5] (wrapping)
function makeSchedule(teams, count) {
  var ms = [];
  for (var i = 0; i < count; i++) { var pick = function (k) { return teams[(i * 6 + k) % teams.length]; }; ms.push({ match: i + 1, red: [pick(0), pick(1), pick(2)], blue: [pick(3), pick(4), pick(5)] }); }
  return ms;
}
function loadSynthetic(nTeams, nMatches) {
  clearAllData();
  var teams = teamIds(100, nTeams);
  addFile('synthetic_scouting_data.csv', csv(many(teams, nMatches)));
  return teams;
}
