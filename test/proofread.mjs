// Tests for the proofreader. Run: node test/proofread.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { proofread, textStats, splitSentences } from '../public/proofread.js';
import { MISSPELLINGS, IRREGULAR, BRITISH, ACCEPTED } from '../public/proofread-data.js';
import { applyFixes } from '../public/punctuation.js';
import { shiftFindings } from '../public/languagetool.js';
import nspell from '../public/vendor/nspell.js';

const dir = new URL('../public/vendor/', import.meta.url);
const speller = nspell(fs.readFileSync(new URL('en_US.aff', dir), 'utf8'), fs.readFileSync(new URL('en_US.dic', dir), 'utf8'));
const extra = new Set(fs.readFileSync(new URL('en_US-70.txt', dir), 'utf8').split('\n').filter(Boolean));
const common = new Map();
{ let tier = -1; for (const l of fs.readFileSync(new URL('en_common.txt', dir), 'utf8').split('\n')) { if (l.startsWith('#')) tier++; else if (l) common.set(l, tier); } }
const check = text => proofread(text, { speller, extra, common });
const rules = text => check(text).map(f => f.rule);
const fixAll = text => applyFixes(text, check(text).filter(f => f.severity === 'error' && f.fix));

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`✗ ${name}\n    ${e.message.split('\n').join('\n    ')}`); }
}
const has = (text, rule) => assert.ok(rules(text).includes(rule), `expected ${rule} in “${text}”, got [${rules(text)}]`);
const lacks = (text, rule) => assert.ok(!rules(text).includes(rule), `did not expect ${rule} in “${text}”`);
const fixedTo = (text, expected) => assert.equal(fixAll(text), expected);

/* ------------------------------------------------------------ word lists */

const isWord = w => speller.correct(w) || extra.has(w) || extra.has(w.toLowerCase()) || ACCEPTED.has(w.toLowerCase());

test('every listed misspelling is not a word, and its correction is', () => {
  for (const [bad, good] of Object.entries(MISSPELLINGS)) {
    assert.ok(!isWord(bad), `“${bad}” is in the dictionary`);
    for (const w of good.replace('’', "'").split(' ')) assert.ok(speller.correct(w), `correction “${w}” (for ${bad}) isn't in the dictionary`);
  }
});
test('every listed British spelling has a dictionary American form', () => {
  for (const [uk, us] of Object.entries(BRITISH)) {
    assert.ok(!speller.correct(uk), `“${uk}” is in the US dictionary`);
    assert.ok(speller.correct(us), `“${us}” isn't in the dictionary`);
  }
});
test('accepted words are not listed misspellings', () => {
  for (const w of ACCEPTED) assert.ok(!MISSPELLINGS[w], w);
});

/* -------------------------------------------------------------- spelling */

test('common misspellings are errors with a fix', () => fixedTo('I recieved it untill Febuary.', 'I received it until February.'));
test('every wrong irregular verb form is not a word, and its past tense is', () => {
  for (const [bad, [past, verb]] of Object.entries(IRREGULAR)) {
    assert.ok(!isWord(bad), `“${bad}” is in the dictionary`);
    assert.ok(speller.correct(past) && speller.correct(verb), `${past}/${verb}`);
  }
});
test('irregular verbs: buyed → bought, and the chain to the participle', () => {
  fixedTo('He buyed it and thinked about it.', 'He bought it and thought about it.');
  // The page repeats "Fix all errors" until nothing is left; so does this.
  let t = 'I had knowed it.';
  for (let i = 0; i < 5; i++) t = fixAll(t);
  assert.equal(t, 'I had known it.');
});
test('words run together are split', () => fixedTo('We help eachother alot.', 'We help each other a lot.'));
test('unknown words get suggestions but no automatic fix', () => {
  const f = check('The sky is beatiful.').find(x => x.rule === 'spelling');
  assert.ok(f && !f.fix && f.options.some(o => o.text === 'beautiful'));
  assert.equal(f.severity, 'check');
});
test('British spellings are flagged with the American form', () => {
  const f = check('The colour and behaviour of the centre.').filter(x => x.rule === 'british');
  assert.deepEqual(f.map(x => x.fix[0].text), ['color', 'behavior', 'center']);
});
test('names, acronyms, and accented words are not flagged as misspellings', () => {
  for (const t of ['We read Zvyagintsev and Hegseth.', 'The NASA and WHO data.', 'A café with a naïve début.', 'Her iPhone and YouTube.']) lacks(t, 'spelling');
});
test('names that look like misspellings are left alone', () => {
  for (const t of ['We met Abdul El-Sayed there.', 'A talk by Mr. Teh.']) assert.deepEqual(rules(t).filter(r => r === 'misspelling'), [], t);
  has('It was a cold Febuary day in Wensday class.', 'misspelling');
});
test('a name at a sentence start is not flagged if it appears elsewhere as a name', () => lacks('Kincaid argues this. We agree with Kincaid.', 'spelling'));
test('modern and compound words are accepted', () => {
  for (const t of ['A transformative and impactful plan.', 'Cybersecurity for underserved users.', 'Per capita incomes grew.', 'The gameplay and the drugmakers.', 'A well-known, self-aware writer.', 'The lunar landers.']) lacks(t, 'spelling');
});
test('possessives and plurals', () => {
  lacks('The students’ essays and the student’s essay.', 'spelling');
  has('We need more informations.', 'spelling');
});
test('misspellings inside quotation marks become checks without automatic fixes', () => {
  const f = check('She wrote, “It was recieved.”').find(x => x.rule === 'misspelling');
  assert.ok(f && f.severity === 'check' && !f.fix && f.options);
});
test('URLs and email addresses are left alone', () => lacks('See https://exmaple.com/recieve or me@exmaple.org.', 'misspelling'));

/* --------------------------------------------------------------- grammar */

test('a/an follows the sound', () => {
  fixedTo('It was a honor to meet an university professor and a elected official.', 'It was an honor to meet a university professor and an elected official.');
  fixedTo('A apple, an one-time fee, a hour, an euro, a x-ray.', 'An apple, a one-time fee, an hour, a euro, an x-ray.');
});
test('a/an: correct uses are not flagged', () => {
  for (const t of ['a horse trader', 'an unannounced visit', 'a union', 'an uninformed voter', 'a historic day', 'an historic day', 'a herb', 'an herb', 'a European', 'an American', 'an hour', 'a user', 'an umbrella', 'a one-way street', 'Plan A is', 'vitamin a in', 'if a is greater than b', 'a priori']) lacks(`It was ${t}.`, 'a-an');
});
test('could of → could have', () => fixedTo('We could of won.', 'We could have won.'));
test('“could, of course,” is fine', () => lacks('We could of course win.', 'could-of'));
test('repeated words', () => { fixedTo('It is the the best.', 'It is the best.'); lacks('What he had had was gone.', 'repeated-word'); lacks('She said that that was fine.', 'repeated-word'); });
test('lowercase i', () => { fixedTo('Then i left, and i’m glad.', 'Then I left, and I’m glad.'); lacks('Use (i) and (ii), i.e., both.', 'lowercase-i'); });
test('sentence capitals', () => {
  fixedTo('It rained. we stayed in.', 'It rained. We stayed in.');
  for (const t of ['See e.g. the data.', 'Smith et al. found it.', 'It cost approx. ten dollars.', 'In the U.S. people vote.', 'He bought an iPhone. eBay sold it.', '“Why?” she asked.', 'Wait… then go.']) lacks(t, 'sentence-capital');
});
test('days and months are capitalized; may, march, and august are not touched', () => {
  fixedTo('We met on monday in january.', 'We met on Monday in January.');
  lacks('They may march in an august hall.', 'proper-capital');
});
test('past participles', () => {
  fixedTo('They have went home. She had ran. It was took. We have already ate.', 'They have gone home. She had run. It was taken. We have already eaten.');
  lacks('We were broke and they had broken it.', 'participle');
});
test('past participles that Merriam-Webster accepts are not flagged', () => {
  for (const t of ['They have drank the water.', 'The key was hid under the mat.', 'He has hid it.', 'They had shrunk.']) lacks(t, 'participle');
});
test('words Merriam-Webster treats as standard are not flagged', () => {
  for (const t of ['It is a very unique chance.', 'Try and relax.', 'In my opinion, it works.', 'It was pretty good.', 'A lot of people came.']) {
    assert.deepEqual(rules(t).filter(r => !['formal-contraction', 'second-person'].includes(r)), [], t);
  }
});
test('repeated words that can be correct are only checks', () => {
  for (const t of ['I gave her her book.', 'Come in in the morning.', 'What it is is a mistake.']) {
    const f = check(t).find(x => x.rule === 'repeated-word');
    assert.ok(!f || f.severity === 'check', t);
  }
  assert.equal(check('It is the the best.').find(x => x.rule === 'repeated-word').severity, 'error');
});
test('“to” before a word that can be a verb is not changed to “too”', () => {
  for (const t of ['The plan is to close for a week.', 'The goal is to fast for a day.', 'They seem to long for home.']) lacks(t, 'to-too');
});
test('the Works Cited list is not checked', () => {
  const t = 'My essay is good.\n\nWorks Cited\n\nSmith, John. “a Title” Publisher, 2020.\nteh book. Accessed 7 Nov. 2026.';
  assert.deepEqual(check(t).map(f => f.rule), []);
});
test('suggestions put the most likely word first', () => {
  for (const [bad, good] of [['beatiful', 'beautiful'], ['becuse', 'because'], ['probly', 'probably'], ['tommorrow', 'tomorrow'], ['realise', 'realize']]) {
    const f = check(`It is ${bad}.`).find(x => x.category === 'spelling');
    const first = f.fix ? f.fix[0].text : f.options[0].text;
    assert.equal(first, good, bad);
  }
});
test('“I seen” but not passives or perfects', () => {
  fixedTo('I seen it.', 'I saw it.');
  for (const t of ['Have you seen it?', 'Is it seen as a threat?', 'Were they seen there?', 'I have seen it.']) lacks(t, 'seen');
});
test('subject–verb agreement', () => {
  fixedTo('He don’t care. We was late. They has left. You was right. I has one.', 'He doesn’t care. We were late. They have left. You were right. I have one.');
  for (const t of ['World War I has ended.', 'Thank you was all she said.', 'If it were true, we were there.']) lacks(t, 'agreement');
});
test('pronoun case after a preposition', () => {
  fixedTo('Between you and I, it is for him and I.', 'Between you and me, it is for him and me.');
  lacks('He and I went home.', 'pronoun-case');
  lacks('I gave it to you and I left.', 'pronoun-case');
});
test('fragments', () => {
  has('It was cold. Although the sun was out.', 'fragment');
  has('We bought fruit. Such as apples and pears.', 'fragment');
  lacks('Although the sun was out, it was cold.', 'fragment');
  lacks('Because of the rain the game stopped.', 'fragment');
});
test('numerals at the start of a sentence', () => {
  has('25 students came.', 'number-start');
  for (const t of ['1. Introduction to the study.', 'It happened on Oct. 7, 2023, in the city.', 'See p. 12 for details.', 'The Sept. 14 issue.']) lacks(t, 'number-start');
});

/* ----------------------------------------------------------- word choice */

test('their/there/they’re', () => {
  fixedTo('Their is a problem with there own plan.', 'There is a problem with their own plan.');
  lacks('Their remains were found.', 'their-there');
});
test('your welcome → you’re welcome', () => fixedTo('Thanks! Your welcome.', 'Thanks! You\'re welcome.'));
test('to/too', () => { fixedTo('We were to tired to go.', 'We were too tired to go.'); lacks('The goal is to soon expand.', 'to-too'); lacks('It is far to the north.', 'to-too'); });
test('everyday/every day', () => { fixedTo('I run everyday.', 'I run every day.'); lacks('It is an everyday task.', 'everyday'); });
test('nonstandard words and phrases', () => fixedTo('Irregardless, for all intensive purposes it works.', 'Regardless, for all intents and purposes it works.'));
test('supposed to', () => fixedTo('We were suppose to go.', 'We were supposed to go.'));
test('then/than, affect/effect, lose/loose are checks', () => {
  for (const [t, r] of [['It is better then that.', 'then-than'], ['It had an affect on us.', 'affect-effect'], ['Do not loose the game.', 'lose-loose'], ['Fewer and less people.', 'fewer']]) {
    const f = check(t).find(x => x.rule === r);
    assert.ok(f && f.severity === 'check', `${r} in “${t}”`);
  }
});

/* --------------------------------------------------------- clarity, tone */

test('wordy phrases and redundancies are suggestions', () => {
  const t = 'Due to the fact that it rained, the end result was that most students left in order to stay dry.';
  const f = check(t).filter(x => x.category === 'clarity');
  assert.deepEqual(f.map(x => x.fix[0].text), ['Because', 'result', 'to']);
  assert.ok(f.every(x => x.severity === 'check'));
});
test('“It is important to note that” can be deleted with the next word capitalized', () => {
  const f = check('It is important to note that the data were incomplete.').find(x => x.rule === 'wordy');
  assert.equal(applyFixes('It is important to note that the data were incomplete.', [f]), 'The data were incomplete.');
});
test('passive voice with “by”, but not “by far” or “by 2020”', () => {
  has('The plan was approved by the committee.', 'passive');
  lacks('It was finished by noon.', 'passive');
  lacks('It was needed by far.', 'passive');
});
test('long sentences', () => has(`${'word '.repeat(45)}end.`, 'long-sentence'));
test('clichés, contractions, informal words, gendered terms', () => {
  const t = 'It is crystal clear that it’s gonna help kids and the policeman.';
  for (const r of ['cliche', 'formal-contraction', 'informal', 'gendered']) has(t, r);
});
test('possessives are not contractions', () => lacks('John’s book and the dog’s bowl.', 'formal-contraction'));
test('turning off formal contractions is separate from the missing-apostrophe error', () => {
  const r = rules('I dont know.');
  assert.ok(r.includes('contraction') && !r.includes('formal-contraction'));
});
test('nothing in quotation marks is restyled', () => {
  const r = rules('The coach said, “You gotta try, it’s awesome.”');
  for (const x of ['second-person', 'informal', 'formal-contraction']) assert.ok(!r.includes(x), x);
});
test('its/it’s and wont/won’t', () => {
  fixedTo('Its important to note that its true. Its going to rain, and it wont stop.', "It's important to note that it's true. It's going to rain, and it won't stop.");
  lacks('The school and its important mission. Its going rate.', 'its-is');
  lacks('He was up early, as was his wont. She was wont to sing.', 'wont');
});
test('there is + plural, me and…, cant, effects as a verb, comma splices, plural apostrophes', () => {
  fixedTo('There is many reasons. There was two problems.', 'There are many reasons. There were two problems.');
  has('Me and my friends spend hours online.', 'me-and');
  fixedTo('We cant stop.', "We can't stop.");
  has('This issue effects everyone.', 'affect-effect');
  lacks('The effects the drug had were mild. Its side effects many people noticed.', 'affect-effect');
  has('I went home, it was late.', 'comma-splice');
  for (const t of ['When I got home, it was late.', 'The man, he said, was tall.', 'It is his conviction, he has said, that it works.', 'We tried, but it was not enough.']) lacks(t, 'comma-splice');
  has('My parent’s were happy.', 'plural-apostrophe');
  lacks('It’s here and that’s fine.', 'plural-apostrophe');
  lacks('The school and its development. Jerusalem as its capital.', 'its-is');
});
test('names and set phrases from the audits are left alone', () => {
  lacks('The band More Stuff and the duo Kid N’ Play performed.', 'informal');
  lacks('He was born c. 1860 in Liberia.', 'number-start');
  lacks('Whether or not it rains, we will go. (Whether or not it works, I will try.)', 'wordy');
  has('We must decide whether or not to go.', 'wordy');
  lacks('The group Sungu Sungu met.', 'repeated-word');
});
test('extra spaces', () => { fixedTo('Two  spaces.', 'Two spaces.'); has('One.  Two.', 'sentence-spacing'); });

/* ------------------------------------------------------------- clean text */

test('a correct academic paragraph has no errors', () => {
  const t = 'Although the results were mixed, the trend was clear. On March 5, 2024, the committee met in Austin, Texas, to review the data. ' +
    'The researchers found that students who slept more performed better than those who did not. However, the sample was small, and the authors ' +
    'caution that further studies are needed. As Smith et al. note, “sleep is not a luxury” (42). The committee therefore recommended a later start time.';
  const errors = check(t).filter(f => f.severity === 'error');
  assert.deepEqual(errors.map(f => `${f.rule}: ${t.slice(f.start, f.end)}`), []);
});

/* ---------------------------------------------------------- stats, tools */

test('sentences split at real sentence ends only', () => {
  const t = 'Dr. Smith arrived at 5 p.m. on Jan. 3. She left. J. K. Rowling wrote it, e.g. in 1997. Done!';
  assert.deepEqual(splitSentences(t).map(s => t.slice(s.start, s.end)), ['Dr. Smith arrived at 5 p.m. on Jan. 3.', 'She left.', 'J. K. Rowling wrote it, e.g. in 1997.', 'Done!']);
});
test('text statistics', () => {
  const s = textStats('One two three. Four five.\n\nSix.');
  assert.equal(s.words, 6); assert.equal(s.sentences, 3); assert.equal(s.paragraphs, 2); assert.equal(s.longest, 3);
  assert.equal(s.grade, null);
});
test('LanguageTool findings move with edits made before them and drop when edited', () => {
  const before = 'Hello wrld. I has it.';
  const f = [{ start: 6, end: 10, fix: [{ start: 6, end: 10, text: 'world' }] }, { start: 14, end: 17, fix: [{ start: 14, end: 17, text: 'have' }] }];
  const after = 'Hello there wrld. I has it.';
  const moved = shiftFindings(f, before, after);
  assert.deepEqual(moved.map(x => after.slice(x.start, x.end)), ['wrld', 'has']);
  assert.equal(shiftFindings(f, before, 'Hello world. I has it.').length, 1);
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
