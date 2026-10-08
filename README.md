# Citation Generator

Paste a URL (or a DOI), pick **MLA 9th edition** or **APA 7th edition**, and get a
formatted citation you can copy with one click. Italics are kept when you paste it into Word or Google Docs.

Editions checked October 2026: MLA Handbook 9th ed. (2021) and APA Publication
Manual 7th ed. (2019) are still the current editions.

## Run it locally

You need Node.js 18 or newer. There are no packages to install.

```bash
cd citation-generator
npm start
```

Then open http://localhost:3000. Set a different port with `PORT=8080 npm start`.

## Tests

```bash
npm test          # offline unit tests for the formatting rules
npm run samples   # fetches real pages and prints MLA + APA output for each
node test/samples.mjs https://example.com/some-article   # try your own URLs
```

## How it works

```
public/index.html, app.js   single-page UI (editable form, live preview, copy)
public/format.js            MLA 9 / APA 7 formatting, shared by the browser and Node
lib/extract.js              fetches the page, extracts metadata, CrossRef lookup
server.js                   serves public/ and GET /api/extract?url=...
```

The backend fetches the page so the browser doesn't run into CORS limits. It looks for each
field in this order:

1. **Structured data**: `citation_*` meta tags (academic sites), JSON-LD
   (schema.org Article / NewsArticle / BlogPosting …), Open Graph, Twitter cards, Dublin Core.
2. **Plain HTML**: `<title>` (minus a trailing "| Site Name"), `<meta name="author">`,
   `<time>` elements, bylines.
3. **CrossRef**: if the link is a DOI or the page declares a DOI, the record from
   `api.crossref.org` replaces the page data. APA uses `https://doi.org/…` as the link.
   If a publisher page blocks the request but its URL contains a DOI, CrossRef data is used instead.

Nothing is guessed. A missing field stays empty and is marked **not found** in the form. The
citation then follows each style's rule for that gap: APA uses "n.d." for a missing date and
moves the title to the front when there's no author, and MLA leaves the element out. Every field
is editable and the citation updates as you type. The form also shows where each value came from.

Fetch failures appear as a clear message: 404, 403/blocked, paywall, rate limiting, timeout,
DNS error, PDF links, and bot-check/CAPTCHA pages. The form stays usable so you can enter the
details by hand.

## Formatting rules implemented

| | MLA 9 | APA 7 |
|---|---|---|
| Authors | 1: `Last, First.` · 2: `Last, First, and First Last.` · 3+: `Last, First, et al.` | `Last, F. M.` · `&` before the last author · up to 20 listed; 21+: first 19, `. . .`, last |
| Title | Title case, in quotation marks | Sentence case; italic for stand-alone web pages, plain for articles |
| Container | Italic website / periodical / journal | Site name plain, or the periodical/journal italic (with italic volume) |
| Date | `5 Mar. 2020` (months abbreviated) | `(2020, March 5)`; journals `(2020)`; `(n.d.)` if none |
| Publisher | Shown for web pages only when it differs from the site name; business words (Inc., LLC) dropped | Not used for web pages |
| Same org as author and site | Starts with the title | Site name omitted |
| Pages | `pp. 357-62` | `357–362` |
| Location | DOI as `https://doi.org/…`, otherwise URL without `https://` | DOI, otherwise full URL; no final period |
| Access date | `Accessed 8 Oct. 2026.` (can be switched off) | — |
| Wikipedia | `"Title." Wikipedia, Wikimedia Foundation, date of revision, URL.` | `Title. (date). In Wikipedia. <permanent link to the revision>` |

## Limitations (check the output)

- **APA sentence case and proper nouns.** Many sites use Title Case headlines. Turning them into
  sentence case can lowercase a proper noun ("Paris" → "paris"). The app keeps words that appear
  capitalized mid-sentence in the page's own text, acronyms, and words like *iPhone*, and it shows a
  warning whenever it changes a title's casing. Each style keeps its own title field, so fixes to
  the APA title don't affect the MLA one.
- **News vs. web page in APA.** APA formats articles from newspapers and magazines as periodicals
  (italic publication name). It formats articles on news *websites* such as CNN or BBC News as web
  pages (italic title). The app picks a type automatically; change **Source type** if it guessed wrong.
- **Source types.** Supported: web pages, news/magazine/blog articles, journal articles, and wiki
  entries. Books, chapters, videos, and similar sources aren't formatted specially.
- **DOIs registered outside CrossRef** (for example DataCite datasets) fall back to the landing page's metadata.
- Some sites block automated requests (HTTP 403 or a CAPTCHA). Fill in the form by hand for those.
