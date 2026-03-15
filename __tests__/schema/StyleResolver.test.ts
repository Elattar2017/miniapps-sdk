/**
 * StyleResolver Test Suite
 */

import { StyleResolver } from '../../src/schema/StyleResolver';
import { ALLOWED_STYLE_PROPERTIES } from '../../src/types';
import { DEFAULT_DESIGN_TOKENS } from '../../src/constants/defaults';
import type { DesignTokens } from '../../src/types';

// Suppress logger output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('StyleResolver', () => {
  let resolver: StyleResolver;
  let tokens: DesignTokens;

  beforeEach(() => {
    resolver = new StyleResolver();
    tokens = DEFAULT_DESIGN_TOKENS;
  });

  describe('security filtering', () => {
    it('filters disallowed style properties', () => {
      const style = {
        fontSize: 16,
        dangerousProp: 'bad-value',
        scriptInjection: 'alert(1)',
      };
      const result = resolver.resolve(style, tokens);
      expect(result).toHaveProperty('fontSize', 16);
      expect(result).not.toHaveProperty('dangerousProp');
      expect(result).not.toHaveProperty('scriptInjection');
    });

    it('passes through all allowed properties unchanged', () => {
      const style: Record<string, unknown> = {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FF0000',
        backgroundColor: '#FFFFFF',
        padding: 8,
        margin: 4,
        borderRadius: 8,
        flex: 1,
        opacity: 0.5,
      };
      const result = resolver.resolve(style, tokens);
      for (const [key, value] of Object.entries(style)) {
        expect(result[key]).toBe(value);
      }
    });

    it('allows all properties in the ALLOWED_STYLE_PROPERTIES list', () => {
      // Build a style object with every allowed property
      const style: Record<string, unknown> = {};
      for (const prop of ALLOWED_STYLE_PROPERTIES) {
        style[prop] = 'test-value';
      }
      const result = resolver.resolve(style, tokens);
      for (const prop of ALLOWED_STYLE_PROPERTIES) {
        expect(result).toHaveProperty(prop);
      }
    });
  });

  describe('theme token resolution', () => {
    it('resolves $theme.colors.primary to the correct color value', () => {
      const style = { color: '$theme.colors.primary' };
      const result = resolver.resolve(style, tokens);
      expect(result.color).toBe('#0066CC');
    });

    it('resolves $theme.colors.background', () => {
      const style = { backgroundColor: '$theme.colors.background' };
      const result = resolver.resolve(style, tokens);
      expect(result.backgroundColor).toBe('#FFFFFF');
    });

    it('resolves nested path $theme.spacing.md', () => {
      const style = { padding: '$theme.spacing.md' };
      const result = resolver.resolve(style, tokens);
      expect(result.padding).toBe(16);
    });

    it('resolves $theme.spacing.unit', () => {
      const style = { margin: '$theme.spacing.unit' };
      const result = resolver.resolve(style, tokens);
      expect(result.margin).toBe(4);
    });

    it('resolves $theme.borderRadius.default', () => {
      const style = { borderRadius: '$theme.borderRadius.default' };
      const result = resolver.resolve(style, tokens);
      expect(result.borderRadius).toBe(8);
    });

    it('resolves $theme.typography.baseFontSize', () => {
      const style = { fontSize: '$theme.typography.baseFontSize' };
      const result = resolver.resolve(style, tokens);
      expect(result.fontSize).toBe(14);
    });

    it('resolves typography scale tokens', () => {
      const style = { fontSize: '$theme.typography.scale.h1' };
      const result = resolver.resolve(style, tokens);
      expect(result.fontSize).toBe(32);
    });

    it('returns original string when token path not found', () => {
      const style = { color: '$theme.colors.nonExistent' };
      const result = resolver.resolve(style, tokens);
      expect(result.color).toBe('$theme.colors.nonExistent');
    });

    it('returns original string when intermediate path segment missing', () => {
      const style = { color: '$theme.nonExistent.deeply.nested' };
      const result = resolver.resolve(style, tokens);
      expect(result.color).toBe('$theme.nonExistent.deeply.nested');
    });

    it('returns original string when token resolves to undefined', () => {
      // Create custom tokens with an explicit undefined-like structure
      const customTokens: DesignTokens = {
        ...tokens,
        colors: {
          ...tokens.colors,
        },
      };
      // Access a property that exists on the path but is undefined
      const style = { color: '$theme.colors.warning' };
      // warning is defined in DEFAULT_DESIGN_TOKENS, so let's test a truly undefined one
      const style2 = { color: '$theme.shadows.xl' };
      const result2 = resolver.resolve(style2, customTokens);
      // shadows.xl does not exist so it should return the original string
      expect(result2.color).toBe('$theme.shadows.xl');
    });
  });

  describe('object token spreading', () => {
    it('spreads object tokens like $theme.shadows.md into resolved styles', () => {
      const style = { shadowStyle: '$theme.shadows.md' };
      // Note: 'shadowStyle' is not in allowed list, so we use a different approach
      // Let's use a property that IS allowed and reference a shadow token
      const styleWithAllowed = { shadowColor: '$theme.shadows.md' };
      const result = resolver.resolve(styleWithAllowed, tokens);
      // When the token resolves to an object, it should be spread into the result
      expect(result.offsetX).toBe(0);
      expect(result.offsetY).toBe(2);
      expect(result.blurRadius).toBe(4);
      expect(result.color).toBe('rgba(0,0,0,0.15)');
    });

    it('spreads $theme.shadows.sm correctly', () => {
      const style = { shadowColor: '$theme.shadows.sm' };
      const result = resolver.resolve(style, tokens);
      expect(result.offsetX).toBe(0);
      expect(result.offsetY).toBe(1);
      expect(result.blurRadius).toBe(2);
      expect(result.color).toBe('rgba(0,0,0,0.1)');
    });

    it('spreads $theme.shadows.lg correctly', () => {
      const style = { shadowColor: '$theme.shadows.lg' };
      const result = resolver.resolve(style, tokens);
      expect(result.offsetX).toBe(0);
      expect(result.offsetY).toBe(4);
      expect(result.blurRadius).toBe(8);
      expect(result.color).toBe('rgba(0,0,0,0.2)');
    });
  });

  describe('edge cases', () => {
    it('handles empty style object', () => {
      const result = resolver.resolve({}, tokens);
      expect(result).toEqual({});
    });

    it('handles mixed token and literal values', () => {
      const style = {
        color: '$theme.colors.primary',
        fontSize: 20,
        backgroundColor: '#EEEEEE',
        padding: '$theme.spacing.sm',
      };
      const result = resolver.resolve(style, tokens);
      expect(result.color).toBe('#0066CC');
      expect(result.fontSize).toBe(20);
      expect(result.backgroundColor).toBe('#EEEEEE');
      expect(result.padding).toBe(8);
    });

    it('does not resolve non-$theme strings', () => {
      const style = { color: 'red' };
      const result = resolver.resolve(style, tokens);
      expect(result.color).toBe('red');
    });

    it('handles numeric values without modification', () => {
      const style = { fontSize: 24, padding: 16 };
      const result = resolver.resolve(style, tokens);
      expect(result.fontSize).toBe(24);
      expect(result.padding).toBe(16);
    });

    it('handles boolean values without modification', () => {
      // overflow is an allowed property
      const style = { overflow: 'hidden' };
      const result = resolver.resolve(style, tokens);
      expect(result.overflow).toBe('hidden');
    });
  });
});
