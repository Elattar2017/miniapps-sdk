/**
 * AssetResolver Test Suite
 * Tests asset:// protocol resolution, module asset registration/unregistration,
 * prefetch with caching, and all reference formats.
 */

import { AssetResolver } from '../../src/modules/AssetResolver';
import type { ModuleCache } from '../../src/modules/ModuleCache';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createMockCache(): jest.Mocked<ModuleCache> {
  return {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    has: jest.fn(),
    getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0 }),
    clearTier: jest.fn(),
  } as unknown as jest.Mocked<ModuleCache>;
}

const API_BASE = 'https://api.example.com';
const MODULE_ID = 'com.vendor.budget';

const SAMPLE_ASSETS: Record<string, string> = {
  icon: '/uploads/modules/com-vendor-budget/a1b2c3d4.png',
  banner: '/uploads/modules/com-vendor-budget/e5f6g7h8.webp',
  'hero-image': '/uploads/modules/com-vendor-budget/12345678.jpg',
};

describe('AssetResolver', () => {
  let resolver: AssetResolver;
  let mockCache: jest.Mocked<ModuleCache>;

  beforeEach(() => {
    mockCache = createMockCache();
    resolver = new AssetResolver(API_BASE, mockCache);
  });

  describe('constructor', () => {
    it('should strip trailing slashes from apiBaseUrl', () => {
      const r = new AssetResolver('https://api.example.com///', mockCache);
      r.registerModuleAssets(MODULE_ID, { icon: '/uploads/icon.png' });
      const url = r.resolveAssetUrl(MODULE_ID, 'asset://icon');
      expect(url).toBe('https://api.example.com/uploads/icon.png');
    });

    it('should handle base URL without trailing slash', () => {
      const r = new AssetResolver('https://api.example.com', mockCache);
      r.registerModuleAssets(MODULE_ID, { icon: '/uploads/icon.png' });
      const url = r.resolveAssetUrl(MODULE_ID, 'asset://icon');
      expect(url).toBe('https://api.example.com/uploads/icon.png');
    });
  });

  describe('registerModuleAssets', () => {
    it('should register assets for a module', () => {
      resolver.registerModuleAssets(MODULE_ID, SAMPLE_ASSETS);
      expect(resolver.hasModuleAssets(MODULE_ID)).toBe(true);
    });

    it('should store a copy of the assets map (not a reference)', () => {
      const assets = { icon: '/uploads/icon.png' };
      resolver.registerModuleAssets(MODULE_ID, assets);

      // Mutate original — should not affect registered map
      assets.icon = '/uploads/changed.png';

      const url = resolver.resolveAssetUrl(MODULE_ID, 'asset://icon');
      expect(url).toBe(`${API_BASE}/uploads/icon.png`);
    });

    it('should overwrite previous registration for the same module', () => {
      resolver.registerModuleAssets(MODULE_ID, { icon: '/uploads/old.png' });
      resolver.registerModuleAssets(MODULE_ID, { banner: '/uploads/banner.webp' });

      expect(resolver.resolveAssetUrl(MODULE_ID, 'asset://icon')).toBeNull();
      expect(resolver.resolveAssetUrl(MODULE_ID, 'asset://banner')).toBe(
        `${API_BASE}/uploads/banner.webp`,
      );
    });

    it('should handle empty assets map', () => {
      resolver.registerModuleAssets(MODULE_ID, {});
      expect(resolver.hasModuleAssets(MODULE_ID)).toBe(true);
      expect(resolver.getAssetNames(MODULE_ID)).toEqual([]);
    });
  });

  describe('unregisterModuleAssets', () => {
    it('should remove assets for a module', () => {
      resolver.registerModuleAssets(MODULE_ID, SAMPLE_ASSETS);
      resolver.unregisterModuleAssets(MODULE_ID);
      expect(resolver.hasModuleAssets(MODULE_ID)).toBe(false);
    });

    it('should not throw when unregistering non-existent module', () => {
      expect(() => resolver.unregisterModuleAssets('non.existent')).not.toThrow();
    });

    it('should make asset:// references unresolvable after unregister', () => {
      resolver.registerModuleAssets(MODULE_ID, SAMPLE_ASSETS);
      resolver.unregisterModuleAssets(MODULE_ID);
      expect(resolver.resolveAssetUrl(MODULE_ID, 'asset://icon')).toBeNull();
    });
  });

  describe('resolveAssetUrl', () => {
    beforeEach(() => {
      resolver.registerModuleAssets(MODULE_ID, SAMPLE_ASSETS);
    });

    describe('asset:// protocol', () => {
      it('should resolve asset://logicalName to full URL', () => {
        const url = resolver.resolveAssetUrl(MODULE_ID, 'asset://icon');
        expect(url).toBe(`${API_BASE}/uploads/modules/com-vendor-budget/a1b2c3d4.png`);
      });

      it('should resolve all registered asset names', () => {
        expect(resolver.resolveAssetUrl(MODULE_ID, 'asset://banner')).toBe(
          `${API_BASE}/uploads/modules/com-vendor-budget/e5f6g7h8.webp`,
        );
        expect(resolver.resolveAssetUrl(MODULE_ID, 'asset://hero-image')).toBe(
          `${API_BASE}/uploads/modules/com-vendor-budget/12345678.jpg`,
        );
      });

      it('should return null for unregistered asset name', () => {
        const url = resolver.resolveAssetUrl(MODULE_ID, 'asset://nonexistent');
        expect(url).toBeNull();
      });

      it('should return null when module has no asset map', () => {
        const url = resolver.resolveAssetUrl('unregistered.module', 'asset://icon');
        expect(url).toBeNull();
      });
    });

    describe('absolute URLs', () => {
      it('should pass through https:// URLs as-is', () => {
        const url = resolver.resolveAssetUrl(MODULE_ID, 'https://cdn.example.com/img.png');
        expect(url).toBe('https://cdn.example.com/img.png');
      });

      it('should pass through http:// URLs as-is', () => {
        const url = resolver.resolveAssetUrl(MODULE_ID, 'http://cdn.example.com/img.png');
        expect(url).toBe('http://cdn.example.com/img.png');
      });
    });

    describe('relative /uploads/ paths', () => {
      it('should prepend apiBaseUrl to /uploads/ paths', () => {
        const url = resolver.resolveAssetUrl(MODULE_ID, '/uploads/modules/test/img.png');
        expect(url).toBe(`${API_BASE}/uploads/modules/test/img.png`);
      });
    });

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(resolver.resolveAssetUrl(MODULE_ID, '')).toBeNull();
      });

      it('should return unknown formats as-is', () => {
        const ref = 'some-random-string';
        expect(resolver.resolveAssetUrl(MODULE_ID, ref)).toBe(ref);
      });

      it('should handle asset:// with empty logical name', () => {
        // asset:// with empty name — no key "" in map → null
        expect(resolver.resolveAssetUrl(MODULE_ID, 'asset://')).toBeNull();
      });
    });
  });

  describe('hasModuleAssets', () => {
    it('should return false for unregistered module', () => {
      expect(resolver.hasModuleAssets('unknown')).toBe(false);
    });

    it('should return true after registration', () => {
      resolver.registerModuleAssets(MODULE_ID, SAMPLE_ASSETS);
      expect(resolver.hasModuleAssets(MODULE_ID)).toBe(true);
    });

    it('should return false after unregistration', () => {
      resolver.registerModuleAssets(MODULE_ID, SAMPLE_ASSETS);
      resolver.unregisterModuleAssets(MODULE_ID);
      expect(resolver.hasModuleAssets(MODULE_ID)).toBe(false);
    });
  });

  describe('getAssetNames', () => {
    it('should return empty array for unregistered module', () => {
      expect(resolver.getAssetNames('unknown')).toEqual([]);
    });

    it('should return all logical names for registered module', () => {
      resolver.registerModuleAssets(MODULE_ID, SAMPLE_ASSETS);
      const names = resolver.getAssetNames(MODULE_ID);
      expect(names).toEqual(expect.arrayContaining(['icon', 'banner', 'hero-image']));
      expect(names).toHaveLength(3);
    });

    it('should return empty array for module with empty assets', () => {
      resolver.registerModuleAssets(MODULE_ID, {});
      expect(resolver.getAssetNames(MODULE_ID)).toEqual([]);
    });
  });

  describe('prefetchModuleAssets', () => {
    beforeEach(() => {
      // @ts-expect-error — mock global fetch
      global.fetch = jest.fn();
    });

    afterEach(() => {
      // @ts-expect-error — clean up
      delete global.fetch;
    });

    it('should skip if module has no asset map', async () => {
      await resolver.prefetchModuleAssets('unregistered');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should skip if asset map is empty', async () => {
      resolver.registerModuleAssets(MODULE_ID, {});
      await resolver.prefetchModuleAssets(MODULE_ID);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch all assets and cache them', async () => {
      resolver.registerModuleAssets(MODULE_ID, SAMPLE_ASSETS);
      mockCache.get.mockReturnValue(undefined); // nothing cached
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await resolver.prefetchModuleAssets(MODULE_ID);

      // Should have fetched all 3 assets
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/uploads/modules/com-vendor-budget/a1b2c3d4.png`,
      );
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/uploads/modules/com-vendor-budget/e5f6g7h8.webp`,
      );
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/uploads/modules/com-vendor-budget/12345678.jpg`,
      );

      // Should cache each with correct key
      expect(mockCache.set).toHaveBeenCalledTimes(3);
      expect(mockCache.set).toHaveBeenCalledWith(
        `asset:${MODULE_ID}:icon`,
        { url: `${API_BASE}/uploads/modules/com-vendor-budget/a1b2c3d4.png`, prefetched: true },
        'asset',
      );
    });

    it('should skip already-cached assets', async () => {
      resolver.registerModuleAssets(MODULE_ID, {
        icon: '/uploads/icon.png',
        banner: '/uploads/banner.webp',
      });

      // icon is cached, banner is not
      mockCache.get.mockImplementation((key: string) => {
        if (key === `asset:${MODULE_ID}:icon`) {
          return { url: `${API_BASE}/uploads/icon.png`, prefetched: true };
        }
        return undefined;
      });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await resolver.prefetchModuleAssets(MODULE_ID);

      // Only banner should be fetched
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/uploads/banner.webp`);
    });

    it('should not cache on failed fetch (non-ok response)', async () => {
      resolver.registerModuleAssets(MODULE_ID, { icon: '/uploads/icon.png' });
      mockCache.get.mockReturnValue(undefined);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

      await resolver.prefetchModuleAssets(MODULE_ID);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully (no throw)', async () => {
      resolver.registerModuleAssets(MODULE_ID, { icon: '/uploads/icon.png' });
      mockCache.get.mockReturnValue(undefined);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(resolver.prefetchModuleAssets(MODULE_ID)).resolves.toBeUndefined();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should handle mixed success and failure', async () => {
      resolver.registerModuleAssets(MODULE_ID, {
        icon: '/uploads/icon.png',
        banner: '/uploads/banner.webp',
        screenshot: '/uploads/screenshot.png',
      });
      mockCache.get.mockReturnValue(undefined);

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true })       // icon succeeds
        .mockRejectedValueOnce(new Error('fail'))   // banner fails
        .mockResolvedValueOnce({ ok: true });       // screenshot succeeds

      await expect(resolver.prefetchModuleAssets(MODULE_ID)).resolves.toBeUndefined();

      // Only icon and screenshot cached
      expect(mockCache.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('multiple modules', () => {
    it('should isolate assets between modules', () => {
      const moduleA = 'com.vendor.moduleA';
      const moduleB = 'com.vendor.moduleB';

      resolver.registerModuleAssets(moduleA, { icon: '/uploads/a/icon.png' });
      resolver.registerModuleAssets(moduleB, { icon: '/uploads/b/icon.png' });

      expect(resolver.resolveAssetUrl(moduleA, 'asset://icon')).toBe(
        `${API_BASE}/uploads/a/icon.png`,
      );
      expect(resolver.resolveAssetUrl(moduleB, 'asset://icon')).toBe(
        `${API_BASE}/uploads/b/icon.png`,
      );
    });

    it('should unregister one module without affecting another', () => {
      const moduleA = 'com.vendor.moduleA';
      const moduleB = 'com.vendor.moduleB';

      resolver.registerModuleAssets(moduleA, { icon: '/uploads/a/icon.png' });
      resolver.registerModuleAssets(moduleB, { icon: '/uploads/b/icon.png' });

      resolver.unregisterModuleAssets(moduleA);

      expect(resolver.hasModuleAssets(moduleA)).toBe(false);
      expect(resolver.hasModuleAssets(moduleB)).toBe(true);
      expect(resolver.resolveAssetUrl(moduleB, 'asset://icon')).toBe(
        `${API_BASE}/uploads/b/icon.png`,
      );
    });
  });
});
