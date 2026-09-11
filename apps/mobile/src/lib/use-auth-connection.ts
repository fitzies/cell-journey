import { useConvexConnectionState } from 'convex/react';
import { useEffect, useState } from 'react';
import { authConnectionMessage, isOfflineNow } from './email-auth';

export function useAuthConnection(pending: boolean) {
  const { isWebSocketConnected } = useConvexConnectionState();
  const [takingLonger, setTakingLonger] = useState(false);
  const [previousPending, setPreviousPending] = useState(pending);

  if (pending !== previousPending) {
    setPreviousPending(pending);
    setTakingLonger(false);
  }

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTakingLonger(true), 10_000);
    return () => clearTimeout(timer);
  }, [pending]);

  const connected = isWebSocketConnected && !isOfflineNow();
  return {
    connected,
    message: authConnectionMessage(connected, pending, takingLonger),
  };
}
