import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebClient } from "@slack/web-api";

export interface ServiceContext {
  client: WebClient;
}

export type RegisterTools = (server: McpServer, ctx: ServiceContext) => void;
