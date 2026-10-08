import {
  TYPES, parseDate, dateToInput, todayDate, parseAuthorLine, authorToLine,
  convertTitle, formatCitation, styleNotes, toHTML, toText,
} from './format.js';

const $ = sel => document.querySelector(sel);
const form = $('#fields');
const f = name => form.elements[name];

const state = {
  style: 'mla',
  sources: {},
  warnings: [],
  hints: [],
  rawTitle: '',
  titles: { mla: '', apa: '' },      // each style keeps its own casing
  recased: { mla: false, apa: false }, // casing was changed automatically
  edited: { mla: false, apa: false },  // user has edited this style's title
};

for (const [value, label] of Object.entries(TYPES)) f('type').add(new Option(label, value));

/* ------------------------------------------------------------- lookup */

$('#lookup').addEventListener('submit', async e => {
  e.preventDefault();
  const url = $('#url').value.trim();
  if (!url) return;
  const btn = $('#go');
  btn.disabled = true;
  btn.textContent = 'Fetching…';
  hideError();
  try {
    const res = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code });
    load(data);
  } catch (err) {
    showError(err.message);
    load({ fields: { type: 'webpage', url, authors: [] }, sources: {}, warnings: [], hints: [] });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate';
  }
});

$('#manual').addEventListener('click', () => {
  hideError();
  load({ fields: { type: 'webpage', url: $('#url').value.trim(), authors: [] }, sources: {}, warnings: [], hints: [] });
  f('title').focus();
});

function showError(msg) {
  const el = $('#error');
  el.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = 'Couldn’t read that page.';
  el.append(strong, msg, ' You can still fill in the citation by hand below.');
  el.hidden = false;
}
function hideError() { $('#error').hidden = true; }

function load({ fields, sources, warnings, hints }) {
  state.sources = sources || {};
  state.warnings = warnings || [];
  state.hints = hints || [];
  state.rawTitle = fields.title || '';
  for (const style of ['mla', 'apa']) {
    const t = convertTitle(state.rawTitle, style, state.hints);
    state.titles[style] = t.text;
    state.recased[style] = t.changed;
    state.edited[style] = false;
  }
  f('type').value = fields.type || 'webpage';
  f('authors').value = (fields.authors || []).map(authorToLine).join('\n');
  f('container').value = fields.container || '';
  f('publisher').value = fields.publisher || '';
  f('date').value = dateToInput(parseDate(fields.date));
  f('volume').value = fields.volume || '';
  f('issue').value = fields.issue || '';
  f('pages').value = fields.pages || '';
  f('doi').value = fields.doi || '';
  f('url').value = fields.url || '';
  f('permalink').value = fields.permalink || '';
  if (!f('accessed').value) f('accessed').value = dateToInput(todayDate());
  state.articleNumber = fields.articleNumber || '';
  f('title').value = state.titles[state.style];

  for (const el of document.querySelectorAll('[data-src]')) {
    const key = el.dataset.src;
    const src = state.sources[key];
    const has = key === 'authors' ? (fields.authors || []).length : fields[key];
    el.textContent = src ? `from ${src}` : has ? '' : 'not found';
    el.title = el.textContent;
    el.classList.toggle('missing', !src && !has);
  }
  $('#result').hidden = false;
  render();
}

/* ------------------------------------------------------------- render */

function readForm() {
  const doi = f('doi').value.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
  return {
    type: f('type').value,
    authors: f('authors').value.split('\n').map(parseAuthorLine).filter(Boolean),
    title: state.titles[state.style].trim(),
    container: f('container').value.trim(),
    publisher: f('publisher').value.trim(),
    date: parseDate(f('date').value),
    volume: f('volume').value.trim(),
    issue: f('issue').value.trim(),
    pages: f('pages').value.trim(),
    articleNumber: state.articleNumber,
    doi,
    url: f('url').value.trim(),
    permalink: f('permalink').value.trim(),
    accessed: parseDate(f('accessed').value),
    includeAccessed: f('includeAccessed').checked,
  };
}

function render() {
  const d = readForm();
  const style = state.style;

  // Show only the fields that matter for this style and source type.
  for (const el of form.querySelectorAll('[data-show]')) {
    el.hidden = !el.dataset.show.split(';').some(rule => {
      const [s, types] = rule.split(':');
      return (s === '*' || s === style) && (types === '*' || types.split(',').includes(d.type));
    });
  }
  $('#container-label').textContent = { journal: 'Journal name', article: 'Periodical / blog name', wiki: 'Wiki name', webpage: 'Website name' }[d.type];
  $('#title-label').textContent = style === 'apa' ? 'Title (sentence case)' : 'Title (title case)';
  $('#out-label').textContent = style === 'apa' ? 'APA 7 reference' : 'MLA 9 Works Cited entry';

  const dateRaw = f('date').value.trim();
  $('#date-help').textContent = dateRaw && !d.date ? 'Couldn’t read this date — use YYYY-MM-DD, YYYY-MM or YYYY.' : '';
  $('#date-help').className = 'help' + (dateRaw && !d.date ? ' bad' : '');
  const accRaw = f('accessed').value.trim();
  $('#accessed-help').textContent = accRaw && !d.accessed ? 'Couldn’t read this date.' : '';
  $('#accessed-help').className = 'help' + (accRaw && !d.accessed ? ' bad' : '');

  const titleHelp = state.recased[style] && !state.edited[style]
    ? (style === 'apa'
      ? 'Converted to sentence case automatically — make sure proper nouns are still capitalized.'
      : 'Converted to title case automatically — check it.')
    : '';
  $('#title-help').textContent = titleHelp;

  const segs = formatCitation(d, style);
  $('#citation').innerHTML = toHTML(segs);
  $('#copied').textContent = '';

  const notes = [...state.warnings, ...styleNotes(d, style)];
  if (titleHelp) notes.push(`Title: ${titleHelp}`);
  $('#notes').replaceChildren(...notes.map(n => Object.assign(document.createElement('li'), { textContent: n })));
}

form.addEventListener('input', e => {
  if (e.target.name === 'title') {
    state.titles[state.style] = e.target.value;
    state.edited[state.style] = true;
  }
  render();
});
form.addEventListener('submit', e => e.preventDefault());

for (const radio of document.querySelectorAll('input[name=style]')) {
  radio.addEventListener('change', () => {
    state.style = radio.value;
    f('title').value = state.titles[state.style];
    if (!$('#result').hidden) render();
  });
}

/* --------------------------------------------------------------- copy */

$('#copy').addEventListener('click', async () => {
  const segs = formatCitation(readForm(), state.style);
  const html = toHTML(segs);
  const text = toText(segs);
  try {
    // Rich text keeps the italics when pasted into Word / Google Docs.
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([`<span style="font-family:'Times New Roman',serif">${html}</span>`], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('#citation'));
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
  }
  $('#copied').textContent = 'Copied with formatting ✓';
});

// Remember the style choice between visits.
try {
  const saved = localStorage.getItem('citation-style');
  if (saved === 'apa' || saved === 'mla') {
    document.querySelector(`input[name=style][value=${saved}]`).checked = true;
    state.style = saved;
  }
  for (const r of document.querySelectorAll('input[name=style]')) {
    r.addEventListener('change', () => { try { localStorage.setItem('citation-style', r.value); } catch {} });
  }
} catch { /* storage unavailable */ }
