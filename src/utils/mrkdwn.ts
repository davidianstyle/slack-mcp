// Convert Slack mrkdwn source into a rich_text block.
//
// Slack drafts only surface in the client UI when the block type is
// `rich_text`. Sending `section/mrkdwn` drafts is accepted by the API but
// the resulting drafts are invisible in the composer and "Drafts & sent"
// view.
//
// Slack renders all content as a single `rich_text_section`. Paragraph
// breaks live as embedded `\n\n` inside text elements — splitting content
// across multiple sections collapses the whitespace. So we emit one section
// with typed elements interleaved (text, link, user mention, broadcast,
// channel), preserving newlines and bullet characters in the text strings.

type RichElement =
  | { type: "text"; text: string; style?: Record<string, boolean> }
  | { type: "link"; url: string; text?: string; style?: Record<string, boolean> }
  | { type: "user"; user_id: string }
  | { type: "channel"; channel_id: string }
  | { type: "broadcast"; range: string };

interface RichTextBlock {
  type: "rich_text";
  elements: [{ type: "rich_text_section"; elements: RichElement[] }];
}

export function mrkdwnToBlocks(input: string): RichTextBlock[] {
  const normalized = input.replace(/\r\n/g, "\n");
  return [
    {
      type: "rich_text",
      elements: [
        { type: "rich_text_section", elements: parseInline(normalized) },
      ],
    },
  ];
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
