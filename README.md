# Citation Generator

Paste a URL (or a DOI), pick a style, and get a formatted citation you can copy with one
click. Italics are kept when you paste it into Word or Google Docs.

| Style | Follows |
|---|---|
| **MLA 8** (default) | *Rules for Writers*, 9th ed., by Hacker & Sommers, section 56b (MLA Handbook, 8th ed., 2016) |
| **APA 6** | *Rules for Writers*, 9th ed., section 61b (APA Publication Manual, 6th ed., 2010, with DOIs written as `https://doi.org/…`) |
| **MLA 9** | MLA Handbook, 9th ed. (2021), the current MLA edition as of October 2026 |
| **APA 7** | APA Publication Manual, 7th ed. (2019), the current APA edition as of October 2026 |

The unit tests check the MLA 8 and APA 6 output against model citations printed in *Rules for Writers*.

## Run it locally

You need Node.js 18 or newer.

```bash
cd citation-generator
npm install
npm start
```

Then open http://localhost:3000. Set a different port with `PORT=8080 npm start`.

## Put it on the web (free, on Vercel)

The repo is ready for Vercel as is. `public/` is served as a static site and `api/extract.js` runs as a serverless function, so nothing has to be started by hand.

1. Go to https://vercel.com/new and sign in with GitHub.
2. Pick this repository, then click **Import**.
3. Leave every setting at its default and click **Deploy**.

You get a public address such as `https://citation-generator-xyz.vercel.app`. Every push to `main` redeploys it automatically.

Want your own copy? [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/lokodayte/citation-generator)

Because anyone can use the hosted version, the server refuses to fetch localhost or private-network addresses. It checks DNS results and every redirect. Successful lookups are cached for an hour.

## Punctuation checker

The **Check punctuation** tab marks punctuation problems in pasted writing. It runs entirely in the
browser (`public/punctuation.js`), so the text is never sent anywhere.

It checks only rules that MLA, APA, the *Chicago Manual of Style*, and the Purdue OWL agree on for
academic writing in American English:

- spacing: no space before `, ; : . ! ?`, a space after them; doubled marks (`,,` `,.`)
- quotation marks: periods and commas inside, colons and semicolons outside, no extra period or comma
  after a quoted `?` or `!`, single marks for a quotation inside a quotation, unmatched marks
- apostrophes: contractions (`dont` → `don't`), `its`/`it's`, no apostrophe in `yours`, `hers`, `ours`,
  `theirs`, or in plural decades (`1990s`)
- commas: dates (`July 4, 1776, …`), city and state (`Dallas, Texas, is…`), after introductory
  transitions, the serial comma, before a quotation after "said", none after "that"
- colons and semicolons: no colon after "such as" or "including", or between a verb and its object; a colon
  (not a semicolon) after "the following"; a semicolon or period (not a comma) before "however"
  between two sentences
- dashes typed as spaced hyphens, spaces around dashes, abbreviations (`etc.`, `e.g.`, `i.e.`), paragraphs
  without end punctuation

**Error** means the text breaks the rule; **Check** means it depends on meaning, so the writer decides.
Fixes are shown before they are applied. Before release, the rules were run on about 28,000 words of
professionally edited articles, and every rule that raised false alarms there was narrowed until it
didn't. The checker can't find every mistake (most comma splices need a human reader).

## Proofreader

The **Proofread** tab (`/#proofread`) checks pasted writing as you type, in the browser
(`public/proofread.js`, word lists in `public/proofread-data.js`). A Works Cited or References
list at the end is not checked (its entries follow their own format) and is left out of the word count.

Every rule is backed by a published authority, and rules were removed where one contradicted
another (for example, Purdue OWL calls "very unique" illogical, but Merriam-Webster calls it
standard in the sense "unusual", so it is not flagged):

| Category | What it checks | Sources |
| --- | --- | --- |
| Spelling | American English Hunspell dictionary (SCOWL size 60, via [nspell](https://github.com/wooorm/nspell)) plus SCOWL size-70 words; about 300 frequent misspellings and 60 wrong irregular verb forms (`buyed` → `bought`) get a one-click fix; suggestions are ranked by edit distance and by how common the word is (SCOWL sizes 10 and 20); British spellings | SCOWL; Merriam-Webster |
| Grammar | `a`/`an` by sound, `could of`, repeated words, capitals, wrong past participles (`have went`; `have drank` and `have hid` are accepted, as in Merriam-Webster), `I seen`, clear agreement errors (`he don't`, `they was`, `there is many`), `between you and I`, `Me and my friend went`, fragments, sentences that begin with a numeral | Merriam-Webster; Purdue OWL; APA Style (numbers) |
| Word choice | `their`/`there`, `your`/`you're`, `to`/`too`, `then`/`than`, `affect`/`effect`, `lose`/`loose`, `who's`/`whose`, `everyday`/`every day`, `less`/`fewer`, `amount`/`number`, `irregardless` (nonstandard) and `nowheres`, `theirselves`, `being that` (chiefly dialectal), `comprised of`, `the reason is because` | Merriam-Webster usage notes and labels |
| Punctuation | everything in the Check punctuation tab, plus `its`/`it's`, `wont`/`won't`, `cant`/`can't`, apostrophes in plurals, possible comma splices, extra spaces (one space after a sentence) | Purdue OWL; APA Style; MLA Style Center |
| Clarity | wordy phrases and redundancies, only those listed in college writing guides; passive voice with "by"; sentences over 40 words; clichés named in college writing guides | Purdue OWL, UNC Writing Center, Brandeis Writing Program, Liberty University and George Mason University writing centers; *The Bedford Handbook* (Hacker and Sommers), Skidmore College, University of Arkansas; APA Style (active voice) |
| Formal tone | contractions; words that dictionaries label informal (`kids`, `stuff`, `guys`, `okay`, `lots of`, `off of`, `gonna`; not `a lot of` or `pretty`, which are not labeled); texting abbreviations; addressing the reader as "you"; gendered terms (`mankind`, `policeman`) | Merriam-Webster; Britannica Dictionary; APA Style (contractions, bias-free language); MLA Style Center; Purdue OWL |

**Error** means a definite rule; **Check** means it depends on meaning or the assignment. Text
inside quotation marks is left alone except for possible misspellings and repeated words.
**Fix all errors** applies only definite fixes and repeats until none are left. Any check can be
turned off, and **Add to dictionary** remembers words in the browser.

Also on the page: word, sentence, and paragraph counts; reading and speaking time (238 and 183 words
a minute, the averages in Brysbaert's 2019 meta-analysis); Flesch–Kincaid grade level for 100+ words;
**Read aloud** (the browser's speech voices, one sentence at a time); and a self-proofreading checklist.

**Deep grammar check** is optional: only when clicked, it sends the text from the browser to
[LanguageTool](https://languagetool.org)'s free public API, which finds grammar errors that fixed
rules can't (`He go to school`). Its findings are always labeled and shown as checks. The free API
allows 20 KB per request and 75 KB a minute per network; see LanguageTool's
[privacy policy](https://languagetool.org/legal/privacy).

How it was tested: each rule's precision was measured on JFLEG (Napoles et al., 2017), a published
set of 1,501 learner sentences each corrected by four people. Every error-level rule marked only
words the human correctors also changed. The rules were also run on about 57,000 words of edited
articles and 17,000 words of Wikipedia, and on full sample essays, and every false alarm found was
fixed. The dictionary files and nspell are open source; licenses are in `public/vendor/LICENSES.txt`.

## Tests

```bash
npm test          # offline tests: citation rules, the punctuation checker, the proofreader
npm run samples   # fetches real pages and prints MLA 8 + APA 6 output (add --all for MLA 9 / APA 7)
node test/samples.mjs https://example.com/some-article   # try your own URLs
```

## How it works

```
public/index.html, app.js   single-page UI (editable form, live preview, copy)
public/format.js            MLA 8 / APA 6 / MLA 9 / APA 7 formatting, shared by the browser and Node
public/punctuation.js       punctuation rules (browser only); public/checker.js is its page
lib/extract.js              fetches the page, extracts metadata, CrossRef lookup
local-server.js             local server (not used on Vercel): serves public/ and GET /api/extract?url=...
api/extract.js              the same endpoint as a Vercel serverless function
lib/handler.js              request handling shared by both
```

The backend fetches the page so the browser doesn't run into CORS limits. Each field is looked for
in the structured data (`citation_*` tags, JSON-LD, Open Graph, Twitter cards, Dublin Core) and on the
visible page (the headline, the byline, the date under the headline), and the two are compared:

- **Title:** the headline printed on the page wins, because a title is cited as printed.
- **Author:** the structured data, checked against the byline. Credentials ("PhD"), job titles and
  affiliations ("Jane Doe, CNN") are removed; login names and interface text are rejected. If the
  publisher is named as the author but a person signed the byline, the person is used. If the data and
  the byline name different people, the citation shows a warning naming both.
- **Date:** the structured date, checked against the date shown on the page and in the URL. A UTC
  timestamp that lands one day off uses the printed date; a real disagreement is flagged. Future dates
  are rejected.
- **DOI:** for journal articles the CrossRef record (`api.crossref.org`) replaces the page's data. For
  anything else with a DOI, CrossRef only fills gaps.

Nothing is guessed. A missing field stays empty and is marked **not found** in the form. Every field
is editable, and the form shows where each value came from.

### When a site refuses the request

Some sites (NYT, Politico, Britannica, Johns Hopkins, APA, ...) refuse automated requests. The app does
not try to get past those blocks. It has two honest alternatives:

1. **The latest saved copy in the Internet Archive**, if there is one. The citation says so, and the
   original URL is kept.
2. **The "Cite this page" button**, a bookmarklet that runs in the reader's own browser, on a page they
   have already opened. It sends the page's metadata and the start of its text to this app in the URL's
   `#fragment` and then by POST to `/api/extract`. Nothing is stored.

Other failures appear as a clear message: 404, rate limiting, timeout, DNS error, PDF links. The form
stays usable so the details can be entered by hand.

## Formatting rules implemented

### Rules for Writers (MLA 8 and APA 6)

| | MLA 8 (RfW 56b) | APA 6 (RfW 61b) |
|---|---|---|
| Authors | 1: `Last, First.` · 2: `Last, First, and First Last.` · 3+: `Last, First, et al.` · organizations are listed as author | `Last, F. M.` · `&` before the last · up to 7 listed; 8+: first 6, `...`, last |
| Title | Title case, in quotation marks | Sentence case; italic for web documents; plain for articles, plus `[Blog post]` for blog posts |
| Container | Italic website / newspaper / magazine / journal | Italic newspaper / magazine / journal (with italic volume) |
| Date | `13 Mar. 2018` (all months abbreviated except May, June, July); web pages and blogs use the most recent update date | `(2015, May 3)`, the date of posting; journals `(2015)`; `(n.d.)` if none |
| Publisher | For websites and blogs; omitted when it matches the site title; drop Inc./Co.; `U`/`P` for university publishers | Web documents: `Retrieved from Publisher website: URL` when the publisher isn't the author |
| Location | DOI as `doi:10.xxxx`, otherwise URL without `http://` | DOI as `https://doi.org/…`; otherwise `Retrieved from URL` (the **home page** URL for newspapers, magazines and journals) |
| Access/retrieval date | `Accessed 22 Mar. 2016.` only when the source has no date | Wikis: `Retrieved December 10, 2015, from URL`; web pages and blogs only if you tick the box |
| Wiki | `"Title." Wikipedia, date, URL.` | `Title. (date). In Wikipedia. Retrieved date, from URL` |

### Current editions (MLA 9 and APA 7)

| | MLA 9 | APA 7 |
|---|---|---|
| Authors | Same as MLA 8, but an organization that is also the publisher is skipped (entry starts with the title) | Up to 20 listed; 21+: first 19, `. . .`, last |
| Location | DOI as `https://doi.org/…` | DOI or full URL, with no "Retrieved from"; the site name follows the title |
| Access date | Only when there's no date, unless you tick the box to add it | — |
| Wiki | Includes the publisher (Wikimedia Foundation) | Permanent link to the revision |

## Limitations (check the output)

No automatic tool can be perfect, because pages sometimes publish wrong or incomplete details. Compare
each citation with the article; the **open the page to compare** link and the "Check the author/date"
warnings are there for that.

- **APA sentence case and proper nouns.** Many sites use Title Case headlines. Turning them into
  sentence case can lowercase a proper noun ("Paris" → "paris"). The app keeps words that appear
  capitalized mid-sentence in the page's own text, acronyms, and words like *iPhone*, and it shows a
  warning whenever it changes a title's casing. Each style keeps its own title field, so fixes to
  the APA title don't affect the MLA one.
- **News vs. web page in APA.** APA formats articles from newspapers and magazines as periodicals
  (italic publication name). It formats articles on news *websites* such as CNN or BBC News as web
  pages (italic title). The app picks a type automatically; change **Source type** if it guessed wrong.
- **Source types.** Supported: web pages, news/magazine articles, blog posts, journal articles,
  and wiki entries. Books, chapters, videos, and similar sources aren't formatted specially.
- **DOIs registered outside CrossRef** (for example DataCite datasets) fall back to the landing page's metadata.
- **Things the app can't know.** For example: a newspaper's city in brackets when it isn't in the name
  (MLA, RfW item 15), a journal's season ("Fall 2015"), or whether an APA 6 home-page URL really is the
  journal's home page. The notes under the citation point these out where they apply.
- Some sites block automated requests (HTTP 403 or a CAPTCHA). Fill in the form by hand for those.
