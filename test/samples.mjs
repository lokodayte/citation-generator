// Runs the extractor + formatter on real URLs and prints MLA and APA output.
// Usage: node test/samples.mjs [--all] [url ...]   (italics shown as *asterisks*)
// Prints the Rules for Writers styles (MLA 8, APA 6); --all adds MLA 9 and APA 7.
import { extractCitation } from '../lib/extract.js';
import { convertTitle, formatCitation, styleNotes, toMarkdown, todayDate } from '../public/format.js';

const DEFAULT_URLS = [
  'https://www.theguardian.com/science/2026/oct/05/nobel-prize-medicine-2026-winner', // news article
  'https://en.wikipedia.org/wiki/Citation',                                          // Wikipedia
  'https://doi.org/10.1038/s41586-020-2649-2',                                       // journal article (DOI, 26 authors)
  'https://jvns.ca/blog/2024/02/16/popular-git-config-options/',                     // blog post
  'https://www.python.org/about/',                                                   // no author, no date
  'https://www.cdc.gov/flu/about/index.html',                                        // organization as author
  'https://www.python.org/this-page-does-not-exist',                                 // error: 404
];

const args = process.argv.slice(2);
const styles = args.includes('--all') ? ['mla8', 'apa6', 'mla9', 'apa7'] : ['mla8', 'apa6'];
const given = args.filter(a => a !== '--all');
const urls = given.length ? given : DEFAULT_URLS;

for (const url of urls) {
  console.log(`\n### ${url}`);
  let r;
  try {
    r = await extractCitation(url);
  } catch (e) {
    console.log(`ERROR [${e.code}]: ${e.message}`);
    continue;
  }
  const f = r.fields;
  console.log(`type: ${f.type}`);
  for (const k of ['title', 'authors', 'container', 'publisher', 'date', 'doi', 'permalink']) {
    if (f[k] == null || (Array.isArray(f[k]) && !f[k].length)) { console.log(`  ${k}: — not found`); continue; }
    const v = k === 'authors' ? `${f[k].length} author(s): ` + f[k].slice(0, 3).map(a => a.name ?? `${a.family}, ${a.given}`).join(' | ') : JSON.stringify(f[k]);
    console.log(`  ${k}: ${v}   [${r.sources[k] || ''}]`);
  }
  for (const w of r.warnings) console.log(`  warning: ${w}`);
  for (const style of styles) {
    const t = convertTitle(f.title, style, r.hints);
    const d = { ...f, title: t.text, accessed: todayDate(), includeAccessed: true };
    console.log(`${style.toUpperCase()}: ${toMarkdown(formatCitation(d, style))}`);
    const notes = styleNotes(d, style);
    if (t.changed) notes.push(`title re-cased from “${f.title}”`);
    if (notes.length) console.log(`  notes: ${notes.join(' / ')}`);
  }
}
