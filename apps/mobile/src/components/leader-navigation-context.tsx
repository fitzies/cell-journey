import { useQuery } from 'convex/react';
import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { useGroups } from '@/components/group-context';
import { api } from '@/lib/api';

type LeaderEventsLayout = 'split' | 'combined';
const LeaderNavigationContext = createContext<LeaderEventsLayout | null>(null);

export function LeaderNavigationProvider({ children }: PropsWithChildren) {
  const { context } = useGroups();
  const [layout, setLayout] = useState<LeaderEventsLayout | null>(null);
  const config = useQuery(api.appConfig.mobile, context?.ledGroups.length && layout === null ? {} : 'skip');

  // Mounted above the tab layouts: switching modes/groups or opening a modal
  // cannot apply a remote navigation change in the middle of an attendance draft.
  // A fresh JS/app session reads the setting again.
  if (config && layout === null) setLayout(config.leaderEventsLayout);

  return <LeaderNavigationContext.Provider value={layout}>{children}</LeaderNavigationContext.Provider>;
}

export function useLeaderEventsLayout() {
  return useContext(LeaderNavigationContext);
}
