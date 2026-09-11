import { type ErrorBoundaryProps } from 'expo-router';
import { useLeaderEventsLayout } from '@/components/leader-navigation-context';
import LeaderEventsScreen from '@/components/leader/events-feed';
import { LeaderAttendanceList } from '@/components/leader/attendance-list';
import { LeaderLoadError } from '@/components/leader/query-state';

export default function LeaderAttendanceScreen() {
  const layout = useLeaderEventsLayout();
  return layout === 'split' ? <LeaderAttendanceList /> : <LeaderEventsScreen />;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const layout = useLeaderEventsLayout();
  return <LeaderLoadError title={layout === 'split' ? 'Attendance' : 'Events'} body="Couldn't load events." retry={retry} />;
}
