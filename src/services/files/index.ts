import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FilesUploadV2Arguments } from "@slack/web-api";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { validateChannelId, validateTs, ValidationError } from "../../utils/validate.js";
import { pruneUploadedFiles, type UploadedFileSource } from "../../utils/pruning.js";

// files.uploadV2's declared return type is a bare WebAPICallResult — the
// SDK's public method signature doesn't model the `files` array its real
// response carries (see file-upload.d.ts's own usage example, which reads
// `res.files`). Same kind of typing gap as pins.list's Item type; this
// loose shape reads the actual runtime response instead of fighting it.
interface FilesUploadV2Result {
  ok?: boolean;
  files?: Array<{ files?: UploadedFileSource[] }>;
}

export function registerFilesTools(server: McpServer, ctx: ServiceContext): void {
  const api = () => ctx.client;

  server.tool(
    "slack_upload_file",
    "Upload a file, from a local path or inline text content, optionally sharing it to a channel " +
      "(or as a thread reply). Provide exactly one of local_path or content. Omit channel_id to " +
      "upload the file privately (not shared to any channel).",
    {
      channel_id: z
        .string()
        .optional()
        .describe("Channel ID to share the file in. Required if thread_ts is given."),
      local_path: z
        .string()
        .optional()
        .describe("Path to a local file to read and upload. Mutually exclusive with content."),
      content: z
        .string()
        .optional()
        .describe("Inline text content to upload as a file. Mutually exclusive with local_path."),
      filename: z.string().describe("Name of the file"),
      title: z.string().optional().describe("Display title for the file"),
      thread_ts: z
        .string()
        .optional()
        .describe("Thread timestamp to upload the file as a reply to (requires channel_id)"),
    },
    withErrorHandling(
      ctx.slug,
      async ({ channel_id, local_path, content, filename, title, thread_ts }) => {
        if (channel_id) validateChannelId(channel_id);
        if (thread_ts) {
          if (!channel_id) {
            throw new ValidationError("thread_ts requires channel_id to also be given.");
          }
          validateTs(thread_ts, "thread_ts");
        }
        if (!local_path && content === undefined) {
          throw new ValidationError("Provide either local_path or content.");
        }
        if (local_path && content !== undefined) {
          throw new ValidationError("Provide only one of local_path or content, not both.");
        }

        // The destination (channel-only vs. channel+thread_ts vs. private
        // upload) and contents (local path vs. inline text) are each
        // mutually-exclusive unions in FilesUploadV2Arguments; we've already
        // enforced those same constraints above via ValidationError, so
        // asserting the merged shape here is just telling TS what our own
        // runtime checks already guarantee.
        const args = {
          ...(channel_id ? { channel_id } : {}),
          ...(thread_ts ? { thread_ts } : {}),
          ...(local_path ? { file: local_path } : { content: content as string }),
          filename,
          title,
        } as FilesUploadV2Arguments;

        const res = (await api().files.uploadV2(args)) as FilesUploadV2Result;

        const files = (res.files ?? []).flatMap((group) => group.files ?? []);
        return textResult({ ok: res.ok, files: pruneUploadedFiles(files) });
      }
    )
  );
}
