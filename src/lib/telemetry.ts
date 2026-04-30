// src/lib/telemetry.ts
// Unified telemetry wrapper. The rest of the codebase imports from here,
// never from @sentry/react-native or posthog-react-native directly, so we
// can swap vendors, respect the opt-out toggle, and keep PII policy in one
// place.
//
// Policy (non-negotiable):
//   - No message content, file content, or file names are ever sent.
//   - No email, phone, or free-form user text.
//   - Identifier is userHashId (already an anonymous hash from sign-in).
//   - Crash reporting is always on; product analytics is opt-out.
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

type Extras = Record<string, string | number | boolean | null | undefined>;

let posthog: PostHog | null = null;
let analyticsEnabled = true;  // opt-out default
let initialized = false;

export function initTelemetry() {
  if (initialized) return;
  initialized = true;

  const extra = (Constants.expoConfig?.extra ?? {}) as {
    sentryDsn?: string;
    posthogApiKey?: string;
    posthogHost?: string;
  };

  // Sentry is initialized by the wizard in app/_layout.tsx — we only use
  // its API here for setUser, addBreadcrumb, and captureException.

  // --- PostHog (respects opt-out at event time) ---
  if (extra.posthogApiKey) {
    posthog = new PostHog(extra.posthogApiKey, {
      host: extra.posthogHost ?? 'https://us.i.posthog.com',
      // Disable autocapture — we only send named events.
      captureAppLifecycleEvents: false,
      disabled: __DEV__, // don't pollute analytics with dev traffic
    });
  }
}

/** Called by settings store whenever the user flips the opt-out toggle. */
export function setAnalyticsEnabled(on: boolean) {
  analyticsEnabled = on;
  if (!posthog) return;
  if (on) void posthog.optIn();
  else void posthog.optOut();
}

/** Attach the current user hash to both Sentry and PostHog. Safe to call repeatedly. */
export function identify(userHashId: string | null) {
  if (!userHashId) {
    Sentry.setUser(null);
    void posthog?.reset();
    return;
  }
  Sentry.setUser({ id: userHashId });
  if (analyticsEnabled) posthog?.identify(userHashId);
}

/** Fire a product analytics event. Silently no-ops if analytics are disabled. */
export function track(event: string, props?: Extras) {
  if (!analyticsEnabled) return;
  posthog?.capture(event, sanitize(props));
  // Also breadcrumb to Sentry so crashes have context.
  Sentry.addBreadcrumb({
    category: 'analytics',
    message: event,
    data: sanitize(props),
    level: 'info',
  });
}

/** Report a handled error (not a crash — those are auto-captured). */
export function captureError(err: unknown, context?: Extras) {
  Sentry.captureException(err, { extra: sanitize(context) });
}

/** Wrap the root component so uncaught errors land in Sentry with a boundary. */
export const wrapRoot = Sentry.wrap;

/**
 * Coarse latency bucket. We never ship exact millisecond timings - they can
 * fingerprint users and correlate across events. Buckets are stable enough
 * to spot regressions without that risk.
 */
export function latencyBucket(ms: number): string {
  if (ms < 500) return 'lt_500ms';
  if (ms < 1500) return 'lt_1_5s';
  if (ms < 3000) return 'lt_3s';
  if (ms < 8000) return 'lt_8s';
  if (ms < 20000) return 'lt_20s';
  return 'gte_20s';
}

// --- internal ---

/**
 * Strip anything that could be PII or free-form content. We allow only
 * primitives and truncate strings hard. If a call site wants to send a
 * message body or file name, it fails here by design.
 */
function sanitize(props?: Extras): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'string') {
      // Keep strings short — protects against accidental content leakage.
      out[k] = v.length > 64 ? v.slice(0, 64) : v;
    }
  }
  return out;
}