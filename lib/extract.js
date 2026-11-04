// Fetches a URL and hands its HTML to lib/page.js. When the link is a DOI, or the
// page declares one, CrossRef (api.crossref.org) overrides the page's data. When a
// site refuses the request, the latest copy in the Internet Archive is read instead
// (and clearly labelled); readers can also send a page from their own browser with
// the "Cite this page" button, which arrives here through extractFromSubmittedPage.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parseDate } from '../public/format.js';
import { clean, doiFromString, extractFromHtml, properNounHints } from './page.js';

export { extractFromHtml };

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const API_UA = 'CitationGenerator/1.0 (citation tool)';
const TIMEOUT_MS = 12000;
const ARCHIVE_TIMEOUT_MS = 8000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 8;
const BLOCKED_CODES = new Set(['blocked', 'paywall', 'rate_limited', 'timeout', 'network', 'empty', 'server_error']);

export class ExtractError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* ------------------------------------------------------------ entry point */

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

export async function extractCitation(input) {
  const url = normalizeInput(input);
  const doiInUrl = doiFromString(safeDecode(url.pathname + url.search));
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

  let result;
  try {
    const page = await fetchPage(url);
    result = extractFromHtml(page.html, page.url);
    if (!result.fields.title) throw new ExtractError('empty', 'The site sent back a page with no readable content (it may only work in a normal browser).');
  } catch (e) {
    if (!(e instanceof ExtractError)) throw e;
    // Publisher pages often block automated requests; a DOI in the URL still
    // gets authoritative metadata from CrossRef.
    if (doiInUrl) {
      const cr = await crossref(doiInUrl).catch(() => null);
      if (cr) {
        cr.fields.url = url.href;
        cr.warnings.unshift('The page itself couldn’t be read, so the details come from CrossRef, using the DOI in the link.');
        return cr;
      }
    }
    if (!BLOCKED_CODES.has(e.code)) throw e;
    result = await fromArchive(url);
    if (!result) throw e;
  }

  return addCrossref(result, result.fields.doi || doiInUrl);
}

// The reader's own browser sent the page (the "Cite this page" button).
export async function extractFromSubmittedPage(input, html) {
  const url = normalizeInput(input);
  if (typeof html !== 'string' || !html) throw new ExtractError('bad_page', 'No page content was received.');
  const result = extractFromHtml(html, url);
  return addCrossref(result, result.fields.doi || doiFromString(safeDecode(url.pathname + url.search)));
}

async function addCrossref(result, doi) {
  if (!doi) return result;
  try {
    mergeCrossref(result, await crossref(doi));
  } catch (e) {
    result.fields.doi = doi;
    result.warnings.push(`Found DOI ${doi}, but the CrossRef lookup failed (${e.message}); using the page’s own details.`);
  }
  return result;
}

// The latest copy saved by the Internet Archive's Wayback Machine, if any.
async function fromArchive(url) {
  try {
    const lookupUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url.href)}&output=json&limit=-1&filter=statuscode:200&fl=timestamp,original`;
    const res = await fetch(lookupUrl, { headers: { 'User-Agent': API_UA }, signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const rows = await res.json();
    const [timestamp, original] = rows[rows.length - 1] || [];
    if (!/^\d{14}$/.test(timestamp || '')) return null;
    // "id_" asks for the page exactly as saved, without the archive's toolbar.
    const page = await fetchPage(new URL(`https://web.archive.org/web/${timestamp}id_/${original}`));
    const result = extractFromHtml(page.html, url);
    if (!result.fields.title) return null;
    const saved = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
    result.warnings.unshift(`This site refuses automated requests, so the details were read from the Internet Archive’s copy saved on ${saved}. Compare them with the article, or use the “Cite this page” button for the live page.`);
    result.sources = Object.fromEntries(Object.entries(result.sources).map(([k, v]) => [k, `${v}, archived copy`]));
    return result;
  } catch {
    return null;
  }
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

// The app is public, so refuse to fetch internal/private network addresses.
function isPrivateIp(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

async function assertPublicHost(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const blocked = () => new ExtractError('bad_url', 'That address points to a private or local network, which can’t be fetched.');
  if (/^localhost$|\.(localhost|local|internal|lan|home)$/i.test(host)) throw blocked();
  if (isIP(host)) { if (isPrivateIp(host)) throw blocked(); return; }
  let addrs;
  try { addrs = await lookup(host, { all: true }); } catch {
    throw new ExtractError('dns', `Couldn’t find the server “${host}”. Check the URL for typos.`);
  }
  if (addrs.some(a => isPrivateIp(a.address))) throw blocked();
}

async function fetchPage(url) {
  let res;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const cookies = new Map();
  try {
    // Follow redirects by hand so every hop passes the private-address check.
    // Some sites set a cookie and redirect back; without it they'd loop forever.
    for (let hop = 0; ; hop++) {
      await assertPublicHost(url);
      const headers = {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      };
      if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      res = await fetch(url, { redirect: 'manual', signal, headers });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      const next = res.status >= 300 && res.status < 400 && res.headers.get('location');
      if (!next) break;
      if (hop >= MAX_REDIRECTS) throw new ExtractError('http_error', 'The page redirects too many times.');
      url = new URL(next, url);
      if (!/^https?:$/.test(url.protocol)) throw new ExtractError('bad_url', 'The page redirects to a non-web address.');
    }
  } catch (e) {
    if (e instanceof ExtractError) throw e;
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
  if (html.trim().length < 200) {
    throw new ExtractError('empty', 'The site sent back an empty page instead of the article (this usually means it blocks automated requests).');
  }
  if (isBotWall(html)) {
    throw new ExtractError('blocked', 'The site answered with a bot check / CAPTCHA page instead of the article, so its metadata can’t be read automatically.');
  }
  return { html, url };
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
  return /just a moment|attention required|are you a (robot|human)|robot or human|security check|access denied|verify you are human|pardon our interruption|request blocked/i.test(title) ||
    /_Incapsula_Resource|captcha-delivery\.com|cf-chl-|px-captcha|enable javascript and cookies to continue/i.test(html);
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
  // Journal articles: CrossRef is the authoritative record. Anything else with a
  // DOI (a magazine piece, a preprint): the page knows itself better, so CrossRef
  // only fills gaps.
  const isJournal = cr.fields.type === 'journal';
  for (const [k, v] of Object.entries(cr.fields)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (k === 'type' && !isJournal) continue;
    const present = result.fields[k];
    if (!isJournal && present && (!Array.isArray(present) || present.length)) continue;
    result.fields[k] = v;
    if (cr.sources[k]) result.sources[k] = cr.sources[k];
  }
  if (isJournal) { delete result.fields.updated; delete result.sources.updated; }
  result.warnings.push(...(isJournal || !result.fields.title ? cr.warnings : []));
  result.hints = [...new Set([...result.hints, ...cr.hints])];
}
