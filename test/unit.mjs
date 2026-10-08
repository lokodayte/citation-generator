// Offline unit tests for the formatting rules. Run: npm test
import assert from 'node:assert/strict';
import {
  parseDate, parseName, parseAuthorLine, initials, mlaAuthors, apaAuthors, titleCase,
  sentenceCase, formatMLA, formatAPA, formatCitation, toMarkdown, mlaDate, apaDate, mlaPublisher,
} from '../public/format.js';
import { extractFromHtml } from '../lib/extract.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exitCode = 1; }
};

const P = (given, family) => ({ given, family, suffix: '' });
const people = n => Array.from({ length: n }, (_, i) => P(`Given${i + 1}`, `Family${i + 1}`));

test('dates parse', () => {
  assert.deepEqual(parseDate('2020-03-05T23:00:00-05:00'), { year: 2020, month: 3, day: 5 });
  assert.deepEqual(parseDate('2020/03'), { year: 2020, month: 3 });
  assert.deepEqual(parseDate('March 5, 2020'), { year: 2020, month: 3, day: 5 });
  assert.deepEqual(parseDate('5 Sept. 2020'), { year: 2020, month: 9, day: 5 });
  assert.deepEqual(parseDate('Tue, 05 Mar 2024 10:00:00 GMT'), { year: 2024, month: 3, day: 5 });
  assert.equal(parseDate('yesterday'), null);
});

test('date formats', () => {
  assert.equal(mlaDate({ year: 2020, month: 9, day: 5 }), '5 Sept. 2020');
  assert.equal(mlaDate({ year: 2020, month: 6 }), 'June 2020');
  assert.equal(apaDate({ year: 2020, month: 3, day: 5 }), '2020, March 5');
  assert.equal(apaDate({ year: 2020, month: 3, day: 5 }, true), '2020');
  assert.equal(apaDate(null), 'n.d.');
});

test('names', () => {
  assert.deepEqual(parseName('Ludwig van Beethoven'), { given: 'Ludwig', family: 'van Beethoven', suffix: '' });
  assert.deepEqual(parseName('Martin Luther King Jr.'), { given: 'Martin Luther', family: 'King', suffix: 'Jr.' });
  assert.deepEqual(parseName('Smith, John'), { family: 'Smith', given: 'John', suffix: '' });
  assert.deepEqual(parseName('Reuters'), { name: 'Reuters' });
  assert.deepEqual(parseAuthorLine('{University of California, Berkeley}'), { name: 'University of California, Berkeley' });
  assert.equal(initials('Jean-Paul'), 'J.-P.');
  assert.equal(initials('J.R.R.'), 'J. R. R.');
  assert.equal(initials('Mary Ann'), 'M. A.');
});

test('MLA author rules', () => {
  assert.equal(mlaAuthors(people(1)), 'Family1, Given1');
  assert.equal(mlaAuthors(people(2)), 'Family1, Given1, and Given2 Family2');
  assert.equal(mlaAuthors(people(3)), 'Family1, Given1, et al.');
});

test('APA author rules', () => {
  assert.equal(apaAuthors(people(1)), 'Family1, G.');
  assert.equal(apaAuthors(people(2)), 'Family1, G., & Family2, G.');
  assert.equal(apaAuthors(people(3)), 'Family1, G., Family2, G., & Family3, G.');
  const a21 = apaAuthors(people(21));
  assert.match(a21, /Family19, G\., \. \. \. Family21, G\.$/);
  assert.doesNotMatch(a21, /Family20|&/);
  assert.match(apaAuthors(people(20)), /Family19, G\., & Family20, G\.$/);
});

test('title case (MLA)', () => {
  assert.equal(titleCase('the war of the worlds: a novel for the ages'), 'The War of the Worlds: A Novel for the Ages');
  assert.equal(titleCase('what the iPhone means to NASA'), 'What the iPhone Means to NASA');
  assert.equal(titleCase('a place to stand on'), 'A Place to Stand On');
});

test('sentence case (APA)', () => {
  assert.equal(sentenceCase('The Future Of Work: Why Remote Jobs Are Here To Stay'), 'The future of work: Why remote jobs are here to stay');
  assert.equal(sentenceCase('How NASA Uses The iPhone In Space', []), 'How NASA uses the iPhone in space');
  assert.equal(sentenceCase('Climate Talks In Paris Stall', ['Paris']), 'Climate talks in Paris stall');
  // already sentence case: proper nouns kept
  assert.equal(sentenceCase('Why the European Union is struggling'), 'Why the European Union is struggling');
});

const web = {
  type: 'webpage', authors: [], title: 'Example page', container: 'Example Site', publisher: '',
  date: null, url: 'https://example.com/page', accessed: { year: 2026, month: 10, day: 8 }, includeAccessed: true,
};

test('no author, no date', () => {
  assert.equal(toMarkdown(formatAPA(web)), '*Example page*. (n.d.). Example Site. https://example.com/page');
  assert.equal(toMarkdown(formatMLA(web)), '“Example page.” *Example Site*, example.com/page. Accessed 8 Oct. 2026.');
});

test('APA omits site name when same as author; MLA starts with title', () => {
  const d = { ...web, authors: [{ name: 'World Health Organization' }], container: 'World Health Organization', date: { year: 2024, month: 1, day: 2 } };
  assert.equal(toMarkdown(formatAPA(d)), 'World Health Organization. (2024, January 2). *Example page*. https://example.com/page');
  assert.equal(toMarkdown(formatMLA(d)), '“Example page.” *World Health Organization*, 2 Jan. 2024, example.com/page. Accessed 8 Oct. 2026.');
});

test('MLA publisher omitted when same as site, kept otherwise', () => {
  assert.doesNotMatch(toText(formatMLA({ ...web, publisher: 'Example Site, Inc.' })), /Inc/);
  assert.match(toText(formatMLA({ ...web, publisher: 'Acme Corporation' })), /Example Site, Acme,/);
});

test('journal article', () => {
  const d = {
    type: 'journal', authors: people(2), title: 'A study', container: 'Journal of Things', volume: '12', issue: '3',
    pages: '1093-1105', doi: '10.1234/abc', date: { year: 2021, month: 5 }, url: 'https://x.org', includeAccessed: false,
  };
  assert.equal(toMarkdown(formatAPA(d)), 'Family1, G., & Family2, G. (2021). A study. *Journal of Things, 12*(3), 1093–1105. https://doi.org/10.1234/abc');
  assert.equal(toMarkdown(formatMLA(d)), 'Family1, Given1, and Given2 Family2. “A study.” *Journal of Things*, vol. 12, no. 3, May 2021, pp. 1093-105, https://doi.org/10.1234/abc.');
});

test('question-mark titles take no extra period', () => {
  const d = { ...web, title: 'Is it true?' };
  assert.match(toMarkdown(formatAPA(d)), /^\*Is it true\?\* \(n\.d\.\)/);
  assert.match(toMarkdown(formatMLA(d)), /^“Is it true\?” \*/);
});

test('extracts from HTML (JSON-LD + OG + title suffix)', () => {
  const html = `<html><head><title>Big News Story | Daily Planet</title>
    <meta property="og:site_name" content="Daily Planet">
    <meta property="og:title" content="Big News Story | Daily Planet">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle",
      "headline":"Big News Story","datePublished":"2025-04-01T09:00:00Z",
      "author":[{"@type":"Person","name":"Lois Lane"},{"@type":"Person","name":"Clark Kent"}],
      "publisher":{"@type":"Organization","name":"Daily Planet"}}</script>
    </head><body><p>Reported in Metropolis today.</p></body></html>`;
  const r = extractFromHtml(html, 'https://planet.example/story?utm_source=x');
  assert.equal(r.fields.type, 'article');
  assert.equal(r.fields.title, 'Big News Story');
  assert.deepEqual(r.fields.authors.map(a => a.family), ['Lane', 'Kent']);
  assert.deepEqual(r.fields.date, { year: 2025, month: 4, day: 1 });
  assert.equal(r.fields.url, 'https://planet.example/story');
  assert.ok(r.hints.includes('Metropolis'));
});

test('missing fields stay empty (nothing invented)', () => {
  const r = extractFromHtml('<html><head></head><body>hi</body></html>', 'https://bare.example/');
  assert.deepEqual(r.fields.authors, []);
  assert.equal(r.fields.title, undefined);
  assert.equal(r.fields.date, undefined);
  assert.equal(r.fields.container, undefined);
});

/* ---- Rules for Writers, 9th ed.: each expected string is the book's own model ---- */

const md = (d, style) => toMarkdown(formatCitation(d, style));
const today = { year: 2016, month: 3, day: 22 };

test('RfW MLA wiki entry (56b item 23): no publisher, no access date when dated', () => {
  const d = { type: 'wiki', authors: [], title: 'House Music', container: 'Wikipedia', publisher: 'Wikimedia Foundation, Inc.',
    date: { year: 2015, month: 11, day: 16 }, url: 'https://en.wikipedia.org/wiki/House_music', accessed: today };
  assert.equal(md(d, 'mla8'), '“House Music.” *Wikipedia*, 16 Nov. 2015, en.wikipedia.org/wiki/House_music.');
});

test('RfW MLA work from a website (item 36): author, site, date, URL', () => {
  const d = { type: 'webpage', authors: [P('Sean', 'Gallagher')], title: 'The Last Nomads of the Tibetan Plateau',
    container: 'Pulitzer Center on Crisis Reporting', publisher: 'Pulitzer Center on Crisis Reporting',
    date: { year: 2012, month: 10, day: 25 }, url: 'http://pulitzercenter.org/reporting/china-glaciers', accessed: today };
  assert.equal(md(d, 'mla8'), 'Gallagher, Sean. “The Last Nomads of the Tibetan Plateau.” *Pulitzer Center on Crisis Reporting*, 25 Oct. 2012, pulitzercenter.org/reporting/china-glaciers.');
});

test('RfW MLA undated web page (item 36): publisher, then access date', () => {
  const d = { type: 'webpage', authors: [], title: 'Social and Historical Context: Vitality',
    container: 'Arapesh Grammar and Digital Language Archive Project', publisher: 'Institute for Advanced Technology in the Humanities',
    date: null, url: 'http://www.arapesh.org/socio_historical_context_vitality.php', accessed: today };
  assert.equal(md(d, 'mla8'), '“Social and Historical Context: Vitality.” *Arapesh Grammar and Digital Language Archive Project*, Institute for Advanced Technology in the Humanities, www.arapesh.org/socio_historical_context_vitality.php. Accessed 22 Mar. 2016.');
});

test('RfW MLA blog post (item 37): includes the blog publisher', () => {
  const d = { type: 'blog', authors: [P('Emily', 'Eakin')], title: 'Cloud Atlas’s Theory of Everything', container: 'NYR Daily',
    publisher: 'NYREV', date: { year: 2012, month: 11, day: 2 }, url: 'http://www.nybooks.com/daily/2012/11/02/ken-wilber-cloud-atlas', accessed: today };
  assert.equal(md(d, 'mla8'), 'Eakin, Emily. “Cloud Atlas’s Theory of Everything.” *NYR Daily*, NYREV, 2 Nov. 2012, www.nybooks.com/daily/2012/11/02/ken-wilber-cloud-atlas.');
});

test('RfW MLA journal article with DOI (items 12–13): doi: prefix', () => {
  const d = { type: 'journal', authors: [P('Joseph', 'Turner')], title: 'Sir Gawain and the Green Knight and the History of Medieval Rhetoric',
    container: 'Rhetoric Review', volume: '31', issue: '4', pages: '371-388', doi: '10.1080/07350198.2012.711196',
    date: { year: 2012, month: 8, day: 17 }, url: 'https://www.tandfonline.com/doi/x', accessed: today };
  assert.equal(md(d, 'mla8'), 'Turner, Joseph. “Sir Gawain and the Green Knight and the History of Medieval Rhetoric.” *Rhetoric Review*, vol. 31, no. 4, 17 Aug. 2012, pp. 371-88, doi:10.1080/07350198.2012.711196.');
});

test('RfW MLA organization author is kept (item 4); MLA 9 starts with the title', () => {
  const d = { ...web, authors: [{ name: 'World Health Organization' }], container: 'World Health Organization', date: { year: 2024, month: 1, day: 2 } };
  assert.match(md(d, 'mla8'), /^World Health Organization\. “Example page\.”/);
  assert.match(md(d, 'mla9'), /^“Example page\.”/);
});

test('MLA publisher names: U and P for university publishers, drop Inc.', () => {
  assert.equal(mlaPublisher('Princeton University Press'), 'Princeton UP');
  assert.equal(mlaPublisher('University of Sussex'), 'U of Sussex');
  assert.equal(mlaPublisher('Harvard Education Press'), 'Harvard Education Press');
  assert.equal(mlaPublisher('Wiley, Inc.'), 'Wiley');
});

test('MLA title case: last word of a title before a subtitle is capitalized', () => {
  assert.equal(titleCase('what it comes down to: a guide'), 'What It Comes Down To: A Guide');
});

test('RfW APA eight or more authors (61b item 3): first six, ..., last', () => {
  const names = [['S. J.', 'Datta'], ['C.', 'Khumnoon'], ['Z. H.', 'Lee'], ['W. K.', 'Moon'], ['S.', 'Docao'], ['T. H.', 'Nguyen'], ['X.', 'Seventh'], ['K. B.', 'Yoon']];
  const d = { type: 'journal', authors: names.map(([g, f]) => P(g, f)), title: 'CO2 capture from humid flue gases and humid atmosphere using a microporous coppersilicate',
    container: 'Science', volume: '350', pages: '302-306', doi: '10.1126/science.aab1680', date: { year: 2015, month: 10, day: 16 } };
  assert.equal(md(d, 'apa6'), 'Datta, S. J., Khumnoon, C., Lee, Z. H., Moon, W. K., Docao, S., Nguyen, T. H., ... Yoon, K. B. (2015). CO2 capture from humid flue gases and humid atmosphere using a microporous coppersilicate. *Science, 350*, 302–306. https://doi.org/10.1126/science.aab1680');
  assert.match(apaAuthors(people(7), 6), /, & Family7, G\.$/);
});

test('RfW APA newspaper on the web (item 13b): home page URL', () => {
  const d = { type: 'article', authors: [P('K.', 'Roberson')], title: 'Innovation helps address nurse shortage', container: 'Des Moines Register',
    date: { year: 2015, month: 5, day: 3 }, url: 'http://www.desmoinesregister.com/story/news/health/2015/05/03/nurse/26834011/' };
  assert.equal(md(d, 'apa6'), 'Roberson, K. (2015, May 3). Innovation helps address nurse shortage. *Des Moines Register*. Retrieved from http://www.desmoinesregister.com/');
});

test('RfW APA document from a website (item 34): organization author', () => {
  const d = { type: 'webpage', authors: [{ name: 'Centers for Disease Control and Prevention' }], title: 'Concussion in winter sports',
    container: 'Centers for Disease Control and Prevention', date: { year: 2012, month: 12, day: 10 }, url: 'http://www.cdc.gov/Features/HockeyConcussions/index.html' };
  assert.equal(md(d, 'apa6'), 'Centers for Disease Control and Prevention. (2012, December 10). *Concussion in winter sports*. Retrieved from http://www.cdc.gov/Features/HockeyConcussions/index.html');
});

test('RfW APA document from a website (item 34): publisher in retrieval statement', () => {
  const d = { type: 'webpage', authors: [P('M.', 'Badrunnesha'), P('C.', 'Kwauk')], title: 'Improving the quality of girls’ education in madrasa in Bangladesh',
    container: 'Brookings Institution', date: { year: 2015, month: 12 }, url: 'http://www.brookings.edu/research/papers/2015/12/05-bangladesh' };
  assert.equal(md(d, 'apa6'), 'Badrunnesha, M., & Kwauk, C. (2015, December). *Improving the quality of girls’ education in madrasa in Bangladesh*. Retrieved from Brookings Institution website: http://www.brookings.edu/research/papers/2015/12/05-bangladesh');
});

test('RfW APA blog post (item 36): [Blog post] label', () => {
  const d = { type: 'blog', authors: [P('M.', 'Costandi')], title: 'Why brain scans aren’t always what they seem', container: 'Neurophilosophy',
    date: { year: 2015, month: 4, day: 9 }, url: 'http://www.theguardian.com/science/neurophilosophy/2015/apr/09/bold-assumptions-fmri' };
  assert.equal(md(d, 'apa6'), 'Costandi, M. (2015, April 9). Why brain scans aren’t always what they seem [Blog post]. Retrieved from http://www.theguardian.com/science/neurophilosophy/2015/apr/09/bold-assumptions-fmri');
});

test('RfW APA wiki entry (item 19b): In Wiki, retrieval date', () => {
  const d = { type: 'wiki', authors: [], title: 'Actor-network theory (ANT)', container: 'STS wiki', date: { year: 2011, month: 2, day: 22 },
    url: 'http://www.stswiki.org/index.php?title=Actor-network_theory', accessed: { year: 2015, month: 12, day: 10 } };
  assert.equal(md(d, 'apa6'), 'Actor-network theory (ANT). (2011, February 22). In *STS wiki*. Retrieved December 10, 2015, from http://www.stswiki.org/index.php?title=Actor-network_theory');
});

function toText(segs) { return segs.map(s => s.text).join(''); }

console.log(`${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
