// Reads citation details out of a page's HTML.
//
// Every field is looked for in the structured data first (citation_* tags,
// JSON-LD, Open Graph, Twitter cards, Dublin Core) and then on the visible page
// (headline, byline, the date under the headline). The two are compared: when
// they disagree the citation keeps the more trustworthy value and a warning
// names both, so a person can check. Nothing is guessed; a field that can't be
// found stays empty.

import { load } from 'cheerio';
import { parseDate, sameEntity } from '../public/format.js';

/* ------------------------------------------------------------------ text */

export const clean = s => (typeof s === 'string' ? load(`<p>${s}</p>`).text() : '').replace(/\s+/g, ' ').trim();
const first = v => (Array.isArray(v) ? v[0] : v);
const lc = s => (s || '').toLowerCase();

// Text of an element with a space between tags, so "StaffJan. 16" can't happen.
function textOf($, el) {
  const out = [];
  const walk = node => {
    if (node.type === 'text') out.push(node.data);
    else if (node.type === 'tag' && !/^(script|style|noscript|svg|template)$/.test(node.name)) {
      out.push(' ');
      (node.children || []).forEach(walk);
      out.push(' ');
    }
  };
  $(el).each((_, n) => walk(n));
  return out.join('').replace(/\s+/g, ' ').trim();
}

/* ---------------------------------------------------------------- authors */

// Titles and degrees are not part of a name in MLA or APA.
const HONORIFIC = /^(dr|prof|professor|mr|mrs|ms|mx|rev|sir|dame|hon)\.?$/i;
const DEGREE = /^(ph\.?\s?d\.?|m\.d\.?|md|d\.o\.?|r\.n\.?|rn|bsn|msn|aprn|fnp|mph|m\.p\.h\.?|mba|m\.b\.a\.?|m\.a\.?|m\.s\.?|b\.a\.?|b\.s\.?|j\.d\.?|jd|ed\.?d\.?|psy\.?d\.?|dds|d\.d\.s\.?|dmd|lcsw|lpc|lmft|cpa|facs|facp|rdn?|ldn?|esq\.?|m\.?sc\.?|b\.?sc\.?|d\.?phil\.?|pharm\.?d\.?|cdces|ibclc|mfa|m\.ed\.?)$/i;
const ROLE = /^(staff|senior|chief|contributing|associate|managing|executive|deputy|special|national|political|science|health|tech|technology|business|sports|culture)?\s*(writer|reporter|editor|correspondent|columnist|contributor|journalist|producer|author)s?$/i;
const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
const PARTICLE = /^(van|von|der|den|de|del|della|di|da|du|la|le|dos|das|ter|ten|bin|ibn|al|el|y)$/i;
// Words that mark an organisation even if a site labels it a "Person".
const ORG_STRONG = /\b(staff|team|editors|editorial|desk|board|foundation|institute|university|college|association|society|agency|organi[sz]ation|department|ministry|council|committee|cent(?:er|re)|inc|llc|ltd|corporation|contributors|reporters|newsroom|news|communications|clinic|hospital|school|lab|labs|library|project)\b/i;
// Words that are also surnames ("Emily Post"): organisation only if nothing says it's a person.
const ORG_WEAK = /\b(press|media|group|company|times|post|magazine|wire|service|network|channel|online|official|government|office|editor|journal|review)\b/i;
const NOT_AN_AUTHOR = /^(admin|administrator|webmaster|user|guest|unknown|anonymous|none|null|undefined|root|author|editor|staff|n\/?a|wpengine|site ?admin|default)$/i;
const NON_AUTHOR_CREDIT = /^(medically\s+)?(reviewed|edited|fact[- ]?checked|updated|photographs?|photos?|illustrat\w+|compiled|produced|translated|narrated|sponsored|presented)\b/i;

const isUpperWord = w => /^\p{Lu}/u.test(w) || PARTICLE.test(w) || /^\p{Lu}\.?$/u.test(w);

const UI_WORD = /^(for|the|read|share|follow|about|more|home|see|view|sign|log|all|our|your|my|this|what|how|why|top|latest|related|contact|subscribe|save|print|email|listen|watch|last|first|next|new|back|get|join|learn|skip|main|menu|search|open|close|at|in|on|of|from|with|and|or|published|updated|posted|by)$/i;

export function looksLikePerson(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (UI_WORD.test(words[0]) || UI_WORD.test(words[words.length - 1])) return false;
  if (/[\d@/:]/.test(name) || ORG_STRONG.test(name)) return false;
  return words.every(isUpperWord) && !PARTICLE.test(words[words.length - 1]);
}

function fixCase(name) {
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4 || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return name;
  return name.toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

// "Dr. Robert N. Johansen Ph.D." → "Robert N. Johansen"
function stripTitles(name) {
  const words = name.split(/\s+/).filter(Boolean);
  while (words.length > 1 && HONORIFIC.test(words[0])) words.shift();
  // Only written-as-a-degree forms ("PhD", "Ph.D.", "MD"), so "Yo-Yo Ma" keeps "Ma".
  const asDegree = w => DEGREE.test(w) && (/\./.test(w) || /^(ph\s?d|\p{Lu}+)$/iu.test(w) && w !== w[0] + w.slice(1).toLowerCase() || /^phd$/i.test(w));
  while (words.length > 1 && asDegree(words[words.length - 1])) words.pop();
  return words.join(' ').replace(/[,;:]+$/, '').replace(/\s+\d+$/, '').trim();
}

function personFromParts(given, family, suffix = '') {
  return { family: fixCase(family), given: fixCase(given), suffix };
}

function personFromNatural(raw) {
  const words = stripTitles(raw).split(/\s+/).filter(Boolean);
  let suffix = '';
  if (words.length > 2 && SUFFIX.test(words[words.length - 1])) suffix = words.pop();
  let i = words.length - 1;
  while (i > 1 && PARTICLE.test(words[i - 1])) i--;
  return personFromParts(words.slice(0, i).join(' '), words.slice(i).join(' '), suffix);
}

/*
 * Turns a raw author string into people and organisations. Handles
 * "By Jane Doe and John Smith", "Adam Zewe | MIT News", "Jane Doe, CNN",
 * "Michelle Golden, PhD", "Doe, Jane", "JANE DOE", "Jane Doe, Staff Writer".
 * opts.person: the source says this is a person. opts.bibliographic: the source
 * writes names as "Family, Given" (citation_author).
 */
export function parseAuthors(raw, { person = false, bibliographic = false } = {}) {
  let s = clean(raw).replace(/^(?:(?:written|posted|reported|published|authored|story|words|text|article)\s+)?by:?\s+/i, '');
  s = s.replace(/^(.{3,}?)\s+\1$/, '$1'); // the same name printed twice (photo label + link)
  if (/^[\p{Ll}\d_.-]+$/u.test(s) && !bibliographic) return []; // a login name such as "harvardgazette"
  if (/^(the|an?)\s/i.test(s)) return [{ name: s }]; // "The Writing Lab & The OWL at Purdue"
  if (!s || s.length > 250 || /^(https?:|www\.|@)|@\S+\.\S+/i.test(s) || NON_AUTHOR_CREDIT.test(s) || NOT_AN_AUTHOR.test(s)) return [];

  // "Adam Zewe | MIT News", "Jane Doe - Reuters": keep the person.
  const piped = s.split(/\s+(?:\||•|·|–|—|-)\s+/);
  if (piped.length > 1 && !bibliographic) s = looksLikePerson(stripTitles(piped[0])) ? piped[0] : piped.join(' ');
  // "Jane Doe for The Times", "Jane Doe at Reuters", "Jane Doe in Washington"
  s = s.replace(/^((?:\p{Lu}[\p{L}'’.-]*\s+){1,4}\p{Lu}[\p{L}'’.-]*)\s+(?:for|at|in|from)\s+(?:the\s+)?\p{Lu}.*$/u, '$1');

  // Job titles after a comma: "Jane Doe, Staff Writer".
  s = s.split(/\s*,\s*/).filter((part, i) => !i || !ROLE.test(part)).join(', ');

  // A whole organisation name; don't split "Johnson and Johnson".
  const strong = ORG_STRONG.test(s);
  if (strong || (!person && !bibliographic && ORG_WEAK.test(s))) {
    const multi = s.split(/\s*(?:;|\s&\s|\sand\s)\s*/i);
    if (!(multi.length > 1 && multi.every(p => looksLikePerson(stripTitles(p))))) return [{ name: s }];
  }

  const out = [];
  for (const chunk of s.split(/\s*;\s*|\s*,?\s+(?:and|&)\s+/i)) {
    let parts = chunk.split(/\s*,\s*/).filter(Boolean);
    // Drop credentials and job titles written after a comma.
    let suffix = '';
    parts = parts.filter((p, i) => {
      if (i && SUFFIX.test(p)) { suffix = p; return false; }
      return !(DEGREE.test(p) || HONORIFIC.test(p) || ROLE.test(p));
    });
    if (!parts.length) continue;
    if (parts.length === 1) {
      out.push(oneName(parts[0], { person, suffix }));
    } else if (bibliographic || parts[0].split(/\s+/).length === 1) {
      // "Doe, Jane A."
      out.push(personFromParts(stripTitles(parts[1]), parts[0], parts[2] || suffix));
    } else if (parts.every(p => p.split(/\s+/).length >= 2)) {
      // "Jane Doe, John Smith"
      parts.forEach(p => out.push(oneName(p, { person })));
    } else {
      // "Jane Doe, CNN": the part after the comma is an affiliation.
      out.push(oneName(parts[0], { person, suffix }));
    }
  }
  return out.filter(Boolean);
}

function oneName(raw, { person, suffix = '' }) {
  const name = fixCase(stripTitles(raw));
  if (!name || NOT_AN_AUTHOR.test(name)) return null;
  if (name.split(/\s+/).length === 1) return { name };
  if (looksLikePerson(name) || person) {
    const p = personFromNatural(name);
    if (suffix) p.suffix = suffix;
    return p;
  }
  return { name };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(a => {
    const k = lc(a.name ?? `${a.family}|${a.given}`);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const authorKey = a => lc(a.name ?? a.family);
function anyInCommon(a, b) {
  const y = b.map(authorKey);
  return a.some(x => y.includes(authorKey(x)));
}
const showAuthors = list => list.map(a => a.name ?? [a.given, a.family].filter(Boolean).join(' ')).join(', ');

/* -------------------------------------------------------------- structured */

const ARTICLE_TYPES = /^(Article|NewsArticle|ReportageNewsArticle|AnalysisNewsArticle|OpinionNewsArticle|BackgroundNewsArticle|ReviewNewsArticle|BlogPosting|LiveBlogPosting|SocialMediaPosting|ScholarlyArticle|MedicalScholarlyArticle|TechArticle|Report|Review)$/;

function collectJsonLd($) {
  const nodes = [];
  const walk = x => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    if (x['@graph']) walk(x['@graph']);
    if (x['@type']) nodes.push(x);
    if (x.mainEntity && typeof x.mainEntity === 'object') walk(x.mainEntity);
  };
  $('script[type="application/ld+json" i]').each((_, el) => {
    const text = $(el).html()?.trim().replace(/^(\/\/\s*)?<!\[CDATA\[|(\/\/\s*)?\]\]>$/g, '') || '';
    try { walk(JSON.parse(text)); return; } catch { /* retry below */ }
    try { walk(JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '))); } catch { /* ignore invalid JSON-LD */ }
  });
  const byId = new Map(nodes.filter(n => n['@id']).map(n => [n['@id'], n]));
  const resolve = v => (v && typeof v === 'object' && v['@id'] && byId.get(v['@id'])) || v;
  const types = n => [].concat(n?.['@type'] || []).map(String);
  return { nodes, resolve, types };
}

// A page can carry JSON-LD for many articles ("related stories"). Pick the one
// describing this page: right URL or right headline, not just the first.
function pickMainNode(ld, pageUrl, h1) {
  const norm = u => { try { const x = new URL(u, pageUrl); return x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, ''); } catch { return ''; } };
  const here = norm(pageUrl);
  const score = n => {
    const isArticle = ld.types(n).some(t => ARTICLE_TYPES.test(t));
    let s = isArticle ? 4 : ld.types(n).some(t => /WebPage$/.test(t)) ? 1 : -99;
    const ref = ld.resolve(n.mainEntityOfPage);
    let urlMatch = false;
    for (const u of [n.url, n['@id'], typeof ref === 'string' ? ref : ref?.['@id'] || ref?.url]) {
      if (typeof u === 'string' && norm(u) === here) urlMatch = true;
    }
    if (urlMatch) s += 3;
    const named = clean(first(n.headline) || first(n.name) || '');
    const titleMatch = h1 && overlap(named, h1) > 0.4;
    if (titleMatch) s += 2;
    // An article listed on this page, not this page itself (e.g. "latest stories").
    const pointsElsewhere = typeof n.url === 'string' && !urlMatch && norm(n.url) && norm(n.url) !== here;
    if (isArticle && h1 && !urlMatch && !titleMatch && pointsElsewhere) return -99;
    if (n.author) s += 1;
    return s;
  };
  let best = null, bestScore = 0;
  for (const n of ld.nodes) {
    const s = score(n);
    if (s > bestScore) { best = n; bestScore = s; }
  }
  return best;
}

function ldAuthors(main, ld) {
  return [].concat(main?.author || main?.creator || []).map(ld.resolve).flatMap(a => {
    if (typeof a === 'string') return parseAuthors(a);
    if (!a || typeof a !== 'object') return [];
    if (a.familyName) return [personFromParts(clean(first(a.givenName) || ''), clean(first(a.familyName)))];
    const name = clean(first(a.name));
    if (!name) return [];
    if (ld.types(a).some(t => /Organi[sz]ation|Corporation|Agency|NGO/.test(t))) return [{ name }];
    return parseAuthors(name, { person: ld.types(a).includes('Person') });
  });
}

/* ---------------------------------------------------------- the visible page */

const NOISE = 'aside,footer,nav,[class*=comment i],[id*=comment i],[class*=related i],[class*=recommend i],[class*=sidebar i],[class*=newsletter i],[class*=promo i],[class*=popular i],[class*=trending i],[class*=more-from i],[class*=read-next i],[class*=about-author i],[class*=author-bio i],[class*=authorbio i]';

const BYLINE_SELECTORS = [
  '[itemprop=author] [itemprop=name]', '[itemprop=author]', 'a[rel~=author]',
  '[class*=byline i] a', '[data-testid*=byline i] a', '[class*=byline i]', '[data-testid*=byline i]', '[data-component*=byline i]',
  '[class*=post-author-name i]', '[class*=author-name i]', '[class*=authorname i]', '[class*=article-author i] a', '[class*=article-author i]',
  '.author a', '.author', '.vcard .fn',
  'a[href*="/author/"]', 'a[href*="/authors/"]', 'a[href*="/people/"]', 'a[href*="/profiles/"]', 'a[href*="/contributor"]', 'a[href*="/by/"]',
];

const HREF_SELECTORS = new Set(BYLINE_SELECTORS.filter(x => x.startsWith('a[href')));

const NAME_WORD = "\\p{Lu}[\\p{L}'’.-]*";
const NAME = `${NAME_WORD}(?:\\s+(?:${NAME_WORD}|van|von|de|del|der|la|le|di|da)){1,3}`;
const NAME_LIST = `${NAME}(?:\\s*(?:,\\s*(?:and\\s+)?|\\s+and\\s+|\\s*&\\s*)${NAME})*`;
// "By Jane Doe", or lowercase "by Jane Doe" only where a byline can start, never
// mid-sentence ("a conjecture posed by John Conway").
const BY_RE = new RegExp(`(?:\\bBy|(?:^|(?<=[.!?|•·)”"’]\\s*))by):?\\s+(${NAME_LIST})`, 'u');
const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const DATE_TEXT = `(?:${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})`;
// Names directly under the headline, followed by a date or reading time.
const LEAD_NAMES_RE = new RegExp(`^(${NAME_LIST})\\s+(?=\\d+\\s*min|${DATE_TEXT}|Updated|Published|Posted)`, 'u');
const DATE_IN_TEXT = new RegExp(`(.{0,30}?)(${DATE_TEXT})`, 'giu');

function findVisibleAuthors($, scope) {
  const { order, h1Index, lead } = scope;
  // Byline elements: near the headline, outside comments / related stories etc.
  for (const sel of BYLINE_SELECTORS) {
    let els;
    try { els = $(sel).toArray(); } catch { continue; }
    els = els.filter(el => {
      const i = order.get(el);
      // Plain profile links must sit right by the headline: further down they are
      // usually people mentioned in the article.
      const reach = HREF_SELECTORS.has(sel) ? [40, 60] : [120, 300];
      if (i == null || (h1Index >= 0 && (i < h1Index - reach[0] || i > h1Index + reach[1]))) return false;
      if (h1Index < 0 && HREF_SELECTORS.has(sel)) return false;
      if ($(el).closest(NOISE).length) return false;
      // "Edited by", "Reviewed by" and similar credits are not the author.
      const before = textOf($, $(el).parent()).split(textOf($, el))[0] || '';
      return !/(edited|reviewed|fact[- ]?checked|produced|illustrated|photo\w*)( and [\w-]+)?\s+by:?\s*$/i.test(before);
    });
    if (!els.length) continue;
    const start = order.get(els[0]);
    const group = els.filter(el => order.get(el) - start < 40);
    const found = dedupe(group.flatMap(el => {
      const t = textOf($, el);
      return t.length > 120 || /\d{4}/.test(t) ? namesFromProse(t) : parseAuthors(t);
    })).filter(isCredibleByline);
    if (found.length && found.length <= 12) return { authors: found, source: 'byline on the page' };
  }
  // "By Jane Doe" in the text just under the headline.
  const by = lead.slice(0, 500).match(BY_RE);
  if (by) {
    const found = parseAuthors(by[1]).filter(isCredibleByline);
    if (found.length) return { authors: found, source: 'byline on the page' };
  }
  const direct = lead.match(LEAD_NAMES_RE);
  if (direct) {
    const found = parseAuthors(direct[1]);
    if (found.length && found.every(a => a.name == null)) return { authors: found, source: 'names under the headline' };
  }
  return { authors: [], source: '' };
}

function isCredibleByline(a) {
  if (a.name != null) return ORG_STRONG.test(a.name);
  return looksLikePerson([a.given, a.family].filter(Boolean).join(' '));
}

function namesFromProse(t) {
  const m = t.match(BY_RE);
  return m ? parseAuthors(m[1]) : [];
}

// The dates printed near the headline, labelled posted or updated.
function findVisibleDates($, scope) {
  const { order, h1Index, lead } = scope;
  const out = { published: null, updated: null };
  const note = (kind, d) => { if (d && !out[kind]) out[kind] = d; };

  $('time').each((_, el) => {
    const i = order.get(el);
    if (i == null || (h1Index >= 0 && (i < h1Index - 120 || i > h1Index + 500)) || $(el).closest(NOISE).length) return;
    const d = parseDate($(el).attr('datetime')) || parseDate(textOf($, el));
    if (!d) return;
    const label = lc(`${$(el).attr('class') || ''} ${$(el).attr('itemprop') || ''} ${$(el).parent().attr('class') || ''} ${textOf($, $(el).parent()).slice(0, 40)}`);
    note(/updat|modif|revis/.test(label) ? 'updated' : 'published', d);
  });
  for (const m of lead.slice(0, 400).matchAll(DATE_IN_TEXT)) {
    const d = parseDate(m[2].replace(/(\d)(st|nd|rd|th)/, '$1'));
    if (!d) continue;
    if (/©|copyright/i.test(m[1])) continue;
    note(/updat|modif|revis|reviewed|edited/i.test(m[1]) ? 'updated' : 'published', d);
  }
  return out;
}

function dateFromUrl(url) {
  const p = url.pathname;
  let m = p.match(/\/((?:19|20)\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:[/-]|$)/);
  if (m) return parseDate(`${m[1]}-${m[2]}-${m[3]}`);
  m = p.match(/\/((?:19|20)\d{2})\/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\/(\d{1,2})(?:\/|$)/i);
  if (m) return parseDate(`${m[2]} ${m[3]}, ${m[1]}`);
  return null;
}

const daysApart = (a, b) => Math.abs(Date.UTC(a.year, (a.month || 1) - 1, a.day || 1) - Date.UTC(b.year, (b.month || 1) - 1, b.day || 1)) / 864e5;
const sameDay = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;
const showDate = d => [d.year, d.month, d.day].filter(Boolean).map(n => String(n).padStart(2, '0')).join('-');
function notFuture(d) {
  if (!d) return null;
  const limit = Date.now() + 2 * 864e5;
  return Date.UTC(d.year, (d.month || 1) - 1, d.day || 1) > limit ? null : d;
}

/* ------------------------------------------------------------------ titles */

const SEP = /\s+(?:\||-|–|—|·|::|•|»|:)\s+/;

function overlap(a, b) {
  const words = s => new Set(lc(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2));
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter(w => y.has(w)).length / Math.max(x.size, y.size);
}

function stripSiteParts(title, names) {
  let t = title;
  for (let i = 0; i < 3; i++) {
    const parts = t.split(SEP);
    if (parts.length < 2) break;
    const last = parts[parts.length - 1];
    if (names.some(n => n && (sameEntity(last, n) || lc(n).includes(lc(last))))) {
      t = t.slice(0, t.lastIndexOf(last)).replace(/\s*(?:\||-|–|—|·|::|•|»|:)\s*$/, '').trim();
      continue;
    }
    const head = parts[0];
    if (names.some(n => n && sameEntity(head, n))) {
      t = t.slice(head.length).replace(/^\s*(?:\||-|–|—|·|::|•|»|:)\s*/, '').trim();
      continue;
    }
    break;
  }
  return t;
}

function titleSuffix(docTitle) {
  const inBrackets = (docTitle || '').match(/\S.*\(([^()]{4,60})\)$/);
  if (inBrackets) return inBrackets[1].trim(); // "Virtue Ethics (Stanford Encyclopedia of Philosophy)"
  const parts = (docTitle || '').split(/\s+(?:\||-|–|—|·|::|•|»)\s+/);
  if (parts.length < 2) return '';
  const last = parts[parts.length - 1].trim();
  return last.split(' ').length <= 5 && !/^[\w-]+\.(com|org|net|edu|gov|co|io|info)$/i.test(last) ? last : '';
}

/* ------------------------------------------------------------ source type */

// Newspapers and magazines whose articles APA treats as periodical articles,
// even when their markup only says "Article".
const PERIODICAL_HOSTS = /(^|\.)(nytimes|washingtonpost|wsj|latimes|usatoday|bostonglobe|chicagotribune|sfchronicle|theguardian|ft|economist|theatlantic|newyorker|time|newsweek|vanityfair|wired|smithsonianmag|nationalgeographic|scientificamerican|harpers|rollingstone|forbes|bloomberg|vogue|esquire|gq|theverge|slate|salon|motherjones|thenation|newrepublic|foreignaffairs|foreignpolicy|nybooks|lrb|prospect|psychologytoday|techcrunch|arstechnica|theconversation|aeon|cbsnews|nbcnews|abcnews|cnn|npr|bbc|foxnews|independent)\.(com|org|co\.uk)$/i;
const NEWS_TYPES = /NewsArticle|LiveBlogPosting/;

function detectType({ url, ldTypes, ogType, meta, isJournal, isWiki, siteName }) {
  if (isWiki) return 'wiki';
  if (isJournal) return 'journal';
  const blogHost = /(^|\.)blog\.|\.blog$|blogspot\.|wordpress\.com$|substack\.com$|medium\.com$|tumblr\.com$/i.test(url.hostname) ||
    /substack/i.test(meta('generator')) || /\/blogs?\//i.test(url.pathname);
  if (blogHost || (ldTypes.includes('BlogPosting') && /\bblog\b/i.test(siteName))) return 'blog';
  if (ldTypes.some(t => NEWS_TYPES.test(t))) return 'article';
  if (PERIODICAL_HOSTS.test(url.hostname) && (ldTypes.includes('Article') || ogType === 'article')) return 'article';
  return 'webpage';
}

/* ---------------------------------------------------------------- doi, url */

export const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>?#&]+)/;
export function doiFromString(s) {
  const m = (s || '').match(DOI_RE);
  return m ? m[1].replace(/[.,;)\]]+$/, '') : '';
}

function cleanUrl(u) {
  const url = new URL(u);
  for (const k of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_|ref_?src|cmpid|smid|smtyp|sref|source$|ocid|taid)/i.test(k)) url.searchParams.delete(k);
  }
  url.hash = '';
  return url.href;
}

// Capitalised words mid-sentence in the page's own text are probably proper
// nouns; APA sentence-casing keeps them capitalised.
export function properNounHints(texts) {
  const out = new Set();
  for (const t of texts) {
    if (!t) continue;
    for (const sentence of t.split(/(?<=[.!?:;])\s+|\n+/)) {
      sentence.split(/\s+/).slice(1).forEach(w => {
        const core = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/['’]s$/, '');
        if (core.length > 1 && /^\p{Lu}/u.test(core)) out.add(core);
      });
    }
  }
  return [...out];
}

/* ---------------------------------------------------------------- extract */

export function extractFromHtml(html, pageUrl) {
  const url = pageUrl instanceof URL ? pageUrl : new URL(pageUrl);
  const $ = load(html);

  const metaMap = new Map();
  $('meta').each((_, el) => {
    const key = lc($(el).attr('name') || $(el).attr('property') || $(el).attr('itemprop') || '');
    const val = ($(el).attr('content') || '').replace(/\s+/g, ' ').trim();
    if (!key || !val) return;
    if (!metaMap.has(key)) metaMap.set(key, []);
    metaMap.get(key).push(val);
  });
  const meta = (...keys) => { for (const k of keys) { const v = metaMap.get(k)?.[0]; if (v) return v; } return ''; };
  const metaAll = (...keys) => keys.flatMap(k => metaMap.get(k) || []);

  const ld = collectJsonLd($);
  const docTitle = clean($('head title').first().text()) || clean($('title').first().text());

  // Headline: the first <h1> that isn't just the site's logo.
  const ogSite = meta('og:site_name');
  const titleHints = [meta('og:title'), meta('twitter:title'), meta('citation_title'), docTitle].filter(Boolean);
  const h1s = $('h1').toArray().filter(el => textOf($, el) && !$(el).closest('footer,aside,nav').length);
  const h1Score = el => Math.max(0, ...titleHints.map(h => overlap(textOf($, el), h))) - (ogSite && sameEntity(textOf($, el), ogSite) ? 1 : 0);
  const h1El = h1s.reduce((best, el) => (!best || h1Score(el) > h1Score(best) ? el : best), null);
  const h1 = h1El && h1Score(h1El) > -0.5 ? textOf($, h1El) : '';

  // Document order, so "near the headline" can be measured.
  const all = $('body *').toArray();
  const order = new Map(all.map((el, i) => [el, i]));
  const h1Index = h1El ? (order.get(h1El) ?? -1) : -1;
  let lead = '';
  if (h1El) {
    const parts = [];
    for (let i = h1Index + 1; i < all.length && parts.join(' ').length < 900; i++) {
      const el = all[i];
      if ($(el).closest(h1El).length || /^(script|style|noscript|svg)$/.test(el.name)) continue;
      if ($(el).closest(NOISE).length) continue;
      const own = (el.children || []).filter(c => c.type === 'text').map(c => c.data).join(' ').trim();
      if (own) parts.push(own);
    }
    lead = parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  const scope = { order, h1Index, lead };

  const main = pickMainNode(ld, url, h1);
  const ldTypes = main ? ld.types(main) : [];
  const ldWebsite = ld.nodes.find(n => ld.types(n).includes('WebSite'));
  const ldPublisher = main ? ld.resolve(main.publisher) : null;
  const ldPublisherName = clean(typeof ldPublisher === 'string' ? ldPublisher : first(ldPublisher?.name) || '');
  const ldPart = main ? ld.resolve(main.isPartOf) : null;

  const fields = {};
  const sources = {};
  const warnings = [];
  const pick = (field, candidates) => {
    for (const [source, value] of candidates) {
      if (value && (!Array.isArray(value) || value.length)) {
        fields[field] = value;
        sources[field] = source;
        return value;
      }
    }
    return null;
  };

  const isWiki = /(^|\.)(wikipedia|wiktionary|wikimedia)\.org$|(^|\.)fandom\.com$/i.test(url.hostname) ||
    (/mediawiki/i.test(meta('generator')) && !ldAuthors(main, ld).some(a => a.name == null));
  const isJournal = !!meta('citation_journal_title');

  /* website / periodical name */
  const nameFromFooter = () => {
    const m = textOf($, $('footer').last()).match(/©\s*(?:(?:19|20)\d{2}\s*[-–]?\s*(?:(?:19|20)\d{2})?\s*)?(?:by\s+)?(\p{Lu}[\p{L}\p{N}&'’. -]{2,50}?)(?:[.,|]|\s+All\s|\s*$)/u);
    return m ? m[1].trim() : '';
  };
  pick('container', [
    ['citation_journal_title', meta('citation_journal_title')],
    ['Open Graph (og:site_name)', ogSite],
    ['JSON-LD (WebSite)', clean(first(ldWebsite?.name) || '')],
    ['JSON-LD (isPartOf)', clean(first(ldPart?.name) || '')],
    ['Dublin Core', meta('dc.source', 'dcterms.ispartof')],
    ['application-name', meta('application-name', 'apple-mobile-web-app-title')],
    ['JSON-LD publisher', ldPublisherName],
    ['end of the page <title>', titleSuffix(docTitle)],
    ['© line in the footer', nameFromFooter()],
  ]);
  // "MIT News | Massachusetts Institute of Technology": site, then publisher.
  let extraPublisher = '';
  if (fields.container) {
    const parts = fields.container.split(/\s+[|–—]\s+/);
    if (parts.length === 2) { fields.container = parts[0].trim(); extraPublisher = parts[1].trim(); }
  }
  const siteName = fields.container || '';

  /* publisher */
  pick('publisher', [
    ['citation_publisher', meta('citation_publisher', 'dc.publisher', 'dcterms.publisher')],
    ['JSON-LD', ldPublisherName],
    ['site name', extraPublisher],
  ]);

  /* title: must match the headline on the page */
  // The title is cited as printed, so the page's own headline wins. The hidden data
  // only supplies it when it has the same words (it keeps punctuation a styled
  // headline can lose), or when the page has no usable headline.
  const candidates = [
    ['citation_title', meta('citation_title')],
    // Wikipedia's "headline" is the Wikidata description; "name" is the title.
    ['JSON-LD', isWiki ? clean(first(main?.name) || '') : clean(first(main?.headline) || '') || (ldTypes.some(t => ARTICLE_TYPES.test(t)) ? clean(first(main?.name) || '') : '')],
    ['Open Graph', meta('og:title')],
    ['Twitter card', meta('twitter:title')],
    ['Dublin Core', meta('dc.title', 'dcterms.title')],
    ['<title>', docTitle],
  ].filter(([, v]) => v);
  const siteNames = [siteName, fields.publisher, extraPublisher, url.hostname.replace(/^www\./, '')];
  const usableH1 = h1 && !siteNames.some(n => n && sameEntity(h1, n)) ? h1 : '';
  let chosen = null;
  if (meta('citation_title')) {
    chosen = ['citation_title', stripSiteParts(meta('citation_title'), siteNames)];
  } else if (usableH1 && !isWiki) {
    const twin = candidates.map(([source, v]) => [source, stripSiteParts(v, siteNames)]).find(([, t]) => t && overlap(t, usableH1) >= 0.9);
    chosen = twin || ['headline on the page', usableH1];
  } else {
    for (const [source, value] of candidates) {
      const t = stripSiteParts(value, siteNames);
      if (t) { chosen = [source, t]; break; }
    }
  }
  if (chosen) {
    sources.title = chosen[0];
    fields.title = chosen[1].replace(/[™®℠]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* authors */
  const visibleAuthors = findVisibleAuthors($, scope);
  const twitterAuthor = [1, 2, 3, 4].map(i => (/^(written by|author|by)\b/i.test(meta(`twitter:label${i}`)) ? meta(`twitter:data${i}`) : '')).find(Boolean) || '';
  const structuredAuthors = dedupe(ldAuthors(main, ld));
  const bibliographic = dedupe(metaAll('citation_author', 'citation_authors', 'bepress_citation_author', 'dc.creator.personalname')
    .flatMap(a => a.split(/\s*;\s*/)).flatMap(a => parseAuthors(a, { person: true, bibliographic: a.includes(',') })));
  const looseMeta = metaAll('author', 'parsely-author', 'sailthru.author', 'byl', 'article.author', 'cxenseparse:author', 'dc.creator', 'dcterms.creator', 'dc.contributor');
  const articleAuthor = dedupe(metaAll('article:author', 'og:article:author').flatMap(a => parseAuthors(a)));
  const metaAuthors = dedupe(looseMeta.flatMap(a => parseAuthors(a)));

  // The publisher named as "author" says little if a person signed the byline.
  const isJustSite = list => list.length === 1 && list[0].name != null && (sameEntity(list[0].name, siteName) || sameEntity(list[0].name, fields.publisher));
  const ranked = [
    ['citation_author', bibliographic],
    ['JSON-LD', structuredAuthors],
    ['Open Graph (article:author)', articleAuthor],
    ['Twitter card', dedupe(parseAuthors(twitterAuthor))],
    ['meta author', metaAuthors],
  ].filter(([, l]) => l.length);
  const strongest = ranked.find(([, l]) => !isJustSite(l));
  if (strongest && (!visibleAuthors.authors.length || !isJustSite(visibleAuthors.authors))) {
    pick('authors', [strongest]);
    if (visibleAuthors.authors.length && !anyInCommon(strongest[1], visibleAuthors.authors) && strongest[0] !== 'citation_author') {
      warnings.push(`Check the author: the page’s hidden data says “${showAuthors(strongest[1])}”, but the byline on the page says “${showAuthors(visibleAuthors.authors)}”. The hidden data was used; fix it below if the byline is right.`);
    }
  } else if (visibleAuthors.authors.length) {
    fields.authors = visibleAuthors.authors;
    sources.authors = visibleAuthors.source;
  } else if (ranked.length) {
    pick('authors', [ranked[0]]);
  }
  if (!fields.authors) fields.authors = [];

  /* dates */
  const visibleDates = findVisibleDates($, scope);
  const urlDate = dateFromUrl(url);
  const datedRaw = [
    ['citation_publication_date', meta('citation_publication_date', 'citation_date', 'citation_online_date', 'bepress_citation_date')],
    ['JSON-LD datePublished', first(main?.datePublished) || (ldTypes.some(t => ARTICLE_TYPES.test(t)) ? first(main?.dateCreated) : '')],
    ['Open Graph (article:published_time)', meta('article:published_time', 'og:published_time', 'og:article:published_time', 'article:published')],
    ['itemprop datePublished', meta('datepublished')],
    ['Dublin Core', meta('dc.date.issued', 'dcterms.issued', 'dc.date.created', 'dcterms.created', 'dc.date', 'dcterms.date')],
    ['date meta tag', meta('date', 'pubdate', 'publish-date', 'publishdate', 'publication_date', 'sailthru.date', 'parsely-pub-date', 'article.published', 'article_date_original', 'cxenseparse:recs:publishtime')],
  ];
  const structuredDate = datedRaw.map(([s, v]) => [s, notFuture(parseDate(v)), String(v || '')]).find(([, d]) => d);
  const updatedCandidates = [
    ['JSON-LD dateModified', notFuture(parseDate(first(main?.dateModified)))],
    ['Open Graph (article:modified_time)', notFuture(parseDate(meta('article:modified_time', 'og:updated_time', 'og:article:modified_time', 'datemodified', 'dcterms.modified', 'dc.date.modified', 'last-modified')))],
    ['shown on the page', notFuture(visibleDates.updated)],
  ];
  const shown = notFuture(visibleDates.published);

  if (isWiki) {
    // Wiki pages change constantly: cite the date of the version you read.
    pick('date', updatedCandidates);
    if (fields.date) sources.date += ' (last revision)';
  } else {
    pick('updated', updatedCandidates);
    if (structuredDate) {
      const [src, d, raw] = structuredDate;
      fields.date = d; sources.date = src;
      const utcish = /T\d.*(Z|[+-]00:?00)$/i.test(raw.trim());
      const better = shown || urlDate;
      if (better && d.day && better.day && !sameDay(d, better)) {
        const apart = daysApart(d, better);
        if (apart <= 1 && utcish) {
          // A time stored in UTC can fall on the next calendar day; the printed date is the real one.
          fields.date = better;
          sources.date = shown ? 'date shown on the page' : 'date in the URL';
        } else if (shown && fields.updated && sameDay(shown, fields.updated)) {
          // The date printed on the page is the update date: nothing to resolve.
        } else {
          warnings.push(`Check the date: the page’s hidden data says ${showDate(d)}, but ${shown ? 'the page shows' : 'the URL says'} ${showDate(better)}. ${src} was used; fix it below if needed.`);
        }
      }
    } else if (shown) {
      fields.date = shown; sources.date = 'date shown on the page';
    } else if (urlDate) {
      fields.date = urlDate; sources.date = 'date in the URL';
    } else if (fields.updated) {
      fields.date = fields.updated; sources.date = `${sources.updated} (last updated)`;
      warnings.push('No publication date found; the page’s “last updated” date is used instead.');
    }
    if (fields.updated && fields.date && sameDay(fields.updated, fields.date)) {
      delete fields.updated; delete sources.updated;
    }
    if (fields.updated && fields.date && Date.UTC(fields.updated.year, (fields.updated.month || 1) - 1, fields.updated.day || 1) < Date.UTC(fields.date.year, (fields.date.month || 1) - 1, fields.date.day || 1)) {
      delete fields.updated; delete sources.updated;
    }
  }

  /* type */
  const ogType = meta('og:type');
  fields.type = detectType({ url, ldTypes, ogType, meta, isJournal, isWiki, siteName });

  /* journal details */
  pick('volume', [['citation_volume', meta('citation_volume', 'prism.volume')]]);
  pick('issue', [['citation_issue', meta('citation_issue', 'prism.number')]]);
  const fp = meta('citation_firstpage', 'prism.startingpage');
  const lp = meta('citation_lastpage', 'prism.endingpage');
  pick('pages', [['citation_firstpage/lastpage', fp && lp && fp !== lp ? `${fp}-${lp}` : fp]]);

  /* DOI */
  pick('doi', [
    ['citation_doi', meta('citation_doi', 'bepress_citation_doi', 'prism.doi')],
    ['Dublin Core', metaAll('dc.identifier', 'dcterms.identifier').find(v => DOI_RE.test(v))],
    ['JSON-LD', [].concat(main?.identifier || [], main?.sameAs || []).map(v => (typeof v === 'object' ? v?.value || v?.['@id'] : v)).find(v => typeof v === 'string' && /doi/i.test(v) && DOI_RE.test(v))],
  ].map(([s, v]) => [s, doiFromString(v)]));

  /* URL: the canonical URL on the same site, minus tracking parameters */
  const canonical = $('link[rel~=canonical]').attr('href') || meta('og:url');
  let finalUrl = url.href;
  try {
    const c = new URL(canonical, url);
    const base = h => h.replace(/^www\./, '');
    if (canonical && /^https?:$/.test(c.protocol) && (base(c.hostname) === base(url.hostname) || c.hostname.endsWith('.' + base(url.hostname)))) finalUrl = c.href;
  } catch { /* keep fetched URL */ }
  fields.url = cleanUrl(finalUrl);

  /* wiki */
  if (fields.type === 'wiki') {
    const rev = html.match(/"wgRevisionId":(\d+)/)?.[1];
    const page = html.match(/"wgPageName":"((?:[^"\\]|\\.)+)"/)?.[1];
    if (rev && page) {
      const title = encodeURIComponent(JSON.parse(`"${page}"`)).replace(/%28/g, '(').replace(/%29/g, ')');
      fields.permalink = `${url.origin}/w/index.php?title=${title}&oldid=${rev}`;
      sources.permalink = 'Wikipedia revision ID';
    }
    fields.authors = []; // collaboratively written: cited without an author
    delete sources.authors;
  }

  /* is this actually one article? */
  const depth = url.pathname.split('/').filter(Boolean).length;
  const looksLikeListing = url.pathname === '/' || ldTypes.includes('CollectionPage') ||
    (depth <= 2 && !isWiki && !fields.authors.length && !fields.date && !ldTypes.some(t => ARTICLE_TYPES.test(t)) && ogType !== 'article');
  if (looksLikeListing) {
    warnings.push('This looks like a home or section page, not one article. For a citation, paste the link to the specific article.');
    if (url.pathname === '/' && !shown) { delete fields.date; delete sources.date; delete fields.updated; delete sources.updated; }
  }

  /* paywall */
  const free = main?.isAccessibleForFree;
  if ((free === false || lc(String(free)) === 'false') && (!fields.authors.length || !fields.date)) {
    warnings.push('The page is marked as subscriber-only, so some details may be hidden. Check them against the article.');
  }

  /* proper-noun hints for APA sentence case */
  const articleEl = $('article').first();
  const paras = (articleEl.length ? articleEl : $('body')).find('p').slice(0, 14).toArray().map(el => textOf($, el));
  const hints = properNounHints([meta('description'), meta('og:description'), meta('twitter:description'), clean(first(main?.description) || ''), lead, ...paras]);
  for (const a of fields.authors) for (const part of [a.family, a.given, a.name]) if (part) hints.push(...part.split(/\s+/));
  if (siteName) hints.push(...siteName.split(/\s+/));
  hints.push(...metaAll('keywords', 'news_keywords').flatMap(k => k.split(/\s*,\s*/)).flatMap(k => k.split(/\s+/)).filter(w => /^\p{Lu}/u.test(w)));

  return { fields, sources, warnings, hints: [...new Set(hints)] };
}
