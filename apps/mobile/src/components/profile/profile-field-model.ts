import { getPostalDistrictFromSector } from '@cell-journey/domain';
import { useRef, useState } from 'react';
import type { Id } from '@/lib/api';

export type ProfileField = 'name' | 'postal' | 'services';
export type ProfileFieldValues = {
  firstName: string;
  lastName: string;
  postalSector: string;
  serviceIds: Id<'services'>[];
};
export type ProfileFieldDialogProps = {
  field: ProfileField;
  initial: ProfileFieldValues;
  services: { _id: Id<'services'>; name: string }[];
  onSave: (values: ProfileFieldValues) => Promise<void>;
  onClose: () => void;
};

export function profileFieldIsValid(field: ProfileField, values: ProfileFieldValues) {
  if (field === 'name') return Boolean(values.firstName.trim() && values.lastName.trim());
  if (field === 'services') return values.serviceIds.length > 0;
  return Boolean(getPostalDistrictFromSector(values.postalSector));
}

export function useProfileFieldDraft({ field, initial, onSave, onClose }: ProfileFieldDialogProps) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const district = getPostalDistrictFromSector(values.postalSector);
  const canSave = !saving && profileFieldIsValid(field, values);
  function setValue<K extends keyof ProfileFieldValues>(key: K, value: ProfileFieldValues[K]) {
    if (savingRef.current) return;
    setError(null);
    setValues(current => ({ ...current, [key]: value }));
  }
  function toggleService(id: Id<'services'>) {
    if (savingRef.current) return;
    setError(null);
    setValues(current => ({ ...current, serviceIds: current.serviceIds.includes(id)
      ? current.serviceIds.filter(value => value !== id) : [...current.serviceIds, id] }));
  }
  async function submit() {
    if (savingRef.current || !profileFieldIsValid(field, values)) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return {
    values, setValue, toggleService, saving, error, canSave, submit,
    close: () => { if (!savingRef.current) onClose(); },
    postalHint: district ? `District ${district.number} · ${district.area}`
      : values.postalSector ? 'Enter a valid two-digit Singapore postal sector.'
        : 'Enter the first two digits of your postal code. Only your district is saved.',
  };
}
