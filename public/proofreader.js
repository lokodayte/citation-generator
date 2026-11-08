// The "Proofread" tab.
import { proofread, textStats, splitSentences, citationsStart, CATEGORIES, PROOF_RULES } from './proofread.js';
import { applyFixes, RULES as PUNCT_RULES } from './punctuation.js';
import { languageToolCheck, shiftFindings, LanguageToolError } from './languagetool.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

const box = $('#proof-text');
const MAX_LISTED = 300;

let speller = null, extra = new Set(), common = new Map(), loading = null;
const dictionary = new Set(store.get('proofread.dictionary', []));
const hiddenCats = new Set(store.get('proofread.hidden', []));
const offRules = new Set(store.get('proofread.off', []));
const ignored = new Set();
let findings = [], visible = [];
let ltFindings = [], ltText = null, ltBusy = null;
let lastText = '';

/* ------------------------------------------------------------- dictionary */

function loadDictionary() {
  loading ??= (async () => {
    $('#proof-summary').textContent = 'Loading the dictionary…';
    try {
      const [aff, dic, words, frequent, mod] = await Promise.all([
        fetch('vendor/en_US.aff').then(r => r.text()), fetch('vendor/en_US.dic').then(r => r.text()),
        fetch('vendor/en_US-70.txt').then(r => r.text()), fetch('vendor/en_common.txt').then(r => r.text()),
        import('./vendor/nspell.js'),
      ]);
      extra = new Set(words.split('\n').filter(Boolean));
      let tier = -1;
      for (const line of frequent.split('\n')) { if (line.startsWith('#')) tier++; else if (line) common.set(line, tier); }
      speller = mod.default(aff, dic);
    } catch {
      $('#proof-spell-note').textContent = 'The spelling dictionary couldn’t be loaded, so only common misspellings are checked. Reload the page to try again.';
    }
    run();
  })();
  return loading;
}

/* -------------------------------------------------------------- utilities */

// Identifies a finding by its rule and the words around it, so "Ignore" still
// applies after edits elsewhere in the text.
const keyOf = (f, text) => `${f.rule}|${text.slice(Math.max(0, f.start - 15), f.end + 15)}`;
const ruleTitle = id => id.startsWith('lt:') ? `LanguageTool: ${id.slice(3)}` : (PROOF_RULES[id] || PUNCT_RULES[id])?.title || id;

function excerpt(text, start, end) {
  const a = Math.max(0, start - 40), b = Math.min(text.length, end + 40);
  return `${a > 0 ? '…' : ''}${esc(text.slice(a, start))}<b>${esc(text.slice(start, end)) || '&nbsp;'}</b>${esc(text.slice(end, b))}${b < text.length ? '…' : ''}`;
}

function afterFix(text, fix) {
  const lo = Math.min(...fix.map(e => e.start)), hi = Math.max(...fix.map(e => e.end));
  const a = Math.max(0, lo - 40), b = Math.min(text.length, hi + 40);
  let s = text.slice(a, b);
  for (const e of [...fix].sort((x, y) => y.start - x.start)) s = s.slice(0, e.start - a) + e.text + s.slice(e.end - a);
  return `${a > 0 ? '…' : ''}${esc(s)}${b < text.length ? '…' : ''}`;
}

const minutes = m => m < 1 ? 'under 1 min' : `${Math.round(m)} min`;
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/* -------------------------------------------------------------------- run */

function run() {
  const text = box.value;
  if (ltText !== null && text !== ltText) { ltFindings = shiftFindings(ltFindings, ltText, text); ltText = text; }
  if (text !== lastText) { stopReading(); lastText = text; try { sessionStorage.setItem('proofread.text', text); } catch { /* ignore */ } }

  let local = proofread(text, { speller, extra, common, dictionary });
  // LanguageTool adds what the local rules don't already cover. For a word the
  // dictionary doesn't know, its suggestions use context ("buyed" → "bought"), so they replace ours.
  const ltSpell = ltFindings.filter(f => f.category === 'spelling');
  local = local.filter(f => !(f.rule === 'spelling' && ltSpell.some(l => l.start === f.start && l.end === f.end)));
  const lt = ltFindings.filter(f => !local.some(o => o.start < f.end && o.end > f.start) && !(f.word && dictionary.has(f.word)));
  findings = [...local, ...lt]
    .filter(f => !offRules.has(f.rule) && !ignored.has(keyOf(f, text)))
    .sort((a, b) => a.start - b.start || (a.severity === 'error' ? -1 : 1));
  visible = findings.filter(f => !hiddenCats.has(f.category));

  renderStats(text);
  renderSummary(text);
  const cut = citationsStart(text);
  $('#proof-cited-note').textContent = cut >= 0
    ? `Your “${text.slice(cut).trim().split('\n')[0].trim()}” list isn’t checked: its entries follow their own format. To make or check an entry, use the Cite a source tab.` : '';
  renderFilters();
  renderOff();
  $('#proof-results').hidden = !text.trim();
  if (!text.trim()) return;
  if (!reading) renderPreview(text);
  renderList(text);
}

function renderStats(full) {
  // Word counts leave out the Works Cited list, as instructors' word limits usually do.
  const cut = citationsStart(full);
  const text = cut >= 0 ? full.slice(0, cut) : full;
  const s = textStats(text);
  if (!s.words) { $('#proof-stats').innerHTML = ''; return; }
  const items = [
    plural(s.words, 'word'), plural(s.sentences, 'sentence'), plural(s.paragraphs, 'paragraph'),
    s.sentences ? `${s.avgSentence.toFixed(1)} words per sentence (longest ${s.longest})` : '',
    `${minutes(s.readingMinutes)} to read, ${minutes(s.speakingMinutes)} to say aloud`,
    s.grade == null ? '' : `reading level ≈ grade ${Math.max(1, Math.round(s.grade))} (Flesch–Kincaid)`,
    cut >= 0 ? 'not counting the Works Cited list' : '',
  ].filter(Boolean);
  $('#proof-stats').innerHTML = items.map(i => `<span>${esc(i)}</span>`).join('');
}

function renderSummary(text) {
  const errors = visible.filter(f => f.severity === 'error').length;
  const checks = visible.length - errors;
  const hidden = findings.length - visible.length;
  let msg = '';
  if (text.trim()) {
    msg = visible.length
      ? [errors && plural(errors, 'error'), checks && `${checks.toLocaleString()} to check`].filter(Boolean).join(' · ')
      : 'No problems found by these checks.';
    if (hidden) msg += ` (${hidden.toLocaleString()} more in hidden categories)`;
    if (loading && !speller && !$('#proof-spell-note').textContent) msg += ' · loading the dictionary…';
  }
  $('#proof-summary').textContent = msg;
  $('#proof-fix').hidden = !visible.some(f => f.severity === 'error' && f.fix);
}

function renderFilters() {
  const counts = {};
  for (const f of findings) counts[f.category] = (counts[f.category] || 0) + 1;
  $('#proof-filters').innerHTML = Object.entries(CATEGORIES).map(([id, name]) =>
    `<button type="button" class="filter cat-${id}" data-cat="${id}" aria-pressed="${!hiddenCats.has(id)}">${esc(name)} <b>${counts[id] || 0}</b></button>`).join('');
}

function renderOff() {
  const off = [...offRules];
  $('#proof-off').innerHTML = off.length
    ? `Turned off: ${off.map(id => `${esc(ruleTitle(id))} <button type="button" class="linkish" data-on="${esc(id)}">turn back on</button>`).join(' · ')}`
    : '';
}

function renderPreview(text) {
  let html = '', at = 0;
  visible.forEach((f, i) => {
    if (f.start < at) return; // overlapping: the first one is marked
    html += esc(text.slice(at, f.start)) + `<mark class="sev-${f.severity}" data-i="${i}" title="${esc(f.title)}">${esc(text.slice(f.start, f.end))}</mark>`;
    at = f.end;
  });
  $('#proof-preview').innerHTML = html + esc(text.slice(at));
}

function renderList(text) {
  const shown = visible.slice(0, MAX_LISTED);
  $('#proof-list').innerHTML = shown.map((f, i) => {
    const buttons = [];
    if (f.fix) buttons.push(`<button type="button" data-fix="${i}">${f.severity === 'error' ? 'Fix' : 'Apply suggestion'}</button>`);
    (f.options || []).forEach((o, k) => buttons.push(`<button type="button" data-fix="${i}" data-opt="${k}">→ ${esc(o.text)}</button>`));
    buttons.push(`<button type="button" data-ignore="${i}">Ignore</button>`);
    if (f.rule === 'spelling' || (f.word && f.source)) buttons.push(`<button type="button" data-add="${i}">Add to dictionary</button>`);
    if ((f.severity === 'check' || f.source) && f.rule !== 'spelling') buttons.push(`<button type="button" class="linkish" data-off="${i}">Turn off this check</button>`);
    return `
    <li class="finding" id="pf-${i}">
      <h3><span class="chip sev-${f.severity}">${f.severity === 'error' ? 'Error' : 'Check'}</span><span class="cat cat-${f.category}">${esc(CATEGORIES[f.category])}</span>${esc(f.title)}</h3>
      <div class="excerpt">${excerpt(text, f.start, f.end)}</div>
      ${f.fix ? `<div class="excerpt">→ ${afterFix(text, f.fix)}</div>` : ''}
      <div class="why">${esc(f.why)}${f.source ? ` <span class="source">Suggested by <a href="https://languagetool.org" target="_blank" rel="noopener">LanguageTool</a>.</span>` : ''}</div>
      <div class="actions">${buttons.join('')}</div>
    </li>`;
  }).join('') + (visible.length > MAX_LISTED ? `<li class="help">Showing the first ${MAX_LISTED} of ${visible.length}. Fix or hide some to see the rest.</li>` : '');
}

/* ---------------------------------------------------------------- editing */

function replaceText(next) {
  const pos = box.selectionStart;
  box.value = next;
  box.selectionStart = box.selectionEnd = Math.min(pos, next.length);
  run();
}

let timer;
box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });

$('#proof-list').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const f = visible[+(btn.dataset.fix ?? btn.dataset.ignore ?? btn.dataset.add ?? btn.dataset.off)];
  if (!f) return;
  if (btn.dataset.fix !== undefined) {
    const fix = btn.dataset.opt !== undefined ? f.options[+btn.dataset.opt].fix : f.fix;
    replaceText(applyFixes(box.value, [{ fix }]));
  } else if (btn.dataset.ignore !== undefined) {
    ignored.add(keyOf(f, box.value)); run();
  } else if (btn.dataset.add !== undefined) {
    dictionary.add((f.word || box.value.slice(f.start, f.end)).toLowerCase().replace(/’/g, "'"));
    store.set('proofread.dictionary', [...dictionary]); run();
  } else if (btn.dataset.off !== undefined) {
    offRules.add(f.rule); store.set('proofread.off', [...offRules]); run();
  }
});

$('#proof-preview').addEventListener('click', e => {
  if (reading) {
    const s = e.target.closest('[data-s]');
    if (s) startReading(+s.dataset.s);
    return;
  }
  const m = e.target.closest('mark');
  const item = m && $(`#pf-${m.dataset.i}`);
  if (!item) return;
  item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  item.classList.add('flash');
  setTimeout(() => item.classList.remove('flash'), 1200);
});

$('#proof-filters').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const cat = b.dataset.cat;
  if (hiddenCats.has(cat)) hiddenCats.delete(cat); else hiddenCats.add(cat);
  store.set('proofread.hidden', [...hiddenCats]);
  run();
});

$('#proof-off').addEventListener('click', e => {
  const b = e.target.closest('[data-on]');
  if (!b) return;
  offRules.delete(b.dataset.on); store.set('proofread.off', [...offRules]); run();
});

// Fixing one error can reveal another ("could of went" → "could have went" → "could have gone"),
// and overlapping fixes wait for the next pass, so repeat until nothing is left to fix.
$('#proof-fix').addEventListener('click', () => {
  let text = box.value;
  for (let pass = 0; pass < 5; pass++) {
    const fixes = proofread(text, { speller, extra, common, dictionary })
      .filter(f => f.severity === 'error' && f.fix && !hiddenCats.has(f.category) && !offRules.has(f.rule) && !ignored.has(keyOf(f, text)));
    if (!fixes.length) break;
    text = applyFixes(text, fixes);
  }
  replaceText(text);
});

$('#proof-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(box.value); } catch { box.select(); document.execCommand('copy'); }
  $('#proof-copy').textContent = 'Copied ✓';
  setTimeout(() => { $('#proof-copy').textContent = 'Copy text'; }, 1500);
});

/* ------------------------------------------------------------ LanguageTool */

$('#proof-lt').addEventListener('click', async () => {
  const text = box.value;
  if (!text.trim() || ltBusy) return;
  const status = $('#proof-lt-status');
  ltBusy = new AbortController();
  $('#proof-lt').disabled = true;
  status.textContent = 'Checking with LanguageTool…';
  try {
    const found = await languageToolCheck(text, { signal: ltBusy.signal });
    // The writer may have kept typing while the check ran.
    ltFindings = shiftFindings(found, text, box.value);
    ltText = box.value;
    run();
    const added = findings.filter(f => f.source).length;
    status.textContent = added ? `LanguageTool found ${plural(added, 'more possible problem')}. Re-run it after big changes.` : 'LanguageTool found nothing more.';
  } catch (e) {
    status.textContent = e instanceof LanguageToolError ? e.message : 'The LanguageTool check failed. Try again.';
  } finally {
    ltBusy = null;
    $('#proof-lt').disabled = false;
  }
});

/* -------------------------------------------------------------- read aloud */

let reading = null;
const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
if (!canSpeak) $('#proof-read').hidden = true;

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => /^en(-|_)US/i.test(v.lang));
  return voices.find(v => v.default) || voices.find(v => v.localService) || voices[0] || null;
}

function renderReading() {
  const { text, sents, i } = reading;
  let html = '', at = 0;
  sents.forEach((s, k) => {
    html += esc(text.slice(at, s.start)) + `<span data-s="${k}" class="sent${k === i ? ' reading' : ''}">${esc(text.slice(s.start, s.end))}</span>`;
    at = s.end;
  });
  $('#proof-preview').innerHTML = html + esc(text.slice(at));
  $('#proof-preview').querySelector('.reading')?.scrollIntoView({ block: 'nearest' });
}

function speakNext() {
  if (!reading) return;
  if (reading.i >= reading.sents.length) { stopReading(); return; }
  const s = reading.sents[reading.i];
  const u = new SpeechSynthesisUtterance(reading.text.slice(s.start, s.end));
  u.lang = 'en-US';
  u.rate = +$('#proof-rate').value;
  const v = pickVoice();
  if (v) u.voice = v;
  const token = reading;
  u.onend = () => { if (reading === token) { reading.i++; renderReading(); speakNext(); } };
  u.onerror = e => { if (reading === token && e.error !== 'interrupted' && e.error !== 'canceled') stopReading(); };
  speechSynthesis.speak(u);
}

function startReading(from = 0) {
  const text = box.value;
  const sents = splitSentences(text);
  if (!sents.length) return;
  speechSynthesis.cancel();
  reading = { text, sents, i: from };
  $('#proof-read').textContent = '■ Stop reading';
  $('#proof-read').setAttribute('aria-pressed', 'true');
  $('#proof-results').hidden = false;
  renderReading();
  speakNext();
}

function stopReading() {
  if (!reading) return;
  reading = null;
  speechSynthesis.cancel();
  $('#proof-read').textContent = '▶ Read aloud';
  $('#proof-read').setAttribute('aria-pressed', 'false');
  if (box.value.trim()) renderPreview(box.value);
}

$('#proof-read').addEventListener('click', () => (reading ? stopReading() : startReading()));

/* -------------------------------------------------------------------- tab */

$('#proof-rules').innerHTML = Object.entries(CATEGORIES).filter(([id]) => id !== 'punctuation').map(([id, name]) => {
  const rules = Object.values(PROOF_RULES).filter(r => r.category === id);
  return `<li><strong>${esc(name)}:</strong> ${rules.map(r => esc(r.title.replace(/^“(.*)”$/, '$1'))).join('; ')}.</li>`;
}).join('') + `<li><strong>Punctuation:</strong> everything in the Check punctuation tab, plus extra spaces.</li>`;

function init() {
  loadDictionary();
  try { if (!box.value) box.value = sessionStorage.getItem('proofread.text') || ''; } catch { /* ignore */ }
  run();
}
document.addEventListener('tabshown', e => {
  if (e.detail === 'proof') { init(); box.focus(); } else stopReading();
});
if (!$('#view-proof').hidden) init();
