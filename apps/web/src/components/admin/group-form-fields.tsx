"use client";

import {
  GROUP_LOCATION_MAX_LENGTH,
  groupDemographicLabels,
  groupDemographicOptions,
  groupFrequencyLabels,
  groupFrequencyOptions,
  groupLanguageLabels,
  groupLanguageOptions,
  type GroupDemographic,
  type GroupFrequency,
  type GroupLanguage,
} from "@cell-journey/domain";
import { useQuery } from "convex/react";
import { Check, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Id } from "@/lib/api";
import { cn } from "@/lib/utils";

import { useDashboardRole } from "./access-context";
import type { GroupRow } from "./types";

const NONE = "none";

export type GroupDetailsValue = {
  regionId: string;
  languages: GroupLanguage[];
  frequency: string;
  demographic: string;
  location: string;
};

/** Initial form values. Regional leaders with one region get it preselected. */
export function initialGroupDetails(
  row: GroupRow | null,
  regions: Array<{ _id: Id<"regions"> }>,
  isAdmin: boolean,
): GroupDetailsValue {
  const defaultRegion = !isAdmin && regions.length === 1 ? regions[0]._id : NONE;
  return {
    regionId: row ? row.region?._id ?? defaultRegion : defaultRegion,
    languages: row?.group.languages ?? [],
    frequency: row?.group.frequency ?? NONE,
    demographic: row?.group.demographic ?? NONE,
    location: row?.group.location ?? "",
  };
}

/** Mutation arguments for createGroup / updateGroup. */
export function groupDetailsArgs(value: GroupDetailsValue) {
  return {
    regionId: value.regionId === NONE ? null : (value.regionId as Id<"regions">),
    languages: value.languages,
    frequency: value.frequency === NONE ? null : (value.frequency as GroupFrequency),
    demographic: value.demographic === NONE ? null : (value.demographic as GroupDemographic),
    location: value.location.trim() || null,
  };
}

/** Regions the signed-in person may put a group in. */
export function useRegionOptions(enabled: boolean) {
  const role = useDashboardRole();
  const regions = useQuery(api.regions.list, enabled && role.isAdmin ? {} : "skip");
  if (!role.isAdmin) return role.regions;
  return (regions ?? []).map((row) => ({ _id: row.region._id, name: row.region.name }));
}

export function GroupDetailsFields({
  value,
  onChange,
  regions,
  idPrefix,
}: {
  value: GroupDetailsValue;
  onChange: (value: GroupDetailsValue) => void;
  regions: Array<{ _id: Id<"regions">; name: string }>;
  idPrefix: string;
}) {
  const { isAdmin } = useDashboardRole();
  const update = (patch: Partial<GroupDetailsValue>) => onChange({ ...value, ...patch });
  const toggleLanguage = (language: GroupLanguage) =>
    update({
      languages: value.languages.includes(language)
        ? value.languages.filter((item) => item !== language)
        : groupLanguageOptions.filter((item) => item === language || value.languages.includes(item)),
    });

  return (
    <>
      {isAdmin || regions.length > 1 ? (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-region`}>Region</Label>
          <Select value={value.regionId} onValueChange={(regionId) => update({ regionId })}>
            <SelectTrigger id={`${idPrefix}-region`}><SelectValue placeholder="Choose a region" /></SelectTrigger>
            <SelectContent>
              {isAdmin ? <SelectItem value={NONE}>No region</SelectItem> : null}
              {regions.map((region) => <SelectItem key={region._id} value={region._id}>{region.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {isAdmin && regions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Create regions in the Regions tab to group cells for regional leaders.</p>
          ) : null}
        </div>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium leading-none">Language</legend>
        <div className="flex flex-wrap gap-1.5">
          {groupLanguageOptions.map((language) => {
            const selected = value.languages.includes(language);
            return (
              <button
                key={language}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleLanguage(language)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {selected ? <Check className="h-3 w-3" /> : null}
                {groupLanguageLabels[language]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-frequency`}>Frequency</Label>
          <Select value={value.frequency} onValueChange={(frequency) => update({ frequency })}>
            <SelectTrigger id={`${idPrefix}-frequency`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {groupFrequencyOptions.map((option) => <SelectItem key={option} value={option}>{groupFrequencyLabels[option]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-demographic`}>Demographic</Label>
          <Select value={value.demographic} onValueChange={(demographic) => update({ demographic })}>
            <SelectTrigger id={`${idPrefix}-demographic`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {groupDemographicOptions.map((option) => <SelectItem key={option} value={option}>{groupDemographicLabels[option]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-location`}>Location</Label>
        <Input
          id={`${idPrefix}-location`}
          value={value.location}
          maxLength={GROUP_LOCATION_MAX_LENGTH}
          onChange={(event) => update({ location: event.target.value })}
          placeholder="Tampines, near the MRT"
        />
        <p className="text-xs text-muted-foreground">Where the group says it meets, in its own words.</p>
      </div>
    </>
  );
}

/** Compact badges describing a group's language, frequency, demographic and location. */
export function GroupDetailsSummary({ group }: { group: GroupRow["group"] }) {
  const languages = (group.languages ?? []).map((language) => groupLanguageLabels[language]).join(" · ");
  const hasDetails = languages || group.frequency || group.demographic || group.location;
  if (!hasDetails) return <span className="text-sm text-muted-foreground">Not set</span>;
  return (
    <div className="flex max-w-72 flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {languages ? <Badge variant="outline">{languages}</Badge> : null}
        {group.frequency ? <Badge variant="secondary">{groupFrequencyLabels[group.frequency]}</Badge> : null}
        {group.demographic ? <Badge variant="secondary">{groupDemographicLabels[group.demographic]}</Badge> : null}
      </div>
      {group.location ? (
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{group.location}</span>
        </p>
      ) : null}
    </div>
  );
}
