// Shared resolution of a tool call's text/blocks/mrkdwn params into the
// { text, blocks } shape the Slack Web API's chat.* methods expect.
//
// Two independent ways exist to attach Block Kit content to a message:
//  - `blocks`: a raw JSON string of block objects, passed straight through
//    (validated for shape only — see utils/validate.ts's parseBlocksJson).
//  - `mrkdwn`: opt in to converting `text` into rich_text blocks locally via
//    utils/mrkdwn.ts, which — unlike Slack's own plain-mrkdwn text
//    rendering — supports real bullet/ordered lists, block quotes, and code
//    fences.
// They both ultimately set the same `blocks` field on the outgoing request,
// so passing both is rejected rather than silently picking a winner.

import type { Block, KnownBlock } from "@slack/types";
import { ValidationError, parseBlocksJson } from "./validate.js";
import { mrkdwnToBlocks } from "./mrkdwn.js";

// Shared tool-param description for the `blocks` param on every tool that
// accepts it (add_message, edit_message, schedule_message). Tools that also
// take a `mrkdwn` param should append their own mutual-exclusion note.
export const BLOCKS_DESCRIPTION =
  "Block Kit blocks as a JSON string (an array of block objects), for rich message layout beyond " +
  "plain mrkdwn text. When both text and blocks are given, text is used only as the notification " +
  "fallback (e.g. push notifications, thread list previews). " +
  "See https://api.slack.com/reference/block-kit/blocks.";

export interface MessageContentInput {
  text: string;
  blocks?: string;
  mrkdwn?: boolean;
}

export interface ResolvedMessageContent {
  text: string;
  blocks?: (KnownBlock | Block)[];
}

export function resolveMessageContent({
  text,
  blocks,
  mrkdwn,
}: MessageContentInput): ResolvedMessageContent {
  if (blocks && mrkdwn) {
    throw new ValidationError(
      "Pass either `blocks` or `mrkdwn: true`, not both — both determine the message's Block Kit payload."
    );
  }

  if (blocks) {
    return { text, blocks: parseBlocksJson(blocks) as unknown as (KnownBlock | Block)[] };
  }

  if (mrkdwn) {
    if (!text) {
      throw new ValidationError(
        "mrkdwn: true requires non-empty `text` to convert into rich-text blocks."
      );
    }
    return { text, blocks: mrkdwnToBlocks(text) as unknown as (KnownBlock | Block)[] };
  }

  return { text };
}
