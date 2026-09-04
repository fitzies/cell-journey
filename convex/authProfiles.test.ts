import { describe, expect, test } from "vitest";
import { normalizeGoogleProfile } from "./authProfiles";

describe("Google auth profile mapping", () => {
  test("normalizes email before Convex Auth links the account", () => {
    expect(
      normalizeGoogleProfile({
        sub: "google-user-id",
        name: "Jamie Tan",
        email: " Jamie.Tan@Example.COM ",
        picture: "https://example.com/photo.jpg",
      }),
    ).toEqual({
      id: "google-user-id",
      name: "Jamie Tan",
      email: "jamie.tan@example.com",
      image: "https://example.com/photo.jpg",
    });
  });

  test("does not invent an email when Google omits it", () => {
    expect(
      normalizeGoogleProfile({ sub: "google-user-id" }),
    ).toMatchObject({
      id: "google-user-id",
      email: undefined,
    });
  });
});
