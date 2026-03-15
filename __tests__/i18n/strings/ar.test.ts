jest.mock("react-native");

import { EN_STRINGS } from '../../../src/i18n/strings/en';
import { AR_STRINGS } from '../../../src/i18n/strings/ar';

describe('Arabic strings', () => {
  it('has translations for all English keys', () => {
    const enKeys = Object.keys(EN_STRINGS);
    const arKeys = Object.keys(AR_STRINGS);
    for (const key of enKeys) {
      expect(arKeys).toContain(key);
    }
  });

  it('all values are non-empty strings', () => {
    for (const [_key, value] of Object.entries(AR_STRINGS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('Arabic strings differ from English strings', () => {
    let differenceCount = 0;
    for (const key of Object.keys(EN_STRINGS)) {
      if (AR_STRINGS[key] !== EN_STRINGS[key]) {
        differenceCount++;
      }
    }
    // At least 80% should differ (parameter-heavy strings might coincidentally match)
    expect(differenceCount).toBeGreaterThan(Object.keys(EN_STRINGS).length * 0.8);
  });

  it('has the same number of keys as English', () => {
    expect(Object.keys(AR_STRINGS).length).toBe(Object.keys(EN_STRINGS).length);
  });

  it('contains Arabic characters', () => {
    const arabicPattern = /[\u0600-\u06FF]/;
    const hasArabic = Object.values(AR_STRINGS).some(v => arabicPattern.test(v));
    expect(hasArabic).toBe(true);
  });
});
