import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/utils/validate.js";
import { resolveMessageContent } from "../src/utils/messageContent.js";

describe("resolveMessageContent", () => {
  const SIGNATURE = "_sent with Claude_";
  const SIGNATURE_BLOCK = {
    type: "context",
    elements: [{ type: "mrkdwn", text: SIGNATURE }],
  };

  it("appends the signature to plain text when neither blocks nor mrkdwn is given", () => {
    expect(resolveMessageContent({ text: "hello" })).toEqual({
      text: `hello\n\n${SIGNATURE}`,
    });
  });

  it("does not stack a second signature when the text already ends with one", () => {
    const signed = `hello\n\n${SIGNATURE}`;
    expect(resolveMessageContent({ text: signed })).toEqual({ text: signed });
  });

  it("recognizes the marker-stripped signature from a draft round-trip", () => {
    const stripped = "hello\n\nsent with Claude";
    expect(resolveMessageContent({ text: stripped })).toEqual({ text: stripped });
  });

  it("parses the blocks JSON string, signing both the blocks and the text fallback", () => {
    const blocksJson = JSON.stringify([{ type: "divider" }]);
    expect(resolveMessageContent({ text: "fallback", blocks: blocksJson })).toEqual({
      text: `fallback\n\n${SIGNATURE}`,
      blocks: [{ type: "divider" }, SIGNATURE_BLOCK],
    });
  });

  it("does not append a second signature block when blocks already contain one", () => {
    const blocksJson = JSON.stringify([{ type: "divider" }, SIGNATURE_BLOCK]);
    expect(resolveMessageContent({ text: "fallback", blocks: blocksJson })).toEqual({
      text: `fallback\n\n${SIGNATURE}`,
      blocks: [{ type: "divider" }, SIGNATURE_BLOCK],
    });
  });

  it("converts signed text into rich_text blocks when mrkdwn: true", () => {
    const result = resolveMessageContent({ text: "- one\n- two", mrkdwn: true });
    expect(result.text).toBe(`- one\n- two\n\n${SIGNATURE}`);
    expect(result.blocks?.[0]).toMatchObject({
      type: "rich_text",
      elements: expect.arrayContaining([
        {
          type: "rich_text_list",
          style: "bullet",
          elements: [
            { type: "rich_text_section", elements: [{ type: "text", text: "one" }] },
            { type: "rich_text_section", elements: [{ type: "text", text: "two" }] },
          ],
        },
      ]),
    });
    expect(JSON.stringify(result.blocks)).toContain("sent with Claude");
  });

  it("rejects passing both blocks and mrkdwn", () => {
    expect(() =>
      resolveMessageContent({
        text: "hi",
        blocks: JSON.stringify([{ type: "divider" }]),
        mrkdwn: true,
      })
    ).toThrow(ValidationError);
  });

  it("rejects mrkdwn: true with no text to convert", () => {
    expect(() => resolveMessageContent({ mrkdwn: true })).toThrow(ValidationError);
  });

  it("propagates a helpful error for malformed blocks JSON", () => {
    try {
      resolveMessageContent({ blocks: "not json" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).toMatch(/valid JSON/);
    }
  });
});
