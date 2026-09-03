/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const previousAdminEmails = process.env.ADMIN_EMAILS;

export function resetBackendTestState() {
  vi.useRealTimers();
  if (previousAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = previousAdminEmails;
}

export function makeTest() {
  return convexTest(schema, modules);
}

type TestClient = ReturnType<typeof makeTest>;

export function asUser(t: TestClient, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session` });
}

export async function seedProfile(
  t: TestClient,
  name: string,
  options: { email?: string; structured?: boolean; serviceId?: Id<"services"> } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name,
      ...(options.email ? { email: options.email } : {}),
    });
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      role: "member",
      onboardingStatus: "approved",
      ...(options.structured
        ? { firstName: name, lastName: "Test", fullName: `${name} Test` }
        : { fullName: name }),
      singaporeRegion: "central",
      serviceIds: options.serviceId ? [options.serviceId] : [],
      createdAt: now,
      updatedAt: now,
    });
    return { userId, profileId };
  });
}

export async function seedGroup(
  t: TestClient,
  ownerProfileId: Id<"userProfiles">,
  code = "GROUP1",
) {
  return await t.run((ctx) => {
    const now = Date.now();
    return ctx.db.insert("groups", {
      name: `Group ${code}`,
      code,
      leaderProfileId: ownerProfileId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function seedMembership(
  t: TestClient,
  profileId: Id<"userProfiles">,
  groupId: Id<"groups">,
  status: "active" | "inactive" = "active",
  startedAt = Date.now() - 100_000,
  endedAt?: number,
) {
  return await t.run(async (ctx) => {
    const membershipId = await ctx.db.insert("memberships", {
      profileId,
      groupId,
      status,
      joinedAt: startedAt,
      sortOrder: startedAt,
    });
    await ctx.db.insert("membershipActivityPeriods", {
      membershipId,
      profileId,
      groupId,
      startedAt,
      ...(endedAt === undefined ? {} : { endedAt }),
      createdAt: startedAt,
      updatedAt: endedAt ?? startedAt,
    });
    return membershipId;
  });
}

export async function seedEvent(
  t: TestClient,
  groupId: Id<"groups">,
  createdByProfileId: Id<"userProfiles">,
  startAt: number,
  endAt: number,
  options: { title?: string; cancelled?: boolean } = {},
) {
  return await t.run((ctx) =>
    ctx.db.insert("events", {
      groupId,
      title: options.title ?? "Event",
      venue: "Home",
      location: "Home",
      startAt,
      endAt,
      createdByProfileId,
      ...(options.cancelled
        ? { cancelledAt: endAt, cancelledByProfileId: createdByProfileId }
        : {}),
      createdAt: startAt,
      updatedAt: startAt,
    }),
  );
}

export async function seedAdmin(t: TestClient) {
  process.env.ADMIN_EMAILS = "admin@example.com";
  const admin = await seedProfile(t, "Admin", { email: "admin@example.com" });
  await t.run((ctx) =>
    ctx.db.patch(admin.userId, { emailVerificationTime: Date.now() }),
  );
  return admin;
}
