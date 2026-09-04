import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

type PendingEmail = {
  address: string;
  sentAt: number;
};

type EmailOtpContextValue = {
  draftEmail: string;
  pendingEmail: PendingEmail | null;
  beginVerification: (address: string) => void;
  markCodeResent: () => void;
  returnToEmailEntry: () => void;
  setDraftEmail: (address: string) => void;
};

const EmailOtpContext = createContext<EmailOtpContextValue | null>(null);

export function EmailOtpProvider({ children }: PropsWithChildren) {
  const [draftEmail, setDraftEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState<PendingEmail | null>(null);

  const value = useMemo<EmailOtpContextValue>(
    () => ({
      draftEmail,
      pendingEmail,
      beginVerification: (address) => {
        setDraftEmail(address);
        setPendingEmail({ address, sentAt: Date.now() });
      },
      markCodeResent: () => {
        setPendingEmail((current) => current ? { ...current, sentAt: Date.now() } : current);
      },
      returnToEmailEntry: () => setPendingEmail(null),
      setDraftEmail,
    }),
    [draftEmail, pendingEmail],
  );

  return <EmailOtpContext.Provider value={value}>{children}</EmailOtpContext.Provider>;
}

export function useEmailOtp() {
  const value = useContext(EmailOtpContext);
  if (!value) throw new Error('useEmailOtp must be used inside EmailOtpProvider');
  return value;
}
