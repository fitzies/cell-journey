import type { ReactElement } from 'react';
import type { MemberStatus } from './types';

export type MemberActionsProps = {
  name: string;
  children: ReactElement;
  width: number;
  height: number;
  status: MemberStatus;
  disabled: boolean;
  onViewProfile: () => void;
  onChangeStatus: (status: MemberStatus) => void;
  onRemove: () => void;
};
