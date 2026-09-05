export type AppMode = 'member' | 'leader';

export type AppHeaderProps = {
  title: string;
  mode: AppMode;
  profile?: boolean;
  eventActions?: {
    onCreate?: () => void;
    onImport?: () => void;
    disabled?: boolean;
  };
};
