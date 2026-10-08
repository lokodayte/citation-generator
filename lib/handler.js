// GET /api/extract?url=... — shared by the local server (server.js) and the
// Vercel serverless function (api/extract.js).
import { extractCitation, ExtractError } from './extract.js';

export async function handleExtract(req, res) {
  const target = new URL(req.url, 'http://localhost').searchParams.get('url');
  let status = 200;
  let body;
  try {
    body = await extractCitation(target);
  } catch (e) {
    if (e instanceof ExtractError) {
      status = 422;
      body = { error: e.message, code: e.code, status: e.status };
    } else {
      console.error(e);
      status = 500;
      body = { error: `Unexpected error: ${e.message}`, code: 'internal' };
    }
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Successful lookups can be cached by a CDN for an hour; errors are not cached.
  res.setHeader('Cache-Control', status === 200 ? 'public, max-age=0, s-maxage=3600' : 'no-store');
  res.end(JSON.stringify(body));
}
