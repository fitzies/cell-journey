import { v } from "convex/values";

export const postalDistrictCodeValidator = v.union(
  v.literal("D01"),
  v.literal("D02"),
  v.literal("D03"),
  v.literal("D04"),
  v.literal("D05"),
  v.literal("D06"),
  v.literal("D07"),
  v.literal("D08"),
  v.literal("D09"),
  v.literal("D10"),
  v.literal("D11"),
  v.literal("D12"),
  v.literal("D13"),
  v.literal("D14"),
  v.literal("D15"),
  v.literal("D16"),
  v.literal("D17"),
  v.literal("D18"),
  v.literal("D19"),
  v.literal("D20"),
  v.literal("D21"),
  v.literal("D22"),
  v.literal("D23"),
  v.literal("D24"),
  v.literal("D25"),
  v.literal("D26"),
  v.literal("D27"),
  v.literal("D28"),
);
export const leaderEventsLayoutValidator = v.union(v.literal("split"), v.literal("combined"));
export const sexValidator = v.union(v.literal("male"), v.literal("female"));
export const groupLanguageValidator = v.union(
  v.literal("english"),
  v.literal("mandarin"),
  v.literal("cantonese"),
  v.literal("hokkien"),
  v.literal("malay"),
  v.literal("tamil"),
);
export const groupFrequencyValidator = v.union(
  v.literal("weekly"),
  v.literal("fortnightly"),
  v.literal("monthly"),
);
export const groupDemographicValidator = v.union(
  v.literal("singles"),
  v.literal("couples"),
  v.literal("mixed"),
);
export const groupDetailsArgs = {
  languages: v.optional(v.array(groupLanguageValidator)),
  frequency: v.optional(v.union(groupFrequencyValidator, v.null())),
  demographic: v.optional(v.union(groupDemographicValidator, v.null())),
  location: v.optional(v.union(v.string(), v.null())),
};
