import type { MembersOptions } from './leader/members/types';

export type AppMode = 'member' | 'leader';

export type AppHeaderProps = {
  title: string;
  mode: AppMode;
  profile?: boolean;
  membersOptions?: MembersOptions;
  /** Group leaders only: adds a person to the roster by email. */
  memberActions?: { onAdd: () => void; disabled?: boolean };
  eventActions?: {
    onCreate?: () => void;
    onImport?: () => void;
    disabled?: boolean;
  };
};
