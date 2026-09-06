import type { ReactElement } from 'react';

export type ProfileGroupMenuEntry = {
  id: string;
  name: string;
  mode: 'member' | 'leader';
  role: string;
};

export type ProfileGroupMenuProps = {
  children: ReactElement;
  entries: ProfileGroupMenuEntry[];
  selectedId: string | null;
  mode: 'member' | 'leader';
  disabled: boolean;
  onSelect: (entry: ProfileGroupMenuEntry) => void;
  onLeave?: () => void;
};

// Web keeps the row's existing group-sheet action.
export function ProfileGroupMenu({ children }: ProfileGroupMenuProps) {
  return children;
}
