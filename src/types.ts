import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebClient } from "@slack/web-api";
import { BrowserApi } from "./utils/browserApi.js";

export interface ServiceContext {
  client: WebClient;
  browserApi?: BrowserApi;
}

export type RegisterTools = (server: McpServer, ctx: ServiceContext) => void;
