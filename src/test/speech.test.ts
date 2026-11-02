import { describe, it, expect } from 'vitest';
import {
  buildSpeechText,
  buildTableSpeechText,
  cleanTextForSpeech,
  detectLangFromText,
  getSpeakableOptions,
  pickVoice,
} from '@/utils/speech';
import { dedupeRepeatedText } from '@/utils/stemText';

describe('cleanTextForSpeech', () => {
  it('strips HTML so markup is never read aloud', () => {
    expect(cleanTextForSpeech('<p>What is <b>half</b>?</p>')).toBe('What is half?');
  });

  it('reads Greek symbols used as math by name (issue 17)', () => {
    expect(cleanTextForSpeech('Compare φ and α and ζ and σ and ς')).toBe(
      'Compare phi and alpha and zeta and sigma and sigma'
    );
  });

  it('reads LaTeX greek commands by name instead of dropping them', () => {
    expect(cleanTextForSpeech('The angle \\theta and \\phi')).toBe('The angle theta and phi');
  });

  it('reads fractions as words', () => {
    expect(cleanTextForSpeech('\\frac{3}{8} of the garden')).toBe('3 over 8 of the garden');
  });

  it('reads math symbols by name', () => {
    expect(cleanTextForSpeech('5 ≤ x ≠ 3')).toBe('5 less than or equal to x not equal to 3');
  });

  it('keeps Greek text as Greek when the text really is Greek', () => {
    const greek = 'Ποιο κλάσμα αντιπροσωπεύει το μισό του κήπου;';
    expect(cleanTextForSpeech(greek)).toContain('κλάσμα');
  });

  it('drops base64 images', () => {
    expect(cleanTextForSpeech('before data:image/jpeg;base64,AAAABBBB after')).toBe('before after');
  });

  // Regression: an ASCII-only character class used to delete every non-Latin
  // script, so translated questions were sent to the synthesiser empty.
  it.each([
    ['Thai', 'พิซซ่าถูกแบ่งออกเป็นสี่ชิ้น'],
    ['Hindi', 'कौन सा अंश आधा दर्शाता है'],
    ['Arabic', 'أي كسر يمثل النصف'],
    ['Chinese', '哪个分数表示一半'],
    ['Japanese', 'どの分数が半分を表しますか'],
    ['Korean', '어느 분수가 절반을 나타내나요'],
    ['Russian', 'Какая дробь представляет половину'],
    ['Tamil', 'எந்த பின்னம் பாதியைக் குறிக்கிறது'],
    ['Vietnamese', 'Phân số nào biểu thị một nửa'],
  ])('preserves %s text', (_label, text) => {
    expect(cleanTextForSpeech(text)).toBe(text);
  });
});

describe('detectLangFromText', () => {
  it('detects Thai (issue 12)', () => {
    expect(detectLangFromText('เศษส่วนใดแทนครึ่งหนึ่ง')).toBe('th');
  });

  it('detects Hindi', () => {
    expect(detectLangFromText('कौन सा अंश आधा दर्शाता है')).toBe('hi');
  });

  it('returns empty for plain English', () => {
    expect(detectLangFromText('Which fraction represents one half?')).toBe('');
  });

  it('does not treat isolated Greek math symbols as Greek language', () => {
    expect(detectLangFromText('The value of φ is about 1.618')).toBe('');
  });

});

describe('getSpeakableOptions / buildSpeechText', () => {
  it('collects options from values', () => {
    expect(getSpeakableOptions({ values: ['A. one', 'B. two'] })).toEqual(['one', 'two']);
  });

  it('collects options from DropdownOptions', () => {
    expect(getSpeakableOptions({ DropdownOptions: ['x', 'y'] })).toEqual(['x', 'y']);
  });

  it('reads the stem AND the options (issue 8)', () => {
    const q = { values: ['A. Numerator', 'B. Denominator'] };
    const text = buildSpeechText(q, 'Which is the top number?');
    expect(text).toBe('Which is the top number?. Option A. Numerator. Option B. Denominator');
  });

  it('reads the passage before the stem', () => {
    const q = { Tabs: [{ TabName: 'Intro', TabContent: 'A fraction is a part of a whole.' }] };
    const text = buildSpeechText(q, 'What is a fraction?');
    expect(text).toBe('Passage 1. A fraction is a part of a whole.. What is a fraction?');
  });

  it('returns empty when there is nothing to read', () => {
    expect(buildSpeechText({}, '')).toBe('');
  });

  // Regression: the repository re-serialises a stringified array, so a converted
  // question's `values` arrives as text. Only real arrays were accepted, so those
  // questions were read out with no options at all.
  it('reads options that arrive as a JSON string', () => {
    expect(getSpeakableOptions({ values: '["one","two"]' })).toEqual(['one', 'two']);
  });

  it('ignores a values string that is not a JSON array', () => {
    expect(getSpeakableOptions({ values: 'not an array' })).toEqual([]);
  });

  // "Option A." is English; spoken by a Hindi voice it is noise inside the question.
  it('drops the English option label for a translated question', () => {
    const q = { values: ['इनवर्स', 'सीधा'], originallanguage: 'Hindi' };
    expect(buildSpeechText(q, 'कौन सा संक्रिया प्रयोग होती है?')).toBe('कौन सा संक्रिया प्रयोग होती है?. इनवर्स. सीधा');
  });

  it('keeps the option label for an English question', () => {
    const q = { values: ['Numerator', 'Denominator'] };
    expect(buildSpeechText(q, 'Which is the top number?'))
      .toBe('Which is the top number?. Option A. Numerator. Option B. Denominator');
  });
});

describe('buildTableSpeechText', () => {
  const TABLE_QUESTION = {
    TableAnalysis: {
      Columns: ['S.no', 'Group', 'Count'],
      Rows: [[1, 'Employed Youth', 12], [2, 'Unemployed Youth', 16]],
    },
  };

  // Regression: the table drawn under the stem was never spoken, so a question
  // answerable only from its data was read aloud with the data missing.
  it('reads the table headers and every row', () => {
    expect(buildTableSpeechText(TABLE_QUESTION)).toBe(
      'Table with columns Group, Count. Row 1. Group: Employed Youth, Count: 12. ' +
      'Row 2. Group: Unemployed Youth, Count: 16'
    );
  });

  it('reads the table as part of the question, after the stem', () => {
    const text = buildSpeechText(TABLE_QUESTION, 'Which group is larger?');
    expect(text).toBe(
      'Which group is larger?. Table with columns Group, Count. ' +
      'Row 1. Group: Employed Youth, Count: 12. Row 2. Group: Unemployed Youth, Count: 16'
    );
  });

  it('parses a table returned as a JSON string', () => {
    const q = { TableAnalysis: JSON.stringify({ Columns: ['Name'], Rows: [['Alpha']] }) };
    expect(buildTableSpeechText(q)).toBe('Table with columns Name. Row 1. Name: Alpha');
  });

  it('cleans LaTeX inside cells instead of spelling out markup', () => {
    const q = { TableAnalysis: { Columns: ['Share'], Rows: [['\\frac{3}{8}']] } };
    expect(buildTableSpeechText(q)).toBe('Table with columns Share. Row 1. Share: 3 over 8');
  });

  it('returns empty for a question with no table', () => {
    expect(buildTableSpeechText({ values: ['A. one'] })).toBe('');
  });
});

describe('pickVoice', () => {
  const voice = (name: string, lang: string): any => ({ name, lang, localService: true });

  it('prefers a voice for the detected language over the English accent', () => {
    const voices = [voice('Google US English', 'en-US'), voice('Kanya', 'th-TH')];
    expect(pickVoice(voices, { gender: 'female', accent: 'en-IN', lang: 'th' })?.lang).toBe('th-TH');
  });

  it('returns no voice rather than an English one when the language has none', () => {
    // An en-US voice cannot pronounce Thai — the engine just stays silent.
    // Leaving the voice unset lets the platform pick from utterance.lang.
    const voices = [voice('Google US English', 'en-US')];
    expect(pickVoice(voices, { gender: 'female', accent: 'en-US', lang: 'th' })).toBeUndefined();
  });

  // Regression: gender was guessed from an English-only name list, so for a Hindi,
  // Urdu or Tamil voice neither gender matched and the picker fell back to the OS's
  // first voice — usually the female one. Selecting Male did nothing after a question
  // was converted to another language.
  it('honours Male for a non-English language', () => {
    const voices = [voice('Microsoft Kalpana - Hindi (India)', 'hi-IN'), voice('Microsoft Hemant - Hindi (India)', 'hi-IN')];
    expect(pickVoice(voices, { gender: 'male', accent: 'en-IN', lang: 'hi' })?.name).toContain('Hemant');
  });

  it('honours Female for a non-English language', () => {
    const voices = [voice('Microsoft Hemant - Hindi (India)', 'hi-IN'), voice('Microsoft Kalpana - Hindi (India)', 'hi-IN')];
    expect(pickVoice(voices, { gender: 'female', accent: 'en-IN', lang: 'hi' })?.name).toContain('Kalpana');
  });

  it('uses a voice the engine labels by gender', () => {
    const voices = [
      { name: 'Some Voice A', lang: 'ta-IN', localService: true, gender: 'female' } as any,
      { name: 'Some Voice B', lang: 'ta-IN', localService: true, gender: 'male' } as any,
    ];
    expect(pickVoice(voices, { gender: 'male', accent: 'en-IN', lang: 'ta' })?.name).toBe('Some Voice B');
  });

  it('prefers an unknown-gender voice over one of the opposite gender', () => {
    const voices = [voice('Microsoft Kalpana - Hindi (India)', 'hi-IN'), voice('Mystery Voice', 'hi-IN')];
    expect(pickVoice(voices, { gender: 'male', accent: 'en-IN', lang: 'hi' })?.name).toBe('Mystery Voice');
  });

  it('does not match a female voice when a male voice was requested', () => {
    const voices = [voice('Microsoft Zira - English (Female)', 'en-US'), voice('Microsoft David', 'en-US')];
    expect(pickVoice(voices, { gender: 'male', accent: 'en-US' })?.name).toBe('Microsoft David');
  });
});

describe('dedupeRepeatedText', () => {
  it('collapses an exactly duplicated stem', () => {
    const half = 'Which fraction represents one half of the garden?';
    expect(dedupeRepeatedText(`${half} ${half}`)).toBe(half);
  });

  it('collapses a repeated sentence anywhere in the stem (issue 20)', () => {
    const s = 'A garden is divided into equal parts. Which fraction is shaded? A garden is divided into equal parts.';
    expect(dedupeRepeatedText(s)).toBe('A garden is divided into equal parts. Which fraction is shaded?');
  });

  it('leaves a normal stem untouched', () => {
    const s = 'What is the numerator of the fraction three eighths?';
    expect(dedupeRepeatedText(s)).toBe(s);
  });

  it('keeps short repeated sentences such as True/False options', () => {
    expect(dedupeRepeatedText('True. False. True. False.')).toBe('True. False. True. False.');
  });
});
