import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { validateChannelId } from "../../utils/validate.js";
import { pruneBookmark, pruneBookmarks } from "../../utils/pruning.js";

export function registerBookmarksTools(server: McpServer, ctx: ServiceContext): void {
  const api = () => ctx.client;

  server.tool(
    "slack_list_bookmarks",
    "List bookmarks attached to a channel",
    {
      channel_id: z.string().describe("Channel ID to list bookmarks for"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id }) => {
      validateChannelId(channel_id);
      const res = await api().bookmarks.list({ channel_id });
      return textResult({ bookmarks: pruneBookmarks(res.bookmarks ?? []) });
    })
  );

  server.tool(
    "slack_add_bookmark",
    "Add a link bookmark to a channel",
    {
      channel_id: z.string().describe("Channel ID to bookmark the link in"),
      title: z.string().describe("Title for the bookmark"),
      link: z.string().describe("URL the bookmark links to"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, title, link }) => {
      validateChannelId(channel_id);
      const res = await api().bookmarks.add({
        channel_id,
        title,
        link,
        type: "link",
      });
      return textResult({
        ok: res.ok,
        bookmark: res.bookmark ? pruneBookmark(res.bookmark) : undefined,
      });
    })
  );

  server.tool(
    "slack_remove_bookmark",
    "Remove a bookmark from a channel",
    {
      channel_id: z.string().describe("Channel ID the bookmark belongs to"),
      bookmark_id: z.string().describe("ID of the bookmark to remove (from slack_list_bookmarks)"),
    },
    withErrorHandling(ctx.slug, async ({ channel_id, bookmark_id }) => {
      validateChannelId(channel_id);
      const res = await api().bookmarks.remove({ channel_id, bookmark_id });
      return textResult({ ok: res.ok });
    })
  );
}
