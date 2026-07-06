import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserApi, BrowserApiError } from "../src/utils/browserApi.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBrowserApi", () => {
  it("returns the parsed JSON body on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, drafts: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createBrowserApi("xoxc-token", "xoxd-token");
    const result = await api("drafts.list", { count: 20 });

    expect(result).toEqual({ ok: true, drafts: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slack.com/api/drafts.list");
    expect(init.headers.Cookie).toBe("d=xoxd-token");
  });

  it("throws BrowserApiError with the Slack error code when ok: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "invalid_auth" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createBrowserApi("xoxc-token", "xoxd-token");
    await expect(api("drafts.list", {})).rejects.toMatchObject(
      new BrowserApiError("invalid_auth", "drafts.list")
    );
  });

  it("throws a plain error for a non-JSON response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createBrowserApi("xoxc-token", "xoxd-token");
    await expect(api("drafts.list", {})).rejects.toThrow(/not valid JSON/);
  });

  it("throws a plain error for a non-200, non-429 HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 500, statusText: "Internal Server Error" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createBrowserApi("xoxc-token", "xoxd-token");
    await expect(api("drafts.list", {})).rejects.toThrow(/HTTP 500/);
  });

  it("retries once after a 429, waiting the Retry-After duration", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "0" } })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, drafts: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createBrowserApi("xoxc-token", "xoxd-token");
    const result = await api("drafts.list", {});

    expect(result).toEqual({ ok: true, drafts: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps the 429 wait even if Retry-After is very large, and gives up after one retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "0" } })
      )
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "0" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    const api = createBrowserApi("xoxc-token", "xoxd-token");
    await expect(api("drafts.list", {})).rejects.toThrow(/HTTP 429/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
