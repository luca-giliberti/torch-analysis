// Torch Analysis: scout rotation
// Classic script, loaded in order by index.html (all files share one global scope).

// ── ROTATION ─────────────────────────────────────────────────────────────

function autoFillScouts() {
  if (!rawData || !rawData.length) { alert('No data loaded — import CSV data first'); return; }
  const nameFields = ['username','Username','user_name','scout','Scout','scouter','name','Name','scout_name'];
  const usedField = nameFields.find(f => rawData.some(r => r[f]));
  if (!usedField) { alert('No scout name column found in data'); return; }
  const scouts = [...new Set(rawData.map(r => r[usedField]).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  document.getElementById('rot-scouts').value = scouts.join('\n');
}

function generateRotation() {
  const output = document.getElementById('rotation-output');
  const scouts = (document.getElementById('rot-scouts').value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const blockSize = Math.max(1, parseInt(document.getElementById('rot-block-size').value) || 6);

  if (!scouts.length) { output.innerHTML = '<div class="empty"><p>Enter at least one scout name</p></div>'; return; }
  if (!matchSchedule.length) { output.innerHTML = '<div class="empty"><p>Load a match schedule on the Schedule tab first</p></div>'; return; }

  const N = scouts.length;
  const positions = ['Blue 1','Blue 2','Blue 3','Red 1','Red 2','Red 3'];
  const numBlocks = Math.ceil(matchSchedule.length / blockSize);

  // Parse per-scout block limits (optional): "Name: 2"
  const limits = {};
  (document.getElementById('rot-limits').value || '').split('\n').forEach(line => {
    const colon = line.lastIndexOf(':');
    if (colon < 0) return;
    const name = line.slice(0, colon).trim();
    const max = parseInt(line.slice(colon + 1).trim());
    if (name && !isNaN(max) && max > 0) limits[name] = max;
  });
  const usedBlocks = {};
  scouts.forEach(s => { usedBlocks[s] = 0; });

  // Round-robin queue. Each block: pick 6 from the front who are still under
  // their limit, push them to the back. N >= 12 guarantees no back-to-back blocks.
  let queue = [...scouts];
  const blockScoutsList = [];
  for (let B = 0; B < numBlocks; B++) {
    const picked = [];
    // Walk the queue in order, take scouts who still have capacity
    const tempQueue = [...queue];
    for (const scout of tempQueue) {
      if (picked.length === 6) break;
      if (!limits[scout] || usedBlocks[scout] < limits[scout]) picked.push(scout);
    }
    // If not enough scouts remain (everyone limited out), fill with '—'
    while (picked.length < 6) picked.push('—');

    picked.filter(s => s !== '—').forEach(s => { usedBlocks[s]++; });
    blockScoutsList.push([...picked]);

    // Rebuild queue: remove this block's scouts, re-add those who still have capacity
    queue = queue.filter(s => !picked.includes(s));
    picked.filter(s => s !== '—').forEach(s => {
      if (!limits[s] || usedBlocks[s] < limits[s]) queue.push(s);
      // else: limit hit — scout is done, stays out of queue
    });
  }

  const rows = matchSchedule.map((match, matchIdx) => {
    const blockIdx = Math.floor(matchIdx / blockSize);
    const assignments = positions.map((pos, posIdx) => ({
      pos,
      scout: blockScoutsList[blockIdx][posIdx]
    }));
    return { match: match.match, blockIdx, assignments };
  });

  renderRotationOutput(rows, scouts, N < 12);
}

function renderRotationOutput(rows, scouts, warnOverlap) {
  const output = document.getElementById('rotation-output');
  if (!rows || !rows.length) return;

  const thBase = 'padding:8px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid var(--border);white-space:nowrap;text-align:center;';
  const thMatch = thBase + 'background:var(--card2);color:var(--muted);';
  const thBlue  = thBase + 'background:rgba(59,130,246,.15);color:#3b82f6;';
  const thRed   = thBase + 'background:rgba(224,85,85,.15);color:#e05555;';

  const tableRows = rows.map(row => {
    const bAlpha = row.blockIdx % 2 === 0 ? '.07' : '.14';
    const rAlpha = row.blockIdx % 2 === 0 ? '.07' : '.14';
    const [b1,b2,b3,r1,r2,r3] = row.assignments;
    const bc = (a) => `<td style="padding:7px 6px;border-bottom:1px solid var(--border);text-align:center;background:rgba(59,130,246,${bAlpha});font-size:12px;color:var(--text);">${esc(a.scout)}</td>`;
    const rc = (a) => `<td style="padding:7px 6px;border-bottom:1px solid var(--border);text-align:center;background:rgba(224,85,85,${rAlpha});font-size:12px;color:var(--text);">${esc(a.scout)}</td>`;
    return `<tr>
      <td style="padding:7px 6px;border-bottom:1px solid var(--border);text-align:center;font-weight:700;color:var(--accent);font-size:12px;white-space:nowrap;">Q${row.match}</td>
      ${bc(b1)}${bc(b2)}${bc(b3)}${rc(r1)}${rc(r2)}${rc(r3)}
    </tr>`;
  }).join('');

  // Summary: match counts per scout
  const counts = {};
  scouts.forEach(s => { counts[s] = 0; });
  rows.forEach(row => row.assignments.forEach(a => { counts[a.scout] = (counts[a.scout] || 0) + 1; }));
  const summaryRows = scouts.map(s =>
    `<tr><td style="padding:5px 8px;border-bottom:1px solid var(--border);font-size:13px;">${esc(s)}</td><td style="padding:5px 8px;border-bottom:1px solid var(--border);font-size:13px;text-align:center;font-weight:600;color:var(--accent);">${counts[s]}</td></tr>`
  ).join('');

  const warnBanner = warnOverlap
    ? `<div style="background:rgba(234,179,8,.12);border:1px solid rgba(234,179,8,.4);border-radius:var(--radius);padding:10px 12px;margin-bottom:12px;font-size:12px;color:#ca8a04;">
        ⚠️ Fewer than 12 scouts — some scouts may appear in back-to-back blocks. Add more scouts to fully avoid repeats.
       </div>` : '';

  output.innerHTML = `${warnBanner}
    <div style="overflow-x:auto;border-radius:var(--radius);border:1px solid var(--border);background:var(--card);margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>
          <th style="${thMatch}">Match</th>
          <th style="${thBlue}">Blue 1</th>
          <th style="${thBlue}">Blue 2</th>
          <th style="${thBlue}">Blue 3</th>
          <th style="${thRed}">Red 1</th>
          <th style="${thRed}">Red 2</th>
          <th style="${thRed}">Red 3</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <details style="margin-bottom:16px;">
      <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--muted);padding:4px 0;">Match counts per scout</summary>
      <div style="border-radius:var(--radius);border:1px solid var(--border);background:var(--card);margin-top:8px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid var(--border);background:var(--card2);color:var(--muted);text-align:left;">Scout</th>
            <th style="padding:6px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid var(--border);background:var(--card2);color:var(--muted);text-align:center;">Matches</th>
          </tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>
    </details>`;
}

(window.APP_PARTS = window.APP_PARTS || []).push('rotation');
