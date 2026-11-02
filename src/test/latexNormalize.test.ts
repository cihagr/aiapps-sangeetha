import { describe, it, expect } from 'vitest';
import { normalizeGeneratedLatex } from '@/utils/latexNormalize';

describe('normalizeGeneratedLatex', () => {
  it('collapses over-escaped LaTeX in the stem', () => {
    const input = { label: 'the fraction \\\\( 12/36 \\\\) is reduced' };
    expect(normalizeGeneratedLatex(input).label).toBe('the fraction \\( 12/36 \\) is reduced');
  });

  it('fixes LaTeX inside a JSON-encoded columns string and keeps it parseable', () => {
    const input = { columns: '[{"text": "\\\\\\\\(\\\\frac{1}{4}\\\\\\\\)", "value": "col1"}]' };
    const out = normalizeGeneratedLatex(input).columns;
    expect(typeof out).toBe('string');
    expect(JSON.parse(out)[0].text).toBe('\\(\\frac{1}{4}\\)');
  });

  it('fixes LaTeX inside arrays of options', () => {
    const input = { values: ['\\\\(\\frac{1}{2}\\\\)', 'plain'] };
    expect(normalizeGeneratedLatex(input).values).toEqual(['\\(\\frac{1}{2}\\)', 'plain']);
  });

  it('fixes LaTeX inside passage tabs', () => {
    const input = { Tabs: [{ TabName: 'A', TabContent: 'x \\\\(\\frac{1}{2}\\\\)' }] };
    expect(normalizeGeneratedLatex(input).Tabs[0].TabContent).toBe('x \\(\\frac{1}{2}\\)');
  });

  it('recurses into agent envelopes', () => {
    const input = { results: [{ index: 0, data: { data: [{ label: '\\\\(\\pi\\\\)' }] } }] };
    const out = normalizeGeneratedLatex(input);
    expect(out.results[0].data.data[0].label).toBe('\\(\\pi\\)');
  });

  it('leaves base64 images untouched', () => {
    const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const input = { label: img };
    expect(normalizeGeneratedLatex(input).label).toBe(img);
  });

  it('leaves ordinary text untouched', () => {
    const input = { label: 'What is 2 + 2?' };
    expect(normalizeGeneratedLatex(input).label).toBe('What is 2 + 2?');
  });

  it('does not corrupt a CorrectAnswer that is a JSON array', () => {
    const out = normalizeGeneratedLatex({ CorrectAnswer: '[1, 2, 0]' });
    expect(JSON.parse(out.CorrectAnswer)).toEqual([1, 2, 0]);
  });
});
