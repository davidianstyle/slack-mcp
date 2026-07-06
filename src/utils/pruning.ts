// Compaction helpers for tool output. Slack messages and drafts carry a lot
// of payload (blocks, attachments, thumbnail URLs, etc.) that's irrelevant
// noise for an LLM reading tool output — these functions cut each down to
// the handful of fields actually useful for a conversation/drafts workflow.

// Structural subset of @slack/web-api's MessageElement (history & replies
// each define their own near-identical copy of this type, so we don't
// import either directly — any object with at least these fields works).
export interface PruneableMessage {
  ts?: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: unknown;
  subtype?: string;
  files?: Array<{ name?: string }>;
}

export interface PrunedMessage {
  ts?: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: unknown;
  subtype?: string;
  files?: string[];
}

export function pruneMessage(msg: PruneableMessage): PrunedMessage {
  const pruned: PrunedMessage = {
    ts: msg.ts,
    user: msg.user,
    text: msg.text,
    thread_ts: msg.thread_ts,
    reply_count: msg.reply_count,
    reactions: msg.reactions,
    subtype: msg.subtype,
  };

  const names = (msg.files ?? [])
    .map((f) => f.name)
    .filter((name): name is string => typeof name === "string");
  if (names.length > 0) {
    pruned.files = names;
  }

  return pruned;
}

export function pruneMessages(messages: readonly PruneableMessage[]): PrunedMessage[] {
  return messages.map(pruneMessage);
}

export interface PrunedDraft {
  id?: unknown;
  last_updated_ts?: unknown;
  destination?: unknown;
  text?: string;
}

// drafts.list is an undocumented, internal Slack endpoint (see
// utils/browserApi.ts) — there's no published response schema. Field names
// below are inferred from what this codebase already knows about the
// request shape: drafts.create/editMessage send `destinations` and
// `blocks` (see services/drafts/index.ts), and the drafts.delete handler's
// comment confirms the draft's own timestamp field is `last_updated_ts`.
// If a live workspace's response uses different keys, these will simply
// come back `undefined` rather than throw.
export function pruneDraft(raw: Record<string, unknown>): PrunedDraft {
  const destinations = raw.destinations;
  const destination = Array.isArray(destinations) ? destinations[0] : destinations;

  return {
    id: raw.id,
    last_updated_ts: raw.last_updated_ts,
    destination,
    text: blocksToText(raw.blocks),
  };
}

interface RichTextLeaf {
  type?: string;
  text?: string;
  url?: string;
  user_id?: string;
  channel_id?: string;
  range?: string;
}

interface RichTextSection {
  type?: string;
  elements?: RichTextLeaf[];
}

interface RichTextBlock {
  type?: string;
  elements?: RichTextSection[];
}

// Best-effort flatten of the rich_text block structure produced by
// utils/mrkdwn.ts's mrkdwnToBlocks back into a plain-text preview. Styling
// (bold/italic/code) is intentionally not reconstructed — this is a preview,
// not a round-trip.
function blocksToText(blocks: unknown): string | undefined {
  if (!Array.isArray(blocks)) return undefined;

  const parts: string[] = [];
  for (const block of blocks as RichTextBlock[]) {
    if (block?.type !== "rich_text" || !Array.isArray(block.elements)) continue;
    for (const section of block.elements) {
      if (!Array.isArray(section?.elements)) continue;
      for (const leaf of section.elements) {
        parts.push(leafToText(leaf));
      }
    }
  }

  return parts.length > 0 ? parts.join("") : undefined;
}

function leafToText(leaf: RichTextLeaf): string {
  switch (leaf.type) {
    case "text":
      return leaf.text ?? "";
    case "link":
      return leaf.text ?? leaf.url ?? "";
    case "user":
      return leaf.user_id ? `<@${leaf.user_id}>` : "";
    case "channel":
      return leaf.channel_id ? `<#${leaf.channel_id}>` : "";
    case "broadcast":
      return leaf.range ? `<!${leaf.range}>` : "";
    default:
      return "";
  }
}
