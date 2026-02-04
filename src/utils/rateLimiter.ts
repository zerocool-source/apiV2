interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

export function createRateLimiter(name: string, config: RateLimiterConfig) {
  const store = new Map<string, RateLimitEntry>();
  stores.set(name, store);

  return {
    check(key: string): { allowed: boolean; retryAfterSeconds?: number } {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now >= entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true };
      }

      if (entry.count >= config.maxRequests) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, retryAfterSeconds };
      }

      entry.count++;
      return { allowed: true };
    },

    cleanup() {
      const now = Date.now();
      for (const [key, entry] of store.entries()) {
        if (now >= entry.resetAt) {
          store.delete(key);
        }
      }
    },
  };
}

const TEN_MINUTES = 10 * 60 * 1000;

export const estimateGenerateLimiter = createRateLimiter('estimate-generate-user', {
  windowMs: TEN_MINUTES,
  maxRequests: 10,
});

export const estimateGenerateIpLimiter = createRateLimiter('estimate-generate-ip', {
  windowMs: TEN_MINUTES,
  maxRequests: 30,
});

export const estimateSelectionLimiter = createRateLimiter('estimate-selection', {
  windowMs: TEN_MINUTES,
  maxRequests: 60,
});

export const productSearchLimiter = createRateLimiter('product-search', {
  windowMs: TEN_MINUTES,
  maxRequests: 120,
});

setInterval(() => {
  estimateGenerateLimiter.cleanup();
  estimateGenerateIpLimiter.cleanup();
  estimateSelectionLimiter.cleanup();
  productSearchLimiter.cleanup();
}, 60000);
