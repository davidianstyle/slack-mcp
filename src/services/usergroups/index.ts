import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerUsergroupsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "usergroups_list",
    "List user groups in the workspace",
    {
      include_users: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include member user IDs"),
      include_disabled: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include disabled groups"),
    },
    async ({ include_users, include_disabled }) => {
      const res = await api().usergroups.list({
        include_users,
        include_disabled,
      });
      return textResult(
        (res.usergroups || []).map((g) => ({
          id: g.id,
          name: g.name,
          handle: g.handle,
          description: g.description,
          is_external: g.is_external,
          user_count: g.user_count,
          users: g.users,
        }))
      );
    }
  );

  server.tool(
    "usergroups_create",
    "Create a new user group",
    {
      name: z.string().describe("Name of the user group"),
      handle: z.string().optional().describe("Mention handle (without @)"),
      description: z.string().optional().describe("Group description"),
      channels: z
        .array(z.string())
        .optional()
        .describe("Default channel IDs for the group"),
    },
    async ({ name, handle, description, channels }) => {
      const res = await api().usergroups.create({
        name,
        handle,
        description,
        channels: channels?.join(","),
      });
      return textResult(res.usergroup);
    }
  );

  server.tool(
    "usergroups_update",
    "Update a user group's metadata",
    {
      usergroup_id: z.string().describe("User group ID to update"),
      name: z.string().optional().describe("New name"),
      handle: z.string().optional().describe("New mention handle"),
      description: z.string().optional().describe("New description"),
      channels: z
        .array(z.string())
        .optional()
        .describe("New default channel IDs"),
    },
    async ({ usergroup_id, name, handle, description, channels }) => {
      const res = await api().usergroups.update({
        usergroup: usergroup_id,
        name,
        handle,
        description,
        channels: channels?.join(","),
      });
      return textResult(res.usergroup);
    }
  );

  server.tool(
    "usergroups_users_update",
    "Replace all members of a user group",
    {
      usergroup_id: z.string().describe("User group ID"),
      user_ids: z
        .array(z.string())
        .describe("User IDs to set as the group's members (replaces all)"),
    },
    async ({ usergroup_id, user_ids }) => {
      const res = await api().usergroups.users.update({
        usergroup: usergroup_id,
        users: user_ids.join(","),
      });
      return textResult(res.usergroup);
    }
  );

  server.tool(
    "usergroups_me",
    "List user groups the authenticated user belongs to, or join/leave a group",
    {
      action: z
        .enum(["list", "join", "leave"])
        .default("list")
        .describe("Action to perform"),
      usergroup_id: z
        .string()
        .optional()
        .describe("Group ID (required for join/leave)"),
    },
    async ({ action, usergroup_id }) => {
      const authRes = await api().auth.test();
      const myId = authRes.user_id!;

      if (action === "list") {
        const groups = await api().usergroups.list({ include_users: true });
        const mine = (groups.usergroups || []).filter((g) =>
          g.users?.includes(myId)
        );
        return textResult(
          mine.map((g) => ({
            id: g.id,
            name: g.name,
            handle: g.handle,
          }))
        );
      }

      if (!usergroup_id)
        return textResult({ error: "usergroup_id required for join/leave" });

      const group = await api().usergroups.users.list({
        usergroup: usergroup_id,
      });
      let users = group.users || [];

      if (action === "join") {
        if (!users.includes(myId)) users = [...users, myId];
      } else {
        users = users.filter((u) => u !== myId);
      }

      const res = await api().usergroups.users.update({
        usergroup: usergroup_id,
        users: users.join(","),
      });
      return textResult(res.usergroup);
    }
  );
}
