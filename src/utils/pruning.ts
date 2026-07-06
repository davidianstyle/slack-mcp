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
// If a live workspace's response uses entirely different keys, pruning
// would reduce every draft to all-undefined fields — output that looks
// successful but is empty. To guard against that, a draft where no known
// field matched is returned raw instead of pruned.
export function pruneDraft(
  raw: Record<string, unknown>
): PrunedDraft | Record<string, unknown> {
  const destinations = raw.destinations;
  const destination = Array.isArray(destinations) ? destinations[0] : destinations;

  const pruned: PrunedDraft = {
    id: raw.id,
    last_updated_ts: raw.last_updated_ts,
    destination,
    text: blocksToText(raw.blocks),
  };

  const allUnknown =
    pruned.id === undefined &&
    pruned.last_updated_ts === undefined &&
    pruned.destination === undefined &&
    pruned.text === undefined;

  return allUnknown ? raw : pruned;
}

export interface PrunedEmojiList {
  names: string[];
  aliases: Record<string, string>;
}

const ALIAS_PREFIX = "alias:";

// emoji.list returns a flat { name: value } map where custom emoji point to
// an image URL and aliases point to another emoji's name as "alias:target".
// Splitting those apart gives the model both the full set of usable names
// and, separately, which ones just redirect to another real emoji.
export function pruneEmojiList(
  emoji: Record<string, string> | undefined
): PrunedEmojiList {
  const names: string[] = [];
  const aliases: Record<string, string> = {};

  for (const [name, value] of Object.entries(emoji ?? {})) {
    names.push(name);
    if (value.startsWith(ALIAS_PREFIX)) {
      aliases[name] = value.slice(ALIAS_PREFIX.length);
    }
  }

  return { names, aliases };
}

// Structural subsets of users.info's User (with its nested Profile) and
// users.profile.get's Profile — any object with at least these fields works,
// so callers don't need to import the @slack/web-api response types here.
export interface UserInfoSource {
  id?: string;
  name?: string;
  real_name?: string;
  is_bot?: boolean;
  is_admin?: boolean;
  tz?: string;
  profile?: ProfileGetSource;
}

export interface ProfileGetSource {
  display_name?: string;
  title?: string;
  email?: string;
  status_text?: string;
  status_emoji?: string;
}

export interface MergedUserInfo {
  id?: string;
  name?: string;
  real_name?: string;
  display_name?: string;
  title?: string;
  email?: string;
  tz?: string;
  status_text?: string;
  status_emoji?: string;
  is_bot?: boolean;
  is_admin?: boolean;
}

// Merges users.info + users.profile.get into the handful of fields a
// conversation actually needs. The two calls' profile fields overlap almost
// entirely; users.profile.get's copy wins on conflict since it's the
// purpose-built endpoint for profile data, falling back to users.info's
// nested profile if the profile.get call didn't return a value (e.g. a
// missing scope or a bot user with no profile).
export function mergeUserInfo(
  user: UserInfoSource | undefined,
  profile: ProfileGetSource | undefined
): MergedUserInfo {
  return {
    id: user?.id,
    name: user?.name,
    real_name: user?.real_name,
    display_name: profile?.display_name ?? user?.profile?.display_name,
    title: profile?.title ?? user?.profile?.title,
    email: profile?.email ?? user?.profile?.email,
    tz: user?.tz,
    status_text: profile?.status_text ?? user?.profile?.status_text,
    status_emoji: profile?.status_emoji ?? user?.profile?.status_emoji,
    is_bot: user?.is_bot,
    is_admin: user?.is_admin,
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
