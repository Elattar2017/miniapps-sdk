/**
 * AnalyticsCollector Test Suite
 */

import { AnalyticsCollector } from '../../../src/kernel/telemetry/AnalyticsCollector';
import type { AnalyticsEvent } from '../../../src/kernel/telemetry/AnalyticsCollector';
import { DataBus } from '../../../src/kernel/communication/DataBus';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AnalyticsCollector', () => {
  let collector: AnalyticsCollector;
  let dataBus: DataBus;

  beforeEach(() => {
    dataBus = new DataBus();
    collector = new AnalyticsCollector({ dataBus });
  });

  describe('trackScreenView()', () => {
    it('stores event with moduleId, screenId, and timestamp', () => {
      collector.trackScreenView('mod-1', 'screen-home');

      const views = collector.getScreenViews();
      expect(views).toHaveLength(1);
      expect(views[0].type).toBe('screen_view');
      expect(views[0].moduleId).toBe('mod-1');
      expect(views[0].screenId).toBe('screen-home');
      expect(views[0].timestamp).toBeGreaterThan(0);
    });

    it('stores metadata correctly when provided', () => {
      const meta = { referrer: 'deep-link', campaign: 'promo' };
      collector.trackScreenView('mod-1', 'screen-home', meta);

      const views = collector.getScreenViews();
      expect(views[0].metadata).toEqual(meta);
    });
  });

  describe('trackInteraction()', () => {
    it('stores event with action type and element', () => {
      collector.trackInteraction('mod-1', 'screen-home', 'tap', 'btn-submit');

      const interactions = collector.getInteractions();
      expect(interactions).toHaveLength(1);
      expect(interactions[0].type).toBe('interaction');
      expect(interactions[0].moduleId).toBe('mod-1');
      expect(interactions[0].screenId).toBe('screen-home');
      expect(interactions[0].action).toBe('tap');
      expect(interactions[0].elementId).toBe('btn-submit');
    });
  });

  describe('trackConversion()', () => {
    it('stores funnel step event', () => {
      collector.trackConversion('mod-1', 'onboarding', 2, { variant: 'A' });

      const metrics = collector.getMetrics();
      expect(metrics.conversions).toBe(1);
    });
  });

  describe('trackTiming()', () => {
    it('stores timing event', () => {
      collector.trackTiming('mod-1', 'api_latency', 150);

      const metrics = collector.getMetrics();
      expect(metrics.avgTiming).toBe(150);
    });
  });

  describe('getScreenViews()', () => {
    it('returns all screen views when no moduleId filter', () => {
      collector.trackScreenView('mod-1', 'screen-a');
      collector.trackScreenView('mod-2', 'screen-b');

      expect(collector.getScreenViews()).toHaveLength(2);
    });

    it('returns filtered views by moduleId', () => {
      collector.trackScreenView('mod-1', 'screen-a');
      collector.trackScreenView('mod-2', 'screen-b');
      collector.trackScreenView('mod-1', 'screen-c');

      const views = collector.getScreenViews('mod-1');
      expect(views).toHaveLength(2);
      expect(views.every(v => v.moduleId === 'mod-1')).toBe(true);
    });
  });

  describe('getInteractions()', () => {
    it('returns interaction history', () => {
      collector.trackInteraction('mod-1', 'screen-a', 'tap', 'btn-1');
      collector.trackInteraction('mod-1', 'screen-a', 'scroll');
      collector.trackInteraction('mod-2', 'screen-b', 'tap', 'btn-2');

      expect(collector.getInteractions()).toHaveLength(3);
      expect(collector.getInteractions('mod-1')).toHaveLength(2);
    });
  });

  describe('getMetrics()', () => {
    it('returns aggregated counts and averages', () => {
      collector.trackScreenView('mod-1', 'screen-a');
      collector.trackScreenView('mod-1', 'screen-b');
      collector.trackInteraction('mod-1', 'screen-a', 'tap');
      collector.trackConversion('mod-1', 'funnel-1', 1);
      collector.trackTiming('mod-1', 'load', 100);
      collector.trackTiming('mod-1', 'render', 200);

      const metrics = collector.getMetrics();
      expect(metrics.screenViews).toBe(2);
      expect(metrics.interactions).toBe(1);
      expect(metrics.conversions).toBe(1);
      expect(metrics.avgTiming).toBe(150);
    });

    it('returns zero counts on empty state', () => {
      const metrics = collector.getMetrics();
      expect(metrics.screenViews).toBe(0);
      expect(metrics.interactions).toBe(0);
      expect(metrics.conversions).toBe(0);
      expect(metrics.avgTiming).toBe(0);
    });
  });

  describe('flush()', () => {
    it('sends buffered events to apiProxy', async () => {
      const mockRequest = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      const apiProxy = { request: mockRequest } as any;
      const col = new AnalyticsCollector({ apiProxy });

      col.trackScreenView('mod-1', 'screen-a');
      col.trackInteraction('mod-1', 'screen-a', 'tap');

      await col.flush();

      expect(mockRequest).toHaveBeenCalledWith('/api/sdk/analytics', {
        method: 'POST',
        body: { events: expect.any(Array) },
      });
      expect(col.getMetrics().screenViews).toBe(0);
    });

    it('works without apiProxy (no crash)', async () => {
      const col = new AnalyticsCollector({});
      col.trackScreenView('mod-1', 'screen-a');

      await expect(col.flush()).resolves.toBeUndefined();
      expect(col.getMetrics().screenViews).toBe(1);
    });
  });

  describe('clear()', () => {
    it('resets all buffers', () => {
      collector.trackScreenView('mod-1', 'screen-a');
      collector.trackInteraction('mod-1', 'screen-a', 'tap');
      collector.trackConversion('mod-1', 'funnel-1', 1);
      collector.trackTiming('mod-1', 'load', 100);

      collector.clear();

      const metrics = collector.getMetrics();
      expect(metrics.screenViews).toBe(0);
      expect(metrics.interactions).toBe(0);
      expect(metrics.conversions).toBe(0);
      expect(metrics.avgTiming).toBe(0);
    });
  });

  describe('buffer overflow', () => {
    it('enforces max buffer size (oldest events dropped)', () => {
      const col = new AnalyticsCollector({ maxBufferSize: 5 });

      for (let i = 0; i < 7; i++) {
        col.trackScreenView('mod-' + i, 'screen-' + i);
      }

      const views = col.getScreenViews();
      expect(views).toHaveLength(5);
      expect(views[0].moduleId).toBe('mod-2');
      expect(views[4].moduleId).toBe('mod-6');
    });

    it('buffer does not grow beyond maxBufferSize', () => {
      const col = new AnalyticsCollector({ maxBufferSize: 3 });

      for (let i = 0; i < 100; i++) {
        col.trackScreenView('mod-' + i, 'screen-' + i);
      }

      const views = col.getScreenViews();
      expect(views).toHaveLength(3);
    });
  });

  describe('DataBus events', () => {
    it('publishes events on track calls', () => {
      const publishSpy = jest.spyOn(dataBus, 'publish');

      collector.trackScreenView('mod-1', 'screen-a');
      expect(publishSpy).toHaveBeenCalledWith('sdk:analytics:screen_view', expect.objectContaining({
        type: 'screen_view',
        moduleId: 'mod-1',
      }));

      collector.trackInteraction('mod-1', 'screen-a', 'tap');
      expect(publishSpy).toHaveBeenCalledWith('sdk:analytics:interaction', expect.objectContaining({
        type: 'interaction',
        action: 'tap',
      }));

      collector.trackConversion('mod-1', 'funnel-1', 1);
      expect(publishSpy).toHaveBeenCalledWith('sdk:analytics:conversion', expect.objectContaining({
        type: 'conversion',
        funnelId: 'funnel-1',
      }));
    });
  });

  describe('multiple modules', () => {
    it('tracks modules independently', () => {
      collector.trackScreenView('mod-a', 'screen-1');
      collector.trackScreenView('mod-b', 'screen-2');
      collector.trackInteraction('mod-a', 'screen-1', 'tap');
      collector.trackInteraction('mod-b', 'screen-2', 'scroll');
      collector.trackInteraction('mod-b', 'screen-2', 'tap');

      expect(collector.getScreenViews('mod-a')).toHaveLength(1);
      expect(collector.getScreenViews('mod-b')).toHaveLength(1);
      expect(collector.getInteractions('mod-a')).toHaveLength(1);
      expect(collector.getInteractions('mod-b')).toHaveLength(2);
    });
  });
});
