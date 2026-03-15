/**
 * BridgeAdapter MediaModule Test Suite
 */

import {
  getNativeModule,
  isNativeModuleAvailable,
  MockMediaModule,
} from '../../src/adapters/BridgeAdapter';

// Suppress console output
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe('getNativeModule MediaModule', () => {
  it('returns a MediaModule instance', () => {
    const media = getNativeModule('MediaModule');
    expect(media).toBeDefined();
    expect(typeof media.captureImage).toBe('function');
    expect(typeof media.pickFromLibrary).toBe('function');
    expect(typeof media.captureFromView).toBe('function');
    expect(typeof media.checkCameraPermission).toBe('function');
    expect(typeof media.checkLibraryPermission).toBe('function');
    expect(typeof media.requestCameraPermission).toBe('function');
    expect(typeof media.requestLibraryPermission).toBe('function');
  });

  it('returns a MediaModule with isMock = true', () => {
    const media = getNativeModule('MediaModule');
    expect(media.isMock).toBe(true);
  });
});

describe('MockMediaModule', () => {
  let media: MockMediaModule;
  beforeEach(() => { media = new MockMediaModule(); });

  describe('captureImage', () => {
    it('returns a valid MediaResult JSON string', async () => {
      const result = JSON.parse(await media.captureImage('{}'));
      expect(result.uri).toMatch(/^data:image\/jpeg;base64,/);
      expect(result.fileName).toBeDefined();
      expect(result.mimeType).toBe('image/jpeg');
      expect(typeof result.width).toBe('number');
      expect(typeof result.height).toBe('number');
      expect(typeof result.fileSize).toBe('number');
      expect(typeof result.timestamp).toBe('number');
    });

    it('includes base64 when requested', async () => {
      const result = JSON.parse(await media.captureImage(JSON.stringify({ includeBase64: true })));
      expect(result.base64).toBeDefined();
      expect(typeof result.base64).toBe('string');
    });

    it('does not include base64 by default', async () => {
      const result = JSON.parse(await media.captureImage('{}'));
      expect(result.base64).toBeUndefined();
    });
  });

  describe('pickFromLibrary', () => {
    it('returns a single MediaResult for non-multiple', async () => {
      const result = JSON.parse(await media.pickFromLibrary('{}'));
      expect(result.uri).toMatch(/^data:image\/jpeg;base64,/);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('returns an array when multiple is true', async () => {
      const result = JSON.parse(await media.pickFromLibrary(JSON.stringify({ multiple: true })));
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].uri).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('respects maxCount for multiple selections', async () => {
      const result = JSON.parse(await media.pickFromLibrary(JSON.stringify({ multiple: true, maxCount: 2 })));
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('captureFromView', () => {
    it('returns a valid MediaResult for a given cameraId', async () => {
      const result = JSON.parse(await media.captureFromView('cam1', '{}'));
      expect(result.uri).toMatch(/^data:image\/jpeg;base64,/);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('includes base64 when requested', async () => {
      const result = JSON.parse(await media.captureFromView('cam1', JSON.stringify({ includeBase64: true })));
      expect(result.base64).toBeDefined();
    });
  });

  describe('permissions', () => {
    it('checkCameraPermission returns granted', async () => {
      expect(await media.checkCameraPermission()).toBe('granted');
    });

    it('checkLibraryPermission returns granted', async () => {
      expect(await media.checkLibraryPermission()).toBe('granted');
    });

    it('requestCameraPermission returns granted', async () => {
      expect(await media.requestCameraPermission()).toBe('granted');
    });

    it('requestLibraryPermission returns granted', async () => {
      expect(await media.requestLibraryPermission()).toBe('granted');
    });
  });
});
