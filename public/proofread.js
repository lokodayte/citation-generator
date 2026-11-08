// Proofreader for academic writing in American English.
//
// Runs entirely in the browser. Checks spelling (with an American English
// Hunspell dictionary), grammar, commonly confused words, punctuation (the
// rules in punctuation.js), clarity, and formal tone.
//
// Each finding: { rule, category, severity, title, why, start, end,
//                 fix?: [{start, end, text}], options?: [{text, fix}] }
//   severity "error" — breaks a rule of standard written English;
//   severity "check" — depends on meaning or on the assignment: the writer decides.
// A finding has `fix` only when there is one clear correction.

import { checkPunctuation, protectedRanges, caseLike } from './punctuation.js';
import { MISSPELLINGS, IRREGULAR, ACCEPTED, BRITISH, WORDY, CLICHES, INFORMAL, TEXTSPEAK, GENDERED, CONTRACTION_FULL } from './proofread-data.js';

export const CATEGORIES = {
  spelling: 'Spelling', grammar: 'Grammar', word: 'Word choice', punctuation: 'Punctuation',
  clarity: 'Clarity', formal: 'Formal tone',
};

const IN_QUOTE = ' This is inside a quotation: change it only if you copied the quotation wrong.';

// quotes: what to do inside quotation marks, where the writer must keep the
// source's words — "skip" (default), "soften" (still shown, as a check), or "keep".
export const PROOF_RULES = {
  'spelling': { category: 'spelling', severity: 'check', quotes: 'soften', title: 'Possible misspelling', why: 'This word isn’t in the American English dictionary. It may be misspelled, or it may be a name or a new or technical word the dictionary doesn’t know; if so, choose “Add to dictionary.”' },
  'misspelling': { category: 'spelling', severity: 'error', quotes: 'soften', title: 'Misspelled word', why: 'This is a common misspelling.' },
  'british': { category: 'spelling', severity: 'check', title: 'British spelling', why: 'American English spells this word differently.' },

  'a-an': { category: 'grammar', severity: 'error', title: '“a” or “an”', why: 'Use “a” before a consonant sound and “an” before a vowel sound. The sound decides, not the letter: a university, a one-time fee, an hour, an honest answer.' },
  'could-of': { category: 'grammar', severity: 'error', title: '“of” instead of “have”', why: '“Could’ve” sounds like “could of,” but the written form is “could have” (also would have, should have, must have, might have, may have).' },
  'repeated-word': { category: 'grammar', severity: 'error', quotes: 'soften', title: 'Repeated word', why: 'The same word appears twice in a row.' },
  'lowercase-i': { category: 'grammar', severity: 'error', title: 'Lowercase “i”', why: 'The pronoun “I” is always a capital letter.' },
  'sentence-capital': { category: 'grammar', severity: 'error', title: 'Sentence starts with a lowercase letter', why: 'Begin every sentence with a capital letter.' },
  'proper-capital': { category: 'grammar', severity: 'error', title: 'Word that needs a capital letter', why: 'Days of the week, months, and the names of languages, nationalities, and religions always begin with a capital letter.' },
  'participle': { category: 'grammar', severity: 'error', title: 'Wrong verb form', why: 'After have, has, had, or a form of “be,” use the past participle: have gone (not have went), has seen, was written, had taken.' },
  'seen': { category: 'grammar', severity: 'error', title: '“seen” without “have”', why: '“Seen” needs a helping verb (I have seen, she had seen). On its own, the past tense is “saw.”' },
  'agreement': { category: 'grammar', severity: 'error', title: 'Subject and verb don’t agree', why: 'The verb must match its subject: he doesn’t, it doesn’t, they were, we are, you have, I have.' },
  'there-is-plural': { category: 'grammar', severity: 'error', title: '“there is” before a plural', why: 'In a sentence that begins with “there is” or “there are,” the verb agrees with the noun that follows it: there are many reasons, there were two problems (Purdue OWL, subject–verb agreement).' },
  'me-and': { category: 'grammar', severity: 'check', title: '“me” or “him” as the subject', why: 'As the subject of a sentence, use I, he, she, we, or they: My friend and I went (not Me and my friend went). Test it by dropping the other person: you would write “I went,” not “Me went.”' },
  'comma-splice': { category: 'punctuation', severity: 'check', title: 'Possible comma splice', why: 'Two complete sentences joined only by a comma make a comma splice (Purdue OWL). Use a period or a semicolon, or add a joining word such as “and,” “but,” or “because.”' },
  'plural-apostrophe': { category: 'punctuation', severity: 'check', title: 'Apostrophe in a plural?', why: 'An apostrophe shows possession or a contraction; it doesn’t make a plural (two apples, not two apple’s). If you mean more than one, remove the apostrophe.' },
  'pronoun-case': { category: 'grammar', severity: 'error', title: '“I” where “me” is needed', why: 'After a preposition (between, with, for, to…), use “me”: between you and me, for her and me. Test it by dropping the other person: you would write “for me,” not “for I.”' },
  'fragment': { category: 'grammar', severity: 'check', title: 'Possible sentence fragment', why: '' },
  'number-start': { category: 'grammar', severity: 'check', title: 'Sentence starts with a numeral', why: 'Don’t begin a sentence with a numeral: spell the number out, or reword the sentence so the number comes later. MLA, APA, and Chicago agree on this.' },

  'their-there': { category: 'word', severity: 'error', title: '“their,” “there,” or “they’re”', why: '“There” points to a place or starts a sentence (there is, there are); “their” shows possession (their own); “they’re” means “they are.”' },
  'your-youre': { category: 'word', severity: 'check', title: '“your” or “you’re”', why: '“You’re” means “you are”; “your” shows possession (your book).' },
  'then-than': { category: 'word', severity: 'check', title: '“then” or “than”', why: 'Use “than” to compare (better than, rather than, other than) and “then” for time or sequence (and then, since then).' },
  'whose': { category: 'word', severity: 'check', title: '“who’s” or “whose”', why: '“Who’s” means “who is” or “who has”; “whose” shows possession (whose idea, whose turn).' },
  'to-too': { category: 'word', severity: 'error', title: '“to” where “too” is meant', why: '“Too” means “excessively” or “also” (too tired, too late, me too); “to” is a preposition or part of a verb (to school, to go).' },
  'affect-effect': { category: 'word', severity: 'check', title: '“affect” or “effect”', why: 'Usually “affect” is the verb (the weather affects us) and “effect” is the noun (an effect on us).' },
  'lose-loose': { category: 'word', severity: 'check', title: '“lose” or “loose”', why: '“Lose” is the verb (lose weight, lose the game); “loose” means not tight.' },
  'everyday': { category: 'word', severity: 'error', title: '“everyday” or “every day”', why: '“Everyday” (one word) is an adjective that comes before a noun: everyday life. When you mean “each day,” write two words: I run every day.' },
  'nonstandard': { category: 'word', severity: 'error', title: 'Nonstandard word', why: '' },
  'supposed-to': { category: 'word', severity: 'error', title: '“suppose to” instead of “supposed to”', why: 'The phrase is “supposed to,” with a “d” (it is hard to hear in speech).' },
  'fewer': { category: 'word', severity: 'check', title: '“less” or “fewer”', why: 'With things you can count, “fewer” is the traditional choice in formal writing (fewer people, fewer errors). “Less” is standard for amounts (less time) and in phrases such as “less than 50 people” (Merriam-Webster).' },
  'number-of': { category: 'word', severity: 'check', title: '“amount” or “number”', why: 'Use “number” for things you can count (a number of students) and “amount” for quantities (an amount of money).' },
  'plural-latin': { category: 'word', severity: 'check', title: 'Singular or plural', why: '“Criteria” and “phenomena” are plural. The singular forms are “criterion” and “phenomenon.”' },
  'reason-because': { category: 'word', severity: 'check', title: '“the reason is because”', why: '“The reason is because” is common, but many readers object that “because” repeats “reason” (Merriam-Webster discusses the objection). “The reason is that…” avoids it.' },
  'in-regard': { category: 'word', severity: 'check', title: '“in regards to”', why: 'The standard phrase is “in regard to” or “with regard to” (or simply “regarding” or “about”).' },
  'comprised': { category: 'word', severity: 'check', title: '“comprised of”', why: 'Merriam-Webster notes that “is comprised of” is now common but still draws strong objections. “Is composed of” or “consists of” avoids them.' },
  'being-that': { category: 'word', severity: 'check', title: '“being that”', why: 'Merriam-Webster labels “being that” (meaning “because” or “since”) chiefly dialectal. Use “because” or “since.”' },

  'its-is': { category: 'punctuation', severity: 'error', title: '“its” where “it’s” is meant', why: '“It’s” means “it is” or “it has”; “its” shows possession (the school and its mission).' },
  'cant': { category: 'punctuation', severity: 'error', title: '“cant” where “can’t” is meant', why: '“Can’t” (cannot) needs an apostrophe. “Cant” without one is a different word (insincere or special talk).' },
  'wont': { category: 'punctuation', severity: 'error', title: '“wont” where “won’t” is meant', why: '“Won’t” (will not) needs an apostrophe. “Wont” without one is a different word meaning “habit” (as was his wont).' },
  'extra-space': { category: 'punctuation', severity: 'error', quotes: 'keep', title: 'Extra space between words', why: 'Two or more spaces in a row between words are a typing slip; use one.' },
  'sentence-spacing': { category: 'punctuation', severity: 'check', quotes: 'keep', title: 'Two spaces after a sentence', why: 'MLA and APA (7th edition) both say to use one space after a period or other end punctuation, unless your instructor prefers two. (The 6th edition of APA recommended two.)' },

  'wordy': { category: 'clarity', severity: 'check', title: 'Wordy phrase', why: '' },
  'redundant': { category: 'clarity', severity: 'check', title: 'Redundant words', why: '' },
  'passive': { category: 'clarity', severity: 'check', title: 'Passive voice', why: 'The doer of the action comes after “by.” Active voice is usually clearer and shorter (The committee approved the plan, not The plan was approved by the committee). Passive voice is fine when the doer is unknown or unimportant.' },
  'long-sentence': { category: 'clarity', severity: 'check', title: 'Very long sentence', why: '' },
  'cliche': { category: 'clarity', severity: 'check', title: 'Cliché', why: '' },

  'formal-contraction': { category: 'formal', severity: 'check', title: 'Contraction', why: 'APA Style says to avoid contractions in academic writing. MLA allows them but notes that they may not suit a formal research paper. Follow your instructor.' },
  'informal': { category: 'formal', severity: 'check', title: 'Informal word', why: '' },
  'textspeak': { category: 'formal', severity: 'check', title: 'Texting abbreviation', why: 'Abbreviations from texting and chat don’t belong in an academic paper. Write the words out.' },
  'second-person': { category: 'formal', severity: 'check', title: 'Addressing the reader as “you”', why: 'The Purdue OWL notes that “you” is rarely used in academic writing, except in instructions. Name who you mean (students, readers, people), unless your assignment asks you to address the reader.' },
  'gendered': { category: 'formal', severity: 'check', title: 'Gendered term', why: 'APA Style recommends gender-neutral terms when you mean people in general (police officer rather than policeman; people or humanity rather than mankind). Keep the original if it is someone’s official title.' },
};

/* ------------------------------------------------------------------ helpers */

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A phrase as a regular expression: any spaces between words, either apostrophe.
const phraseRe = p => esc(p).replace(/ +/g, '[ \\t]+').replace(/['’]/g, '[\'’]');
const sub = (start, end, text) => [{ start, end, text }];

function keepCase(source, replacement) {
  if (source.length > 1 && source === source.toUpperCase() && /\p{Lu}/u.test(source)) return replacement.toUpperCase();
  return caseLike(source, replacement);
}
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

// Abbreviations whose period doesn't end a sentence.
const ABBREV = new Set(('mr mrs ms dr prof sr jr st mt ft vs etc al cf ca approx ch chap ed eds trans vol vols no nos p pp ' +
  'para paras fig figs sec jan feb mar apr jun jul aug sep sept oct nov dec inc co corp ltd dept univ gov gen col capt lt ' +
  'sgt rev hon rep sen est esp viz incl misc op ibid govt assn natl intl min max approx dept').split(' '));
// …and those that are followed by a capitalized name or number ("Dr. Smith", "p. 12").
const TITLE_ABBREV = new Set('mr mrs ms dr prof sr jr st mt ft gen col capt lt sgt rev hon rep sen gov no nos vol vols p pp fig figs ch vs cf c ca jan feb mar apr jun jul aug sep sept oct nov dec'.split(' '));

// Splits text into sentences: [{start, end}] (end exclusive, trailing spaces excluded).
export function splitSentences(text) {
  const out = [];
  let lineStart = 0;
  for (const line of text.split('\n')) {
    let start = line.search(/\S/);
    if (start >= 0) {
      const re = /[.!?…]+["”’)\]]*(?=\s|$)/g;
      let m;
      while ((m = re.exec(line))) {
        const end = m.index + m[0].length;
        const next = line.slice(end).match(/^\s*(\S?)/)[1];
        if (next && /\p{Ll}/u.test(next)) continue; // "etc. and", "e.g. the"
        if (m[0] === '.') {
          const tok = line.slice(0, m.index).match(/[\p{L}.]+$/u)?.[0] || '';
          if (/^\p{Lu}$/u.test(tok) || TITLE_ABBREV.has(tok.toLowerCase()) || /\p{L}\.\p{L}/u.test(tok)) continue; // "J. K.", "Dr.", "U.S."
        }
        if (end > start) out.push({ start: lineStart + start, end: lineStart + end });
        start = end + (line.slice(end).match(/^\s*/)[0].length);
      }
      const rest = line.slice(start).trimEnd();
      if (rest) out.push({ start: lineStart + start, end: lineStart + start + rest.length });
    }
    lineStart += line.length + 1;
  }
  return out;
}

// Spans inside quotation marks (curly pairs, or pairs of straight quotes in a paragraph).
function quoteRanges(text) {
  const out = [];
  let depth = 0, open = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '“') { if (!depth) open = i; depth++; }
    else if (ch === '”' && depth) { depth--; if (!depth) out.push([open, i + 1]); }
    else if (ch === '\n') depth = 0;
  }
  let offset = 0;
  for (const line of text.split('\n')) {
    const idx = [...line.matchAll(/(?<!\d)"/g)].map(m => m.index);
    for (let k = 0; k + 1 < idx.length; k += 2) out.push([offset + idx[k], offset + idx[k + 1] + 1]);
    offset += line.length + 1;
  }
  return out;
}

// Where a Works Cited, References, or Bibliography list begins (entries follow their own format).
const CITATIONS_HEADING = /^[ \t]*(?:Works Cited|Works Consulted|Works Referenced|References|Reference List|Bibliography|Sources Cited|Literature Cited)[ \t]*:?[ \t]*$/im;
export function citationsStart(text) {
  const m = text.match(CITATIONS_HEADING);
  return m ? m.index : -1;
}

function context(text) {
  const shielded = protectedRanges(text);
  const quotes = quoteRanges(text);
  const sentences = splitSentences(text);
  const starts = new Set();
  for (const s of sentences) {
    const lead = text.slice(s.start, s.end).match(/^[\s"“‘'(\[—–-]*/)[0].length;
    starts.add(s.start + lead);
  }
  const overlaps = (ranges, a, b) => ranges.some(([x, y]) => a < y && b > x);
  return {
    text, sentences,
    isSentenceStart: i => starts.has(i),
    inProtected: (a, b) => overlaps(shielded, a, b),
    inQuote: (a, b) => quotes.some(([x, y]) => a >= x && b <= y),
    // The writer's apostrophe: curly if the text mostly uses curly ones.
    apos: (text.match(/’/g) || []).length > (text.match(/'/g) || []).length ? '’' : "'",
  };
}

/* ------------------------------------------------------------ article a/an */

const SILENT_H = /^(hour|honest|honor|honour|heir)|^hors$/;
const AMBIGUOUS_H = /^(herb|historic|homage)/; // "a/an historic", "a/an herb": both in use
// Words spelled with a vowel but starting with a consonant sound ("you", "w").
const CONSONANT_SOUND = /^(one(?:$|s$|ness|self|-)|once|ouija|eu|ewe|use|usa|usu|ute|uti|uto|ura|ure|uri|uro|ubiq|ukul|unanim|unar|uvul|uni(?:form|on|que|t|ver|corn|cycl|lateral|fy|fi|son|sex|cameral|cellular|polar))/;
const CAP_VOWEL = /^(American|African|Asian|Australian|Austrian|Arab|Arabic|Argentine|Argentinian|Armenian|Algerian|Afghan|Albanian|Egyptian|English|Ethiopian|Eritrean|Estonian|Ecuadorian|Indian|Indonesian|Iranian|Iraqi|Irish|Israeli|Italian|Icelandic|Islamic|Olympic|Ottoman|Easter|Atlantic|Arctic|Antarctic|Omani)s?$/;
const CAP_CONSONANT = /^(European|Eurasian|Ukrainian|Ugandan|Uruguayan|Utahn|Unitarian|University|Union|United|Universal)s?$/;
// Words that can't follow an article: "a" here is a letter or variable ("if a is …").
const NOT_AFTER_ARTICLE = new Set(('is are was were am be and or of in on at to it its if as equals equal else either into onto upon unless until an a the ' +
  'each every our out over after about above across against among around before behind below beneath beside between beyond but by during except for ' +
  'from inside outside since than that through throughout toward towards within without which who whom whose when where while why how all any also ' +
  'always already again almost even ever ought has have had will would can could should may might must do does did not no nor so yet').split(' '));
const LABEL_NOUN = /\b(vitamin|type|grade|plan|part|option|section|item|class|exhibit|appendix|row|column|letter|letters|step|figure|table|group|team|level|category|size|blood|hepatitis|model|series|phase|version|tier|block|unit|chapter|volume|question|problem|answer|choice|list|track|side|point|note|key|line|wing|building|hall|room|gate|terminal|lot|zone|sector|cell|box|division|league|string|flight|deck|program|project|batch|sample|trial|case|subject|participant|condition|sheet|form|page|region|area)[ \t]+$/i;

function expectedArticle(word) {
  const w = word.replace(/['’].*$/, '');
  if (/^[A-Za-z]-/.test(w)) return 'aefhilmnorsx'.includes(w[0].toLowerCase()) ? 'an' : 'a'; // letter names: an x-ray, a T-shirt
  if (/^\p{Lu}/u.test(w)) return CAP_VOWEL.test(w) ? 'an' : CAP_CONSONANT.test(w) ? 'a' : null;
  if (w.length < 2) return null;
  if (AMBIGUOUS_H.test(w)) return null;
  if (SILENT_H.test(w)) return 'an';
  if (/^[aeiou]/.test(w)) {
    if (CONSONANT_SOUND.test(w)) return 'a';
    if (/^uni/.test(w)) return null; // "an uninformed" but "a uniform": unknown uni- words are left alone
    return 'an';
  }
  return /^[bcdfgjklmnpqrstvwxyz]/.test(w) || /^h/.test(w) ? 'a' : null;
}

/* ---------------------------------------------------------------- grammar */

// Repeated words that are always a slip. Others can be correct: "I gave her her book",
// "What it is is…", "Come in in the morning", "the will will be read".
const ERROR_DOUBLES = new Set('the a an and or but nor of my your our their its this these those than if because although whether'.split(' '));
const LEGIT_DOUBLES = new Set(['had', 'that']);

const PARTICIPLE = {
  went: 'gone', came: 'come', ran: 'run', saw: 'seen', did: 'done', wrote: 'written', ate: 'eaten',
  began: 'begun', swam: 'swum', took: 'taken', gave: 'given', spoke: 'spoken', chose: 'chosen', broke: 'broken',
  stole: 'stolen', threw: 'thrown', drove: 'driven', rode: 'ridden', flew: 'flown', grew: 'grown', knew: 'known',
  sang: 'sung', rang: 'rung', froze: 'frozen', shook: 'shaken', fell: 'fallen', tore: 'torn', wore: 'worn',
  blew: 'blown', drew: 'drawn', sank: 'sunk', shrank: 'shrunk', sprang: 'sprung',
  mistook: 'mistaken', undertook: 'undertaken', overtook: 'overtaken', withdrew: 'withdrawn', arose: 'arisen',
};
// After a form of "be" only these (not "were broke", which can mean "had no money").
const BE_PARTICIPLE = ['took', 'gave', 'wrote', 'stole', 'chose', 'spoke', 'drove', 'ate', 'threw', 'drew', 'began', 'sang', 'rang', 'froze', 'shook', 'tore', 'wore', 'mistook', 'undertook', 'overtook', 'withdrew'];
const ADVERBS = 'already|never|ever|just|not|always|finally|recently|also|probably|really|actually|definitely|certainly|still|all|both|even|only|truly|once|often';
const COUNT_NOUNS = 'people|students|children|items|things|books|words|mistakes|errors|cars|problems|questions|options|choices|employees|members|jobs|calories|cases|deaths|patients|participants|individuals|countries|schools|teachers|workers|families|women|men|animals|trees|houses|homes|companies|events|users|customers|votes|points|steps';

// Finite verbs that show the words before a comma form a clause ("I went home, it was late").
const FINITE = 'is|was|are|were|am|has|have|had|do|does|did|will|would|can|could|should|may|might|must|isn[\'’]t|wasn[\'’]t|' +
  'went|came|saw|got|made|took|gave|knew|thought|told|felt|left|found|said|ran|ate|wrote|became|began|kept|held|brought|' +
  'bought|sat|stood|lost|paid|met|sent|spent|built|won|fell|grew|drove|flew|threw|wore|chose|spoke|broke|taught|caught|\\p{Ll}+ed';

function* grammarRules(c) {
  const { text } = c;
  const each = function* (re, fn) { for (const m of text.matchAll(re)) { const f = fn(m); if (f) yield f; } };

  // could of → could have
  yield* each(/\b(could|would|should|must|might|may)([ \t]+)(of)\b(?![ \t]+course\b)/gi, m => {
    const at = m.index + m[1].length + m[2].length;
    return { rule: 'could-of', start: m.index, end: at + 2, fix: sub(at, at + 2, keepCase(m[3], 'have')) };
  });

  // a / an
  yield* each(/(?<![\p{L}\p{N}'’.-])(a|an|A|An)([ \t]+)(\p{L}[\p{L}'’-]*)/gu, m => {
    const [all, art, , next] = m;
    if (art[0] === 'A' && !c.isSentenceStart(m.index)) return null; // "Plan A", "Type A"
    if (LABEL_NOUN.test(text.slice(Math.max(0, m.index - 30), m.index))) return null; // "part a"
    if (NOT_AFTER_ARTICLE.has(next.toLowerCase()) || /^(priori|posteriori|fortiori|la|cappella|capella|propos)$/i.test(next)) return null;
    const want = expectedArticle(next);
    if (!want || want === art.toLowerCase()) return null;
    const rep = art[0] === 'A' ? capitalize(want) : want;
    return { rule: 'a-an', start: m.index, end: m.index + all.length, title: `Use “${rep}” here`, fix: sub(m.index, m.index + art.length, rep) };
  });

  // Repeated words: "the the".
  yield* each(/(?<![\p{L}'’-])(\p{L}+)(?=([ \t]+)(\p{L}+)(?![\p{L}'’-]))/gu, m => {
    const w = m[1].toLowerCase();
    if (w !== m[3].toLowerCase() || LEGIT_DOUBLES.has(w)) return null;
    if (/^\p{Lu}/u.test(m[3]) && !ERROR_DOUBLES.has(w)) return null; // names: "Sungu Sungu", "Walla Walla"
    const end = m.index + m[1].length + m[2].length + m[3].length;
    const f = { rule: 'repeated-word', start: m.index, end, fix: sub(m.index + m[1].length, end, '') };
    if (!ERROR_DOUBLES.has(w)) { f.severity = 'check'; f.why = 'The same word appears twice in a row. That is sometimes intended (“very, very”), but often a typing slip.'; }
    return f;
  });

  // Lowercase "i" as a pronoun (not "i.e.", "(i)", or a roman numeral list "i.").
  yield* each(/(?<![\p{L}\p{N}'’.(\[\/\\_-])i(?=['’](?:m|ve|ll|d)\b|[ \t\n,;:!?”"]|\.(?!\p{L})|$)/gu, m => {
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    if (!text.slice(lineStart, m.index).trim() && /^[.)]/.test(text.slice(m.index + 1))) return null;
    return { rule: 'lowercase-i', start: m.index, end: m.index + 1, fix: sub(m.index, m.index + 1, 'I') };
  });

  // A sentence that starts with a lowercase letter after . ! or ?
  yield* each(/([.!?])(["”’)\]]*)([ \t]+)(\p{Ll}[\p{L}'’-]*)/gu, m => {
    const [, mark, closers, space, word] = m;
    if (closers) return null; // “Why?” she asked.
    if (/\p{Lu}/u.test(word.slice(1))) return null; // iPhone, eBay
    if (mark === '.') {
      if (text[m.index - 1] === '.' || text[m.index + 1] === '.') return null; // ellipsis
      const tok = text.slice(0, m.index).match(/[\p{L}\p{N}.]+$/u)?.[0] || '';
      if (!tok || tok.includes('.') || tok.length === 1 || ABBREV.has(tok.toLowerCase())) return null; // e.g., U.S., J., etc.
    }
    const at = m.index + 1 + space.length;
    const f = { rule: 'sentence-capital', start: at, end: at + word.length, fix: sub(at, at + 1, word[0].toUpperCase()) };
    if (mark !== '.') f.severity = 'check'; // "Yahoo! is …"
    return f;
  });
  // …or at the start of a paragraph.
  {
    let offset = 0, prev = null;
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t) {
        const prevEnded = prev === null || /[.!?:]["”’)]*$/.test(prev) || (/^\p{Lu}/u.test(prev) && prev.split(/\s+/).length <= 8 && !/[,;]$/.test(prev));
        const lead = line.match(/^[\s"“‘(\[]*/)[0].length;
        const word = line.slice(lead).match(/^\p{Ll}[\p{L}'’-]*/u)?.[0];
        if (prevEnded && word && !/\p{Lu}/u.test(word.slice(1)) && /[.!?]["”’)]*$/.test(t) && !(word === 'i' && /^[.)]/.test(line.slice(lead + 1)))) {
          const at = offset + lead;
          yield { rule: 'sentence-capital', start: at, end: at + word.length, fix: sub(at, at + 1, word[0].toUpperCase()) };
        }
        prev = t;
      }
      offset += line.length + 1;
    }
  }

  // Days, months, languages, nationalities, religions.
  yield* each(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|september|october|november|december|english|american|spanish|african|european|asian|christian|muslim|jewish|islamic)\b/g, m => ({
    rule: 'proper-capital', start: m.index, end: m.index + m[0].length, title: `Capitalize “${capitalize(m[0])}”`, fix: sub(m.index, m.index + 1, m[0][0].toUpperCase()),
  }));

  // have went → have gone; was took → was taken
  const pList = Object.keys(PARTICIPLE).join('|');
  yield* each(new RegExp(`(?:\\b(?:have|has|had|having|haven['’]t|hasn['’]t|hadn['’]t)|['’]ve)((?:[ \\t]+(?:${ADVERBS}))*)[ \\t]+(?:(?:I|you|we|they|he|she|it)[ \\t]+)?(${pList})\\b`, 'gi'), m => {
    const word = m[2], at = m.index + m[0].length - word.length;
    const right = PARTICIPLE[word.toLowerCase()];
    return { rule: 'participle', start: m.index, end: at + word.length, title: `“${word}” should be “${right}”`, fix: sub(at, at + word.length, keepCase(word, right)) };
  });
  yield* each(new RegExp(`\\b(?:am|is|are|was|were|be|been|being|isn['’]t|aren['’]t|wasn['’]t|weren['’]t)((?:[ \\t]+(?:${ADVERBS}))*)[ \\t]+(${BE_PARTICIPLE.join('|')})\\b`, 'gi'), m => {
    const word = m[2], at = m.index + m[0].length - word.length;
    const right = PARTICIPLE[word.toLowerCase()];
    return { rule: 'participle', start: m.index, end: at + word.length, title: `“${word}” should be “${right}”`, fix: sub(at, at + word.length, keepCase(word, right)) };
  });

  // "I seen it" (but "Have you seen", "had they seen" are fine).
  // (Nor passives: "Is it seen as …", "were they seen".)
  yield* each(/(?<!\b(?:have|has|had|having|['’]ve|am|is|are|was|were|be|been|being|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|get|gets|got)[ \t]+(?:[\p{L}'’]+[ \t]+)?)\b(I|we|they|you|he|she|it)([ \t]+)(seen)\b/giu, m => {
    const at = m.index + m[1].length + m[2].length;
    return { rule: 'seen', start: m.index, end: at + 4, fix: sub(at, at + 4, 'saw') };
  });

  // Subject–verb agreement (only unambiguous pairs).
  const AGREE = {
    "don't": "doesn't", 'was': 'were', "wasn't": "weren't", 'is': 'are', "isn't": "aren't", 'has': 'have',
    "hasn't": "haven't", "doesn't": "don't",
  };
  const agree = (m, verb) => {
    const at = m.index + m[0].length - verb.length;
    const right = AGREE[verb.toLowerCase().replace('’', "'")].replace("'", verb.includes('’') ? '’' : "'");
    return { rule: 'agreement', start: m.index, end: at + verb.length, title: `“${verb}” should be “${right}”`, fix: sub(at, at + verb.length, keepCase(verb, right)) };
  };
  yield* each(/\b(?:he|she|it)[ \t]+(don['’]t)\b/gi, m => agree(m, m[1]));
  yield* each(/\b(?:they|we)[ \t]+(was|wasn['’]t|is|isn['’]t|has|hasn['’]t|doesn['’]t)\b/gi, m => agree(m, m[1]));
  yield* each(/(?<!\bthank[ \t]+)\byou[ \t]+(was|wasn['’]t|has|hasn['’]t|doesn['’]t)\b/gi, m => agree(m, m[1]));
  yield* each(/(?<!\p{Lu}[\p{L}]*[ \t]+)\bI[ \t]+(has|hasn['’]t|doesn['’]t)\b/gu, m => agree(m, m[1])); // not "World War I has"

  // between you and I → me
  yield* each(/\bbetween[ \t]+you[ \t]+and[ \t]+(I)\b/gi, m => {
    const at = m.index + m[0].length - 1;
    return { rule: 'pronoun-case', start: m.index, end: at + 1, fix: sub(at, at + 1, 'me') };
  });
  yield* each(/\b(?:with|for|to|from|like|about|against|among|except|without|behind|beside|near|toward|towards|of)[ \t]+(?:you|him|her|them|us)[ \t]+and[ \t]+(I)(?=[ \t]*(?:[.,;:!?)]|$))/gim, m => {
    const at = m.index + m[0].length - 1;
    return { rule: 'pronoun-case', start: m.index, end: at + 1, fix: sub(at, at + 1, 'me') };
  });

  // "There is many reasons" → "there are"
  yield* each(/\b(there)[ \t]*(is|was|['’]s)[ \t]+(?=(?:many|several|numerous|two|three|four|five|six|seven|eight|nine|ten|both)\b(?!-))/gi, m => {
    const verb = m[2], at = m.index + m[0].length - verb.length - (m[0].length - m[0].trimEnd().length);
    const vStart = m.index + m[1].length + (m[0].slice(m[1].length).match(/^[ \t]*/)[0].length);
    const right = /was/i.test(verb) ? ' were' : ' are';
    const fix = /['’]s/.test(verb) ? sub(vStart, vStart + verb.length, right) : sub(vStart, vStart + verb.length, keepCase(verb, right.trim()));
    return { rule: 'there-is-plural', start: m.index, end: vStart + verb.length, fix };
  });

  // "Me and my friend went" (subject).
  yield* each(/(?:^|(?<=[.!?]["”’)]*[ \t]+))(Me|Him|Her|Them|Us)[ \t]+and[ \t]+(?:I|me|him|her|them|us|my|his|her|their|our|the|a|an|\p{Lu}\p{Ll}+)\b(?=[ \t]+\p{Ll})/gmu, m => (
    { rule: 'me-and', start: m.index, end: m.index + m[1].length + 4 }));

  // "The apple's are ripe": an apostrophe used for a plural.
  yield* each(/\b(\p{Ll}{3,})['’]s(?=[ \t]+(?:are|were)\b)/gu, m => {
    if (/^(it|that|what|there|here|who|let|he|she|where|how|why|when)$/.test(m[1])) return null;
    const end = m.index + m[0].length;
    return { rule: 'plural-apostrophe', start: m.index, end, fix: sub(end - 2, end - 1, '') };
  });

  // Sentence-level checks.
  for (const s of c.sentences) {
    const sent = text.slice(s.start, s.end);
    const lead = sent.match(/^[\s"“‘(\[]*/)[0].length;
    const body = sent.slice(lead);
    const start = s.start + lead;

    // Fragments: an opening subordinate clause with nothing after it.
    let m = body.match(/^(Although|Though|Even though|Because(?! of\b)|Whereas)\b/);
    if (m && !body.includes(',') && /[.!]["”’)]*$/.test(body)) {
      yield { rule: 'fragment', start, end: start + m[1].length,
        why: `A sentence that begins with “${m[1]}” needs a main clause after that opening part (${m[1]} it rained, we went). If yours has one, put a comma after the opening part; if not, join it to the sentence before.` };
    }
    m = body.match(/^(Such as|Especially|Including|Which)\b/);
    if (m && /[.!]["”’)]*$/.test(body) && !(m[1] === 'Which' && body.includes(','))) {
      yield { rule: 'fragment', start, end: start + m[1].length,
        why: `This starts like the second half of a sentence, so it can’t stand alone. Join it to the sentence before it with a comma (…, ${m[1].toLowerCase()} …).` };
    }

    // Comma splice: a sentence that starts with its subject, then ", it was …".
    if (/^(?:I|We|They|He|She|It|You|The|This|That|These|Those|My|Our|Their|His|Her|Its|There)\b/.test(body)) {
      const sp = body.match(new RegExp(`^(?=[^,;:]{6,},)([^,;:]*?\\b(?:${FINITE})\\b[^,;:]*?),[ \\t]+(?:it|this|he|she|they|we|I|there)[ \\t]+(?:is|was|are|were|am|has|have|had|will|would|can|could|should|may|might|must|isn['’]t|wasn['’]t|aren['’]t|weren['’]t|doesn['’]t|didn['’]t|don['’]t|['’]s|['’]re)\\b(?![^.!?]*?,[ \\t]*(?:and|but|or|so)\\b)`, 'u'));
      if (sp && !/\b(?:because|although|though|when|whenever|if|since|while|after|before|unless|until|whereas|as|once|that|which|who|whom|whose|where|whether|than)\b/i.test(sp[1]) && !/^,[ \t]+(?:it|this|he|she|they|we|I|there)[ \t]+\S+(?:[ \t]+\S+)?[ \t]*,/.test(body.slice(sp[1].length))) {
        const at = start + sp[1].length;
        yield { rule: 'comma-splice', start: at, end: at + 1, options: [{ text: ';', fix: sub(at, at + 1, ';') }] };
      }
    }

    // Numeral at the start (not a numbered list item like "1. Introduction").
    if (/^\d/.test(body) && !/^\d+[.)]\s/.test(body) && /\s/.test(body) && /[.!?]["”’)]*$/.test(body)) {
      const num = body.match(/^[\d.,%-]+/)[0];
      yield { rule: 'number-start', start, end: start + num.length };
    }
  }
}

/* ---------------------------------------------------------------- spacing */

function* apostropheRules(c) {
  const { text } = c;
  // "Its important to note" (but not "its important role", where "its" is possessive).
  for (const m of text.matchAll(/\b(its)(?=[ \t]+(?:(?:important|clear|obvious|true|possible|impossible|necessary|likely|unlikely|hard|easy|difficult|essential|crucial|vital|unclear|evident|apparent|surprising|interesting|worth|okay|fine|sad|strange|unfair|fair|best|better|time)(?=[ \t]*(?:[.,;!?]|$)|[ \t]+(?:to|that|for|because|when|if|noting)\b)|going[ \t]+to\b))/gim)) {
    yield { rule: 'its-is', start: m.index, end: m.index + 3, fix: sub(m.index, m.index + 3, keepCase(m[1], `it${c.apos}s`)) };
  }
  // "we cant stop" → can't ("cant" alone is a word: insincere talk).
  for (const m of text.matchAll(/\b(?:I|you|we|they|he|she|it|who|that|people)[ \t]+(cant)(?=[ \t]+\p{Ll})/giu)) {
    const at = m.index + m[0].length - 4;
    yield { rule: 'cant', start: at, end: at + 4, fix: sub(at, at + 4, keepCase(m[1], `can${c.apos}t`)) };
  }
  for (const m of text.matchAll(/\b(wont)(?=[ \t]+(?:be|go|have|do|work|help|stop|happen|change|let|make|take|get|come|need|matter|last|leave|give|see|know|say|tell|allow|fit|hurt|stay|ever|even|always|never|really|just|affect|cause|solve|fix|accept|believe|forget|find|lose|win|pay|use|want|like)\b)/gi)) {
    yield { rule: 'wont', start: m.index, end: m.index + 4, fix: sub(m.index, m.index + 4, keepCase(m[1], `won${c.apos}t`)) };
  }
}

function* spacingRules(c) {
  for (const m of c.text.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
    const afterSentence = /[.!?]["”’)]*$/.test(c.text.slice(Math.max(0, m.index - 4), m.index));
    yield { rule: afterSentence ? 'sentence-spacing' : 'extra-space', start: m.index, end: m.index + m[0].length, fix: sub(m.index, m.index + m[0].length, ' ') };
  }
}

/* ------------------------------------------------------------ word choice */

function* wordRules(c) {
  const { text } = c;
  const each = function* (re, fn) { for (const m of text.matchAll(re)) { const f = fn(m); if (f) yield f; } };
  const replaceWord = (rule, m, word, rep, extra = {}) => {
    const at = m.index + m[0].lastIndexOf(word);
    return { rule, start: m.index, end: m.index + m[0].length, fix: sub(at, at + word.length, keepCase(word, rep)), ...extra };
  };

  yield* each(/\b(their)(?=[ \t]+(?:is|are|was|were|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|has[ \t]+been|have[ \t]+been|will[ \t]+be|seems?|appears?|exists?)\b)/gi,
    m => ({ rule: 'their-there', start: m.index, end: m.index + 5, title: '“their” should be “there”', fix: sub(m.index, m.index + 5, keepCase(m[1], 'there')) }));
  yield* each(/\b(their)(?=[ \t]+going[ \t]+to\b)/gi,
    m => ({ rule: 'their-there', severity: 'check', start: m.index, end: m.index + 5, title: '“their” or “they’re”?', fix: sub(m.index, m.index + 5, keepCase(m[1], `they${c.apos}re`)) }));
  yield* each(/\b(who['’]s)(?=[ \t]+(?:own|name|names|idea|ideas|work|job|life|lives|family|parents|mother|father|house|car|book|books|research|role|fault|turn|responsibility|opinion|opinions|goal|goals|story|stories|voice|words)\b)/gi,
    m => ({ rule: 'whose', start: m.index, end: m.index + 5, fix: sub(m.index, m.index + 5, keepCase(m[1], 'whose')) }));
  yield* each(/\b(?:is|are|was|were|am|be|been|being|get|gets|got|seem|seems|seemed|feel|feels|felt|look|looks|looked|become|became|far|way|much)[ \t]+(to)(?=[ \t]+(?:tired|hard|late|early|much|many|big|small|difficult|easy|young|old|expensive|hot|cold|high|complicated|scared|afraid|weak|loud|heavy|sick|full|lazy|bad|good|soon|often|little|few|great|strict|harsh|simple|large|dangerous|risky)(?:[ \t]*[.,;:!?)]|[ \t]+(?:to|for|and|but|that)\b|$))/gim,
    m => ({ rule: 'to-too', start: m.index + m[0].length - 2, end: m.index + m[0].length, fix: sub(m.index + m[0].length - 2, m.index + m[0].length, 'too') }));
  yield* each(/\b(there|they['’]re)(?=[ \t]+own\b)/gi,
    m => ({ rule: 'their-there', start: m.index, end: m.index + m[1].length, title: `“${m[1]}” should be “their”`, fix: sub(m.index, m.index + m[1].length, keepCase(m[1], 'their')) }));

  const youre = `you${c.apos}re`;
  yield* each(/\b(your)(?=[ \t]+welcome(?:[ \t]*[.!,]|[ \t]*$))/gim,
    m => ({ rule: 'your-youre', severity: 'error', start: m.index, end: m.index + 4, fix: sub(m.index, m.index + 4, keepCase(m[1], youre)) }));
  yield* each(/\b(your)(?=[ \t]+(?:a|an|the)\b(?![ \t]+(?:priori|posteriori)))/gi,
    m => ({ rule: 'your-youre', start: m.index, end: m.index + 4, fix: sub(m.index, m.index + 4, keepCase(m[1], youre)) }));
  yield* each(/\b(your)(?=[ \t]+(?:supposed|able|allowed|going|about|unable|required|expected)[ \t]+to\b)/gi,
    m => ({ rule: 'your-youre', start: m.index, end: m.index + 4, fix: sub(m.index, m.index + 4, keepCase(m[1], youre)) }));

  yield* each(/\b(?:more|less|better|worse|rather|fewer|greater|larger|smaller|higher|lower|bigger|longer|shorter|faster|slower|older|younger|easier|harder|stronger|weaker|cheaper|other|richer|poorer|happier|healthier|safer|wider|deeper|heavier|smarter)[ \t]+(then)\b/gi,
    m => replaceWord('then-than', m, m[1], 'than'));
  yield* each(/\b(?:and|since|until|till)[ \t]+(than)\b/gi, m => replaceWord('then-than', m, m[1], 'then'));

  yield* each(/\b(affects?)(?=[ \t]+on\b)/gi, m => ({ rule: 'affect-effect', start: m.index, end: m.index + m[1].length, fix: sub(m.index, m.index + 1, m[1][0] === 'A' ? 'E' : 'e') }));
  yield* each(/\ban[ \t]+(affect)\b/gi, m => replaceWord('affect-effect', m, m[1], 'effect'));
  // "Social media effects teenagers": the verb is "affects" ("effects" as a verb means "brings about").
  yield* each(/(?<!\b(?:the|these|those|its|their|his|her|our|my|your|of|side|adverse|negative|positive|harmful|special|sound|visual|personal|such|any|no|other|lasting|long-term|possible|potential|main|real|full|its)[ \t]+)\b(effects)(?=[ \t]+(?:the|a|an|my|your|his|her|their|our|everyone|everybody|people|us|them|me|him|many|most|all|every|some|students|children|teens|teenagers|society|millions|thousands)\b)/gi,
    m => replaceWord('affect-effect', m, m[1], 'affects'));
  yield* each(/\b(?:was|were|is|are|be|been|being|get|got)[ \t]+(effected)[ \t]+by\b/gi, m => replaceWord('affect-effect', m, m[1], 'affected', { why: '“Affected by” means “influenced by.” “Effected” means “brought about” (the change was effected by a new law), which is rarely what is meant.' }));

  yield* each(/\b(?:to|will|would|could|can|might|may|did|didn['’]t|don['’]t|doesn['’]t|not|never|cannot|can['’]t|won['’]t|wouldn['’]t|couldn['’]t|must|should)[ \t]+(loose|loosing)(?=[ \t]+(?:the|a|an|my|your|his|her|their|our|its|weight|money|time|control|interest|hope|sight|track|touch|focus|faith|everything|it|them|him|me|us|anything|something|points|jobs?|lives|games?)\b)/gi,
    m => replaceWord('lose-loose', m, m[1], m[1].toLowerCase() === 'loose' ? 'lose' : 'losing'));
  yield* each(/\b(?:am|is|are|was|were|been|keep|kept|started|stop|stopped)[ \t]+(loosing)\b/gi, m => replaceWord('lose-loose', m, m[1], 'losing'));

  yield* each(/\b(everyday)(?=[ \t]*(?:[.,;:!?)]|$)|[ \t]+(?:of|for|at|in|on|to|because|until|since|while|when|after|before|without|with|now|this|last|next)\b)/gim,
    m => ({ rule: 'everyday', start: m.index, end: m.index + 8, fix: sub(m.index, m.index + 8, keepCase(m[1], 'every day')) }));

  const NONSTANDARD = {
    irregardless: ['regardless', 'Merriam-Webster labels “irregardless” nonstandard. Use “regardless.”'],
    nowheres: ['nowhere', 'Merriam-Webster labels “nowheres” chiefly dialectal. Use “nowhere.”'],
    anywheres: ['anywhere', 'Merriam-Webster labels “anywheres” chiefly dialectal. Use “anywhere.”'],
    somewheres: ['somewhere', 'Merriam-Webster labels “somewheres” chiefly dialectal. Use “somewhere.”'],
    theirselves: ['themselves', 'Merriam-Webster labels “theirselves” chiefly dialectal. Use “themselves.”'],
    hisself: ['himself', 'Merriam-Webster labels “hisself” chiefly dialectal. Use “himself.”'],
  };
  yield* each(/\b(irregardless|nowheres|anywheres|somewheres|theirselves|hisself)\b/gi, m => {
    const [rep, why] = NONSTANDARD[m[1].toLowerCase()];
    return { rule: 'nonstandard', start: m.index, end: m.index + m[1].length, why, fix: sub(m.index, m.index + m[1].length, keepCase(m[1], rep)) };
  });
  yield* each(/\bfor[ \t]+all[ \t]+(intensive[ \t]+purposes)\b/gi, m => {
    const at = m.index + m[0].length - m[1].length;
    return { rule: 'nonstandard', start: m.index, end: m.index + m[0].length, title: '“for all intensive purposes”', why: 'The phrase is “for all intents and purposes” (meaning “in effect”); Merriam-Webster calls “intensive purposes” a mishearing of it.', fix: sub(at, m.index + m[0].length, 'intents and purposes') };
  });

  yield* each(/(?:\b(?:is|are|was|were|am|be|been|being|not|isn['’]t|aren['’]t|wasn['’]t|weren['’]t)|['’](?:re|m|s))[ \t]+(suppose)(?=[ \t]+to\b)/gi, m => replaceWord('supposed-to', m, m[1], 'supposed'));

  yield* each(new RegExp(`\\b(less)(?=[ \\t]+(?:${COUNT_NOUNS})\\b)`, 'gi'), m => ({ rule: 'fewer', start: m.index, end: m.index + 4, fix: sub(m.index, m.index + 4, keepCase(m[1], 'fewer')) }));
  yield* each(new RegExp(`\\b(amount)(?=[ \\t]+of[ \\t]+(?:${COUNT_NOUNS})\\b)`, 'gi'), m => ({ rule: 'number-of', start: m.index, end: m.index + 6, fix: sub(m.index, m.index + 6, keepCase(m[1], 'number')) }));
  yield* each(/\b(criteria|phenomena)(?=[ \t]+(?:is|was|has)\b)/gi, m => ({ rule: 'plural-latin', start: m.index, end: m.index + m[1].length }));
  yield* each(/\b(?:a|one|this|that|each|every)[ \t]+(criteria|phenomena)\b/gi, m => replaceWord('plural-latin', m, m[1], m[1].toLowerCase() === 'criteria' ? 'criterion' : 'phenomenon'));
  yield* each(/\breason(?:[ \t]+why)?[ \t]+(?:is|was)[ \t]+(because)\b/gi, m => replaceWord('reason-because', m, m[1], 'that'));
  yield* each(/\b(?:in|with)[ \t]+(regards)(?=[ \t]+to\b)/gi, m => replaceWord('in-regard', m, m[1], 'regard'));
  yield* each(/\b(?:is|are|was|were|be|been|being)[ \t]+(comprised)(?=[ \t]+of\b)/gi, m => replaceWord('comprised', m, m[1], 'composed'));
  yield* each(/(?:^|(?<=[.!?]["”’)]*[ \t]+|,[ \t]+))(being[ \t]+that)(?=[ \t]+\p{L})/gimu, m => ({
    rule: 'being-that', start: m.index, end: m.index + m[1].length, fix: sub(m.index, m.index + m[1].length, keepCase(m[1], 'because')),
  }));
}

/* ---------------------------------------------------------------- clarity */

const wordyMap = new Map(WORDY.map(([p, rep, kind]) => [p, { rep, kind }]));
const WORDY_RE = new RegExp(`\\b(${[...wordyMap.keys()].sort((a, b) => b.length - a.length).map(phraseRe).join('|')})\\b`, 'gi');
const CLICHE_RE = new RegExp(`(?<![\\p{L}'’-])(${CLICHES.map(phraseRe).join('|')})(?![\\p{L}'’-])`, 'giu');
const PARTICIPLES_IRREGULAR = 'written|given|taken|seen|known|shown|done|made|found|held|built|sent|told|paid|led|kept|brought|bought|caught|taught|thought|sold|spent|won|chosen|driven|eaten|broken|spoken|stolen|forgotten|hidden|begun|drawn|grown|thrown|worn|torn|sung|hit|put|set|cut|read|beaten|bitten|frozen|shaken|fed|felt|heard|lost|met|struck|understood|overseen|undertaken|withdrawn|forbidden|forgiven|ridden|sworn|stuck|swept';
const NOT_AGENT = 'noon|midnight|then|now|far|hand|chance|accident|mistake|default|nature|night|day|law|definition|design|contrast|comparison|way|tomorrow|tonight|next|this[ \\t]+time|that[ \\t]+time|the[ \\t]+time|the[ \\t]+end|January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\\d';

function* clarityRules(c) {
  const { text } = c;
  const each = function* (re, fn) { for (const m of text.matchAll(re)) { const f = fn(m); if (f) yield f; } };

  // Wordy phrases and redundancies.
  yield* each(WORDY_RE, m => {
    const phrase = m[1];
    const { rep, kind } = wordyMap.get(phrase.toLowerCase().replace(/\s+/g, ' ').replace(/’/g, "'"));
    const start = m.index, end = m.index + phrase.length;
    if (kind === 'r') {
      return { rule: 'redundant', start, end, why: `“${phrase}” says the same thing twice; “${rep}” is enough.`, fix: sub(start, end, keepCase(phrase, rep)) };
    }
    if (rep === null) {
      const hint = /necessary|crucial|important|need|avoided/i.test(phrase) ? 'Reword the sentence with “must” or “should.”'
        : /possib|chance|happen/i.test(phrase) ? 'Reword the sentence with “may,” “might,” or “could.”'
        : /purpose/i.test(phrase) ? 'Use “to” and a verb instead (to study, not for the purpose of studying).'
        : 'Use “while,” or delete it (was in the process of writing → was writing).';
      return { rule: 'wordy', start, end, why: `“${phrase}” is a wordy phrase. ${hint}` };
    }
    if (rep === '') {
      // Delete the phrase; capitalize what follows if it began the sentence.
      const after = text.slice(end).match(/^[ \t]*/)[0].length;
      const fix = [{ start, end: end + after, text: '' }];
      if (/^\p{Lu}/u.test(phrase) && /\p{Ll}/u.test(text[end + after] || '')) fix.push({ start: end + after, end: end + after + 1, text: text[end + after].toUpperCase() });
      return { rule: 'wordy', start, end, why: `“${phrase}” adds words without adding meaning. You can usually start with what follows.`, fix };
    }
    return { rule: 'wordy', start, end, why: `“${phrase}” can usually be shortened to “${rep}.”`, fix: sub(start, end, keepCase(phrase, rep)) };
  });
  // Not where it opens a clause ("Whether or not it rains, we go"): there "or not" is needed.
  yield* each(/(?<![.!?,;:(—–\n][ \t]*|^[ \t]*)\b(whether)[ \t]+or[ \t]+not\b/gi, m => ({
    rule: 'wordy', start: m.index, end: m.index + m[0].length,
    why: '“Or not” is needed only when you mean “regardless of whether” (Whether or not it rains, we will go). Otherwise “whether” alone is enough (decide whether to go), as the Brandeis and Purdue writing guides note.',
    fix: sub(m.index, m.index + m[0].length, m[1]),
  }));

  // Passive voice with the doer named after "by".
  yield* each(new RegExp(`\\b(am|is|are|was|were|be|been|being)((?:[ \\t]+(?:not|also|often|usually|always|never|then|now|still|already|widely|generally|commonly|first|later|recently|largely|mostly|partly|fully|being))*)[ \\t]+([a-z]+ed|${PARTICIPLES_IRREGULAR})[ \\t]+by\\b(?![ \\t]+(?:${NOT_AGENT})\\b)`, 'gi'), m => {
    if (/^(need|feed|bleed|breed|speed|seed|shed|bed|red|wed|sled)$/i.test(m[3])) return null;
    return { rule: 'passive', start: m.index, end: m.index + m[0].length };
  });

  // Long sentences: mark the first word, give the count.
  for (const s of c.sentences) {
    const words = text.slice(s.start, s.end).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
    if (words.length > 40) {
      const first = text.slice(s.start).match(/[\p{L}\p{N}]+/u);
      const at = s.start + first.index;
      yield { rule: 'long-sentence', start: at, end: at + first[0].length,
        why: `This sentence is ${words.length} words long. Long sentences are harder to follow; consider splitting it into two or three.` };
    }
  }

  yield* each(CLICHE_RE, m => ({ rule: 'cliche', start: m.index, end: m.index + m[1].length,
    why: `“${m[1]}” is a cliché (an overused expression). College writing guides advise replacing clichés with your own, more specific words.` }));

}

/* ------------------------------------------------------------ formal tone */

// Labels from Merriam-Webster and the Britannica Dictionary (formerly Merriam-Webster's Learner's Dictionary).
const INFORMAL_NOTE = {
  kid: 'meaning a child', kids: 'meaning children', guys: 'for people', stuff: 'meaning things; name the specific things',
  awesome: 'meaning “extremely good”', 'a bunch of': 'somewhat informal', 'off of': 'chiefly US', anyways: 'US',
  "y'all": 'chiefly Southern US',
};
const informalRe = new RegExp(`(?<![\\p{L}'’-])(${INFORMAL.map(([w]) => phraseRe(w)).join('|')})(?![\\p{L}'’-])`, 'giu');
const informalMap = new Map(INFORMAL.map(([w, s, auto]) => [w.replace(/’/g, "'"), { s, auto }]));

function* formalRules(c) {
  const { text } = c;
  const each = function* (re, fn) { for (const m of text.matchAll(re)) { const f = fn(m); if (f) yield f; } };
  const withOptions = (f, word, choices, auto) => {
    const fixes = choices.map(t => ({ text: keepCase(word, t), fix: sub(f.start, f.end, keepCase(word, t)) }));
    if (auto && fixes.length === 1) f.fix = fixes[0].fix; else if (fixes.length) f.options = fixes;
    return f;
  };

  // Contractions (not possessives such as "John's").
  yield* each(/(?<![\p{L}'’])([\p{L}]+['’](?:t|re|ve|ll|d|m|s))(?![\p{L}'’])/gu, m => {
    const word = m[1], key = word.toLowerCase().replace('’', "'");
    const full = CONTRACTION_FULL[key];
    if (!full) return null;
    const next = text.slice(m.index + word.length).match(/^[ \t]+([\p{L}]+)/u)?.[1]?.toLowerCase() || '';
    let choices = full;
    if (full.length === 2 && /^(been|got|gotten|had|done|gone|seen|taken|made|given|[a-z]+ed)$/.test(next)) choices = [full[1], full[0]];
    const f = { rule: 'formal-contraction', start: m.index, end: m.index + word.length, title: `Contraction “${word}”` };
    return withOptions(f, word, choices, choices.length === 1);
  });

  yield* each(informalRe, m => {
    const word = m[1];
    if (/^\p{Lu}/u.test(word) && !c.isSentenceStart(m.index)) return null; // names: "More Stuff", "Kid N' Play"
    const { s, auto } = informalMap.get(word.toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' '));
    const lw = word.toLowerCase();
    const why = lw === 'alright' ? 'Merriam-Webster accepts “alright,” but “all right” is far more common in edited writing, and some readers object to “alright.” Use “all right” in a formal paper.'
      : `Dictionaries label “${word}” informal${INFORMAL_NOTE[lw] ? ` (${INFORMAL_NOTE[lw]})` : ''}. Use a more formal word in an academic paper.`;
    return withOptions({ rule: 'informal', start: m.index, end: m.index + word.length, title: `Informal: “${word}”`, why }, word, s, auto);
  });
  yield* each(/\b(super)[ \t]+(?=(?:important|easy|hard|difficult|helpful|interesting|fun|cool|nice|fast|quick|big|small|good|bad|common|popular|expensive|cheap|clear|simple|excited|happy|useful)\b)/g, m => (
    withOptions({ rule: 'informal', start: m.index, end: m.index + 5, title: 'Informal: “super”', why: 'Dictionaries label “super” meaning “very” informal (Britannica: US, informal).' }, m[1], ['very', 'extremely'], false)));

  yield* each(new RegExp(`(?<![\\p{L}'’@#./-])(${TEXTSPEAK.join('|')})(?![\\p{L}'’/-])`, 'gu'), m => ({ rule: 'textspeak', start: m.index, end: m.index + m[1].length, title: `Texting abbreviation “${m[1]}”` }));

  yield* each(/(?<!\bthank[ \t]+)\b(you|your|yours|yourself|yourselves)\b/gi, m => ({ rule: 'second-person', start: m.index, end: m.index + m[1].length }));

  const gendered = Object.keys(GENDERED).map(esc).join('|');
  yield* each(new RegExp(`(?<![\\p{L}-])(${gendered}|${Object.keys(GENDERED).map(k => esc(capitalize(k))).join('|')})(?![\\p{L}-])`, 'gu'), m => {
    const word = m[1];
    if (/^\p{Lu}/u.test(word) && !c.isSentenceStart(m.index)) return null; // "Chairman Mao", "George Foreman"
    return withOptions({ rule: 'gendered', start: m.index, end: m.index + word.length, title: `Gendered term “${word}”` }, word, GENDERED[word.toLowerCase()], false);
  });
}

/* --------------------------------------------------------------- spelling */

// Prefixes written with a hyphen that aren't words on their own.
const PREFIXES = new Set('co re pre non anti post self ex multi semi sub inter intra pro mid over under cross counter extra hyper micro macro mini neo pseudo quasi socio ultra un bi tri de dis mis out up all trans meta proto'.split(' '));

// Edit distance (insertions, deletions, substitutions, adjacent swaps).
function distance(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
function edits1(w) {
  const out = new Set();
  for (let i = 0; i <= w.length; i++) {
    const a = w.slice(0, i), b = w.slice(i);
    if (b) out.add(a + b.slice(1));
    if (b.length > 1) out.add(a + b[1] + b[0] + b.slice(2));
    for (const ch of LETTERS) { if (b) out.add(a + ch + b.slice(1)); out.add(a + ch + b); }
  }
  return out;
}

// Suggestions: the dictionary's own, plus common words one or two edits away, ranked
// by edit distance, then by how common the word is (SCOWL size 10, then 20), then the
// dictionary's order. common: Map of word → 0 (size 10) or 1 (size 20).
function rankSuggestions(word, list, common) {
  const lower = word.toLowerCase();
  const pool = new Map(list.map((s, i) => [s.toLowerCase(), { s, i }]));
  if (common.size && lower.length <= 14) {
    const near = [...edits1(lower)].filter(w => common.has(w));
    if (!near.length) for (const e of edits1(lower)) for (const w of edits1(e)) if (common.has(w)) near.push(w);
    for (const w of near) if (!pool.has(w)) pool.set(w, { s: w, i: 100 });
  }
  return [...pool.values()]
    .map(({ s, i }) => ({ s, i, d: distance(word, s), t: common.get(s.toLowerCase()) ?? 2, f: s[0].toLowerCase() === lower[0] ? 0 : 1 }))
    .sort((x, y) => x.d - y.d || x.t - y.t || x.f - y.f || x.i - y.i)
    .map(x => x.s);
}

const UNCOUNTABLE = /^(information|advice|equipment|furniture|evidence|knowledge|homework|luggage|baggage|feedback|software|hardware|research|news|traffic|machinery|jewelry|clothing|garbage|scenery|vocabulary|staff|mail|music|money|progress|weather|work|fun|health|wealth)s$/i;

// sp: nspell (SCOWL size 60, with affixes); extra: plain words of SCOWL size 70.
function known(w, sp, extra) {
  const lower = w.toLowerCase();
  return ACCEPTED.has(lower) || sp.correct(w) || extra.has(w) || extra.has(lower) || (/^\p{Lu}\p{Ll}*$/u.test(w) && sp.correct(lower));
}

function isCorrect(w, sp, extra) {
  if (known(w, sp, extra)) return true;
  if (/'s$/i.test(w) && known(w.slice(0, -2), sp, extra)) return true;
  // Plurals the dictionary lacks ("landers"), but not of nouns that have no plural ("informations").
  if (/[^s]s$/i.test(w) && !UNCOUNTABLE.test(w) && known(w.slice(0, -1), sp, extra)) return true;
  return false;
}

// Closed compounds of two common words of four letters or more: gameplay, drugmakers.
// (Shorter parts would accept misspellings such as "col" + "our".)
function isCompound(lower, sp) {
  for (let i = 4; i <= lower.length - 4; i++) {
    if (sp.correct(lower.slice(0, i)) && sp.correct(lower.slice(i))) return true;
  }
  return false;
}

function britishToUS(w, sp) {
  if (BRITISH[w]) return BRITISH[w];
  const tries = [
    [/our(s|ed|ing|ful|able|ably|ite|ites|ist|ists|less|al|ally|ism|isms)?$/, 'or$1'], // colour, favourite, behavioural
    [/is(e|es|ed|ing|ation|ations|er|ers|able)$/, 'iz$1'], // realise, organisation
    [/ys(e|es|ed|ing)$/, 'yz$1'], // analyse
    [/([^aeiou])re(s)?$/, '$1er$2'], // centre, theatre, fibre
    [/([aeiou])ll(ed|ing|er|ers)$/, '$1l$2'], // travelled, modelling
    [/ence(s)?$/, 'ense$1'], // defence, licence
    [/ae/, 'e'], [/oe/, 'e'], // anaemia, oestrogen
  ];
  for (const [re, rep] of tries) {
    if (!re.test(w)) continue;
    const us = w.replace(re, rep);
    if (us !== w && sp.correct(us)) return us;
  }
  return null;
}

const spellCache = new Map();
let cachedSpeller = null, cachedCommon = null;

function spellWord(w, speller, extra, common) {
  if (speller !== cachedSpeller || common !== cachedCommon) { spellCache.clear(); cachedSpeller = speller; cachedCommon = common; }
  if (spellCache.has(w)) return spellCache.get(w);
  const lower = w.toLowerCase();
  let res = null;
  if (MISSPELLINGS[lower]) res = { kind: 'misspelling', fix: MISSPELLINGS[lower] };
  else if (IRREGULAR[lower]) res = { kind: 'misspelling', fix: IRREGULAR[lower][0], why: `“${IRREGULAR[lower][1]}” is an irregular verb: its past tense is “${IRREGULAR[lower][0]}.”` };
  else if (speller && !isCorrect(w, speller, extra)) {
    const us = britishToUS(lower, speller);
    // Suggest possessives ("information's") only for a word with an apostrophe.
    if (us) res = { kind: 'british', fix: us };
    else if (!isCompound(lower, speller)) {
      const suggestions = rankSuggestions(w, speller.suggest(w).filter(x => w.includes("'") || !x.includes("'")), common).slice(0, 4);
      res = { kind: 'unknown', suggestions };
    }
  }
  spellCache.set(w, res);
  return res;
}

function* spellingRules(c, speller, dictionary, extra, common) {
  const { text } = c;
  const tokens = [...text.matchAll(/\p{L}(?:[\p{L}\p{M}'’]*[\p{L}\p{M}])?/gu)];
  // Capitalized words used in mid-sentence are names: don't flag them at a sentence start either.
  const names = new Set();
  for (const m of tokens) if (/^\p{Lu}\p{Ll}/u.test(m[0]) && !c.isSentenceStart(m.index)) names.add(m[0]);

  for (const m of tokens) {
    const raw = m[0], start = m.index, end = start + raw.length;
    const word = raw.replace(/’/g, "'").replace(/^'+|'+$/g, '');
    if (word.length < 2) continue;
    if (/[^\p{ASCII}']/u.test(word)) continue; // café, naïve, Gutiérrez: accented and foreign words
    const before = text[start - 1] || '', after = text[end] || '';
    if (/[\p{N}_@#\/\\]/u.test(before) || /[\p{N}_@\/\\]/u.test(after)) continue;
    if ((before === '.' && /\p{L}/u.test(text[start - 2] || '')) || (after === '.' && /\p{L}/u.test(text[end + 1] || ''))) continue; // file.txt, U.S.A.
    if (after === '-' && PREFIXES.has(word.toLowerCase())) continue;
    if (dictionary.has(word.toLowerCase())) continue;

    const lower = word.toLowerCase();
    if (word === word.toUpperCase()) continue; // acronyms
    if (/\p{Lu}/u.test(word.slice(1))) continue; // iPhone, McDonald, YouTube
    // A capitalized word in mid-sentence is a name ("Sayed" is not "said"), unless it is
    // a misspelled month or day ("Febuary").
    if (/^\p{Lu}/u.test(word) && (!c.isSentenceStart(start) || names.has(word)) && !/^\p{Lu}/u.test(MISSPELLINGS[lower] || '')) continue;

    const r = spellWord(word, speller, extra, common);
    if (!r) continue;
    if (r.kind === 'misspelling') {
      const rep = /^\p{Lu}/u.test(r.fix) ? r.fix : keepCase(word, r.fix);
      yield { rule: 'misspelling', start, end, title: `“${raw}” should be “${rep}”`, fix: sub(start, end, rep), ...(r.why && { why: r.why }) };
    } else if (r.kind === 'british') {
      const rep = keepCase(word, r.fix);
      yield { rule: 'british', start, end, title: `British spelling “${raw}”`, why: `“${raw}” is the British spelling. American English spells it “${rep}.”`, fix: sub(start, end, rep) };
    } else {
      const f = { rule: 'spelling', start, end, title: `Possible misspelling: “${raw}”`, word: lower };
      if (/^\p{Lu}/u.test(word)) f.why = 'This word isn’t in the dictionary. If it’s a name, choose “Add to dictionary.”';
      if (r.suggestions.length) f.options = r.suggestions.map(s => ({ text: keepCase(word, s), fix: sub(start, end, keepCase(word, s)) }));
      yield f;
    }
  }
}

/* -------------------------------------------------------------------- run */

// speller: an nspell instance (or null while the dictionary loads).
// extra: more correct words (SCOWL size 70), lowercase.
// common: Map of the most common words → 0 or 1 (SCOWL size 10 or 20), to rank suggestions.
// dictionary: lowercase words the writer added.
// A Works Cited or References list at the end is not checked.
export function proofread(fullText, { speller = null, extra = new Set(), common = new Map(), dictionary = new Set() } = {}) {
  const cut = citationsStart(fullText);
  const text = cut >= 0 ? fullText.slice(0, cut) : fullText;
  const c = context(text);
  const raw = [
    ...grammarRules(c), ...apostropheRules(c), ...spacingRules(c), ...wordRules(c), ...clarityRules(c), ...formalRules(c), ...spellingRules(c, speller, dictionary, extra, common),
  ];
  const out = [];
  for (const f of raw) {
    const rule = PROOF_RULES[f.rule];
    if (c.inProtected(f.start, f.end)) continue;
    const g = { category: rule.category, severity: rule.severity, title: rule.title, why: rule.why, fix: null, ...f };
    if (rule.quotes !== 'keep' && c.inQuote(f.start, f.end)) {
      if (rule.quotes !== 'soften') continue;
      g.severity = 'check';
      g.why += IN_QUOTE;
      if (g.fix) { g.options = [{ text: 'Apply', fix: g.fix }]; g.fix = null; }
    }
    out.push(g);
  }
  for (const f of checkPunctuation(text)) out.push({ ...f, category: 'punctuation' });

  // A misspelling inside a span another rule already explains ("irregardless", "dont") isn't repeated.
  const kept = out.filter(f => f.category !== 'spelling' || !out.some(o => o !== f && o.category !== 'spelling' && o.start < f.end && o.end > f.start));
  const seen = new Set();
  return kept
    .filter(f => { const k = `${f.rule}:${f.start}:${f.end}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.start - b.start || (a.severity === 'error' ? -1 : 1));
}

/* ------------------------------------------------------------------ stats */

function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, m => m[0]).replace(/^y/, '');
  return Math.max(1, (w.match(/[aeiouy]+/g) || []).length);
}

export function textStats(text) {
  const words = text.match(/[\p{L}\p{N}]+(?:['’.,-][\p{L}\p{N}]+)*/gu) || [];
  const sentences = splitSentences(text).filter(s => /\p{L}/u.test(text.slice(s.start, s.end)));
  const wc = words.length, sc = sentences.length;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const lengths = sentences.map(s => (text.slice(s.start, s.end).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length);
  return {
    words: wc,
    characters: text.length,
    sentences: sc,
    paragraphs: text.split('\n').filter(l => /[\p{L}\p{N}]/u.test(l)).length,
    avgSentence: sc ? wc / sc : 0,
    longest: lengths.length ? Math.max(...lengths) : 0,
    // Average adult rates for nonfiction: 238 words a minute silently, 183 aloud (Brysbaert 2019).
    readingMinutes: wc / 238,
    speakingMinutes: wc / 183,
    // Flesch–Kincaid grade level; only meaningful for longer passages.
    grade: wc >= 100 && sc ? 0.39 * (wc / sc) + 11.8 * (syl / wc) - 15.59 : null,
  };
}
