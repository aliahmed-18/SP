import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateJoinCode, isValidJoinCode, normalizeJoinCode } from './codes';

describe('join codes', () => {
  it('generates 5 chars from the allowed alphabet only', () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(5);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
      expect(isValidJoinCode(code)).toBe(true);
    }
  });
  it('never uses look-alike characters', () => {
    for (const ch of '01OI') expect(CODE_ALPHABET).not.toContain(ch);
  });
  it('uses every allowed character eventually', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const ch of generateJoinCode()) seen.add(ch);
    expect(seen.size).toBe(CODE_ALPHABET.length);
  });
  it('validates and normalises input', () => {
    expect(normalizeJoinCode(' bc eu-3 ')).toBe('BCEU3');
    expect(isValidJoinCode('BCEU3')).toBe(true);
    expect(isValidJoinCode('BCEU')).toBe(false);
    expect(isValidJoinCode('BCEU30')).toBe(false);
    expect(isValidJoinCode('BCEO3')).toBe(false);
    expect(isValidJoinCode('bceu3')).toBe(false);
  });
});
