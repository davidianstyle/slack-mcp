import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerUsersTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "slack_users_search",
    "Search for users by name, email, or display name",
    {
      query: z.string().describe("Search query (name, email, or display name)"),
    },
    async ({ query }) => {
      const res = await api().users.list({});
      const q = query.toLowerCase();

      const matches = (res.members || []).filter((u) => {
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
    }
  );
}
