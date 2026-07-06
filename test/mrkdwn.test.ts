import { describe, expect, it } from "vitest";
import { mrkdwnToBlocks } from "../src/utils/mrkdwn.js";

// Every mrkdwnToBlocks() call returns a single rich_text block; these helpers
// pull out the parts each test cares about.
function elementsOf(input: string) {
  const blocks = mrkdwnToBlocks(input);
  expect(blocks).toHaveLength(1);
  expect(blocks[0].type).toBe("rich_text");
  return blocks[0].elements;
}

describe("mrkdwnToBlocks — inline formatting (regression baseline)", () => {
  it("wraps plain text in a single rich_text_section", () => {
    expect(elementsOf("hello world")).toEqual([
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: "hello world" }],
      },
    ]);
  });

  it("parses bold, italic, code, and strike spans", () => {
    const els = elementsOf("*bold* _italic_ `code` ~strike~");
    expect(els).toEqual([
      {
        type: "rich_text_section",
        elements: [
          { type: "text", text: "bold", style: { bold: true } },
          { type: "text", text: " " },
          { type: "text", text: "italic", style: { italic: true } },
          { type: "text", text: " " },
          { type: "text", text: "code", style: { code: true } },
          { type: "text", text: " " },
          { type: "text", text: "strike", style: { strike: true } },
        ],
      },
    ]);
  });

  it("parses links, user/channel mentions, and broadcasts", () => {
    const els = elementsOf(
      "<https://example.com|link> <@U123> <#C123> <!channel>"
    );
    expect(els).toEqual([
      {
        type: "rich_text_section",
        elements: [
          { type: "link", url: "https://example.com", text: "link" },
          { type: "text", text: " " },
          { type: "user", user_id: "U123" },
          { type: "text", text: " " },
          { type: "channel", channel_id: "C123" },
          { type: "text", text: " " },
          { type: "broadcast", range: "channel" },
        ],
      },
    ]);
  });

  it("keeps blank-line-separated paragraphs in a single rich_text_section", () => {
    // Splitting across multiple sections collapses the blank-line spacing in
    // Slack's renderer — see the module header comment.
    const els = elementsOf("first paragraph\n\nsecond paragraph");
    expect(els).toEqual([
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: "first paragraph\n\nsecond paragraph" }],
      },
    ]);
  });

  it("produces a single empty rich_text_section for an empty string", () => {
    expect(elementsOf("")).toEqual([{ type: "rich_text_section", elements: [] }]);
  });
});

describe("mrkdwnToBlocks — fenced code blocks", () => {
  it("wraps a fenced code block in a rich_text_preformatted element", () => {
    const els = elementsOf("```\nconst x = 1;\n```");
    expect(els).toEqual([
      {
        type: "rich_text_preformatted",
        elements: [{ type: "text", text: "const x = 1;" }],
      },
    ]);
  });

  it("strips the language tag from the opening fence", () => {
    const els = elementsOf("```js\nconst x = 1;\n```");
    expect(els).toEqual([
      {
        type: "rich_text_preformatted",
        elements: [{ type: "text", text: "const x = 1;" }],
      },
    ]);
  });

  it("preserves internal newlines and does not apply inline styling", () => {
    const els = elementsOf("```\nline one\n*not bold*\nline three\n```");
    expect(els).toEqual([
      {
        type: "rich_text_preformatted",
        elements: [{ type: "text", text: "line one\n*not bold*\nline three" }],
      },
    ]);
  });

  it("falls back to inline parsing when a code fence is never closed", () => {
    // The unclaimed ``` line is handled by the plain inline parser, not
    // treated as a fence — and that parser reads the first two backticks
    // as an (empty) inline code span, same as it would for any other
    // stray "``" in running text. This is pre-existing inline-parser
    // behavior, not a code-fence feature.
    const els = elementsOf("before\n```\ndangling");
    expect(els).toEqual([
      {
        type: "rich_text_section",
        elements: [
          { type: "text", text: "before\n" },
          { type: "text", text: "", style: { code: true } },
          { type: "text", text: "`\ndangling" },
        ],
      },
    ]);
  });

  it("treats a fence with only blank content as an empty preformatted block", () => {
    const els = elementsOf("```\n\n```");
    expect(els).toEqual([{ type: "rich_text_preformatted", elements: [] }]);
  });
});

describe("mrkdwnToBlocks — block quotes", () => {
  it("converts a single quoted line into a rich_text_quote", () => {
    const els = elementsOf("> quoted text");
    expect(els).toEqual([
      {
        type: "rich_text_quote",
        elements: [{ type: "text", text: "quoted text" }],
      },
    ]);
  });

  it("joins consecutive quote lines, preserving the newline between them", () => {
    const els = elementsOf("> line one\n> line two");
    expect(els).toEqual([
      {
        type: "rich_text_quote",
        elements: [{ type: "text", text: "line one\nline two" }],
      },
    ]);
  });

  it("supports inline formatting inside a quote", () => {
    const els = elementsOf("> *bold* and <@U1>");
    expect(els).toEqual([
      {
        type: "rich_text_quote",
        elements: [
          { type: "text", text: "bold", style: { bold: true } },
          { type: "text", text: " and " },
          { type: "user", user_id: "U1" },
        ],
      },
    ]);
  });

  it("ends the quote at the next blank line", () => {
    const els = elementsOf("> quoted\n\nafter");
    expect(els).toEqual([
      { type: "rich_text_quote", elements: [{ type: "text", text: "quoted" }] },
      { type: "rich_text_section", elements: [{ type: "text", text: "after" }] },
    ]);
  });
});

describe("mrkdwnToBlocks — bullet and ordered lists", () => {
  it("converts consecutive '- ' lines into a bullet rich_text_list", () => {
    const els = elementsOf("- one\n- two\n- three");
    expect(els).toEqual([
      {
        type: "rich_text_list",
        style: "bullet",
        elements: [
          { type: "rich_text_section", elements: [{ type: "text", text: "one" }] },
          { type: "rich_text_section", elements: [{ type: "text", text: "two" }] },
          { type: "rich_text_section", elements: [{ type: "text", text: "three" }] },
        ],
      },
    ]);
  });

  it("treats '*' and '+' markers the same as '-' (bullet style)", () => {
    const els = elementsOf("* one\n+ two");
    expect(els).toEqual([
      {
        type: "rich_text_list",
        style: "bullet",
        elements: [
          { type: "rich_text_section", elements: [{ type: "text", text: "one" }] },
          { type: "rich_text_section", elements: [{ type: "text", text: "two" }] },
        ],
      },
    ]);
  });

  it("converts consecutive numbered lines into an ordered rich_text_list", () => {
    const els = elementsOf("1. first\n2. second");
    expect(els).toEqual([
      {
        type: "rich_text_list",
        style: "ordered",
        elements: [
          { type: "rich_text_section", elements: [{ type: "text", text: "first" }] },
          { type: "rich_text_section", elements: [{ type: "text", text: "second" }] },
        ],
      },
    ]);
  });

  it("starts a new list block when switching between bullet and ordered styles", () => {
    const els = elementsOf("- bullet\n1. ordered");
    expect(els).toEqual([
      {
        type: "rich_text_list",
        style: "bullet",
        elements: [{ type: "rich_text_section", elements: [{ type: "text", text: "bullet" }] }],
      },
      {
        type: "rich_text_list",
        style: "ordered",
        elements: [{ type: "rich_text_section", elements: [{ type: "text", text: "ordered" }] }],
      },
    ]);
  });

  it("supports inline formatting inside list items", () => {
    const els = elementsOf("- *bold item*\n- plain <@U1>");
    expect(els).toEqual([
      {
        type: "rich_text_list",
        style: "bullet",
        elements: [
          {
            type: "rich_text_section",
            elements: [{ type: "text", text: "bold item", style: { bold: true } }],
          },
          {
            type: "rich_text_section",
            elements: [
              { type: "text", text: "plain " },
              { type: "user", user_id: "U1" },
            ],
          },
        ],
      },
    ]);
  });

  it("does not misparse a numeric-but-non-list line like '1.5 apples'", () => {
    const els = elementsOf("1.5 apples");
    expect(els).toEqual([
      { type: "rich_text_section", elements: [{ type: "text", text: "1.5 apples" }] },
    ]);
  });
});

describe("mrkdwnToBlocks — mixed documents", () => {
  it("handles a paragraph, list, quote, code fence, and trailing paragraph in order", () => {
    const input = [
      "intro paragraph",
      "- item one",
      "- item two",
      "> a quote",
      "```",
      "code();",
      "```",
      "outro paragraph",
    ].join("\n");

    const els = elementsOf(input);
    expect(els).toEqual([
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: "intro paragraph" }],
      },
      {
        type: "rich_text_list",
        style: "bullet",
        elements: [
          { type: "rich_text_section", elements: [{ type: "text", text: "item one" }] },
          { type: "rich_text_section", elements: [{ type: "text", text: "item two" }] },
        ],
      },
      {
        type: "rich_text_quote",
        elements: [{ type: "text", text: "a quote" }],
      },
      {
        type: "rich_text_preformatted",
        elements: [{ type: "text", text: "code();" }],
      },
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: "outro paragraph" }],
      },
    ]);
  });
});
