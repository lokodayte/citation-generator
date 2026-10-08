// Fetches a URL and extracts citation metadata. No dependencies (Node 18+).
//
// Order of preference for every field:
//   1. Structured data: citation_* meta (academic), JSON-LD (schema.org),
//      Open Graph, Twitter cards, Dublin Core
//   2. Plain HTML: <title>, <meta name="author">, <time>, bylines
//   3. CrossRef (api.crossref.org) when a DOI is found — overrides the above
// Nothing is guessed: a field that can't be found is left empty.

import { parseDate, parseName, sameEntity } from '../public/format.js';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const API_UA = 'CitationGenerator/1.0 (local citation tool)';
const TIMEOUT_MS = 15000;
const MAX_BYTES = 5 * 1024 * 1024;

export class ExtractError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ------------------------------------------------------------ entry point */

export async function extractCitation(input) {
  const url = normalizeInput(input);
  const doiInUrl = doiFromString(decodeURIComponent(url.pathname + url.search));
  const isDoiLink = /(^|\.)doi\.org$/i.test(url.hostname);

  // DOI links: go straight to CrossRef for clean data.
  if (doiInUrl && isDoiLink) {
    try {
      const cr = await crossref(doiInUrl);
      cr.fields.url = `https://doi.org/${cr.fields.doi}`;
      return cr;
    } catch (e) {
      if (e.code !== 'doi_not_found') throw e;
      // Not a CrossRef DOI (e.g. DataCite) — fall back to the landing page.
    }
  }

  let page;
  try {
    page = await fetchPage(url);
  } catch (e) {
    // Publisher pages often block bots; if the URL itself contains a DOI we
    // can still get authoritative metadata from CrossRef.
    if (doiInUrl && e instanceof ExtractError) {
      const cr = await crossref(doiInUrl).catch(() => null);
      if (cr) {
        cr.fields.url = url.href;
        cr.warnings.unshift(`The page itself couldn't be fetched (${e.message}) — used CrossRef data for the DOI in the URL.`);
        return cr;
      }
    }
    throw e;
  }

  const result = extractFromHtml(page.html, page.url);
  const doi = result.fields.doi || doiInUrl;
  if (doi) {
    try {
      mergeCrossref(result, await crossref(doi));
    } catch (e) {
      result.fields.doi = doi;
      result.warnings.push(`Found DOI ${doi}, but the CrossRef lookup failed (${e.message}); using the page's own metadata.`);
    }
  }
  return result;
}

function normalizeInput(input) {
  let s = String(input || '').trim();
  if (!s) throw new ExtractError('bad_url', 'Please paste a URL.');
  const bareDoi = s.match(/^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i);
  if (bareDoi) s = `https://doi.org/${bareDoi[1]}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  let url;
  try { url = new URL(s); } catch { throw new ExtractError('bad_url', 'That doesn’t look like a valid URL.'); }
  if (!/^https?:$/.test(url.protocol)) throw new ExtractError('bad_url', 'Only http(s) links can be cited.');
  return url;
}

/* --------------------------------------------------------------- fetching */

async function fetchPage(url) {
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new ExtractError('timeout', `The site didn’t respond within ${TIMEOUT_MS / 1000} seconds.`);
    }
    const cause = e.cause?.code || '';
    if (cause === 'ENOTFOUND' || cause === 'EAI_AGAIN') {
      throw new ExtractError('dns', `Couldn’t find the server “${url.hostname}”. Check the URL for typos.`);
    }
    throw new ExtractError('network', `Couldn’t connect to ${url.hostname} (${cause || e.message}).`);
  }

  if (!res.ok) throw statusError(res.status);

  const type = res.headers.get('content-type') || '';
  if (/application\/pdf/i.test(type)) {
    throw new ExtractError('not_html', 'This link is a PDF, which has no web-page metadata to read. Try the article’s landing page or DOI instead, or fill in the fields by hand.');
  }
  if (type && !/html|xml/i.test(type)) {
    throw new ExtractError('not_html', `This link returns ${type.split(';')[0]}, not a web page.`);
  }

  const html = decodeBody(await readLimited(res), type);
  if (isBotWall(html)) {
    throw new ExtractError('blocked', 'The site answered with a bot check / CAPTCHA page instead of the article, so its metadata can’t be read automatically.');
  }
  return { html, url: new URL(res.url || url.href) };
}

function statusError(status) {
  const msg = {
    401: 'The page requires a login (HTTP 401).',
    402: 'The page is behind a paywall (HTTP 402).',
    403: 'The site refused access (HTTP 403). It may block automated requests, or the page may be behind a paywall or login.',
    404: 'Page not found (HTTP 404). Check that the URL is correct.',
    410: 'This page has been removed (HTTP 410).',
    429: 'The site is rate-limiting requests (HTTP 429). Try again in a minute.',
    451: 'The page is unavailable for legal reasons (HTTP 451).',
  }[status];
  const code = { 401: 'blocked', 402: 'paywall', 403: 'blocked', 404: 'not_found', 410: 'not_found', 429: 'rate_limited', 451: 'blocked' }[status];
  if (msg) return new ExtractError(code, msg, status);
  if (status >= 500) return new ExtractError('server_error', `The site had a server error (HTTP ${status}). Try again later.`, status);
  return new ExtractError('http_error', `The site returned HTTP ${status}.`, status);
}

async function readLimited(res) {
  const chunks = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= MAX_BYTES) { await reader.cancel(); break; }
  }
  return Buffer.concat(chunks);
}

function decodeBody(buf, contentType) {
  let charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (!charset) {
    const sniff = buf.subarray(0, 4096).toString('latin1');
    charset = sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  }
  try { return new TextDecoder(charset || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

function isBotWall(html) {
  if (html.length > 150000) return false;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return /just a moment|attention required|are you a (robot|human)|security check|access denied|verify you are human/i.test(title) ||
    /_Incapsula_Resource|captcha-delivery\.com|cf-chl-|px-captcha/i.test(html);
}

/* ------------------------------------------------------------ HTML parsing */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', copy: '©', reg: '®', trade: '™',
  laquo: '«', raquo: '»', middot: '·', bull: '•', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', atilde: 'ã', aring: 'å', iacute: 'í', igrave: 'ì',
  icirc: 'î', iuml: 'ï', oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö', otilde: 'õ', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', ntilde: 'ñ', ccedil: 'ç', szlig: 'ß',
  Eacute: 'É', Aacute: 'Á', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Ccedil: 'Ç', Ouml: 'Ö', Uuml: 'Ü', Auml: 'Ä',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    return ENTITIES[e] ?? m;
  });
}

const stripTags = s => (s || '').replace(/<[^>]*>/g, ' ');
const clean = s => (typeof s === 'string' ? decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim() : '');
const first = v => (Array.isArray(v) ? v[0] : v);

function parseAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([^\s=<>"'/]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return attrs;
}

function collectMeta(html) {
  const map = new Map();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = parseAttrs(tag);
    const key = (a.name || a.property || a.itemprop || '').toLowerCase();
    if (!key || a.content == null) continue;
    const val = clean(a.content);
    if (!val) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(val);
  }
  return map;
}

function collectLinks(head) {
  const links = [];
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) links.push(parseAttrs(tag));
  return links;
}

const ARTICLE_TYPES = /^(Article|NewsArticle|ReportageNewsArticle|AnalysisNewsArticle|OpinionNewsArticle|BackgroundNewsArticle|ReviewNewsArticle|BlogPosting|LiveBlogPosting|SocialMediaPosting|ScholarlyArticle|MedicalScholarlyArticle|TechArticle|Report|Review)$/;
const PERIODICAL_TYPES = /NewsArticle|BlogPosting|LiveBlogPosting/;

function collectJsonLd(html) {
  const nodes = [];
  const walk = x => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    if (x['@graph']) walk(x['@graph']);
    if (x['@type']) nodes.push(x);
    if (x.mainEntity && typeof x.mainEntity === 'object') walk(x.mainEntity);
  };
  for (const [, body] of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = body.trim().replace(/^(\/\/\s*)?<!\[CDATA\[|(\/\/\s*)?\]\]>$/g, '');
    try { walk(JSON.parse(text)); continue; } catch { /* retry below */ }
    try { walk(JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '))); } catch { /* ignore invalid JSON-LD */ }
  }
  const byId = new Map(nodes.filter(n => n['@id']).map(n => [n['@id'], n]));
  const resolve = v => (v && typeof v === 'object' && v['@id'] && byId.get(v['@id'])) || v;
  const types = n => [].concat(n?.['@type'] || []).map(String);
  const find = re => nodes.find(n => types(n).some(t => re.test(t)));
  return {
    article: find(ARTICLE_TYPES),
    webpage: find(/WebPage$/),
    website: find(/^WebSite$/),
    resolve,
    types,
  };
}

/* ------------------------------------------------------------- authors */

const ORG_WORDS = /\b(staff|news|team|editors?|editorial|desk|board|foundation|institute|university|college|association|society|agency|organi[sz]ation|department|ministry|council|committee|cent(?:er|re)|inc|llc|ltd|press|media|group|company|corporation|contributors?|times|post|magazine|reporters?|wire|service|network|channel|online|official|government|office)\b/i;

function splitNames(str) {
  let parts = str.split(/\s*(?:;|\s&\s|\sand\s|\|)\s*/i);
  parts = parts.flatMap(p => {
    const c = p.split(/\s*,\s*/);
    return c.length > 1 && c.every(x => x.split(/\s+/).length >= 2) ? c : [p];
  });
  return parts.map(p => p.trim()).filter(Boolean);
}

function toAuthors(raw, { person = false, siteName = '' } = {}) {
  const str = clean(raw).replace(/^by:?\s+/i, '');
  if (!str || /^(https?:|www\.|@)/i.test(str) || str.length > 150) return [];
  // An organisation name: keep whole (don't split "Johnson and Johnson").
  if (!person && ORG_WORDS.test(str)) return [{ name: str }];
  return splitNames(str).map(n => {
    if (!person && (ORG_WORDS.test(n) || n.split(' ').length > 5)) return { name: n };
    return parseName(n);
  }).filter(Boolean);
}

function ldAuthors(main, ld, siteName) {
  const raw = [].concat(main?.author || main?.creator || []).map(ld.resolve);
  return raw.flatMap(a => {
    if (typeof a === 'string') return toAuthors(a, { siteName });
    if (!a || typeof a !== 'object') return [];
    if (a.familyName) return [{ family: clean(first(a.familyName)), given: clean(first(a.givenName) || ''), suffix: '' }];
    const name = clean(first(a.name));
    if (!name) return [];
    if (ld.types(a).some(t => /Organization|Corporation|NewsMediaOrganization|GovernmentOrganization/.test(t))) return [{ name }];
    return toAuthors(name, { person: ld.types(a).includes('Person'), siteName });
  });
}

function bylineAuthors(html, siteName) {
  const re = /<(\w+)\b[^>]*(?:rel\s*=\s*["']author["']|itemprop\s*=\s*["']author["']|class\s*=\s*["'][^"']*\bbyline\b[^"']*["'])[^>]*>([\s\S]{0,400}?)<\/\1>/i;
  const m = html.match(re);
  if (!m) return [];
  const text = clean(m[2]).replace(/^by:?\s+/i, '');
  if (!text || text.length > 80 || /\d/.test(text)) return [];
  return toAuthors(text, { siteName });
}

function dedupeAuthors(list) {
  const seen = new Set();
  return list.filter(a => {
    const k = (a.name ?? `${a.family}|${a.given}`).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ----------------------------------------------------------------- misc */

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>?#&]+)/;
function doiFromString(s) {
  const m = (s || '').match(DOI_RE);
  return m ? m[1].replace(/[.,;)\]]+$/, '') : '';
}

const TITLE_SEP = /\s+(?:\||-|–|—|·|::|•)\s+/;

// "Some headline | Site Name" → "Some headline" when the suffix is the site.
function stripSiteSuffix(title, siteName) {
  const parts = title.split(TITLE_SEP);
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1];
  const firstPart = parts[0];
  if (siteName && sameEntity(last, siteName)) return title.slice(0, title.lastIndexOf(last)).replace(/\s*(?:\||-|–|—|·|::|•)\s*$/, '').trim();
  if (siteName && sameEntity(firstPart, siteName)) return title.slice(firstPart.length).replace(/^\s*(?:\||-|–|—|·|::|•)\s*/, '').trim();
  return title;
}

function titleSuffix(docTitle) {
  const parts = (docTitle || '').split(TITLE_SEP);
  if (parts.length < 2) return '';
  const last = parts[parts.length - 1].trim();
  return last.split(' ').length <= 5 ? last : '';
}

function cleanUrl(u) {
  const url = new URL(u);
  for (const k of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_|ref_?src|cmpid|smid|smtyp)/i.test(k)) url.searchParams.delete(k);
  }
  url.hash = '';
  return url.href;
}

// Capitalised words that appear mid-sentence in the page's own text are
// probably proper nouns; APA sentence-casing keeps them capitalised.
function properNounHints(texts) {
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

/* --------------------------------------------------------------- extract */

export function extractFromHtml(html, pageUrl) {
  const url = pageUrl instanceof URL ? pageUrl : new URL(pageUrl);
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 300000);
  const meta = collectMeta(html);
  const m = (...keys) => { for (const k of keys) { const v = meta.get(k)?.[0]; if (v) return v; } return ''; };
  const ma = (...keys) => keys.flatMap(k => meta.get(k) || []);
  const links = collectLinks(head);
  const ld = collectJsonLd(html);
  const main = ld.article || ld.webpage || null;
  const docTitle = clean(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');

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

  // Type
  const ldTypes = main ? ld.types(main) : [];
  const ogType = m('og:type');
  const isWiki = /(^|\.)wikipedia\.org$/i.test(url.hostname);
  const isJournal = !!m('citation_journal_title');
  const isBlog = /(^|\.)blog\.|blogspot\.|wordpress\.com$|substack\.com$|medium\.com$/i.test(url.hostname) || /\/blogs?\//i.test(url.pathname);
  const isPeriodical = ldTypes.some(t => PERIODICAL_TYPES.test(t)) || isBlog;
  fields.type = isWiki ? 'wiki' : isJournal ? 'journal' : isPeriodical ? 'article' : 'webpage';

  // Website / container name
  const ldPart = main && ld.resolve(main.isPartOf);
  const ldPublisher = main && ld.resolve(main.publisher);
  const ldPublisherName = clean(typeof ldPublisher === 'string' ? ldPublisher : first(ldPublisher?.name));
  pick('container', [
    ['citation_journal_title', m('citation_journal_title')],
    ['Open Graph (og:site_name)', m('og:site_name')],
    ['JSON-LD (WebSite)', clean(first(ld.website?.name))],
    ['JSON-LD (isPartOf)', clean(first(ldPart?.name))],
    ['Dublin Core', m('dc.source', 'dcterms.ispartof')],
    ['application-name meta', m('application-name')],
    ['JSON-LD publisher', fields.type === 'article' ? ldPublisherName : ''],
    ['<title> suffix', titleSuffix(docTitle)],
  ]);
  const siteName = fields.container || '';

  // Title
  pick('title', [
    ['citation_title', m('citation_title', 'dc.title.alternative')],
    // Wikipedia's JSON-LD "headline" is the Wikidata description; "name" is the title.
    ['JSON-LD', isWiki ? clean(first(main?.name)) : clean(first(main?.headline)) || (ld.article ? clean(first(main?.name)) : '')],
    ['Open Graph', m('og:title')],
    ['Twitter card', m('twitter:title')],
    ['Dublin Core', m('dc.title', 'dcterms.title')],
    ['<title>', docTitle],
  ]);
  if (fields.title) {
    const stripped = stripSiteSuffix(fields.title, siteName);
    if (stripped) fields.title = stripped;
    // Some sites use one generic og:title ("Welcome to Example.com") on every
    // page; if it names the site but the page's <title> doesn't, use <title>.
    const fromDoc = stripSiteSuffix(docTitle, siteName);
    const lc = x => x.toLowerCase();
    if (/Open Graph|Twitter/.test(sources.title) && siteName && fromDoc && lc(fields.title).includes(lc(siteName)) &&
        !lc(fromDoc).includes(lc(siteName)) && lc(fromDoc) !== lc(fields.title)) {
      fields.title = fromDoc;
      sources.title = '<title>';
    }
    fields.title = fields.title.replace(/[™®℠]/g, '').trim();
  }

  // Publisher
  pick('publisher', [
    ['citation_publisher', m('citation_publisher', 'dc.publisher', 'dcterms.publisher')],
    ['JSON-LD', ldPublisherName],
  ]);

  // Authors
  const opts = { siteName };
  pick('authors', [
    ['citation_author', dedupeAuthors(ma('citation_author', 'citation_authors').flatMap(a => a.includes(';') ? a.split(';') : [a]).flatMap(a => toAuthors(a, { person: true })))],
    ['JSON-LD', dedupeAuthors(ldAuthors(main, ld, siteName))],
    ['Open Graph (article:author)', dedupeAuthors(ma('article:author').flatMap(a => toAuthors(a, opts)))],
    ['Dublin Core', dedupeAuthors(ma('dc.creator', 'dcterms.creator').flatMap(a => toAuthors(a, opts)))],
    ['meta author', dedupeAuthors(ma('author', 'parsely-author', 'sailthru.author', 'byl').flatMap(a => toAuthors(a, opts)))],
    ['byline in page', dedupeAuthors(bylineAuthors(html, siteName))],
  ]);
  if (!fields.authors) fields.authors = [];

  // Dates
  const timeTag = html.match(/<time\b[^>]*(?:itemprop\s*=\s*["']datePublished["']|pubdate)[^>]*>/i)?.[0] ||
    html.match(/<article\b[\s\S]{0,20000}?(<time\b[^>]*>)/i)?.[1] || '';
  const timeAttr = timeTag ? parseAttrs(timeTag).datetime : '';
  const dateCandidates = [
    ['citation_publication_date', m('citation_publication_date', 'citation_date', 'citation_online_date')],
    ['JSON-LD datePublished', main?.datePublished],
    ['Open Graph (article:published_time)', m('article:published_time', 'og:published_time')],
    ['Dublin Core', m('dc.date.issued', 'dcterms.issued', 'dc.date', 'dcterms.date', 'dcterms.created')],
    ['<time> element', timeAttr],
    ['date meta', m('date', 'pubdate', 'publish-date', 'publishdate', 'sailthru.date', 'parsely-pub-date', 'article.published')],
  ].map(([s, v]) => [s, parseDate(first(v))]);
  const modified = [
    ['JSON-LD dateModified', main?.dateModified],
    ['Open Graph (article:modified_time)', m('article:modified_time', 'og:updated_time')],
  ].map(([s, v]) => [s, parseDate(first(v))]);

  if (fields.type === 'wiki') {
    // Wiki pages change constantly; MLA and APA use the date of the version cited.
    pick('date', modified);
    if (fields.date) sources.date += ' (last revision)';
  } else if (!pick('date', dateCandidates) && pick('date', modified)) {
    sources.date += ' (last updated)';
    warnings.push('No publication date found; using the page’s “last updated” date.');
  }

  // Journal details
  pick('volume', [['citation_volume', m('citation_volume', 'prism.volume')]]);
  pick('issue', [['citation_issue', m('citation_issue', 'prism.number')]]);
  const fp = m('citation_firstpage', 'prism.startingpage');
  const lp = m('citation_lastpage', 'prism.endingpage');
  pick('pages', [['citation_firstpage/lastpage', fp && lp && fp !== lp ? `${fp}-${lp}` : fp]]);

  // DOI
  const doiSource = [
    ['citation_doi', m('citation_doi', 'bepress_citation_doi', 'prism.doi')],
    ['Dublin Core', ma('dc.identifier', 'dcterms.identifier').find(v => DOI_RE.test(v))],
    ['JSON-LD', [].concat(main?.identifier || [], main?.sameAs || []).map(v => (typeof v === 'object' ? v.value || v['@id'] : v)).find(v => typeof v === 'string' && /doi/i.test(v) && DOI_RE.test(v))],
  ].map(([s, v]) => [s, doiFromString(v)]);
  pick('doi', doiSource);

  // URL: prefer the canonical URL on the same site, minus tracking parameters.
  const canonical = links.find(l => /\bcanonical\b/i.test(l.rel || ''))?.href || m('og:url');
  let finalUrl = url.href;
  try {
    const c = new URL(decodeEntities(canonical), url);
    const base = h => h.replace(/^www\./, '');
    if (canonical && /^https?:$/.test(c.protocol) && (base(c.hostname) === base(url.hostname) || c.hostname.endsWith('.' + base(url.hostname)))) finalUrl = c.href;
  } catch { /* keep fetched URL */ }
  fields.url = cleanUrl(finalUrl);

  // Wikipedia permanent link to the exact revision (APA 7 recommends it).
  if (fields.type === 'wiki') {
    const rev = html.match(/"wgRevisionId":(\d+)/)?.[1];
    const page = html.match(/"wgPageName":"((?:[^"\\]|\\.)+)"/)?.[1];
    if (rev && page) {
      const title = encodeURIComponent(JSON.parse(`"${page}"`)).replace(/%28/g, '(').replace(/%29/g, ')');
      fields.permalink = `${url.origin}/w/index.php?title=${title}&oldid=${rev}`;
      sources.permalink = 'Wikipedia revision ID';
    }
    if (fields.authors.length) warnings.push('Wikipedia entries are cited without an author (the page is collaboratively written).');
  }

  // Paywall flag (schema.org)
  const free = main?.isAccessibleForFree ?? ld.webpage?.isAccessibleForFree;
  if (free === false || String(free).toLowerCase() === 'false') {
    warnings.push('The page is marked as subscriber-only. Metadata was read from the page header, but double-check it against the article.');
  }

  // Proper-noun hints for APA sentence case
  const article = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html.slice(headEnd > 0 ? headEnd : 0);
  const paras = [...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].slice(0, 12).map(p => clean(p[1]));
  const hints = properNounHints([
    m('description'), m('og:description'), m('twitter:description'), clean(first(main?.description)),
    ...paras,
  ]);
  for (const a of fields.authors) for (const part of [a.family, a.given, a.name]) if (part) hints.push(...part.split(/\s+/));
  if (siteName) hints.push(...siteName.split(/\s+/));
  hints.push(...ma('keywords', 'news_keywords').flatMap(k => k.split(/\s*,\s*/)).flatMap(k => k.split(/\s+/)).filter(w => /^\p{Lu}/u.test(w)));

  return { fields, sources, warnings, hints: [...new Set(hints)] };
}

/* --------------------------------------------------------------- CrossRef */

async function crossref(doi) {
  let res;
  try {
    res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': API_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ExtractError('crossref_error', `couldn’t reach CrossRef: ${e.cause?.code || e.message}`);
  }
  if (res.status === 404) throw new ExtractError('doi_not_found', `DOI ${doi} isn’t registered with CrossRef`);
  if (!res.ok) throw new ExtractError('crossref_error', `CrossRef returned HTTP ${res.status}`);
  const w = (await res.json()).message;

  const fields = {};
  const warnings = [];
  let title = clean(w.title?.[0]);
  const subtitle = clean(w.subtitle?.[0]);
  if (subtitle && !title.toLowerCase().includes(subtitle.toLowerCase())) title += `: ${subtitle}`;
  if (title) fields.title = title;
  fields.authors = (w.author || [])
    .map(a => (a.family ? { family: clean(a.family), given: clean(a.given || ''), suffix: clean(a.suffix || '') } : a.name ? { name: clean(a.name) } : null))
    .filter(Boolean);
  const dp = w.issued?.['date-parts']?.[0];
  if (dp?.[0]) fields.date = parseDate({ year: dp[0], month: dp[1], day: dp[2] });
  const container = clean(w['container-title']?.[0]);
  if (container) fields.container = container;
  if (w.publisher) fields.publisher = clean(w.publisher);
  if (w.volume) fields.volume = clean(w.volume);
  if (w.issue) fields.issue = clean(w.issue);
  if (w.page) fields.pages = clean(w.page);
  if (w['article-number']) fields.articleNumber = clean(w['article-number']);
  fields.doi = w.DOI || doi;
  fields.type = w.type === 'journal-article' ? 'journal' : 'webpage';
  if (w.type !== 'journal-article') {
    warnings.push(`CrossRef lists this as “${w.type}”. This app formats journal articles, web pages, news/blog articles and wiki entries — check the result against the style guide.`);
  }

  const sources = {};
  for (const k of Object.keys(fields)) if (k !== 'type') sources[k] = 'CrossRef';
  const hints = properNounHints([clean(w.abstract || '')]);
  for (const a of fields.authors) for (const part of [a.family, a.given, a.name]) if (part) hints.push(...part.split(/\s+/));
  return { fields, sources, warnings, hints };
}

function mergeCrossref(result, cr) {
  for (const [k, v] of Object.entries(cr.fields)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (k === 'type' && v !== 'journal') continue; // keep the page's own type
    result.fields[k] = v;
    if (cr.sources[k]) result.sources[k] = cr.sources[k];
  }
  result.warnings.push(...cr.warnings);
  result.hints = [...new Set([...result.hints, ...cr.hints])];
}
