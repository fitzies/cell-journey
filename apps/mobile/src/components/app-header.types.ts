import type { MembersOptions } from './leader/members/types';

export type AppMode = 'member' | 'leader';

export type AppHeaderProps = {
  title: string;
  mode: AppMode;
  profile?: boolean;
  membersOptions?: MembersOptions;
  eventActions?: {
    onCreate?: () => void;
    onImport?: () => void;
    disabled?: boolean;
  };
};
