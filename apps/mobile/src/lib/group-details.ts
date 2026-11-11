import {
  groupDemographicLabels,
  groupFrequencyLabels,
  groupLanguageLabels,
  type GroupDemographic,
  type GroupFrequency,
  type GroupLanguage,
} from '@cell-journey/domain';

export type GroupDetails = {
  languages?: GroupLanguage[];
  frequency?: GroupFrequency;
  demographic?: GroupDemographic;
  location?: string;
};

/** "English, Mandarin · Weekly · Couples · Bishan" or a prompt when empty. */
export function groupDetailsSummary(group: GroupDetails) {
  const parts = [
    group.languages?.length ? group.languages.map((language) => groupLanguageLabels[language]).join(', ') : null,
    group.frequency ? groupFrequencyLabels[group.frequency] : null,
    group.demographic ? groupDemographicLabels[group.demographic] : null,
    group.location?.trim() || null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Language, frequency, demographic and location';
}
