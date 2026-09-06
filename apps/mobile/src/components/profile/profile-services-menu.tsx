import type { ReactElement } from 'react';
import type { Id } from '@/lib/api';

export type ProfileServicesMenuProps = {
  children: ReactElement;
  services: { _id: Id<'services'>; name: string }[];
  selectedIds: Id<'services'>[];
  disabled: boolean;
  onToggle: (id: Id<'services'>) => void;
};

// Android and web open the selection dialog through the row's onPress.
export function ProfileServicesMenu({ children }: ProfileServicesMenuProps) {
  return children;
}
