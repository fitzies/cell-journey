import { StyleSheet, View, type DimensionValue } from 'react-native';
import { radius, useAppTheme } from '@/constants/tokens';
import { Bone, BoneCard, BoneLines, DateBone, SkeletonPulse } from './skeleton';

// Each skeleton mirrors the loaded screen's layout so content lands where the placeholders were.

function SectionHeadingBone({ width = 130, trailing = false }: { width?: number; trailing?: boolean }) {
  return (
    <View style={styles.sectionHeading}>
      <Bone width={width} height={18} round={9} />
      {trailing ? <Bone width={64} height={12} round={6} /> : null}
    </View>
  );
}

function EventCardBone() {
  return (
    <BoneCard style={styles.eventCard}>
      <DateBone />
      <BoneLines widths={['62%', '82%', '48%']} />
    </BoneCard>
  );
}

function HistoryRowBone() {
  const t = useAppTheme();
  return (
    <View style={[styles.historyRow, { borderBottomColor: t.track }]}>
      <DateBone />
      <BoneLines widths={['58%', '40%', '24%']} />
    </View>
  );
}

export function AttendanceOverviewSkeleton() {
  return (
    <SkeletonPulse label="Loading attendance" style={styles.overview}>
      <View style={styles.statRow}>
        {[0, 1, 2].map((index) => (
          <BoneCard key={index} style={styles.statCard}>
            <Bone width="60%" height={11} />
            <Bone width="50%" height={24} round={8} />
            <Bone width="80%" height={10} />
          </BoneCard>
        ))}
      </View>
      <BoneCard style={styles.chartCard}>
        <Bone width="35%" height={11} />
        <Bone width="45%" height={30} round={9} />
        <View style={styles.chartBars}>
          {[0.55, 0.8, 0.4, 0.7, 0.9, 0.6, 0.75, 0.5, 0.85, 0.65].map((value, index) => (
            <Bone key={index} width={14} height={Math.round(value * 120)} round={4} />
          ))}
        </View>
      </BoneCard>
    </SkeletonPulse>
  );
}

export function LeaderHomeSkeleton({ showAttendance = true }: { showAttendance?: boolean }) {
  return (
    <>
      <SkeletonPulse label="Loading your group">
        <Bone width={150} height={14} />
        <Bone height={46} round={radius.pill} style={styles.primaryAction} />
        <View style={styles.section}>
          <SectionHeadingBone width={140} />
          <BoneCard style={styles.nextCard}>
            <DateBone large />
            <BoneLines widths={['70%', '52%', '64%']} gap={11} />
          </BoneCard>
        </View>
      </SkeletonPulse>
      {showAttendance ? (
        <View style={styles.section}>
          <SkeletonPulse label="Loading attendance"><SectionHeadingBone width={150} /></SkeletonPulse>
          <AttendanceOverviewSkeleton />
        </View>
      ) : null}
    </>
  );
}

// Leader "Upcoming Events" (combined feed and planned list).
export function LeaderEventsSkeleton({ headings = true }: { headings?: boolean }) {
  return (
    <SkeletonPulse label="Loading events">
      {headings ? <Bone width={120} height={11} style={styles.groupName} /> : null}
      {headings ? <SectionHeadingBone width={150} trailing /> : null}
      <View style={styles.feed}>
        {[0, 1, 2, 3].map((index) => <EventCardBone key={index} />)}
      </View>
    </SkeletonPulse>
  );
}

export function LeaderAttendanceListSkeleton() {
  const t = useAppTheme();
  return (
    <SkeletonPulse label="Loading events">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <View key={index} style={[styles.attendanceRow, { borderBottomColor: t.line }]}>
          <BoneLines widths={['45%', '70%']} gap={8} lineHeight={12} />
          <Bone width={128} height={46} round={radius.pill} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

const MEMBER_NAME_WIDTHS: DimensionValue[] = ['48%', '36%', '56%', '42%', '52%', '38%'];

export function MembersSkeleton() {
  const t = useAppTheme();
  return (
    <SkeletonPulse label="Loading members">
      <Bone height={44} round={radius.pill} />
      <View style={styles.membersSummary}>
        <Bone width={110} height={12} />
        <Bone width={150} height={12} />
      </View>
      <View style={styles.membersSection}>
        <View style={styles.sectionHeading}>
          <Bone width={70} height={18} round={9} />
          <Bone width={24} height={14} />
        </View>
        {MEMBER_NAME_WIDTHS.map((_, index) => (
          <View key={index} style={[styles.memberRow, { borderBottomColor: t.line }]}>
            <Bone width={44} height={44} round={22} />
            <Bone width={MEMBER_NAME_WIDTHS[index]} height={14} />
          </View>
        ))}
      </View>
    </SkeletonPulse>
  );
}

export function ProfileSkeleton() {
  const t = useAppTheme();
  return (
    <SkeletonPulse label="Loading profile">
      <View style={styles.identity}>
        <Bone width={72} height={72} round={36} />
        <Bone width={160} height={22} round={8} />
        <Bone width={70} height={13} />
      </View>
      <View style={[styles.profileTabs, { borderBottomColor: t.track }]}>
        <Bone width={56} height={14} style={styles.profileTab} />
        <Bone width={64} height={14} style={styles.profileTab} />
      </View>
      {[0, 1, 2, 3].map((index) => (
        <View key={index}>
          <View style={styles.profileRow}>
            <Bone width={36} height={36} round={12} />
            <BoneLines widths={['28%', '55%']} gap={8} lineHeight={12} />
          </View>
          <View style={[styles.divider, { backgroundColor: t.track }]} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

export function JoinRequestsSkeleton() {
  return (
    <SkeletonPulse label="Loading join requests" style={styles.feed}>
      {[0, 1, 2].map((index) => (
        <BoneCard key={index} style={styles.requestCard}>
          <View style={styles.requestTop}>
            <Bone width={42} height={42} round={15} />
            <BoneLines widths={['50%', '75%']} gap={8} lineHeight={12} />
          </View>
          <View style={styles.requestActions}>
            <Bone width="auto" height={46} round={radius.pill} style={styles.requestButton} />
            <Bone width="auto" height={46} round={radius.pill} style={styles.requestButton} />
          </View>
        </BoneCard>
      ))}
    </SkeletonPulse>
  );
}

export function MemberHomeSkeleton() {
  return (
    <SkeletonPulse label="Loading your group">
      <SectionHeadingBone width={140} trailing />
      <EventCardBone />
      <View style={styles.section}>
        <SectionHeadingBone width={150} />
        <BoneCard style={styles.summaryCard}>
          <BoneLines widths={['45%', '70%']} />
          <Bone width={56} height={26} round={8} />
        </BoneCard>
      </View>
      <View style={styles.section}>
        <SectionHeadingBone width={160} />
        {[0, 1, 2].map((index) => <HistoryRowBone key={index} />)}
      </View>
    </SkeletonPulse>
  );
}

export function MemberScheduleSkeleton() {
  return (
    <SkeletonPulse label="Loading events">
      <View style={styles.overviewRow}>
        <Bone width={110} height={16} />
        <Bone width={80} height={11} />
      </View>
      <SectionHeadingBone width={140} />
      <EventCardBone />
      <View style={styles.section}>
        <SectionHeadingBone width={150} trailing />
        <View style={styles.feed}>
          {[0, 1, 2].map((index) => <EventCardBone key={index} />)}
        </View>
      </View>
    </SkeletonPulse>
  );
}

export function MemberAttendanceSkeleton() {
  return (
    <SkeletonPulse label="Loading attendance">
      <BoneCard style={styles.statSummary}>
        <View style={styles.statTop}>
          <BoneLines widths={['45%', '70%']} />
          <Bone width={72} height={36} round={10} />
        </View>
        <View style={styles.trendRow}>
          {Array.from({ length: 12 }, (_, index) => <Bone key={index} width="auto" height={8} round={4} style={styles.trendBar} />)}
        </View>
      </BoneCard>
      <View style={styles.section}>
        <SectionHeadingBone width={80} trailing />
        {[0, 1, 2, 3, 4].map((index) => <HistoryRowBone key={index} />)}
      </View>
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 30 },
  sectionHeading: { minHeight: 24, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  primaryAction: { marginTop: 20 },
  nextCard: { minHeight: 132, paddingHorizontal: 18, paddingVertical: 20, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', gap: 16 },
  eventCard: { minHeight: 96, paddingVertical: 13, paddingLeft: 15, paddingRight: 13, flexDirection: 'row', alignItems: 'center', gap: 13 },
  feed: { gap: 10 },
  groupName: { marginBottom: 24 },
  overview: { gap: 12 },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, minWidth: 0, padding: 12, gap: 8 },
  chartCard: { padding: 16, gap: 12, borderRadius: radius.xl },
  chartBars: { height: 140, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  membersSummary: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  membersSection: { marginTop: 32 },
  memberRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  identity: { alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 24 },
  profileTabs: { flexDirection: 'row', gap: 24, borderBottomWidth: 1 },
  profileTab: { marginVertical: 15, marginHorizontal: 4 },
  profileRow: { minHeight: 64, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { height: 1 },
  requestCard: { padding: 14, gap: 14 },
  requestTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  requestActions: { flexDirection: 'row', gap: 10 },
  requestButton: { flex: 1 },
  summaryCard: { minHeight: 82, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyRow: { paddingVertical: 15, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 13 },
  overviewRow: { marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  statSummary: { padding: 18 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  trendRow: { marginTop: 36, flexDirection: 'row', gap: 6 },
  trendBar: { flex: 1 },
});
