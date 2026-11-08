// Switching between the tools. Each tab other than the first has its own
// address (#check, #proofread) so it can be bookmarked or shared.
const HASH = { check: '#check', proof: '#proofread' };
const buttons = [...document.querySelectorAll('.tabs [data-view]')];

export function show(view) {
  for (const btn of buttons) {
    const on = btn.dataset.view === view;
    btn.setAttribute('aria-selected', String(on));
    document.getElementById(`view-${btn.dataset.view}`).hidden = !on;
  }
  const hash = HASH[view];
  if (hash && location.hash !== hash) history.replaceState(null, '', hash);
  if (!hash && Object.values(HASH).includes(location.hash)) history.replaceState(null, '', location.pathname);
  document.dispatchEvent(new CustomEvent('tabshown', { detail: view }));
}

for (const btn of buttons) btn.addEventListener('click', () => show(btn.dataset.view));
const fromHash = () => Object.entries(HASH).find(([, h]) => h === location.hash)?.[0];
if (fromHash()) show(fromHash());
window.addEventListener('hashchange', () => { if (fromHash()) show(fromHash()); });
