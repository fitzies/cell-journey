import { GROUP_LOCATION_MAX_LENGTH, type GroupDemographic, type GroupFrequency, type GroupLanguage } from "@cell-journey/domain";
import type { Doc } from "./_generated/dataModel";

type GroupDetailsInput = {
  languages?: GroupLanguage[];
  frequency?: GroupFrequency | null;
  demographic?: GroupDemographic | null;
  location?: string | null;
};

/** Validates group details. `undefined` keeps a field, `null` clears it. */
export function groupDetailsPatch(input: GroupDetailsInput) {
  const patch: Partial<Pick<Doc<"groups">, "languages" | "frequency" | "demographic" | "location">> = {};
  if (input.languages !== undefined) {
    const languages = [...new Set(input.languages)];
    patch.languages = languages.length ? languages : undefined;
  }
  if (input.frequency !== undefined) patch.frequency = input.frequency ?? undefined;
  if (input.demographic !== undefined) patch.demographic = input.demographic ?? undefined;
  if (input.location !== undefined) {
    const location = input.location?.trim().replace(/\s+/g, " ") ?? "";
    if (location.length > GROUP_LOCATION_MAX_LENGTH) {
      throw new Error(`Keep the location under ${GROUP_LOCATION_MAX_LENGTH} characters`);
    }
    patch.location = location || undefined;
  }
  return patch;
}
