import { describe, it, expect } from 'vitest';
import {
  buildSpeechText,
  detectLangFromText,
  languageFromQuestionId,
  pickVoice,
  resolveLanguageCode,
} from '@/utils/speech';

// Real record from the repository (question id 9944).
const THAI_QUESTION = {
  id: 'IG_V2025_S1882_LO5759_MC_L1_TH_ID19944',
  quesOrigin: 'Thai',
  question: 'พิซซ่าถูกแบ่งออกเป็นสี่ชิ้นเท่าๆ กัน และเด็กคนหนึ่งกินไปหนึ่งชิ้น เศษส่วนใดแสดงถึงชิ้นเดียวที่ถูกกินจากทั้งหมดที่แบ่งเท่าๆ กัน?',
  values: ['1/2', '1/8', '1/6', '1/4'],
};

const voice = (name: string, lang: string): any => ({ name, lang, localService: true });

describe('speaking a converted (Thai) question', () => {
  it('resolves the language from the stored label "Thai"', () => {
    expect(resolveLanguageCode(THAI_QUESTION.quesOrigin)).toBe('th');
  });

  it('resolves the language from the question identifier', () => {
    expect(languageFromQuestionId(THAI_QUESTION.id)).toBe('th');
  });

  it('accepts codes and locales as-is', () => {
    expect(resolveLanguageCode('th')).toBe('th');
    expect(resolveLanguageCode('th-TH')).toBe('th-th');
    expect(resolveLanguageCode('Vietnamese')).toBe('vi');
    expect(resolveLanguageCode('')).toBe('');
  });

  it('detects Thai from the script as a fallback', () => {
    expect(detectLangFromText(THAI_QUESTION.question)).toBe('th');
  });

  it('builds speech text containing the Thai stem and every option', () => {
    const text = buildSpeechText(THAI_QUESTION, THAI_QUESTION.question);
    expect(text).toContain('พิซซ่า');
    // The "Option A." label is English. Spoken by a Thai voice it is noise inside the
    // question, so a translated question reads its options without the label.
    expect(text).not.toContain('Option A.');
    expect(text).toContain('1 over 2');
    expect(text).toContain('1 over 4');
  });

  it('uses an installed Thai voice when one exists', () => {
    const voices = [voice('Microsoft Zira', 'en-US'), voice('Kanya', 'th-TH')];
    expect(pickVoice(voices, { gender: 'female', accent: 'en-IN', lang: 'th' })?.lang).toBe('th-TH');
  });

  it('matches a bare "th" voice for a "th-TH" hint', () => {
    const voices = [voice('Thai', 'th')];
    expect(pickVoice(voices, { gender: 'female', accent: 'en-IN', lang: 'th-TH' })?.lang).toBe('th');
  });

  it('does NOT fall back to an English voice for Thai', () => {
    // An en-US voice cannot pronounce Thai; returning it left the engine silent.
    const voices = [voice('Microsoft Zira', 'en-US'), voice('Microsoft David', 'en-GB')];
    expect(pickVoice(voices, { gender: 'female', accent: 'en-US', lang: 'th' })).toBeUndefined();
  });

  it('still picks an English voice for English content', () => {
    const voices = [voice('Microsoft Zira', 'en-US')];
    expect(pickVoice(voices, { gender: 'female', accent: 'en-US' })?.lang).toBe('en-US');
  });
});
