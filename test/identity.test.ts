import { describe, expect, it, vi } from "vitest";
import { createIdentityLookup } from "../src/utils/identity.js";

function fakeClient(userId: string | undefined) {
  const authTest = vi.fn(async () => ({ ok: true, user_id: userId }));
  return { auth: { test: authTest } };
}

describe("createIdentityLookup", () => {
  it("resolves the authenticated user id", async () => {
    const client = fakeClient("U123");
    const getMyUserId = createIdentityLookup(client as never);
    expect(await getMyUserId()).toBe("U123");
  });

  it("memoizes across calls — auth.test is only invoked once per process", async () => {
    const client = fakeClient("U123");
    const getMyUserId = createIdentityLookup(client as never);

    await getMyUserId();
    await getMyUserId();
    await getMyUserId();

    expect(client.auth.test).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when auth.test doesn't return a user_id", async () => {
    const client = fakeClient(undefined);
    const getMyUserId = createIdentityLookup(client as never);
    await expect(getMyUserId()).rejects.toThrow(/user ID/);
  });
});
