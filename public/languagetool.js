// Optional deeper grammar check with LanguageTool's free public API
// (https://dev.languagetool.org/public-http-api). Runs only when the writer
// clicks the button: the text is then sent from their browser to LanguageTool.
// Limits of the free service: 20 KB per request, 75 KB and 20 requests per minute.

const ENDPOINT = 'https://api.languagetool.org/v2/check';
const PER_REQUEST = 18000; // bytes, below the 20 KB limit
const PER_MINUTE = 70000; // bytes, below the 75 KB limit

// Rules that contradict MLA/APA or US dictionaries ("cafe" is standard in
// Merriam-Webster; MLA uses hyphens in page ranges), or that this site already checks.
const DISABLED = ['CAFE_DIACRITIC', 'EN_DIACRITICS_REPLACE', 'DASH_RULE', 'EN_QUOTES', 'WHITESPACE_RULE'];

const CATEGORY = {
  TYPOS: 'spelling', COMPOUNDING: 'spelling', GRAMMAR: 'grammar', CASING: 'grammar', MISC: 'grammar',
  PUNCTUATION: 'punctuation', TYPOGRAPHY: 'punctuation', CONFUSED_WORDS: 'word', SEMANTICS: 'word',
  COLLOCATIONS: 'word', NONSTANDARD_PHRASES: 'word', REDUNDANCY: 'clarity', STYLE: 'clarity', PLAIN_ENGLISH: 'clarity',
};

const bytes = s => new TextEncoder().encode(s).length;

// Splits the text at paragraph breaks into pieces small enough for one request.
function chunks(text) {
  const out = [];
  let start = 0, size = 0, offset = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const b = bytes(line);
    if (size && size + b > PER_REQUEST) { out.push({ start, text: text.slice(start, offset) }); start = offset; size = 0; }
    size += b; offset += line.length;
  }
  if (offset > start) out.push({ start, text: text.slice(start, offset) });
  return out.filter(c => c.text.trim());
}

export class LanguageToolError extends Error {}

export async function languageToolCheck(text, { signal } = {}) {
  if (bytes(text) > PER_MINUTE) {
    throw new LanguageToolError('This text is too long for LanguageTool’s free service (about 70,000 characters at a time). Check it in parts.');
  }
  const findings = [];
  for (const piece of chunks(text)) {
    if (bytes(piece.text) > 20000) throw new LanguageToolError('One paragraph is longer than LanguageTool’s free service accepts (20,000 characters). Split it, or check it in parts.');
    const body = new URLSearchParams({ text: piece.text, language: 'en-US', disabledRules: DISABLED.join(',') });
    let res;
    try {
      res = await fetch(ENDPOINT, { method: 'POST', body, signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new LanguageToolError('Couldn’t reach LanguageTool. Check your internet connection and try again.');
    }
    if (res.status === 429) throw new LanguageToolError('LanguageTool’s free service is busy (it allows a limited number of checks per minute from each network). Wait a minute and try again.');
    if (!res.ok) throw new LanguageToolError(`LanguageTool returned an error (${res.status}). Try again later.`);
    const data = await res.json();
    for (const m of data.matches || []) {
      const start = piece.start + m.offset, end = start + m.length;
      const replacements = (m.replacements || []).slice(0, 4).map(r => r.value);
      const f = {
        rule: `lt:${m.rule.id}`, source: 'LanguageTool', severity: 'check',
        category: CATEGORY[m.rule.category?.id] || 'grammar',
        title: m.shortMessage || m.rule.description || 'Possible problem',
        why: m.message, start, end, fix: null,
      };
      const opts = replacements.map(r => ({ text: r || '(delete)', fix: [{ start, end, text: r }] }));
      if (opts.length === 1) f.fix = opts[0].fix; else if (opts.length) f.options = opts;
      if (m.rule.category?.id === 'TYPOS') f.word = text.slice(start, end).toLowerCase();
      findings.push(f);
    }
  }
  return findings;
}

// Keeps earlier findings in place after the text is edited: those before the
// edited stretch stay, those after it move with it, those inside it are dropped.
export function shiftFindings(findings, before, after) {
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p++;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const changedEnd = before.length - s, delta = after.length - before.length;
  const move = e => ({ ...e, start: e.start + delta, end: e.end + delta });
  return findings.flatMap(f => {
    if (f.end <= p) return [f];
    if (f.start >= changedEnd) {
      const g = { ...f, start: f.start + delta, end: f.end + delta };
      if (f.fix) g.fix = f.fix.map(move);
      if (f.options) g.options = f.options.map(o => ({ ...o, fix: o.fix.map(move) }));
      return [g];
    }
    return [];
  });
}
