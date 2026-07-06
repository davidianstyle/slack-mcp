import { describe, expect, it } from "vitest";
import { pruneMessage, pruneMessages, pruneDraft } from "../src/utils/pruning.js";

describe("pruneMessage", () => {
  it("keeps only the compact fields", () => {
    const raw = {
      ts: "1234567890.123456",
      user: "U123",
      text: "hello",
      thread_ts: "1234567890.000001",
      reply_count: 3,
      reactions: [{ name: "thumbsup", count: 2, users: ["U1", "U2"] }],
      subtype: "bot_message",
      // Fields that should be dropped entirely:
      blocks: [{ type: "rich_text" }],
      attachments: [{ text: "unfurled" }],
      client_msg_id: "abc-123",
    };

    expect(pruneMessage(raw)).toEqual({
      ts: "1234567890.123456",
      user: "U123",
      text: "hello",
      thread_ts: "1234567890.000001",
      reply_count: 3,
      reactions: [{ name: "thumbsup", count: 2, users: ["U1", "U2"] }],
      subtype: "bot_message",
    });
  });

  it("reduces files down to just their names", () => {
    const raw = {
      ts: "1234567890.123456",
      files: [
        { id: "F1", name: "report.pdf", url_private: "https://example.com/report.pdf" },
        { id: "F2", name: "notes.txt" },
      ],
    };

    const pruned = pruneMessage(raw);
    expect(pruned.files).toEqual(["report.pdf", "notes.txt"]);
    expect(pruned).not.toHaveProperty("url_private");
  });

  it("omits the files key entirely when there are no files", () => {
    const pruned = pruneMessage({ ts: "1234567890.123456" });
    expect(pruned).not.toHaveProperty("files");
  });

  it("drops files with no name rather than emitting undefined placeholders", () => {
    const pruned = pruneMessage({
      ts: "1",
      files: [{ id: "F1" }, { id: "F2", name: "keep.png" }],
    });
    expect(pruned.files).toEqual(["keep.png"]);
  });

  it("pruneMessages maps over an array preserving order", () => {
    const pruned = pruneMessages([{ ts: "1" }, { ts: "2" }]);
    expect(pruned.map((m) => m.ts)).toEqual(["1", "2"]);
  });
});

describe("pruneDraft", () => {
  it("extracts id, last_updated_ts, and destination", () => {
    const raw = {
      id: "draft-1",
      last_updated_ts: "1700000000.000000",
      destinations: [{ channel_id: "C123", thread_ts: "1699999999.000000" }],
      blocks: [],
    };

    const pruned = pruneDraft(raw);
    expect(pruned.id).toBe("draft-1");
    expect(pruned.last_updated_ts).toBe("1700000000.000000");
    expect(pruned.destination).toEqual({ channel_id: "C123", thread_ts: "1699999999.000000" });
  });

  it("flattens rich_text blocks into a plain-text preview", () => {
    const raw = {
      id: "draft-2",
      blocks: [
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "text", text: "Hello " },
                { type: "user", user_id: "U123" },
                { type: "text", text: "!" },
              ],
            },
          ],
        },
      ],
    };

    const pruned = pruneDraft(raw);
    expect(pruned.text).toBe("Hello <@U123>!");
  });

  it("returns undefined text when there are no blocks", () => {
    const pruned = pruneDraft({ id: "draft-3" });
    expect(pruned.text).toBeUndefined();
  });

  it("passes through a bare destinations object that isn't wrapped in an array", () => {
    const pruned = pruneDraft({ id: "draft-4", destinations: { channel_id: "C1" } });
    expect(pruned.destination).toEqual({ channel_id: "C1" });
  });

  it("falls back to the raw draft when none of the known fields are present", () => {
    // drafts.list is undocumented — if Slack's real field names differ from
    // our inferred ones, pruning every field to undefined would silently
    // destroy the output. Unknown shapes must pass through unchanged.
    const raw = { draft_uuid: "abc", ts_updated: "123", body: "hello" };
    expect(pruneDraft(raw)).toBe(raw);
  });

  it("still prunes when at least one known field is present", () => {
    const pruned = pruneDraft({ id: "draft-5", unknown_field: "x" });
    expect(pruned).toEqual({
      id: "draft-5",
      last_updated_ts: undefined,
      destination: undefined,
      text: undefined,
    });
    expect(pruned).not.toHaveProperty("unknown_field");
  });
});
