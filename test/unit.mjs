// Offline unit tests for the formatting rules. Run: npm test
import assert from 'node:assert/strict';
import {
  parseDate, parseName, parseAuthorLine, initials, mlaAuthors, apaAuthors, titleCase,
  sentenceCase, formatMLA, formatAPA, toMarkdown, mlaDate, apaDate,
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

function toText(segs) { return segs.map(s => s.text).join(''); }

console.log(`${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
