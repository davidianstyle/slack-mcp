// Convert Slack mrkdwn source into rich_text blocks.
//
// Slack drafts only surface in the client UI when the block type is
// `rich_text`. Sending `section/mrkdwn` drafts is accepted by the API but
// the resulting drafts are invisible in the composer and "Drafts & sent"
// view. The same rich_text conversion is also used (opt-in, via the
// `mrkdwn` tool param) when posting/editing live messages, since it's the
// only way to get real bullet/ordered lists, block quotes, and code fences
// — Slack's plain mrkdwn text parser renders those constructs literally
// (e.g. a "- item" line shows up as the literal characters "- item", not an
// actual bullet).
//
// A rich_text block's `elements` array holds block-level entries in
// document order: rich_text_section (a run of inline content),
// rich_text_preformatted (a fenced code block), rich_text_quote (a `>`
// block quote), and rich_text_list (a run of `-`/`*`/`+` or `1.` lines).
//
// Within a rich_text_section, paragraph breaks live as embedded `\n\n`
// inside text elements — splitting a plain-text run across multiple
// sections collapses the whitespace in Slack's renderer. So any contiguous
// run of lines that isn't a code fence, quote, or list is kept as a single
// section, preserving internal blank lines exactly as written.

type RichElement =
  | { type: "text"; text: string; style?: Record<string, boolean> }
  | { type: "link"; url: string; text?: string; style?: Record<string, boolean> }
  | { type: "user"; user_id: string }
  | { type: "channel"; channel_id: string }
  | { type: "broadcast"; range: string };

// rich_text_preformatted only allows "text" and "link" leaves (no styling,
// no mentions) — code content is never run through the inline parser.
type PreformattedElement = { type: "text"; text: string };

interface RichTextSectionElement {
  type: "rich_text_section";
  elements: RichElement[];
}

interface RichTextPreformattedElement {
  type: "rich_text_preformatted";
  elements: PreformattedElement[];
}

interface RichTextQuoteElement {
  type: "rich_text_quote";
  elements: RichElement[];
}

interface RichTextListElement {
  type: "rich_text_list";
  style: "bullet" | "ordered";
  elements: RichTextSectionElement[];
}

type BlockElement =
  | RichTextSectionElement
  | RichTextPreformattedElement
  | RichTextQuoteElement
  | RichTextListElement;

interface RichTextBlock {
  type: "rich_text";
  elements: BlockElement[];
}

export function mrkdwnToBlocks(input: string): RichTextBlock[] {
  const normalized = input.replace(/\r\n/g, "\n");
  return [
    {
      type: "rich_text",
      elements: parseBlockLevel(normalized),
    },
  ];
}

// A fence line is a ``` marker optionally followed by a language tag, alone
// on its line. Only lines that match this exactly delimit a code block —
// inline ``` usage inside a paragraph is left untouched.
const FENCE_RE = /^```(\S*)?\s*$/;
const QUOTE_RE = /^>\s?(.*)$/;
const BULLET_RE = /^[-*+]\s+(.*)$/;
const ORDERED_RE = /^\d+\.\s+(.*)$/;

// Find every well-formed (opened-and-closed) fence pair, scanning greedily
// left to right. An unmatched opening fence (no later closing line) is left
// unclaimed and falls back to being parsed as plain paragraph text.
function findFenceRanges(lines: string[]): Map<number, number> {
  const ranges = new Map<number, number>();
  let i = 0;
  while (i < lines.length) {
    if (FENCE_RE.test(lines[i])) {
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (FENCE_RE.test(lines[j])) {
          close = j;
          break;
        }
      }
      if (close !== -1) {
        ranges.set(i, close);
        i = close + 1;
        continue;
      }
    }
    i++;
  }
  return ranges;
}

function parseBlockLevel(text: string): BlockElement[] {
  const lines = text.split("\n");
  const fenceRanges = findFenceRanges(lines);
  const out: BlockElement[] = [];
  let i = 0;

  while (i < lines.length) {
    const fenceClose = fenceRanges.get(i);
    if (fenceClose !== undefined) {
      const code = lines.slice(i + 1, fenceClose).join("\n");
      out.push({
        type: "rich_text_preformatted",
        elements: code.length > 0 ? [{ type: "text", text: code }] : [],
      });
      i = fenceClose + 1;
      continue;
    }

    if (QUOTE_RE.test(lines[i])) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].replace(QUOTE_RE, "$1"));
        i++;
      }
      out.push({
        type: "rich_text_quote",
        elements: parseInline(quoteLines.join("\n")),
      });
      continue;
    }

    if (BULLET_RE.test(lines[i]) || ORDERED_RE.test(lines[i])) {
      const style: "bullet" | "ordered" = BULLET_RE.test(lines[i]) ? "bullet" : "ordered";
      const items: RichElement[][] = [];
      while (i < lines.length) {
        const re = style === "bullet" ? BULLET_RE : ORDERED_RE;
        if (!re.test(lines[i])) break;
        items.push(parseInline(lines[i].replace(re, "$1")));
        i++;
      }
      out.push({
        type: "rich_text_list",
        style,
        elements: items.map((elements) => ({
          type: "rich_text_section" as const,
          elements,
        })),
      });
      continue;
    }

    // Plain paragraph run: consume lines until the next special block
    // starts (or end of input). Blank lines *inside* the run are genuine
    // paragraph breaks and are preserved verbatim (see header comment);
    // blank lines at the run's edges are just the gap next to a
    // neighboring quote/list/fence and are trimmed away.
    const start = i;
    while (
      i < lines.length &&
      fenceRanges.get(i) === undefined &&
      !QUOTE_RE.test(lines[i]) &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i])
    ) {
      i++;
    }
    const rawLines = lines.slice(start, i);
    let from = 0;
    let to = rawLines.length;
    while (from < to && rawLines[from].trim() === "") from++;
    while (to > from && rawLines[to - 1].trim() === "") to--;
    const trimmedLines = rawLines.slice(from, to);

    if (trimmedLines.length > 0) {
      out.push({
        type: "rich_text_section",
        elements: parseInline(trimmedLines.join("\n")),
      });
    } else if (out.length === 0 && i >= lines.length) {
      // The whole document was blank — still emit one (empty) section
      // rather than an empty elements array, matching prior behavior.
      out.push({ type: "rich_text_section", elements: parseInline(rawLines.join("\n")) });
    }
  }

  return out;
}

function parseInline(text: string): RichElement[] {
  const out: RichElement[] = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (buf.length === 0) return;
    out.push({ type: "text", text: buf });
    buf = "";
  };

  while (i < text.length) {
    const ch = text[i];

    // Slack tag: <...>
    if (ch === "<") {
      const close = text.indexOf(">", i + 1);
      if (close !== -1) {
        flush();
        const inner = text.slice(i + 1, close);
        out.push(parseSlackTag(inner));
        i = close + 1;
        continue;
      }
    }

    // Style spans: *bold*, _italic_, `code`, ~strike~
    const span = matchSpan(text, i);
    if (span) {
      flush();
      out.push({ type: "text", text: span.text, style: { [span.style]: true } });
      i = span.endIdx;
      continue;
    }

    buf += ch;
    i++;
  }

  flush();
  return out;
}

function parseSlackTag(inner: string): RichElement {
  if (inner.startsWith("@")) {
    const id = inner.slice(1).split("|")[0];
    return { type: "user", user_id: id };
  }
  if (inner.startsWith("#")) {
    const id = inner.slice(1).split("|")[0];
    return { type: "channel", channel_id: id };
  }
  if (inner.startsWith("!")) {
    const range = inner.slice(1).split("|")[0];
    return { type: "broadcast", range };
  }
  const pipe = inner.indexOf("|");
  if (pipe === -1) return { type: "link", url: inner };
  return { type: "link", url: inner.slice(0, pipe), text: inner.slice(pipe + 1) };
}

const SPAN_MARKERS: Array<{ char: string; style: "bold" | "italic" | "code" | "strike" }> = [
  { char: "`", style: "code" },
  { char: "*", style: "bold" },
  { char: "_", style: "italic" },
  { char: "~", style: "strike" },
];

function matchSpan(
  text: string,
  i: number
): { text: string; style: "bold" | "italic" | "code" | "strike"; endIdx: number } | null {
  for (const { char, style } of SPAN_MARKERS) {
    if (text[i] !== char) continue;
    if (i + 1 >= text.length || /\s/.test(text[i + 1])) continue;
    const close = text.indexOf(char, i + 1);
    if (close === -1) continue;
    if (/\s/.test(text[close - 1])) continue;
    if (text.slice(i + 1, close).includes("\n")) continue;
    return { text: text.slice(i + 1, close), style, endIdx: close + 1 };
  }
  return null;
}
