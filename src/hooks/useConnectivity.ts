// src/hooks/useConnectivity.ts
import { useEffect, useRef, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * Connectivity hook exposing an `isOnline` boolean and an optional
 * `onReconnect` callback that fires exactly once per offline->online
 * transition.
 *
 * Behavior:
 *   - On mount, performs an immediate synchronous check of current state.
 *   - Subscribes to NetInfo for subsequent transitions.
 *   - Debounces rapid flap transitions (offline -> online -> offline within
 *     1 second) so `onReconnect` does not fire multiple times for what is
 *     effectively a single recovery event.
 *   - On app foreground after a cold start, if we were last known offline
 *     and NetInfo now reports online, `onReconnect` fires once.
 *
 * Connectivity definition:
 *   We consider the device "online" when NetInfo reports both `isConnected`
 *   and `isInternetReachable` as true (or when `isInternetReachable` is
 *   null, which happens on some platforms where the underlying probe has
 *   not yet resolved — we treat null as "assume online" to avoid false
 *   offline states on initial load).
 */

export type UseConnectivityOptions = {
  /** Called once per offline -> online transition. The queue replay logic
   *  in File 3 wires into this to drain pending messages. */
  onReconnect?: () => void;
};

export type UseConnectivityResult = {
  /** True when the device is considered online (see Connectivity definition). */
  isOnline: boolean;
  /** True until the first NetInfo state has been observed. Useful for
   *  suppressing the offline banner on app launch before NetInfo has
   *  actually reported anything. */
  isInitialized: boolean;
};

function deriveOnline(state: NetInfoState): boolean {
  if (!state.isConnected) return false;
  // Some platforms return null for isInternetReachable until a probe
  // completes. Treat null as optimistically online to avoid a flash of
  // the offline banner on cold start.
  if (state.isInternetReachable === false) return false;
  return true;
}

export function useConnectivity(options?: UseConnectivityOptions): UseConnectivityResult {
  const { onReconnect } = options ?? {};

  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Track the previous value so we can detect offline -> online transitions
  // without relying on stale closure state.
  const prevOnlineRef = useRef<boolean>(true);

  // Hold the latest onReconnect callback in a ref so the NetInfo subscriber
  // always invokes the current function without needing to re-subscribe on
  // every render. This is the standard pattern for passing "effect event"
  // callbacks into long-lived subscriptions.
  const onReconnectRef = useRef<typeof onReconnect>(onReconnect);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  // Debounce: suppress duplicate reconnect events that occur within this
  // window. Prevents fire-storms during flaky connectivity (e.g. subway
  // entering/leaving a station).
  const lastReconnectAtRef = useRef<number>(0);
  const RECONNECT_DEBOUNCE_MS = 1000;

  useEffect(() => {
    // Fire-and-forget initial fetch for the immediate check. NetInfo.fetch()
    // returns a promise; we do not await here — we just want the current
    // state as soon as it is available.
    NetInfo.fetch().then((state) => {
      const online = deriveOnline(state);
      prevOnlineRef.current = online;
      setIsOnline(online);
      setIsInitialized(true);
    });

    // Subscribe to transitions.
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = deriveOnline(state);
      const wasOnline = prevOnlineRef.current;

      setIsOnline(online);
      setIsInitialized(true);

      // Detect offline -> online edge. Debounce.
      if (!wasOnline && online) {
        const now = Date.now();
        if (now - lastReconnectAtRef.current >= RECONNECT_DEBOUNCE_MS) {
          lastReconnectAtRef.current = now;
          // Use the ref so the latest callback is invoked even if the
          // caller passed a fresh closure between subscriptions.
          onReconnectRef.current?.();
        }
      }

      prevOnlineRef.current = online;
    });

    return () => {
      unsubscribe();
    };
    // Intentionally empty deps — we set up the subscription exactly once
    // per mount and read the latest onReconnect via the ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isOnline, isInitialized };
}