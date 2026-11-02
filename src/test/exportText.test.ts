import { describe, it, expect } from 'vitest';
import { toExportText, toExportOptionText } from '@/utils/exportText';

describe('toExportText', () => {
  it('converts virtual-keyboard fractions', () => {
    const html = '<span class="vk-frac" contenteditable="false"><span class="vk-num" contenteditable="true">3</span><span class="vk-bar"></span><span class="vk-den" contenteditable="true">8</span></span>';
    expect(toExportText(html)).toBe('⅜');
  });

  it('converts a non-vulgar fraction to slash form', () => {
    const html = '<span class="vk-frac"><span class="vk-num">12</span><span class="vk-bar"></span><span class="vk-den">36</span></span>';
    expect(toExportText(html)).toBe('12/36');
  });

  it('converts virtual-keyboard matrix', () => {
    const html = '<span class="vk-matrix"><span class="vk-matrix-paren">[</span><table><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table><span class="vk-matrix-paren">]</span></span>';
    expect(toExportText(html)).toBe('[1 2; 3 4]');
  });

  it('converts sup/sub to unicode', () => {
    expect(toExportText('x<sup>2</sup>')).toBe('x²');
    expect(toExportText('H<sub>2</sub>O')).toBe('H₂O');
  });

  it('keeps non-mappable sup readable', () => {
    expect(toExportText('x<sup>a+b</sup>')).toBe('x^(a+b)');
  });

  it('drops the empty-box placeholders', () => {
    const html = '<span class="vk-frac"><span class="vk-num">◻</span><span class="vk-bar"></span><span class="vk-den">◻</span></span>';
    expect(toExportText(html)).toBe('');
  });

  it('converts delimited LaTeX fractions from the API', () => {
    const raw = 'Three out of eight equal parts is \\\\(\\frac{3}{8}\\\\).';
    expect(toExportText(raw)).toBe('Three out of eight equal parts is ⅜.');
  });

  it('converts the real 9913 stem fragment', () => {
    const raw = 'simplification strategies for the fraction \\\\( 12/36 \\\\). To determine';
    expect(toExportText(raw)).toBe('simplification strategies for the fraction 12/36. To determine');
  });

  it('converts bare (undelimited) LaTeX', () => {
    expect(toExportText('The value \\frac{1}{2} is half')).toBe('The value ½ is half');
  });

  it('converts LaTeX symbols instead of leaving backslashes', () => {
    expect(toExportText('a \\times b \\leq c \\alpha')).toBe('a × b ≤ c α');
  });

  it('converts sqrt', () => {
    expect(toExportText('\\sqrt{16} = 4')).toBe('√(16) = 4');
  });

  it('strips zero-width junk characters', () => {
    expect(toExportText('tan\u207b\u00b9(23\u200b)')).toBe('tan⁻¹(23)');
  });

  it('leaves plain text alone', () => {
    expect(toExportText('What is the capital of France?')).toBe('What is the capital of France?');
  });

  it('handles greek keyboard characters', () => {
    expect(toExportText('φ α ζ σ ς')).toBe('φ α ζ σ ς');
  });

  it('handles symbol keyboard characters', () => {
    expect(toExportText('≤ ≥ ≠ ≈ · ÷ × ± ∈ ∉ ⊂ ∪ ∩ ∞ ° → ⇒ ∴ ∵ ∇')).toBe('≤ ≥ ≠ ≈ · ÷ × ± ∈ ∉ ⊂ ∪ ∩ ∞ ° → ⇒ ∴ ∵ ∇');
  });

  it('strips option prefixes', () => {
    expect(toExportOptionText('A. The numerator')).toBe('The numerator');
    expect(toExportOptionText({ text: 'B) The denominator' })).toBe('The denominator');
  });

  it('handles arrays', () => {
    expect(toExportText(['one', 'two'])).toBe('one\ntwo');
  });

  it('drops base64 images', () => {
    expect(toExportText('before data:image/jpeg;base64,AAAABBBBCCCC after')).toBe('before after');
  });

  it('leaves a book name with underscores untouched', () => {
    expect(toExportText('Grade_6-Math_Fractions')).toBe('Grade_6-Math_Fractions');
  });

  it('leaves a question identifier untouched', () => {
    expect(toExportText('IG_V2025_S1882_LO5761_MC_L1_EN_ID9913')).toBe('IG_V2025_S1882_LO5761_MC_L1_EN_ID9913');
  });

  it('still converts subscripts when the text is real LaTeX', () => {
    expect(toExportText(String.raw`the value \(x_1 + x_2\)`)).toBe('the value x₁ + x₂');
  });

  it('returns empty for null/undefined', () => {
    expect(toExportText(null)).toBe('');
    expect(toExportText(undefined)).toBe('');
  });
});
