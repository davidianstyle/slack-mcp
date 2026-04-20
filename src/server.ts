import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ServiceContext } from "./types.js";
import { registerConversationsTools } from "./services/conversations/index.js";
import { registerChannelsTools } from "./services/channels/index.js";
import { registerUsersTools } from "./services/users/index.js";
import { registerUsergroupsTools } from "./services/usergroups/index.js";

export function createServer(ctx: ServiceContext): McpServer {
  const server = new McpServer({
    name: "slack-mcp",
    version: "0.1.0",
  });

  registerConversationsTools(server, ctx);
  registerChannelsTools(server, ctx);
  registerUsersTools(server, ctx);
  registerUsergroupsTools(server, ctx);

  return server;
}
