#!/usr/bin/env node
import { program } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadAuth } from "./auth.js";
import { createServer } from "./server.js";

program
  .name("slack-mcp")
  .description("Slack MCP server for Claude Code")
  .requiredOption("--slug <slug>", "Slack workspace slug (e.g. acme-slack-com)")
  .parse();

const opts = program.opts<{ slug: string }>();

const client = loadAuth(opts.slug);
const server = createServer({ client });
const transport = new StdioServerTransport();
await server.connect(transport);
