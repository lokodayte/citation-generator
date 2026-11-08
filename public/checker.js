// The "Check punctuation" tab.
import { checkPunctuation, applyFixes, RULES } from './punctuation.js';

const $ = sel => document.querySelector(sel);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

document.addEventListener('tabshown', e => { if (e.detail === 'check') $('#check-text').focus(); });

$('#rule-list').innerHTML = Object.values(RULES)
  .map(r => `<li><strong>${esc(r.title)}</strong> <span class="chip sev-${r.severity}">${r.severity}</span><br>${esc(r.why)}</li>`).join('');

/* ---------------------------------------------------------------- checking */

const box = $('#check-text');
const ignored = new Set();
let findings = [];

// Identifies a finding by its rule and the words around it, so "Ignore" still
// applies after edits elsewhere in the text.
const keyOf = (f, text) => `${f.rule}|${text.slice(Math.max(0, f.start - 15), f.end + 15)}`;

function excerpt(text, start, end) {
  const a = Math.max(0, start - 40), b = Math.min(text.length, end + 40);
  return `${a > 0 ? '…' : ''}${esc(text.slice(a, start))}<b>${esc(text.slice(start, end)) || '&nbsp;'}</b>${esc(text.slice(end, b))}${b < text.length ? '…' : ''}`;
}

// What the same stretch of text looks like after the fix.
function afterFix(text, f) {
  const a = Math.max(0, f.start - 40);
  const b = Math.min(text.length, Math.max(f.end, ...f.fix.map(e => e.end)) + 40);
  const local = f.fix.map(e => ({ ...e, start: e.start - a, end: e.end - a }));
  let s = text.slice(a, b);
  for (const e of [...local].sort((x, y) => y.start - x.start)) s = s.slice(0, e.start) + e.text + s.slice(e.end);
  return `${a > 0 ? '…' : ''}${esc(s)}${b < text.length ? '…' : ''}`;
}

function run() {
  const text = box.value;
  findings = checkPunctuation(text).filter(f => !ignored.has(keyOf(f, text)));
  const errors = findings.filter(f => f.severity === 'error');
  const checks = findings.length - errors.length;

  $('#check-summary').textContent = !text.trim() ? ''
    : findings.length ? [errors.length && `${errors.length} error${errors.length > 1 ? 's' : ''}`, checks && `${checks} to check`].filter(Boolean).join(' · ')
    : 'No punctuation problems found by these checks.';
  $('#fix-errors').hidden = !errors.some(f => f.fix);
  $('#check-results').hidden = !findings.length;
  if (!findings.length) return;

  // Marked-up copy of the text (overlapping findings: the first one is marked).
  let html = '', at = 0;
  findings.forEach((f, i) => {
    if (f.start < at) return;
    html += esc(text.slice(at, f.start)) + `<mark class="sev-${f.severity}" data-i="${i}" title="${esc(f.title)}">${esc(text.slice(f.start, f.end))}</mark>`;
    at = f.end;
  });
  $('#check-preview').innerHTML = html + esc(text.slice(at));

  $('#check-list').innerHTML = findings.map((f, i) => `
    <li class="finding" id="finding-${i}">
      <h3><span class="chip sev-${f.severity}">${f.severity === 'error' ? 'Error' : 'Check'}</span>${esc(f.title)}</h3>
      <div class="excerpt">${excerpt(text, f.start, f.end)}</div>
      ${f.fix ? `<div class="excerpt">→ ${afterFix(text, f)}</div>` : ''}
      <div class="why">${esc(f.why)}</div>
      <div class="actions">
        ${f.fix ? `<button type="button" data-fix="${i}">${f.severity === 'error' ? 'Fix' : 'Apply suggestion'}</button>` : ''}
        <button type="button" data-ignore="${i}">Ignore</button>
      </div>
    </li>`).join('');
}

function replaceText(next) {
  const pos = box.selectionStart;
  box.value = next;
  box.selectionStart = box.selectionEnd = Math.min(pos, next.length);
  run();
}

let timer;
box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });

$('#check-list').addEventListener('click', e => {
  const fix = e.target.closest('[data-fix]');
  const ign = e.target.closest('[data-ignore]');
  if (fix) replaceText(applyFixes(box.value, [findings[+fix.dataset.fix]]));
  if (ign) { ignored.add(keyOf(findings[+ign.dataset.ignore], box.value)); run(); }
});

$('#check-preview').addEventListener('click', e => {
  const m = e.target.closest('mark');
  if (!m) return;
  const item = $(`#finding-${m.dataset.i}`);
  item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  item.classList.add('flash');
  setTimeout(() => item.classList.remove('flash'), 1200);
});

$('#fix-errors').addEventListener('click', () => {
  replaceText(applyFixes(box.value, findings.filter(f => f.severity === 'error')));
});

$('#copy-text').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(box.value); } catch { box.select(); document.execCommand('copy'); }
  $('#copy-text').textContent = 'Copied ✓';
  setTimeout(() => { $('#copy-text').textContent = 'Copy text'; }, 1500);
});
