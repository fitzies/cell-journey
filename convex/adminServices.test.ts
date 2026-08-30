import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  makeTest,
  resetBackendTestState,
  seedAdmin,
  seedProfile,
} from "../test/convexBackendTestHelpers";

afterEach(resetBackendTestState);

describe("admin service configuration", () => {
  test("admins can create, reorder, rename, and archive onboarding services", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const adminClient = asUser(t, admin.userId);

    const evening = await adminClient.mutation(api.admin.createService, {
      name: "Evening Service",
      sortOrder: 20,
    });
    const morning = await adminClient.mutation(api.admin.createService, {
      name: "Morning Service",
      sortOrder: 10,
    });

    expect(await adminClient.query(api.admin.listServices, {})).toMatchObject([
      { _id: morning?._id, name: "Morning Service", sortOrder: 10, isActive: true },
      { _id: evening?._id, name: "Evening Service", sortOrder: 20, isActive: true },
    ]);
    expect(await asUser(t, admin.userId).query(api.groups.listServices, {})).toMatchObject([
      { _id: morning?._id },
      { _id: evening?._id },
    ]);

    await adminClient.mutation(api.admin.updateService, {
      serviceId: evening!._id,
      name: "Saturday Service",
      sortOrder: 5,
      isActive: false,
    });

    expect(await adminClient.query(api.admin.listServices, {})).toMatchObject([
      { _id: evening?._id, name: "Saturday Service", sortOrder: 5, isActive: false },
      { _id: morning?._id, name: "Morning Service", sortOrder: 10, isActive: true },
    ]);
    expect(await asUser(t, admin.userId).query(api.groups.listServices, {})).toMatchObject([
      { _id: morning?._id },
    ]);
  });

  test("service management requires admin access and rejects duplicate names", async () => {
    const t = makeTest();
    const admin = await seedAdmin(t);
    const member = await seedProfile(t, "Member", { email: "member@example.com" });
    const adminClient = asUser(t, admin.userId);

    await adminClient.mutation(api.admin.createService, {
      name: "Sunday 10am",
      sortOrder: 10,
    });

    await expect(
      adminClient.mutation(api.admin.createService, {
        name: "  sunday 10AM  ",
        sortOrder: 20,
      }),
    ).rejects.toThrow("already exists");
    await expect(
      asUser(t, member.userId).mutation(api.admin.createService, {
        name: "Unauthorized service",
        sortOrder: 30,
      }),
    ).rejects.toThrow("not allowed");
  });
});
