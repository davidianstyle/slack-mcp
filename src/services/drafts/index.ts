import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { BrowserApi } from "../../utils/browserApi.js";
import { mrkdwnToBlocks } from "../../utils/mrkdwn.js";

const NO_BROWSER_AUTH =
  "Slack drafts require browser-session tokens. Set SLACK_XOXC_<SLUG> and SLACK_XOXD_<SLUG> in ~/.config/openbrain/.env. See ~/Code/slack-mcp/README.md for extraction steps.";

function requireBrowserApi(ctx: ServiceContext): BrowserApi {
  if (!ctx.browserApi) throw new Error(NO_BROWSER_AUTH);
  return ctx.browserApi;
}

export function registerDraftsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  server.tool(
    "slack_drafts_list",
    "List draft messages saved in Slack",
    {
      count: z.number().optional().default(20).describe("Number of drafts to return"),
      cursor: z.string().optional().describe("Pagination cursor for next page"),
    },
    async ({ count, cursor }) => {
      const api = requireBrowserApi(ctx);
      const res = await api("drafts.list", { count, cursor });
      return textResult(res);
    }
  );

  server.tool(
    "slack_drafts_create",
    "Create a draft message in a channel, DM, or thread (appears in Slack's Drafts section). Only one draft per channel is allowed — if one exists already, use slack_drafts_edit instead.",
    {
      channel_id: z.string().describe("Channel or DM ID to draft the message in"),
      text: z.string().describe("Draft message text (Slack mrkdwn — *bold*, `code`, <url|link>, etc.)"),
      thread_ts: z.string().optional().describe("Thread timestamp to draft a reply to"),
    },
    async ({ channel_id, text, thread_ts }) => {
      const api = requireBrowserApi(ctx);
      const destination: Record<string, unknown> = { channel_id };
      if (thread_ts) {
        destination.thread_ts = thread_ts;
        destination.broadcast = false;
      }
      const res = await api("drafts.create", {
        client_msg_id: randomUUID(),
        destinations: JSON.stringify([destination]),
        blocks: JSON.stringify(mrkdwnToBlocks(text)),
        file_ids: "[]",
        is_from_composer: false,
      });
      return textResult(res);
    }
  );

  server.tool(
    "slack_drafts_edit",
    "Edit an existing draft message (replaces text and/or destination)",
    {
      draft_id: z.string().describe("ID of the draft to edit (from slack_drafts_list)"),
      channel_id: z.string().describe("Channel or DM ID the draft is in"),
      text: z.string().describe("Updated draft text (Slack mrkdwn)"),
      thread_ts: z.string().optional().describe("Thread timestamp if draft is a reply"),
    },
    async ({ draft_id, channel_id, text, thread_ts }) => {
      const api = requireBrowserApi(ctx);
      const destination: Record<string, unknown> = { channel_id };
      if (thread_ts) {
        destination.thread_ts = thread_ts;
        destination.broadcast = false;
      }
      const res = await api("drafts.editMessage", {
        draft_id,
        destinations: JSON.stringify([destination]),
        blocks: JSON.stringify(mrkdwnToBlocks(text)),
        file_ids: "[]",
      });
      return textResult(res);
    }
  );

  server.tool(
    "slack_drafts_delete",
    "Delete a draft by id.",
    {
      draft_id: z.string().describe("ID of the draft to delete (from slack_drafts_list)"),
    },
    async ({ draft_id }) => {
      const api = requireBrowserApi(ctx);
      // Slack expects client_last_updated_ts to be the *current* epoch time
      // the client is performing the delete, not the draft's stored
      // last_updated_ts. Naming is misleading — verified empirically.
      const nowTs = (Date.now() / 1000).toFixed(6);
      const res = await api("drafts.delete", {
        draft_id,
        client_last_updated_ts: nowTs,
      });
      return textResult(res);
    }
  );
}
