// Citation formatting. Pure functions, shared by the browser UI, the server,
// and the tests. Four styles:
//   mla8 / apa6 — as taught in Hacker & Sommers, Rules for Writers, 9th ed.
//                 (MLA Handbook 8th ed., 2016; APA Publication Manual 6th ed.,
//                 2010, with DOIs written as https://doi.org/...). "RfW" below
//                 cites that book's section/item numbers.
//   mla9 / apa7 — MLA Handbook 9th ed. (2021); APA Publication Manual 7th ed. (2019).

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
// MLA abbreviates all months except May, June, and July (RfW 56b; MLA 9, 2.94).
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.',
  'Oct.', 'Nov.', 'Dec.'];

export const STYLES = {
  mla8: { label: 'MLA 8', family: 'mla', edition: 8, name: 'MLA (Rules for Writers, 9th ed.)' },
  apa6: { label: 'APA 6', family: 'apa', edition: 6, name: 'APA (Rules for Writers, 9th ed.)' },
  mla9: { label: 'MLA 9', family: 'mla', edition: 9, name: 'MLA 9th edition (2021)' },
  apa7: { label: 'APA 7', family: 'apa', edition: 7, name: 'APA 7th edition (2019)' },
};
export const styleFamily = style => STYLES[style]?.family || (String(style).startsWith('apa') ? 'apa' : 'mla');

export const TYPES = {
  webpage: 'Web page',
  article: 'News or magazine article',
  blog: 'Blog post',
  journal: 'Journal article',
  wiki: 'Wikipedia / wiki entry',
};

/* ------------------------------------------------------------------ dates */

function makeDate(y, m, d) {
  y = +y; m = +m || 0; d = +d || 0;
  if (!(y >= 1000 && y <= 2999)) return null;
  const out = { year: y };
  if (m >= 1 && m <= 12) {
    out.month = m;
    if (d >= 1 && d <= 31) out.day = d;
  }
  return out;
}

function monthIndex(name) {
  if (name.length < 3) return 0;
  const i = MONTHS.findIndex(m => m.slice(0, 3).toLowerCase() === name.slice(0, 3).toLowerCase());
  return i + 1;
}

// Accepts ISO strings (keeps the date as written, ignoring time zone),
// YYYY, YYYY-MM, YYYY/MM/DD, "March 5, 2020", "5 March 2020", "Mar 2020",
// and RFC 2822 ("Tue, 05 Mar 2024 10:00:00 GMT"). Returns {year, month?, day?}.
export function parseDate(input) {
  if (!input) return null;
  if (typeof input === 'object') return input.year ? makeDate(input.year, input.month, input.day) : null;
  let s = String(input).trim().replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?(?:[T ].*)?$/))) return makeDate(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T.*)?$/))) return makeDate(m[1], m[2], m[3]);
  s = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,? /i, '');
  if ((m = s.match(/^([a-z]{3,})\.? (?:(\d{1,2})(?:st|nd|rd|th)?,? )?(\d{4})\b/i)) && monthIndex(m[1])) {
    return makeDate(m[3], monthIndex(m[1]), m[2]);
  }
  if ((m = s.match(/^(\d{1,2}) ([a-z]{3,})\.?,? (\d{4})\b/i)) && monthIndex(m[2])) {
    return makeDate(m[3], monthIndex(m[2]), m[1]);
  }
  return null;
}

export function dateToInput(d) {
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return [d.year, d.month && p(d.month), d.month && d.day && p(d.day)].filter(Boolean).join('-');
}

export function todayDate() {
  const t = new Date();
  return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate() };
}

// MLA: day Month year — "5 Mar. 2020"
export function mlaDate(d) {
  if (!d) return '';
  return [d.day, d.month && MLA_MONTHS[d.month - 1], d.year].filter(Boolean).join(' ');
}

// "December 10, 2015" — APA retrieval dates.
export function longDate(d) {
  if (!d) return '';
  return d.month ? `${MONTHS[d.month - 1]}${d.day ? ' ' + d.day : ''}, ${d.year}` : String(d.year);
}

// APA: "2020, March 5"; journals use the year only; "n.d." when undated.
export function apaDate(d, yearOnly = false) {
  if (!d) return 'n.d.';
  if (yearOnly || !d.month) return String(d.year);
  return `${d.year}, ${MONTHS[d.month - 1]}${d.day ? ' ' + d.day : ''}`;
}

/* ------------------------------------------------------------------ names */

const SUFFIX_RE = /^(jr|sr|ii|iii|iv)\.?$/i;
const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'da', 'du',
  'la', 'le', 'dos', 'das', 'ter', 'ten', 'bin', 'ibn', 'al']);

// Person: {family, given, suffix}. Organisation or single name: {name}.
export function parseName(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.includes(',')) {
    const parts = s.split(',').map(t => t.trim()).filter(Boolean);
    if (parts.length === 2 && SUFFIX_RE.test(parts[1])) { // "John Smith, Jr."
      const p = parseName(parts[0]);
      if (p.family) p.suffix = parts[1];
      return p;
    }
    return { family: parts[0], given: parts[1] || '', suffix: parts[2] || '' }; // "Smith, John"
  }
  const words = s.split(' ');
  if (words.length === 1) return { name: s };
  let suffix = '';
  if (words.length > 2 && SUFFIX_RE.test(words[words.length - 1])) suffix = words.pop();
  let i = words.length - 1;
  while (i > 1 && PARTICLES.has(words[i - 1].toLowerCase())) i--;
  return { given: words.slice(0, i).join(' '), family: words.slice(i).join(' '), suffix };
}

// Edit-form convention: "Family, Given[, Suffix]" for people; anything without a
// comma (or wrapped in {braces}) is an organisation or single name.
export function parseAuthorLine(line) {
  line = line.trim();
  if (!line) return null;
  const braced = line.match(/^\{(.+)\}$/);
  if (braced) return { name: braced[1].trim() };
  if (!line.includes(',')) return { name: line };
  const [family, given = '', suffix = ''] = line.split(',').map(t => t.trim());
  return { family, given, suffix };
}

export function authorToLine(a) {
  if (a.name != null) return a.name.includes(',') ? `{${a.name}}` : a.name;
  return [a.family, a.given, a.suffix].filter(Boolean).join(', ');
}

export function initials(given) {
  return (given || '').split(/[\s.]+/).filter(Boolean)
    .map(part => part.split('-').filter(Boolean).map(p => p[0].toUpperCase() + '.').join('-'))
    .join(' ');
}

function mlaInverted(a) {
  if (a.name != null) return a.name;
  return [a.family, a.given, a.suffix].filter(Boolean).join(', ');
}
function mlaNatural(a) {
  if (a.name != null) return a.name;
  return [a.given, a.family].filter(Boolean).join(' ') + (a.suffix ? ', ' + a.suffix : '');
}
// MLA (RfW 56b items 1–3; MLA 9, 2.1.1): one author inverted; two: "A, and B"
// (second in normal order); three or more: first author + "et al."
export function mlaAuthors(list) {
  if (!list.length) return '';
  if (list.length === 1) return mlaInverted(list[0]);
  if (list.length === 2) return `${mlaInverted(list[0])}, and ${mlaNatural(list[1])}`;
  return `${mlaInverted(list[0])}, et al.`;
}

function apaName(a) {
  if (a.name != null) return a.name;
  const ini = initials(a.given);
  return [a.family, ini, a.suffix].filter(Boolean).join(', ');
}
// APA 6 (RfW 61b items 2–3): up to seven authors, "&" before the last; eight or
// more: first six, three ellipsis dots, last.
// APA 7 (9.8): up to 20 authors; 21+: first 19, ". . .", last.
export function apaAuthors(list, edition = 7) {
  const n = list.map(apaName);
  if (!n.length) return '';
  if (n.length === 1) return n[0];
  const max = edition === 6 ? 7 : 20;
  if (n.length <= max) return `${n.slice(0, -1).join(', ')}, & ${n[n.length - 1]}`;
  if (edition === 6) return `${n.slice(0, 6).join(', ')}, ... ${n[n.length - 1]}`;
  return `${n.slice(0, 19).join(', ')}, . . . ${n[n.length - 1]}`;
}

/* ----------------------------------------------------------- title casing */

// Words MLA lowercases in title case unless first or last in the title or
// subtitle: articles, prepositions, coordinating conjunctions, the "to" in
// infinitives (RfW 56b general guidelines; MLA 9, 1.2).
const MINOR = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'about', 'above', 'across', 'against', 'along', 'amid', 'among', 'around', 'at', 'behind',
  'below', 'beneath', 'beside', 'between', 'beyond', 'by', 'despite', 'during', 'from', 'in',
  'inside', 'into', 'of', 'on', 'onto', 'outside', 'per', 'through', 'throughout', 'to',
  'toward', 'towards', 'under', 'underneath', 'upon', 'versus', 'via', 'vs', 'with',
  'within', 'without']);

function splitWord(tok) {
  const lead = tok.match(/^[^\p{L}\p{N}]*/u)[0];
  const rest = tok.slice(lead.length);
  const trail = rest.match(/[^\p{L}\p{N}]*$/u)[0];
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

// Words whose capitalisation carries meaning: iPhone, McDonald, NASA, COVID-19, U.S., Node.js
function isSpecial(core) {
  return /\p{Lu}/u.test(core.slice(1)) || /\d/.test(core) || /\.\p{L}/u.test(core) || /^(https?:|www\.)/i.test(core);
}
const capFirst = w => w.replace(/^\p{L}/u, c => c.toUpperCase());
const endsClause = trail => /[:?!]/.test(trail);

export function titleCase(s) {
  const toks = s.split(/(\s+)/);
  const wordIdx = toks.map((t, i) => (/\S/.test(t) && splitWord(t).core ? i : -1)).filter(i => i >= 0);
  const last = wordIdx[wordIdx.length - 1];
  let capNext = true;
  for (let i = 0; i < toks.length; i++) {
    if (!/\S/.test(toks[i])) continue;
    const { lead, core, trail } = splitWord(toks[i]);
    if (!core) { if (endsClause(toks[i])) capNext = true; continue; }
    let out;
    if (isSpecial(core)) out = core;
    else if (!capNext && i !== last && !endsClause(trail) && MINOR.has(core.toLowerCase())) out = core.toLowerCase();
    else out = core.split('-').map((p, j) => (j > 0 && MINOR.has(p.toLowerCase()) ? p.toLowerCase() : capFirst(p))).join('-');
    toks[i] = lead + out + trail;
    capNext = endsClause(trail);
  }
  return toks.join('');
}

// APA sentence case: capitalise the first word, the first word after a colon,
// and proper nouns. Proper nouns can't be detected reliably, so:
//  - if the title is already in sentence case, existing capitals are kept;
//  - if it is in Title Case, words are lowercased unless they look special
//    (acronyms, iPhone…) or appear capitalised mid-sentence in the page's
//    own text (`hints`). The UI warns the user to check the result.
export function sentenceCase(s, hints = []) {
  const hint = new Set(hints);
  const toks = s.split(/(\s+)/);
  const words = toks.filter(t => /\S/.test(t)).map(t => splitWord(t).core).filter(Boolean);
  const letters = words.filter(w => /\p{L}/u.test(w));
  const allCaps = letters.length > 1 && letters.filter(w => w.length > 1 && w === w.toUpperCase()).length / letters.length > 0.8;
  const content = letters.slice(1).filter(w => !MINOR.has(w.toLowerCase()));
  const capped = content.filter(w => /^\p{Lu}/u.test(w)).length;
  const isTitleCase = allCaps || (content.length > 0 && capped / content.length >= 0.75);

  let capNext = true;
  for (let i = 0; i < toks.length; i++) {
    if (!/\S/.test(toks[i])) continue;
    const { lead, core, trail } = splitWord(toks[i]);
    if (!core) { if (endsClause(toks[i])) capNext = true; continue; }
    const base = core.replace(/['’]s$/, '');
    let out = core;
    if (capNext) {
      out = allCaps && !hint.has(core) ? capFirst(core.toLowerCase()) : capFirst(core);
    } else if (isTitleCase && !hint.has(core) && !hint.has(base) && !/^I(['’]|$)/.test(core) && (allCaps || !isSpecial(core))) {
      out = core.split('-').map(p => (hint.has(p) ? p : p.toLowerCase())).join('-');
    }
    toks[i] = lead + out + trail;
    capNext = endsClause(trail);
  }
  return toks.join('');
}

// Returns the title as the style wants it, plus whether casing was changed.
export function convertTitle(title, style, hints = []) {
  if (!title) return { text: '', changed: false };
  const text = styleFamily(style) === 'apa' ? sentenceCase(title, hints) : titleCase(title);
  return { text, changed: text !== title };
}

/* ------------------------------------------------------------- formatting */

const endsWithPunct = s => /[.?!]["”’]?$/.test(s);
const withPeriod = s => (endsWithPunct(s) ? s : s + '.');

function normEntity(s) {
  return (s || '').toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[.,]/g, '')
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|plc|gmbh|limited)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}
// "Essentially the same" entity (MLA 9 2.5.3; APA 7 9.19).
export function sameEntity(a, b) {
  const x = normEntity(a), y = normEntity(b);
  if (!x || !y) return false;
  return x === y || x.replace(/ /g, '') === y.replace(/ /g, '') || x.startsWith(y + ' ') || y.startsWith(x + ' ');
}

// MLA drops business words such as Inc. and Co., and abbreviates university
// publishers with "U" and "P" — "Princeton UP", "Fordham U", "U of Sussex"
// (RfW 56b "Publication information"; MLA 9, 2.5.2).
export function mlaPublisher(p) {
  let out = p.replace(/,?\s+(Inc\.?|LLC|Ltd\.?|Limited|Corporation|Corp\.?|Company|Co\.)$/i, '').trim();
  if (/\bUniversity\b/.test(out)) {
    out = out.replace(/\bUniversity Press\b/g, 'UP').replace(/\bUniversity\b/g, 'U').replace(/\bPress\b/g, 'P');
  }
  return out;
}

function splitRange(pages) {
  const m = String(pages).trim().match(/^([\w.]+)\s*[-–—]+\s*([\w.]+)$/);
  return m ? [m[1], m[2]] : null;
}
// MLA: "pp. 159-74" (second number abbreviated to two digits when possible).
function mlaPages(pages) {
  const r = splitRange(pages);
  if (!r) return `p. ${pages}`;
  let [a, b] = r;
  if (/^\d+$/.test(a) && /^\d+$/.test(b) && +a >= 100 && a.length === b.length) {
    for (let k = 2; k <= b.length; k++) {
      if (a.slice(0, b.length - k) === b.slice(0, b.length - k)) { b = b.slice(-k); break; }
    }
  }
  return `pp. ${a}-${b}`;
}
// APA: full numbers with an en dash.
function apaPages(pages) {
  const r = splitRange(pages);
  return r ? `${r[0]}–${r[1]}` : String(pages);
}

const doiUrl = doi => `https://doi.org/${doi}`;
const stripProtocol = url => (url || '').replace(/^https?:\/\//i, '');

class Builder {
  constructor() { this.segs = []; }
  t(text) { if (text) this.segs.push({ text }); return this; }
  i(text) { if (text) this.segs.push({ text, italic: true }); return this; }
  add(segs) { this.segs.push(...segs); return this; }
}

/*
 * d = { type, authors[], title (already cased), container, publisher, date{},
 *       volume, issue, pages, articleNumber, doi, url, permalink, accessed{},
 *       includeAccessed (MLA 9), includeRetrieved (APA 6 web pages and blogs) }
 * Returns an array of {text, italic?} segments.
 */
export function formatMLA(d, edition = 9) {
  const book = edition === 8;
  const b = new Builder();
  let authors = d.type === 'wiki' ? [] : (d.authors || []);
  const publisher = d.publisher ? mlaPublisher(d.publisher) : '';

  // MLA 9 (2.1.3): a work by an organisation that is also its publisher starts
  // with the title. Rules for Writers (56b item 4, 35b, 56) always lists the
  // organisation as author, so mla8 keeps it.
  if (!book && authors.length === 1 && authors[0].name != null &&
      (sameEntity(authors[0].name, d.container) || sameEntity(authors[0].name, publisher))) {
    authors = [];
  }

  const a = mlaAuthors(authors);
  if (a) b.t(withPeriod(a) + ' ');
  if (d.title) b.t(`“${withPeriod(d.title)}” `);

  // Container elements, separated by commas, ending with a period.
  const els = [];
  if (d.container) els.push([{ text: d.container, italic: true }]);
  if (d.volume) els.push([{ text: `vol. ${d.volume}` }]);
  if (d.issue) els.push([{ text: `no. ${d.issue}` }]);
  // Publisher: given for websites and blogs, omitted for newspapers, magazines
  // and journals, and when it is the same as the website's title (RfW 56b
  // general guidelines, items 36–37; MLA 9, 2.5.3). Rules for Writers' wiki
  // model has no publisher (“House Music.” Wikipedia, ...; item 23).
  const publisherTypes = book ? ['webpage', 'blog'] : ['webpage', 'blog', 'wiki'];
  if (publisher && publisherTypes.includes(d.type) && !sameEntity(publisher, d.container)) {
    els.push([{ text: publisher }]);
  }
  if (d.date) els.push([{ text: mlaDate(d.date) }]);
  if (d.pages) els.push([{ text: mlaPages(d.pages) }]);
  // DOI: "doi:10.1086/668300" in Rules for Writers (items 12–13); MLA 9 uses
  // https://doi.org/. URLs drop the protocol in both.
  const loc = d.doi ? (book ? `doi:${d.doi}` : doiUrl(d.doi)) : stripProtocol(d.url);
  if (loc) els.push([{ text: loc }]);

  els.forEach((el, idx) => {
    if (idx) b.t(', ');
    b.add(el);
  });
  if (els.length) {
    const lastText = els[els.length - 1].at(-1).text;
    if (!endsWithPunct(lastText)) b.t('.');
  }
  // Access date: Rules for Writers adds it only when the source has no date
  // (56b "Dates"); for MLA 9 it is optional, so the user chooses.
  const accessed = book ? !d.date : d.includeAccessed;
  if (accessed && d.accessed) b.t(` Accessed ${mlaDate(d.accessed)}.`);
  return tidy(b.segs);
}

export function formatAPA(d, edition = 7) {
  const apa6 = edition === 6;
  const authors = d.type === 'wiki' ? [] : (d.authors || []);
  const a = apaAuthors(authors, edition);
  const date = `(${apaDate(d.date, d.type === 'journal')}).`;
  const container = d.container || '';
  const orgAuthorIsSite = authors.length === 1 && authors[0].name != null && sameEntity(authors[0].name, container);
  // APA 7 treats blog posts as periodical articles; APA 6 labels them [Blog post].
  const type = !apa6 && d.type === 'blog' ? 'article' : d.type;

  // Title: italic for stand-alone web documents; plain for articles, blog
  // posts and wiki entries.
  const title = new Builder();
  if (d.title) {
    if (type === 'webpage') title.i(d.title).t(endsWithPunct(d.title) ? '' : '.');
    else if (type === 'blog') title.t(`${d.title} [Blog post].`); // RfW 61b item 36
    else title.t(withPeriod(d.title));
  }

  const source = new Builder();
  if (type === 'webpage') {
    // APA 7 gives the site name unless it is the author (9.19 / 10.16). APA 6
    // names the publisher in the retrieval statement instead (below).
    if (!apa6 && container && !orgAuthorIsSite) source.t(withPeriod(container));
  } else if (type === 'article') {
    if (container) source.i(container).t('.');
  } else if (type === 'journal') {
    if (container) {
      source.i(container + (d.volume ? `, ${d.volume}` : ''));
      if (d.issue) source.t(`(${d.issue})`);
      if (d.pages) source.t(`, ${apaPages(d.pages)}`);
      else if (d.articleNumber) source.t(`, Article ${d.articleNumber}`);
      source.t('.');
    }
  } else if (type === 'wiki') {
    if (container) source.t('In ').i(container).t('.');
  }

  let link = '';
  if (d.doi) {
    link = doiUrl(d.doi);
  } else if (apa6 && d.url) {
    // Rules for Writers 61b: newspapers, magazines and journals without a DOI
    // give the publication's home page (items 11–13); a web document names its
    // publisher when it isn't the author (item 34); a wiki entry gets a
    // retrieval date (item 19b); other retrieval dates only when content is
    // likely to change (general guidelines).
    if (type === 'article' || type === 'journal') {
      link = `Retrieved from ${homePage(d.url)}`;
    } else {
      const site = type === 'webpage' && container && !orgAuthorIsSite ? `${container} website: ` : '';
      const dated = d.accessed && (type === 'wiki' || d.includeRetrieved);
      link = dated ? `Retrieved ${longDate(d.accessed)}, from ${site}${d.url}` : `Retrieved from ${site}${d.url}`;
    }
  } else {
    link = type === 'wiki' && d.permalink ? d.permalink : (d.url || '');
  }

  const parts = [];
  if (a) {
    parts.push([{ text: `${withPeriod(a)} ${date}` }], title.segs);
  } else {
    // No author: the title moves to the author position (RfW 61b item 5; APA 7, 9.12).
    parts.push(title.segs, [{ text: date }]);
  }
  parts.push(source.segs, link ? [{ text: link }] : []);

  const b = new Builder();
  parts.filter(p => p.length).forEach((p, i) => { if (i) b.t(' '); b.add(p); });
  return tidy(b.segs);
}

function homePage(url) {
  try { return new URL(url).origin + '/'; } catch { return url; }
}

function tidy(segs) {
  const out = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && !!prev.italic === !!s.italic) prev.text += s.text;
    else out.push({ ...s });
  }
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  return out;
}

// style: 'mla8' | 'apa6' | 'mla9' | 'apa7' ('mla' / 'apa' mean the newer editions).
export function formatCitation(d, style) {
  // Site/periodical names are titles: capitalise a leading article ("the Guardian").
  if (d.container) d = { ...d, container: d.container.replace(/^(the|a|an)\b/, w => capFirst(w)) };
  const { family, edition } = STYLES[style] || { family: styleFamily(style), edition: styleFamily(style) === 'apa' ? 7 : 9 };
  return family === 'apa' ? formatAPA(d, edition) : formatMLA(d, edition);
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const toHTML = segs => segs.map(s => (s.italic ? `<i>${esc(s.text)}</i>` : esc(s.text))).join('');
export const toText = segs => segs.map(s => s.text).join('');
export const toMarkdown = segs => segs.map(s => (s.italic ? `*${s.text}*` : s.text)).join('');

// Notes explaining how missing data was handled under each style's rules.
export function styleNotes(d, style) {
  const notes = [];
  const { family, edition } = STYLES[style] || { family: styleFamily(style), edition: 0 };
  const hasAuthors = d.type !== 'wiki' && d.authors && d.authors.length;
  if (!d.title) notes.push('No title — add one before copying.');
  if (family === 'apa') {
    if (!d.date) notes.push('No publication date found, so APA uses “n.d.”.');
    if (!hasAuthors && d.type !== 'wiki') notes.push('No author found, so the title moves to the author position.');
    if (edition === 6) {
      if (!d.doi && (d.type === 'article' || d.type === 'journal') && d.url) {
        notes.push('Rules for Writers gives the publication’s home page URL (not the article’s) when there is no DOI — check that it is the right home page.');
      }
      if (d.type === 'wiki') notes.push('Wiki entries include the date you retrieved them (Rules for Writers 61b, item 19b).');
    } else {
      if (d.type === 'wiki' && !d.permalink) notes.push('APA 7 recommends linking to the archived version of a wiki page (e.g., the Wikipedia “Permanent link”).');
      if (d.type === 'journal' && !d.doi) notes.push('No DOI found; the URL is used instead.');
    }
  } else {
    if (!d.date) notes.push(edition === 8
      ? 'No publication date found, so it’s left out and your access date is added at the end (Rules for Writers 56b).'
      : 'No publication date found, so it’s left out. MLA recommends keeping the access date in that case.');
    if (!hasAuthors && d.type !== 'wiki') notes.push('No author found, so the entry starts with the title.');
    if (edition === 8 && d.type === 'article') notes.push('If the newspaper’s city isn’t in its name, add it in brackets after the title, e.g. Plain Dealer [Cleveland] (Rules for Writers 56b, item 15).');
  }
  if (!d.container) notes.push(`No ${d.type === 'journal' ? 'journal' : 'website/periodical'} name found — left out.`);
  return notes;
}
