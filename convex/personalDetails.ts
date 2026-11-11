import {
  normalizeDateOfBirth,
  normalizeSingaporePhone,
  type Sex,
} from "@cell-journey/domain";
import type { Doc } from "./_generated/dataModel";

export type PersonalDetailsInput = {
  dateOfBirth?: string | null;
  sex?: Sex | null;
  phone?: string | null;
};

/**
 * Validates optional personal details. `undefined` leaves a field alone,
 * `null` or an empty string clears it.
 */
export function personalDetailsPatch(input: PersonalDetailsInput) {
  const patch: Partial<Pick<Doc<"userProfiles">, "dateOfBirth" | "sex" | "phone">> = {};
  if (input.dateOfBirth !== undefined) {
    if (input.dateOfBirth === null || input.dateOfBirth.trim() === "") {
      patch.dateOfBirth = undefined;
    } else {
      const dateOfBirth = normalizeDateOfBirth(input.dateOfBirth);
      if (!dateOfBirth) throw new Error("Enter a valid date of birth");
      patch.dateOfBirth = dateOfBirth;
    }
  }
  if (input.sex !== undefined) patch.sex = input.sex ?? undefined;
  if (input.phone !== undefined) {
    if (input.phone === null || input.phone.trim() === "") {
      patch.phone = undefined;
    } else {
      const phone = normalizeSingaporePhone(input.phone);
      if (!phone) throw new Error("Enter an 8-digit Singapore phone number");
      patch.phone = phone;
    }
  }
  return patch;
}

