import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';

// Live connectivity status — backed by the OS network state on native
// (Android/iOS) and by navigator.onLine's connectivity events in a plain
// browser tab, via @capacitor/network's web shim.
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let handle;
    let cancelled = false;

    Network.getStatus().then(({ connected }) => {
      if (!cancelled) setIsOnline(connected);
    });

    Network.addListener('networkStatusChange', ({ connected }) => {
      setIsOnline(connected);
    }).then(h => {
      if (cancelled) h.remove();
      else handle = h;
    });

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  return isOnline;
}
