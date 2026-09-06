import type { ReactElement } from 'react';

export type MemberActionsProps = {
  name: string;
  children: ReactElement;
  width: number;
  height: number;
  inactive: boolean;
  disabled: boolean;
  onChangeStatus: () => void;
  onRemove: () => void;
};
