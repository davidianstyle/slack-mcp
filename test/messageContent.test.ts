import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/utils/validate.js";
import { resolveMessageContent } from "../src/utils/messageContent.js";

describe("resolveMessageContent", () => {
  it("passes text through unchanged when neither blocks nor mrkdwn is given", () => {
    expect(resolveMessageContent({ text: "hello" })).toEqual({ text: "hello" });
  });

  it("parses the blocks JSON string and keeps text as the fallback", () => {
    const blocksJson = JSON.stringify([{ type: "divider" }]);
    expect(resolveMessageContent({ text: "fallback", blocks: blocksJson })).toEqual({
      text: "fallback",
      blocks: [{ type: "divider" }],
    });
  });

  it("converts text into rich_text blocks when mrkdwn: true", () => {
    const result = resolveMessageContent({ text: "- one\n- two", mrkdwn: true });
    expect(result.text).toBe("- one\n- two");
    expect(result.blocks).toEqual([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_list",
            style: "bullet",
            elements: [
              { type: "rich_text_section", elements: [{ type: "text", text: "one" }] },
              { type: "rich_text_section", elements: [{ type: "text", text: "two" }] },
            ],
          },
        ],
      },
    ]);
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
