import { describe, expect, it } from "vitest";
import { mapSlackError, withErrorHandling } from "../src/utils/errors.js";
import { BrowserApiError } from "../src/utils/browserApi.js";
import { textResult } from "../src/utils/formatting.js";

function webApiError(data: Record<string, unknown>): Error {
  const err = new Error("web api error") as Error & { data: unknown };
  err.data = data;
  return err;
}

describe("mapSlackError", () => {
  it("extracts the Slack error code from err.data.error", () => {
    const mapped = mapSlackError(webApiError({ error: "channel_not_found" }), "acme-slack-com");
    expect(mapped.error).toBe("channel_not_found");
  });

  it("extracts response_metadata.messages when present", () => {
    const mapped = mapSlackError(
      webApiError({
        error: "invalid_arguments",
        response_metadata: { messages: ["[ERROR] missing required field: channel"] },
      }),
      "acme-slack-com"
    );
    expect(mapped.messages).toEqual(["[ERROR] missing required field: channel"]);
  });

  it("extracts needed/provided scopes only for missing_scope errors", () => {
    const mapped = mapSlackError(
      webApiError({ error: "missing_scope", needed: "channels:read", provided: "chat:write" }),
      "acme-slack-com"
    );
    expect(mapped.needed).toBe("channels:read");
    expect(mapped.provided).toBe("chat:write");
  });

  it("does not attach needed/provided for non missing_scope errors", () => {
    const mapped = mapSlackError(
      webApiError({ error: "channel_not_found", needed: "x", provided: "y" }),
      "acme-slack-com"
    );
    expect(mapped.needed).toBeUndefined();
    expect(mapped.provided).toBeUndefined();
  });

  it.each(["invalid_auth", "token_revoked", "account_inactive"])(
    "maps %s to a SLACK_TOKEN_<SLUG> remediation hint",
    (code) => {
      const mapped = mapSlackError(webApiError({ error: code }), "acme-slack-com");
      expect(mapped.hint).toMatch(/SLACK_TOKEN_ACME_SLACK_COM/);
    }
  );

  it("does not attach a hint for unrelated errors", () => {
    const mapped = mapSlackError(webApiError({ error: "channel_not_found" }), "acme-slack-com");
    expect(mapped.hint).toBeUndefined();
  });

  it.each(["invalid_auth", "token_revoked", "account_inactive"])(
    "maps %s from a browser-API failure to a re-extract xoxc/xoxd hint",
    (code) => {
      const mapped = mapSlackError(new BrowserApiError(code, "drafts.list"), "acme-slack-com");
      expect(mapped.error).toBe(code);
      expect(mapped.hint).toMatch(/xoxc/);
      expect(mapped.hint).toMatch(/xoxd/);
      expect(mapped.hint).not.toMatch(/SLACK_TOKEN/);
    }
  );

  it("does not attach a hint for unrelated browser-API failures", () => {
    const mapped = mapSlackError(new BrowserApiError("some_other_error", "drafts.list"), "acme-slack-com");
    expect(mapped.hint).toBeUndefined();
  });

  it("falls back to the error message for plain errors", () => {
    const mapped = mapSlackError(new Error("boom"), "acme-slack-com");
    expect(mapped.error).toBe("boom");
  });

  it("falls back to String(err) for non-Error throws", () => {
    const mapped = mapSlackError("boom", "acme-slack-com");
    expect(mapped.error).toBe("boom");
  });
});

describe("withErrorHandling", () => {
  it("passes through a successful result unchanged", async () => {
    const wrapped = withErrorHandling("acme-slack-com", async (n: number) => textResult({ n }));
    const result = await wrapped(5);
    expect(result).toEqual(textResult({ n: 5 }));
  });

  it("catches a thrown error and returns a mapped, ok:false result", async () => {
    const wrapped = withErrorHandling("acme-slack-com", async () => {
      throw webApiError({ error: "invalid_auth" });
    });
    const result = await wrapped(undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("invalid_auth");
    expect(parsed.hint).toMatch(/SLACK_TOKEN_ACME_SLACK_COM/);
  });
});
