import { router } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';

type PlaceDraft = { venue: string; onChoose: (venue: string) => void };
const EventPlaceContext = createContext<{
  draft: PlaceDraft | null;
  openPlace: (venue: string, onChoose: (venue: string) => void) => void;
} | null>(null);

// Shares only the place editor with its modal route. The event form stays mounted.
export function EventPlaceProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const openPlace = (venue: string, onChoose: (venue: string) => void) => {
    setDraft({ venue, onChoose });
    router.push('/create-event/place');
  };
  return <EventPlaceContext value={{ draft, openPlace }}>{children}</EventPlaceContext>;
}

export function useEventPlace() {
  const context = useContext(EventPlaceContext);
  if (!context) throw new Error('Place picker must be used inside the event modal.');
  return context;
}
