import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";

export function registerCanvasTools(server: McpServer, ctx: ServiceContext): void {
  const api = () => ctx.client;

  server.tool(
    "slack_create_canvas",
    "Create a standalone canvas from markdown content",
    {
      title: z.string().optional().describe("Title of the new canvas"),
      markdown: z.string().describe("Markdown content for the canvas body"),
    },
    withErrorHandling(ctx.slug, async ({ title, markdown }) => {
      const res = await api().canvases.create({
        title,
        document_content: { type: "markdown", markdown },
      });
      return textResult({ ok: res.ok, canvas_id: res.canvas_id });
    })
  );

  server.tool(
    "slack_edit_canvas",
    "Replace an existing canvas's entire content with new markdown",
    {
      canvas_id: z.string().describe("ID of the canvas to edit"),
      markdown: z.string().describe("New markdown content, replacing the canvas's current content"),
    },
    withErrorHandling(ctx.slug, async ({ canvas_id, markdown }) => {
      const res = await api().canvases.edit({
        canvas_id,
        changes: [
          {
            operation: "replace",
            document_content: { type: "markdown", markdown },
          },
        ],
      });
      return textResult({ ok: res.ok });
    })
  );
}
