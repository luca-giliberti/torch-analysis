// Torch Analysis: page switching
// Classic script, loaded in order by index.html (all files share one global scope).

// ── NAVIGATION ─────────────────────────────────────────────────────────────
function showPage(page, skipActive) {
  if (!skipActive) activePage = page;
  document.getElementById('team-detail').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
  const el = document.getElementById('page-' + page);
  if (el) { el.style.display = 'block'; el.classList.add('active'); }
  document.querySelectorAll('.nav-btn').forEach((b, i) => {
    const pages = ['rankings','teams','compare','charts','notes','predict','rotation','picklist','schedule','import'];
    b.classList.toggle('active', pages[i] === page);
  });
  if (page === 'picklist') renderPicklist();
  if (page === 'schedule') renderSchedule();
  if (page === 'predict') predRenderPageExtras();
  if (page === 'charts') chRender();
  // rotation re-render not needed — table persists in DOM
}

(window.APP_PARTS = window.APP_PARTS || []).push('navigation');
