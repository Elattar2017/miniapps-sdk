/**
 * Media Pick Lifecycle Integration Test
 *
 * Verifies the end-to-end lifecycle:
 * MockMediaModule → captureImage/pickFromLibrary → MediaResult → state storage
 */

import { MockMediaModule, getNativeModule } from '../../src/adapters/BridgeAdapter';
import type { MediaResult } from '../../src/types';

// Suppress console output
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Media Pick Lifecycle', () => {
  describe('MockMediaModule resolution', () => {
    it('getNativeModule returns MediaModule', () => {
      const mod = getNativeModule('MediaModule');
      expect(mod).toBeDefined();
      expect(mod.isMock).toBe(true);
    });

    it('MediaModule has all required methods', () => {
      const mod = getNativeModule('MediaModule');
      expect(typeof mod.captureImage).toBe('function');
      expect(typeof mod.pickFromLibrary).toBe('function');
      expect(typeof mod.captureFromView).toBe('function');
      expect(typeof mod.checkCameraPermission).toBe('function');
      expect(typeof mod.checkLibraryPermission).toBe('function');
      expect(typeof mod.requestCameraPermission).toBe('function');
      expect(typeof mod.requestLibraryPermission).toBe('function');
    });
  });

  describe('captureImage lifecycle', () => {
    it('captures image and returns valid MediaResult', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.captureImage(JSON.stringify({
        quality: 0.8,
        maxDimension: 1920,
      }));

      const result: MediaResult = JSON.parse(resultStr);
      expect(result.uri).toBeTruthy();
      expect(result.fileName).toBeTruthy();
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('includes base64 when requested', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.captureImage(JSON.stringify({
        includeBase64: true,
      }));

      const result: MediaResult = JSON.parse(resultStr);
      expect(result.base64).toBeDefined();
      expect(typeof result.base64).toBe('string');
      expect(result.base64!.length).toBeGreaterThan(0);
    });

    it('omits base64 when not requested', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.captureImage(JSON.stringify({
        includeBase64: false,
      }));

      const result: MediaResult = JSON.parse(resultStr);
      expect(result.base64).toBeUndefined();
    });
  });

  describe('pickFromLibrary lifecycle', () => {
    it('picks single image', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.pickFromLibrary(JSON.stringify({
        multiple: false,
      }));

      const result: MediaResult = JSON.parse(resultStr);
      expect(result.uri).toBeTruthy();
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('picks multiple images', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.pickFromLibrary(JSON.stringify({
        multiple: true,
        maxCount: 3,
      }));

      const results: MediaResult[] = JSON.parse(resultStr);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
      for (const r of results) {
        expect(r.uri).toBeTruthy();
        expect(r.mimeType).toBe('image/jpeg');
      }
    });
  });

  describe('captureFromView lifecycle', () => {
    it('captures frame from named camera view', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.captureFromView('cam1', JSON.stringify({
        quality: 0.8,
      }));

      const result: MediaResult = JSON.parse(resultStr);
      expect(result.uri).toBeTruthy();
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('includes base64 when requested', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.captureFromView('cam1', JSON.stringify({
        includeBase64: true,
      }));

      const result: MediaResult = JSON.parse(resultStr);
      expect(result.base64).toBeDefined();
    });
  });

  describe('permission flow', () => {
    it('grants camera permission in mock', async () => {
      const media = new MockMediaModule();
      expect(await media.checkCameraPermission()).toBe('granted');
      expect(await media.requestCameraPermission()).toBe('granted');
    });

    it('grants library permission in mock', async () => {
      const media = new MockMediaModule();
      expect(await media.checkLibraryPermission()).toBe('granted');
      expect(await media.requestLibraryPermission()).toBe('granted');
    });
  });

  describe('state storage simulation', () => {
    it('MediaResult can be stored and retrieved from a state map', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.captureImage('{}');
      const result: MediaResult = JSON.parse(resultStr);

      // Simulate moduleState storage
      const moduleState: Record<string, unknown> = {};
      const responseKey = 'profilePhoto';
      moduleState[responseKey] = result;

      expect(moduleState[responseKey]).toBeDefined();
      const stored = moduleState[responseKey] as MediaResult;
      expect(stored.uri).toBe(result.uri);
      expect(stored.fileName).toBe(result.fileName);
      expect(stored.width).toBe(result.width);
      expect(stored.height).toBe(result.height);
    });

    it('multiple MediaResults can be stored as array', async () => {
      const media = new MockMediaModule();
      const resultStr = await media.pickFromLibrary(JSON.stringify({ multiple: true }));
      const results: MediaResult[] = JSON.parse(resultStr);

      const moduleState: Record<string, unknown> = {};
      moduleState['selectedPhotos'] = results;

      const stored = moduleState['selectedPhotos'] as MediaResult[];
      expect(Array.isArray(stored)).toBe(true);
      expect(stored.length).toBe(results.length);
    });
  });
});
