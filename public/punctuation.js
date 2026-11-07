// Punctuation checker for academic writing in American English.
//
// Runs entirely in the browser: the text is never sent anywhere.
// Only rules that the major style guides agree on are checked (MLA, APA, the
// Chicago Manual of Style, and the Purdue OWL). Each finding is one of:
//   error — the text breaks the rule;
//   check — probably wrong, but it depends on meaning, so the writer decides.
// A finding may carry a fix: a list of {start, end, text} edits.

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const STATES = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming';
const CONJUNCTIVE = 'however|therefore|moreover|furthermore|consequently|nevertheless|nonetheless';
// "However much you try" uses "however" as an adverb, not a connector.
const DEGREE_WORDS = /^(much|many|little|few|long|far|hard|often|large|small|high|low|great|strong|good|bad|well|soon|slight|minor|briefly|slowly|quickly|carefully|closely|clearly)$/i;

export const RULES = {
  'space-before': { severity: 'error', title: 'Space before punctuation', why: 'Commas, periods, semicolons, colons, question marks, and exclamation points follow the word directly, with no space before them.' },
  'space-after': { severity: 'error', title: 'Missing space after punctuation', why: 'Put a space after a comma, semicolon, or colon, and between sentences.' },
  'doubled': { severity: 'error', title: 'Doubled punctuation', why: 'Two marks in a row like this (",," or ",.") are a typing slip; keep one.' },
  'repeated-end': { severity: 'check', title: 'Repeated ! or ?', why: 'Academic writing uses a single exclamation point or question mark.' },
  'quote-period-comma': { severity: 'error', title: 'Period or comma outside the quotation marks', why: 'In American English, periods and commas go inside closing quotation marks. (When a parenthetical citation follows the quotation, the period comes after the citation instead.)' },
  'quote-after-question': { severity: 'error', title: 'Extra period or comma after a question or exclamation', why: 'When a quotation ends with a question mark or exclamation point, that mark replaces the period or comma: He asked, “Why?” and left.' },
  'quote-colon-semicolon': { severity: 'error', title: 'Colon or semicolon inside the quotation marks', why: 'Colons and semicolons go outside closing quotation marks.' },
  'nested-quotes': { severity: 'error', title: 'Quotation inside a quotation', why: 'Use single quotation marks for a quotation inside a quotation.' },
  'unbalanced-quotes': { severity: 'check', title: 'Unmatched quotation mark', why: 'Each opening quotation mark needs a closing one. (Exception: when one quotation runs over several paragraphs, only the last paragraph gets the closing mark.)' },
  'unbalanced-brackets': { severity: 'check', title: 'Unmatched parenthesis or bracket', why: 'Each opening parenthesis or bracket needs a closing one.' },
  'pronoun-apostrophe': { severity: 'error', title: 'Apostrophe in a possessive pronoun', why: 'Possessive pronouns never take an apostrophe: its, yours, hers, ours, theirs, whose.' },
  'its': { severity: 'error', title: '“its” where “it’s” is meant', why: '“It’s” means “it is” or “it has”; “its” shows possession.' },
  'contraction': { severity: 'error', title: 'Missing apostrophe in a contraction', why: 'A contraction needs an apostrophe where letters are left out (don’t, isn’t, they’re).' },
  'decade': { severity: 'check', title: 'Apostrophe in a decade', why: 'Plural decades take no apostrophe: the 1990s. (Use an apostrophe only for possession, or for a shortened decade such as the ’90s.)' },
  'abbreviation': { severity: 'error', title: 'Missing period in an abbreviation', why: 'Write “etc.”, “e.g.”, and “i.e.” with their periods.' },
  'date-day-year': { severity: 'error', title: 'Missing comma in a date', why: 'In a month-day-year date, put a comma between the day and the year: July 4, 1776.' },
  'date-after-year': { severity: 'error', title: 'Missing comma after the year', why: 'When a month-day-year date is followed by more of the sentence, put a comma after the year too: On July 4, 1776, the colonies declared independence.' },
  'date-month-year': { severity: 'check', title: 'Comma between month and year', why: 'A date with only the month and year takes no comma: June 2020.' },
  'city-state': { severity: 'error', title: 'Missing comma after a state name', why: 'A state after a city is set off by commas on both sides when the sentence continues: Dallas, Texas, is…' },
  'colon-such-as': { severity: 'error', title: 'Colon after “such as” or “including”', why: 'Don’t put a colon after “such as,” “including,” or “especially”; the list follows directly.' },
  'colon-verb': { severity: 'check', title: 'Colon after a verb or preposition', why: 'A colon should follow a complete sentence. Don’t put one between a verb and what follows it (“The reasons are: …”) or after a preposition (“consists of: …”).' },
  'semicolon-list': { severity: 'error', title: 'Semicolon introducing a list', why: 'Use a colon, not a semicolon, after “the following” or “as follows.”' },
  'semicolon-clause': { severity: 'check', title: 'Semicolon before a dependent clause', why: 'A semicolon joins two complete sentences. A clause starting with “which,” “who,” or “because” can’t stand alone, so it usually takes a comma or no punctuation.' },
  'conjunctive-splice': { severity: 'check', title: 'Comma before “however” (and similar words)', why: 'If “however,” “therefore,” “moreover,” or a similar word starts a new complete sentence here, put a semicolon before it and a comma after it (It rained; however, we went). A comma alone makes a comma splice. If the word interrupts one sentence, put commas on both sides of it (It is, however, safe).' },
  'conjunctive-comma': { severity: 'check', title: 'Comma after “however” (and similar words)', why: 'After a semicolon, words like “however” and “therefore” are followed by a comma.' },
  'intro-comma': { severity: 'check', title: 'Comma after an introductory word', why: 'Transitional words and phrases at the start of a sentence (However, For example, In addition…) are followed by a comma.' },
  'serial-comma': { severity: 'check', title: 'Serial (Oxford) comma', why: 'MLA, APA, and Chicago all use a comma before the “and” or “or” that ends a list of three or more items.' },
  'signal-comma': { severity: 'check', title: 'Comma before a quotation', why: 'Put a comma after a verb such as “said” or “asked” that introduces a full-sentence quotation.' },
  'that-comma': { severity: 'check', title: 'Comma after “that” before a quotation', why: 'When a quotation follows “that,” it becomes part of your sentence, so no comma goes before it.' },
  'dash': { severity: 'check', title: 'Dash typed as a spaced hyphen', why: 'A dash is an em dash (—), or two hyphens (--), with no spaces around it. A hyphen with spaces around it is not a dash.' },
  'dash-spaces': { severity: 'check', title: 'Spaces around a dash', why: 'MLA, APA, and Chicago put no spaces before or after a dash.' },
  'end-punctuation': { severity: 'check', title: 'Paragraph doesn’t end with punctuation', why: 'End every sentence with a period, question mark, or exclamation point.' },
};

/* ------------------------------------------------------------------ helpers */

// URLs, email addresses, and domain names follow their own rules: ignore them.
function protectedRanges(text) {
  const ranges = [];
  const re = /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"”]+|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|edu|gov|io|co|us|uk|info|ca|au|de|fr|jp|ai)\b(?:\/[^\s<>"”]*)?|\bdoi:\S+/gi;
  for (const m of text.matchAll(re)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function caseLike(source, replacement) {
  if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const CONTRACTIONS = {
  dont: "don't", doesnt: "doesn't", didnt: "didn't", isnt: "isn't", arent: "aren't", wasnt: "wasn't",
  werent: "weren't", hasnt: "hasn't", havent: "haven't", hadnt: "hadn't", wouldnt: "wouldn't",
  couldnt: "couldn't", shouldnt: "shouldn't", mustnt: "mustn't", neednt: "needn't", youre: "you're",
  theyre: "they're", thats: "that's", whats: "what's", theres: "there's", whos: "who's", im: "I'm",
  ive: "I've", youve: "you've", theyve: "they've", weve: "we've", youll: "you'll", theyll: "they'll",
  itll: "it'll", wouldve: "would've", couldve: "could've", shouldve: "should've", aint: "ain't",
};

/* ------------------------------------------------------------------- rules */

function* simpleRules(text) {
  const all = (re, fn) => [...text.matchAll(re)].map(fn).filter(Boolean);

  // Space before , ; : ! ? .
  yield* all(/(?<=\S)[ \t]+([,;:!?])(?![-()])/g, m => ({ // not a smiley like ":)"
    rule: 'space-before', start: m.index, end: m.index + m[0].length,
    fix: [{ start: m.index, end: m.index + m[0].length - 1, text: '' }],
  }));
  yield* all(/(?<=[\p{L}\p{N}”"’)\]])[ \t]+\.(?=\s|$|["”’)\]])/gu, m => {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (/^ \./.test(after)) return null; // a spaced ellipsis ". . ."
    return { rule: 'space-before', start: m.index, end: m.index + m[0].length, fix: [{ start: m.index, end: m.index + m[0].length - 1, text: '' }] };
  });

  // Missing space after , ; : ? ! or between sentences.
  yield* all(/[,;](?=\p{L})/gu, m => ({ rule: 'space-after', start: m.index, end: m.index + 2, fix: [{ start: m.index + 1, end: m.index + 1, text: ' ' }] }));
  yield* all(/(?<=\p{L}):(?=\p{L})/gu, m => {
    const before = text.slice(Math.max(0, m.index - 8), m.index);
    if (/(https?|ftp|mailto|file|urn|doi|isbn|issn|tel)$/i.test(before)) return null;
    return { rule: 'space-after', start: m.index, end: m.index + 2, fix: [{ start: m.index + 1, end: m.index + 1, text: ' ' }] };
  });
  yield* all(/(?<=[\p{Ll}\p{N}”"’)])[!?](?=\p{Lu}\p{Ll})/gu, m => ({ rule: 'space-after', start: m.index, end: m.index + 2, fix: [{ start: m.index + 1, end: m.index + 1, text: ' ' }] }));
  yield* all(/(?<=\p{Ll}{2})\.(?=\p{Lu}\p{Ll})/gu, m => {
    // Not code such as models.QuerySet or obj.Method(): camelCase or brackets nearby.
    const next = text.slice(m.index + 1).match(/^[\p{L}\p{N}_]+/u)?.[0] || '';
    const prev = text.slice(0, m.index).match(/[^\s]*$/)[0];
    if (/\p{Ll}\p{Lu}/u.test(next) || /[_(\[{<>=]/.test(prev) || /^[(_]/.test(text.slice(m.index + 1 + next.length))) return null;
    return { rule: 'space-after', start: m.index, end: m.index + 2, fix: [{ start: m.index + 1, end: m.index + 1, text: ' ' }] };
  });

  // Doubled marks. Four periods are fine (an ellipsis that ends a sentence),
  // and so are "etc.," and "e.g.," (an abbreviation's period then a comma).
  yield* all(/,,+|;;+|::+|[,;:][,;:.]|(?<!\.)\.\.(?!\.)/g, m => {
    const keep = m[0].endsWith('.') ? '.' : m[0][0];
    return { rule: 'doubled', start: m.index, end: m.index + m[0].length, fix: [{ start: m.index, end: m.index + m[0].length, text: keep }] };
  });
  yield* all(/(?<![!?])(?:!{2,}|\?{2,})(?![!?\p{L}\p{N}])/gu, m => ({ rule: 'repeated-end', start: m.index, end: m.index + m[0].length, fix: [{ start: m.index, end: m.index + m[0].length, text: m[0][0] }] }));

  // Closing quotation mark, then a period or comma: move it inside.
  // (A digit before " is an inch mark, not a quotation.)
  yield* all(/(?<=[^\s\d(“"])(["”])([.,])/g, m => {
    // After a quotation that ends in ? or !, no period or comma is added at all.
    if (/[?!]/.test(text[m.index - 1])) {
      return { rule: 'quote-after-question', start: m.index - 1, end: m.index + 2, fix: [{ start: m.index + 1, end: m.index + 2, text: '' }] };
    }
    return { rule: 'quote-period-comma', start: m.index, end: m.index + 2, fix: [{ start: m.index, end: m.index + 2, text: m[2] + m[1] }] };
  });
  // Colon or semicolon just inside a closing quotation mark: move it outside.
  yield* all(/(?<=[^\s(“"])([;:])(["”])(?=\s|$)/g, m => ({
    rule: 'quote-colon-semicolon', start: m.index, end: m.index + 2,
    fix: [{ start: m.index, end: m.index + 2, text: m[2] + m[1] }],
  }));

  // Apostrophes.
  yield* all(/\b(your|her|our|their)['’]s\b/gi, m => ({
    rule: 'pronoun-apostrophe', start: m.index, end: m.index + m[0].length,
    fix: [{ start: m.index, end: m.index + m[0].length, text: caseLike(m[1], m[1].toLowerCase() + 's') }],
  }));
  yield* all(/\bits['’](?![\p{L}])/giu, m => ({ rule: 'pronoun-apostrophe', start: m.index, end: m.index + 4, fix: [{ start: m.index, end: m.index + 4, text: m[0].slice(0, 3) }] }));
  yield* all(/\bit['’]s(?= (own|self)\b)/gi, m => ({ rule: 'pronoun-apostrophe', start: m.index, end: m.index + 4, fix: [{ start: m.index, end: m.index + 4, text: caseLike(m[0], 'its') }] }));
  yield* all(/\bits(?= (a|an|the|been|not|my|your|our|their|his|her)\b)(?! a (priori|posteriori|fortiori)\b)/gi, m => ({
    rule: 'its', start: m.index, end: m.index + 3, fix: [{ start: m.index, end: m.index + 3, text: caseLike(m[0], "it's") }],
  }));
  yield* all(new RegExp(`\\b(${Object.keys(CONTRACTIONS).join('|')})\\b`, 'gi'), m => {
    const w = m[0];
    // Only all-lowercase or Capitalized ("IM" is an abbreviation, not "I'm").
    if (w !== w.toLowerCase() && w !== w[0].toUpperCase() + w.slice(1).toLowerCase()) return null;
    const fixed = CONTRACTIONS[w.toLowerCase()];
    return { rule: 'contraction', start: m.index, end: m.index + w.length, fix: [{ start: m.index, end: m.index + w.length, text: /^I'/.test(fixed) ? fixed : caseLike(w, fixed) }] };
  });
  yield* all(/\b(1[0-9]|20)\d0['’]s\b/g, m => ({ rule: 'decade', start: m.index, end: m.index + m[0].length, fix: [{ start: m.index, end: m.index + m[0].length, text: m[0].replace(/['’]/, '') }] }));

  // Abbreviations.
  yield* all(/\betc\b(?!\.)/gi, m => ({ rule: 'abbreviation', start: m.index, end: m.index + 3, fix: [{ start: m.index + 3, end: m.index + 3, text: '.' }] }));
  yield* all(/\b(e\.g|i\.e)(?![.\p{L}])/giu, m => ({ rule: 'abbreviation', start: m.index, end: m.index + 3, fix: [{ start: m.index + 3, end: m.index + 3, text: '.' }] }));

  // Dates.
  yield* all(new RegExp(`\\b(?:${MONTHS}) \\d{1,2}(?:st|nd|rd|th)?( )(?=\\d{4}\\b)`, 'g'), m => {
    const at = m.index + m[0].length - 1;
    const yearEnd = m.index + m[0].length + 4;
    const fix = [{ start: at, end: at, text: ',' }];
    // The sentence goes on after the year: that comma is needed too.
    if (/^ [\p{L}\p{N}“"]/u.test(text.slice(yearEnd, yearEnd + 2))) fix.push({ start: yearEnd, end: yearEnd, text: ',' });
    return { rule: 'date-day-year', start: m.index, end: yearEnd, fix };
  });
  yield* all(new RegExp(`\\b(?:${MONTHS}) \\d{1,2}(?:st|nd|rd|th)?, \\d{4}(?= [\\p{L}\\p{N}“"])`, 'gu'), m => {
    const at = m.index + m[0].length;
    return { rule: 'date-after-year', start: m.index, end: at, fix: [{ start: at, end: at, text: ',' }] };
  });
  yield* all(new RegExp(`(?<!\\d )\\b(?:${MONTHS}), (?=\\d{4}\\b(?![,.]?\\d))`, 'g'), m => {
    const comma = m.index + m[0].length - 2;
    return { rule: 'date-month-year', start: m.index, end: m.index + m[0].length + 4, fix: [{ start: comma, end: comma + 1, text: '' }] };
  });

  // City, State, …
  const NOT_A_CITY = /^(Yes|No|Oh|Well|Hello|Hi|Dear|Thanks|Sincerely|However|Also|So|And|But|Then|Now|Today|Yesterday|Again)$/;
  // Not before "and"/"or": "Adams, Washington and Jefferson" are people.
  yield* all(new RegExp(`\\b((?:(?:St|Ft|Mt|Pt)\\. |\\p{Lu}\\p{Ll}+ ){0,2}\\p{Lu}\\p{Ll}+), (${STATES})(?= (?!and\\b|or\\b)\\p{Ll})`, 'gu'), m => {
    if (NOT_A_CITY.test(m[1].split(' ').pop())) return null;
    const at = m.index + m[0].length;
    return { rule: 'city-state', start: m.index, end: at, fix: [{ start: at, end: at, text: ',' }] };
  });
  yield* all(/\bWashington, D\.C\.(?= \p{Ll})/gu, m => {
    const at = m.index + m[0].length;
    return { rule: 'city-state', start: m.index, end: at, fix: [{ start: at, end: at, text: ',' }] };
  });

  // Colons.
  yield* all(/\b(such as|including|especially)[ \t]*:(?=[ \t]+\S)/gi, m => {
    const colon = m.index + m[0].lastIndexOf(':');
    return { rule: 'colon-such-as', start: m.index, end: colon + 1, fix: [{ start: m.index + m[1].length, end: colon + 1, text: '' }] };
  });
  yield* all(/(?<=\S[ \t]+)\b(are|is|was|were|include|includes|included|consist of|consists of|consisted of|of|to|for|with|by|from|on|like|for example|for instance)[ \t]*:(?=[ \t]+\S)/gi, m => {
    const colon = m.index + m[0].lastIndexOf(':');
    return { rule: 'colon-verb', start: m.index, end: colon + 1, fix: [{ start: m.index + m[1].length, end: colon + 1, text: '' }] };
  });

  // Semicolons.
  yield* all(/\b(the following|as follows)[ \t]*;/gi, m => {
    const semi = m.index + m[0].length - 1;
    return { rule: 'semicolon-list', start: m.index, end: semi + 1, fix: [{ start: semi, end: semi + 1, text: ':' }] };
  });
  yield* all(/;(?=[ \t]+(which|who|whom|whose|because)\b)/gi, m => ({
    rule: 'semicolon-clause', start: m.index, end: m.index + 1, fix: /because/i.test(text.slice(m.index, m.index + 12)) ? null : [{ start: m.index, end: m.index + 1, text: ',' }],
  }));

  // "however," "therefore," … between sentences.
  yield* all(new RegExp(`,[ \\t]+(${CONJUNCTIVE})[ \\t]+(?=(\\p{Ll}[\\p{L}'’]*))`, 'giu'), m => {
    if (DEGREE_WORDS.test(m[2])) return null;
    // No automatic fix: "It rained, however we went" needs "; however," but
    // "It is, however safe" needs a second comma. Only the writer knows which.
    return { rule: 'conjunctive-splice', start: m.index, end: m.index + m[0].trimEnd().length };
  });
  yield* all(new RegExp(`;[ \\t]+(${CONJUNCTIVE})[ \\t]+(?=(\\p{Ll}[\\p{L}'’]*))`, 'giu'), m => {
    if (DEGREE_WORDS.test(m[2])) return null;
    const wordEnd = m.index + m[0].trimEnd().length;
    return { rule: 'conjunctive-comma', start: m.index + 1, end: wordEnd, fix: [{ start: wordEnd, end: wordEnd, text: ',' }] };
  });
  yield* all(/(?:^|(?<=[.!?]["”’)]?[ \t]+))(However|Therefore|Moreover|Furthermore|Consequently|Nevertheless|Nonetheless|Additionally|In addition|For example|For instance|In fact|As a result|On the other hand|In conclusion|In contrast|In summary)(?=[ \t]+(\p{L}[\p{L}'’]*))/gmu, m => {
    if (/^(to|of|with)$/i.test(m[2])) return null; // "In addition to …", "As a result of …"
    if (m[1] === 'However' && DEGREE_WORDS.test(m[2])) return null;
    const at = m.index + m[1].length;
    return { rule: 'intro-comma', start: m.index, end: at, fix: [{ start: at, end: at, text: ',' }] };
  });

  // Serial comma in lists of four or more: "A, B, C and D".
  const ITEM = "[\\p{L}'’-]+(?: [\\p{L}'’-]+){0,2}";
  // Only clear lists: interruptions ("samples, thankfully, weren't") and attributions
  // ("policy, said Diana Buttu, a lawyer and…") look similar but are not lists.
  const NOT_LIST_WORD = /^(is|are|was|were|be|been|being|has|have|had|said|says|told|asked|especially|particularly|including|like|such|which|who|whom|whose|that|above|however|also|too|not|\p{L}+n['’]t)$/iu;
  const PREPOSITION = /^(of|in|on|at|by|for|with|from|to|into|about|after|before|during|than)$/i;
  const DETERMINER = /^(the|a|an|our|their|his|her|its|my|your)$/i;
  const looksLikeList = items => {
    const words = items.map(i => i.split(' '));
    if (words.some(w => w.some(x => NOT_LIST_WORD.test(x)) || PREPOSITION.test(w[0]))) return false;
    if (words.some(w => w.length === 1 && /ly$/i.test(w[0]) && w[0].length > 4)) return false; // "thankfully"
    const caps = words.map(w => /^\p{Lu}/u.test(w[0]));
    if (caps[1] !== caps[2]) return false; // "acronym, GITIS, the country's oldest"
    const det = words.map(w => DETERMINER.test(w[0]));
    if (det[1] !== det[2]) return false; // "Ivan, the younger son, is…"
    return true;
  };
  yield* all(new RegExp(`(${ITEM}), (${ITEM}), (${ITEM}) (and|or) (?=[\\p{L}])`, 'gu'), m => {
    if (!looksLikeList([m[1].split(' ').pop(), m[2], m[3]])) return null;
    const at = m.index + m[0].length - m[4].length - 2;
    const firstWord = m[1].split(' ').pop();
    return { rule: 'serial-comma', start: m.index + m[1].length - firstWord.length, end: m.index + m[0].length - 1, fix: [{ start: at, end: at, text: ',' }] };
  });

  // Commas around quotations.
  yield* all(/\b(said|says|asked|asks|replied|replies|answered|exclaimed|shouted|whispered|added|remarked|declared|announced|stated|explained)(?=[ \t]+["“]\p{Lu})/gu, m => {
    const at = m.index + m[0].length;
    return { rule: 'signal-comma', start: m.index, end: at, fix: [{ start: at, end: at, text: ',' }] };
  });
  // Only after a reporting verb: in "Beyond that, “…”" the comma ends an introductory phrase.
  yield* all(/(?<=\b(?:says|said|argues|argued|writes|wrote|notes|noted|claims|claimed|states|stated|explains|explained|suggests|suggested|believes|believed|thinks|thought|finds|found|shows|showed|reports|reported|insists|insisted|admits|admitted|observes|observed|concludes|concluded|maintains|maintained|adds|added)[ \t]+)that,(?=[ \t]*["“])/gi, m => ({ rule: 'that-comma', start: m.index, end: m.index + 5, fix: [{ start: m.index + 4, end: m.index + 5, text: '' }] }));

  // Dashes.
  yield* all(/(?<=[\p{L},;)”"’])[ \t]+-{1,2}[ \t]+(?=[\p{L}“"(])/gu, m => ({ rule: 'dash', start: m.index, end: m.index + m[0].length, fix: [{ start: m.index, end: m.index + m[0].length, text: '—' }] }));
  yield* all(/[ \t]+—[ \t]*|[ \t]*—[ \t]+/g, m => ({ rule: 'dash-spaces', start: m.index, end: m.index + m[0].length, fix: [{ start: m.index, end: m.index + m[0].length, text: '—' }] }));
}

// Quotation marks, parentheses, and brackets, one paragraph at a time.
function* pairedMarks(text) {
  let offset = 0;
  for (const line of text.split('\n')) {
    // Curly quotes: nested pairs should be single quotes.
    const open = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '“') open.push(i);
      else if (line[i] === '”') {
        if (!open.length) { yield { rule: 'unbalanced-quotes', start: offset + i, end: offset + i + 1 }; continue; }
        const o = open.pop();
        if (open.length) {
          yield { rule: 'nested-quotes', start: offset + o, end: offset + i + 1, fix: [{ start: offset + o, end: offset + o + 1, text: '‘' }, { start: offset + i, end: offset + i + 1, text: '’' }] };
        }
      }
    }
    for (const o of open) yield { rule: 'unbalanced-quotes', start: offset + o, end: offset + o + 1 };

    // Straight quotes: an odd number means one is missing (inch marks excluded).
    const straight = [...line.matchAll(/(?<!\d)"/g)].map(m => m.index);
    if (straight.length % 2) {
      const last = straight[straight.length - 1];
      yield { rule: 'unbalanced-quotes', start: offset + last, end: offset + last + 1 };
    }

    // Parentheses and brackets. "1)" or "a)" list markers and ":)" are not pairs.
    for (const [o, c] of [['(', ')'], ['[', ']']]) {
      const stack = [];
      for (let i = 0; i < line.length; i++) {
        if (line[i] === o) stack.push(i);
        else if (line[i] === c) {
          if (stack.length) { stack.pop(); continue; }
          const before = line.slice(Math.max(0, i - 4), i);
          if (c === ')' && (/(^|\s)([a-z]|\d{1,2}|[ivx]{1,4})$/i.test(before) || /[:;]-?$/.test(before))) continue;
          yield { rule: 'unbalanced-brackets', start: offset + i, end: offset + i + 1 };
        }
      }
      for (const s of stack) yield { rule: 'unbalanced-brackets', start: offset + s, end: offset + s + 1 };
    }

    // A paragraph of several sentences that stops without end punctuation.
    const trimmed = line.trimEnd();
    if (/[\p{L}\p{N}]$/u.test(trimmed) && trimmed.split(/\s+/).length >= 12 && /[.!?]["”’)]?\s+\S/.test(trimmed)) {
      const end = offset + trimmed.length;
      yield { rule: 'end-punctuation', start: end - 1, end, fix: [{ start: end, end, text: '.' }] };
    }
    offset += line.length + 1;
  }
}

/* -------------------------------------------------------------------- run */

export function checkPunctuation(text) {
  const shielded = protectedRanges(text);
  const inProtected = f => shielded.some(([a, b]) => f.start < b && f.end > a);
  const seen = new Set();
  const out = [];
  for (const f of [...simpleRules(text), ...pairedMarks(text)]) {
    if (!f || inProtected(f)) continue;
    const key = `${f.rule}:${f.start}:${f.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rule = RULES[f.rule];
    out.push({ ...f, severity: rule.severity, title: rule.title, why: rule.why, fix: f.fix || null });
  }
  return out.sort((a, b) => a.start - b.start || (a.severity === 'error' ? -1 : 1));
}

// Applies the fixes of several findings at once, skipping any that overlap.
export function applyFixes(text, findings) {
  const edits = [];
  for (const f of findings) {
    if (!f.fix) continue;
    const lo = Math.min(...f.fix.map(e => e.start)), hi = Math.max(...f.fix.map(e => e.end));
    if (edits.some(e => lo <= e.hi && hi >= e.lo)) continue;
    edits.push({ lo, hi, fix: f.fix });
  }
  const flat = edits.flatMap(e => e.fix).sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of flat) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
