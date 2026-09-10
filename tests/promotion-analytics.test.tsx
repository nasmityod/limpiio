/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, act } from '@testing-library/react';
import PromotionLink from '@/app/components/PromotionLink';
import { trackSelectPromotion } from '@/app/components/TrackPromotion';

const trackMock = vi.fn<(...args: unknown[]) => boolean>(() => true);
const consentListeners = new Set<(c: 'granted' | 'denied') => void>();

vi.mock('@/lib/ga4', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ga4')>('@/lib/ga4');
  return {
    ...actual,
    track: (...args: unknown[]) => trackMock(...args),
    onAnalyticsConsentChange: (
      listener: (consent: 'granted' | 'denied') => void,
    ) => {
      consentListeners.add(listener);
      return () => consentListeners.delete(listener);
    },
  };
});

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    className,
    ref,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
    ref?: React.Ref<HTMLAnchorElement>;
  }) => (
    <a href={href} onClick={onClick} className={className} ref={ref}>
      {children}
    </a>
  ),
}));

const promotion = {
  promotion_id: 'promo-1',
  promotion_name: 'Banner verano',
  creative_name: 'summer',
  creative_slot: 'home_promo_banners_1',
};

type IoCallback = IntersectionObserverCallback;

describe('promotion analytics (IntersectionObserver)', () => {
  let ioCallback: IoCallback | null = null;
  let observed: Element | null = null;

  beforeEach(() => {
    trackMock.mockClear();
    trackMock.mockReturnValue(true);
    consentListeners.clear();
    ioCallback = null;
    observed = null;

    class MockIntersectionObserver {
      constructor(cb: IoCallback) {
        ioCallback = cb;
      }
      observe(el: Element) {
        observed = el;
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds = [0.5];
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function emitRatio(ratio: number, intersecting = ratio >= 0.5) {
    act(() => {
      ioCallback?.(
        [
          {
            isIntersecting: intersecting,
            intersectionRatio: ratio,
            target: observed as Element,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: 0,
          },
        ],
        {} as IntersectionObserver,
      );
    });
  }

  it('no envía view_promotion mientras está fuera del viewport', () => {
    render(
      <PromotionLink href="/productos" promotion={promotion}>
        Ver
      </PromotionLink>,
    );
    emitRatio(0, false);
    expect(
      trackMock.mock.calls.filter((c) => c[0] === 'view_promotion'),
    ).toHaveLength(0);
  });

  it('envía cuando supera el threshold 0.5', () => {
    render(
      <PromotionLink href="/productos" promotion={promotion}>
        Ver
      </PromotionLink>,
    );
    emitRatio(0.5, true);
    expect(
      trackMock.mock.calls.filter((c) => c[0] === 'view_promotion'),
    ).toHaveLength(1);
  });

  it('no duplica al entrar y salir', () => {
    render(
      <PromotionLink href="/productos" promotion={promotion}>
        Ver
      </PromotionLink>,
    );
    emitRatio(0.6, true);
    emitRatio(0, false);
    emitRatio(0.9, true);
    expect(
      trackMock.mock.calls.filter((c) => c[0] === 'view_promotion'),
    ).toHaveLength(1);
  });

  it('no marca como enviada cuando track devuelve false', () => {
    trackMock.mockReturnValue(false);
    render(
      <PromotionLink href="/productos" promotion={promotion}>
        Ver
      </PromotionLink>,
    );
    emitRatio(0.7, true);
    expect(
      trackMock.mock.calls.filter((c) => c[0] === 'view_promotion'),
    ).toHaveLength(1);

    trackMock.mockReturnValue(true);
    emitRatio(0, false);
    emitRatio(0.8, true);
    expect(
      trackMock.mock.calls.filter((c) => c[0] === 'view_promotion'),
    ).toHaveLength(2);
  });

  it('reintenta al conceder consentimiento si sigue visible', () => {
    trackMock.mockReturnValue(false);
    render(
      <PromotionLink href="/productos" promotion={promotion}>
        Ver
      </PromotionLink>,
    );
    emitRatio(0.7, true);
    expect(consentListeners.size).toBeGreaterThan(0);

    trackMock.mockReturnValue(true);
    act(() => {
      consentListeners.forEach((l) => l('granted'));
    });
    expect(
      trackMock.mock.calls.filter((c) => c[0] === 'view_promotion'),
    ).toHaveLength(2);
  });

  it('select_promotion continúa funcionando al clic', () => {
    const { getByText } = render(
      <PromotionLink href="/productos" promotion={promotion}>
        Ver
      </PromotionLink>,
    );
    fireEvent.click(getByText('Ver'));
    expect(
      trackMock.mock.calls.some((c) => c[0] === 'select_promotion'),
    ).toBe(true);
  });

  it('trackSelectPromotion usa payload correcto', () => {
    trackSelectPromotion(promotion);
    expect(trackMock).toHaveBeenCalledWith(
      'select_promotion',
      expect.objectContaining({
        promotion_id: 'promo-1',
        promotion_name: 'Banner verano',
        creative_name: 'summer',
        creative_slot: 'home_promo_banners_1',
      }),
    );
  });
});
