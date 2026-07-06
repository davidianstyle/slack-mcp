import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebClient } from "@slack/web-api";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { memoizeWithTtl } from "../../utils/ttlCache.js";

const MEMBER_CACHE_TTL_MS = 10 * 60 * 1000;

type Member = NonNullable<
  Awaited<ReturnType<WebClient["users"]["list"]>>["members"]
>[number];

async function fetchAllMembers(client: WebClient): Promise<Member[]> {
  const members: Member[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.users.list({ cursor, limit: 200 });
    members.push(...(res.members ?? []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return members;
}

export function registerUsersTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;
  const getAllMembers = memoizeWithTtl(
    () => fetchAllMembers(api()),
    MEMBER_CACHE_TTL_MS
  );

  server.tool(
    "slack_users_search",
    "Search for users by name, email, or display name",
    {
      query: z.string().describe("Search query (name, email, or display name)"),
    },
    withErrorHandling(ctx.slug, async ({ query }) => {
      const members = await getAllMembers();
      const q = query.toLowerCase();

      const matches = members.filter((u) => {
        if (u.deleted || u.is_bot) return false;
        const name = u.real_name?.toLowerCase() ?? "";
        const display = u.profile?.display_name?.toLowerCase() ?? "";
        const email = u.profile?.email?.toLowerCase() ?? "";
        return name.includes(q) || display.includes(q) || email.includes(q);
      });

      return textResult(
        matches.map((u) => ({
          id: u.id,
          name: u.name,
          real_name: u.real_name,
          display_name: u.profile?.display_name,
          email: u.profile?.email,
          is_admin: u.is_admin,
          tz: u.tz,
        }))
      );
    })
  );
}
