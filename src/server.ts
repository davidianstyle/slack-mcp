import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SlackAuth } from "./auth.js";
import { ServiceContext } from "./types.js";
import { createIdentityLookup } from "./utils/identity.js";
import { registerConversationsTools } from "./services/conversations/index.js";
import { registerChannelsTools } from "./services/channels/index.js";
import { registerUsersTools } from "./services/users/index.js";
import { registerUsergroupsTools } from "./services/usergroups/index.js";
import { registerDraftsTools } from "./services/drafts/index.js";
import { registerReactionsTools } from "./services/reactions/index.js";
import { registerScheduledTools } from "./services/scheduled/index.js";

export function createServer(auth: SlackAuth): McpServer {
  const server = new McpServer({
    name: "slack-mcp",
    version: "0.1.0",
  });

  const ctx: ServiceContext = {
    ...auth,
    getMyUserId: createIdentityLookup(auth.client),
  };

  registerConversationsTools(server, ctx);
  registerChannelsTools(server, ctx);
  registerUsersTools(server, ctx);
  registerUsergroupsTools(server, ctx);
  registerDraftsTools(server, ctx);
  registerReactionsTools(server, ctx);
  registerScheduledTools(server, ctx);

  return server;
}
