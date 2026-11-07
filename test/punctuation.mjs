// Tests for the punctuation checker. Run: npm test
import assert from 'node:assert/strict';
import { checkPunctuation, applyFixes } from '../public/punctuation.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exitCode = 1; }
};
const rules = t => checkPunctuation(t).map(f => f.rule);
const fixAll = t => applyFixes(t, checkPunctuation(t));
// Correct text must produce no findings at all.
const clean = t => assert.deepEqual(checkPunctuation(t).map(f => `${f.rule}: ${JSON.stringify(t.slice(f.start, f.end))}`), [], t);

test('spacing around punctuation', () => {
  assert.equal(fixAll('This is wrong , and this ; too .'), 'This is wrong, and this; too.');
  assert.equal(fixAll('One,two;three. Note:this. It ended.Then it began. Why?Because.'), 'One, two; three. Note: this. It ended. Then it began. Why? Because.');
  clean('He paused . . . and then spoke. Wait... what? The end. . . .');
  clean('It cost $1,000 at 3:30 p.m. in the U.S. Read Ph.D. theses, e.g., this one.');
  clean('See https://example.com/a,b;c:d and www.unesco.org/en.Page or mail me@school.edu.');
});

test('doubled and repeated marks', () => {
  assert.equal(fixAll('Wait,, what,. Fine;; ok..'), 'Wait, what. Fine; ok.');
  assert.deepEqual(rules('Wow!! Really??'), ['repeated-end', 'repeated-end']);
  clean('Bring pens, paper, etc., to class. It ends here....');
});

test('periods and commas inside quotation marks; colons and semicolons outside', () => {
  assert.equal(fixAll('He called it “brilliant”. She said “no”, then left.'), 'He called it “brilliant.” She said “no,” then left.');
  assert.equal(fixAll('He said "stop". Then "go", she said.'), 'He said "stop." Then "go," she said.');
  assert.equal(fixAll('She called it “a lie;” I agreed. He wrote “Note:” on it.'), 'She called it “a lie”; I agreed. He wrote “Note”: on it.');
  clean('Smith calls it “a crisis” (22). He asked, “Why?” Did she say “yes”? The board is 12".');
});

test('quotation inside a quotation uses single marks', () => {
  assert.equal(fixAll('He said, “She told me “no” twice.”'), 'He said, “She told me ‘no’ twice.”');
  clean('He said, “She told me ‘no’ twice.”');
});

test('unmatched quotes and brackets', () => {
  assert.deepEqual(rules('He said “hello and left.'), ['unbalanced-quotes']);
  assert.deepEqual(rules('The data (from 2020 show growth.'), ['unbalanced-brackets']);
  clean('Steps: 1) mix, 2) bake. Results (see Table 1) were clear :) and [sic] fine.');
});

test('apostrophes', () => {
  assert.equal(fixAll("The book is your's, not her's. The dog wagged it's own tail."), "The book is yours, not hers. The dog wagged its own tail.");
  assert.equal(fixAll("Its a fact. its been years. I dont know. Im sure theyre right. Thats it."), "It's a fact. it's been years. I don't know. I'm sure they're right. That's it.");
  assert.deepEqual(rules("The 1990's were loud."), ['decade']);
  clean("The company raised its prices; its a priori claim failed. It's late. The 1990s and the '90s. We won't, can't, and we'll see. Send an IM.");
});

test('abbreviations', () => {
  assert.equal(fixAll('Bring pens, paper etc to class, e.g pencils.'), 'Bring pens, paper etc. to class, e.g. pencils.');
  clean('Bring tools, e.g., hammers, i.e., the basics, etc.');
});

test('dates', () => {
  assert.equal(fixAll('On July 4 1776 the colonies declared independence.'), 'On July 4, 1776, the colonies declared independence.');
  assert.equal(fixAll('On July 4, 1776 the colonies declared independence.'), 'On July 4, 1776, the colonies declared independence.');
  assert.equal(fixAll('It opened in June, 2020.'), 'It opened in June 2020.');
  clean('On July 4, 1776, they signed. It opened in June 2020. It happened on July 4, 1776. Accessed 4 July 2020. In May, 2,000 people came.');
});

test('city and state', () => {
  assert.equal(fixAll('Dallas, Texas is large. Washington, D.C. is the capital.'), 'Dallas, Texas, is large. Washington, D.C., is the capital.');
  clean('She lives in Dallas, Texas. Dallas, Texas, is large. Presidents Adams, Washington and Jefferson. Yes, Virginia is a state.');
});

test('colons', () => {
  assert.equal(fixAll('Bring fruit such as: apples and pears.'), 'Bring fruit such as apples and pears.');
  assert.deepEqual(rules('The reasons are: cost and time.'), ['colon-verb']);
  assert.deepEqual(rules('The kit consists of: a tent and a stove.'), ['colon-verb']);
  clean('Bring three things: a pen, a book, and water. Note: this matters.\nSubject: Grades\nThe list includes:\n- apples');
});

test('semicolons', () => {
  assert.equal(fixAll('Bring the following; pens and paper.'), 'Bring the following: pens and paper.');
  assert.deepEqual(rules('I met Ana; who was kind.'), ['semicolon-clause']);
  clean('I came; I saw; I left. I left; when I returned, it was gone.');
});

test('however, therefore, and similar words', () => {
  assert.deepEqual(rules('It rained, however we went.'), ['conjunctive-splice']);
  assert.equal(checkPunctuation('It rained, however we went.')[0].fix, null);
  assert.equal(fixAll('It rained; however we went.'), 'It rained; however, we went.');
  assert.equal(fixAll('However the plan failed. For example the cost rose.'), 'However, the plan failed. For example, the cost rose.');
  clean('It rained; however, we went. He was, however, late. However much you try, it fails. In addition to cost, time matters. As a result of this, we left. In fact, it worked.');
});

test('serial comma in long lists', () => {
  assert.equal(fixAll('We need apples, pears, plums and figs.'), 'We need apples, pears, plums, and figs.');
  clean('We need apples, pears, plums, and figs. We need apples and pears. On July 4, 1776, Adams and Jefferson met.');
});

test('commas around quotations', () => {
  assert.equal(fixAll('She said “Leave now.”'), 'She said, “Leave now.”');
  assert.equal(fixAll('Smith argues that, “art matters.”'), 'Smith argues that “art matters.”');
  clean('She said, “Leave now.” Poe wrote “The Raven” in 1845. Smith argues that “art matters.”');
});

test('dashes', () => {
  assert.equal(fixAll('It was late - very late. It was cold — very cold.'), 'It was late—very late. It was cold—very cold.');
  clean('It was late—very late. Read pages 4-7. It was late--very late. A well-known author.\n- a bullet point');
});

test('paragraph end', () => {
  assert.deepEqual(rules('This paragraph has two sentences. The second one stops here without any final mark at all'), ['end-punctuation']);
  clean('A Short Heading Without a Period\nThis paragraph is fine. It ends properly.');
});

test('false alarms found in published writing stay quiet', () => {
  clean('The blood samples, thankfully, weren’t altered or damaged.');
  clean('It would steer policy, said Diana Buttu, a lawyer and former adviser.');
  clean('Ivan, the younger son, is doubtful and skeptical. Andrey, the elder, is faithful and trusting.');
  clean('It is known by its acronym, GITIS, the country’s oldest and largest school.');
  clean('It was a repudiation, above all, of Donald Trump and the decade he defined.');
  clean('Big firms like banks, healthcare companies, platforms like Amazon and Walmart will act.');
  clean('Strong institutions may help societies, especially in democracies, articulate and act.');
  clean('Beyond that, “the league has changed,” she said.');
  clean('Call EventQuerySet(SearchableMixin, models.QuerySet) here.');
  clean('It showed a code like “LI???77” on the label.');
});

test('a question or exclamation ending a quotation takes no period or comma', () => {
  assert.equal(fixAll('He shouted “Run!”. She asked “Why?”, then left.'), 'He shouted, “Run!” She asked, “Why?” then left.');
});

test('real missing serial commas are still found', () => {
  assert.deepEqual(rules('It requires expertise, time, effort and creativity.'), ['serial-comma']);
  assert.deepEqual(rules('We loved the dialogue, the essays, the criticism and the discoveries.'), ['serial-comma']);
  assert.deepEqual(rules('Thanks to editors, photographers, producers, designers and colleagues.'), ['serial-comma']);
});

test('fixes never overlap', () => {
  const t = 'Its a test ,, ok';
  const out = applyFixes(t, checkPunctuation(t));
  assert.equal(typeof out, 'string');
  assert.ok(!out.includes(' ,'));
});

test('a well-edited paragraph has no findings', () => {
  clean('On March 5, 2024, the committee met in Austin, Texas, to review the proposal. Its members disagreed; however, they reached a compromise. As the chair said, “We listened to everyone.” The plan, which covers housing, transit, parks, and schools, will cost $2.4 million (about 3% of the budget). Critics called it “too cautious,” but supporters praised its scope—especially the focus on schools.');
});

console.log(`${passed} punctuation tests passed${process.exitCode ? ', some FAILED' : ''}`);
