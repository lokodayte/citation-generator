// /api/extract — shared by the local server (local-server.js) and the Vercel
// serverless function (api/extract.js).
//   GET  ?url=...          fetch the page and read its details
//   POST {url, html}       read a page sent from the reader's own browser
import { extractCitation, extractFromSubmittedPage, ExtractError } from './extract.js';

const MAX_POST_BYTES = 4 * 1024 * 1024;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body; // parsed by the host
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_POST_BYTES) throw new ExtractError('too_large', 'That page is too large to read.');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function handleExtract(req, res) {
  let status = 200;
  let body;
  try {
    if (req.method === 'POST') {
      const { url, html } = await readJson(req);
      body = await extractFromSubmittedPage(url, html);
    } else {
      body = await extractCitation(new URL(req.url, 'http://localhost').searchParams.get('url'));
    }
  } catch (e) {
    if (e instanceof ExtractError) {
      status = 422;
      body = { error: e.message, code: e.code, status: e.status };
    } else if (e instanceof SyntaxError) {
      status = 400;
      body = { error: 'The page data could not be read.', code: 'bad_page' };
    } else {
      console.error(e);
      status = 500;
      body = { error: `Unexpected error: ${e.message}`, code: 'internal' };
    }
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Successful lookups can be cached by a CDN for an hour; errors are not cached.
  res.setHeader('Cache-Control', status === 200 && req.method !== 'POST' ? 'public, max-age=0, s-maxage=3600' : 'no-store');
  res.end(JSON.stringify(body));
}
