import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { pruneReminder, pruneReminders } from "../../utils/pruning.js";

// reminders.* is a user-token-only API family (no bot token scope exists
// for it) — see https://docs.slack.dev/changelog/2023-07-its-later-already-for-stars-and-reminders.
// If this workspace's token lacks the needed user scope, the call fails
// with `missing_scope` and the shared error mapper reports that cleanly.

export function registerRemindersTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const api = () => ctx.client;

  server.tool(
    "slack_add_reminder",
    "Create a reminder for yourself",
    {
      text: z.string().describe("The content of the reminder"),
      time: z
        .union([z.string(), z.number()])
        .describe(
          "When the reminder should fire: a Unix timestamp (up to 5 years out), the number of " +
            "seconds from now (if within 24 hours), or a natural-language description " +
            "(e.g. 'in 15 minutes', 'every Thursday')."
        ),
      user: z
        .string()
        .optional()
        .describe(
          "No longer supported by Slack — reminders can't be set for other users. Accepted only " +
            "for API compatibility; the reminder is always created for the authenticated user."
        ),
    },
    withErrorHandling(ctx.slug, async ({ text, time, user }) => {
      const res = await api().reminders.add({ text, time, user });
      return textResult({
        ok: res.ok,
        reminder: res.reminder ? pruneReminder(res.reminder) : undefined,
      });
    })
  );

  server.tool(
    "slack_list_reminders",
    "List reminders created by or for the authenticated user",
    {},
    withErrorHandling(ctx.slug, async () => {
      const res = await api().reminders.list();
      return textResult({ reminders: pruneReminders(res.reminders ?? []) });
    })
  );

  server.tool(
    "slack_complete_reminder",
    "Mark a reminder as complete",
    {
      reminder_id: z.string().describe("ID of the reminder to complete"),
    },
    withErrorHandling(ctx.slug, async ({ reminder_id }) => {
      const res = await api().reminders.complete({ reminder: reminder_id });
      return textResult({ ok: res.ok });
    })
  );

  server.tool(
    "slack_delete_reminder",
    "Delete a reminder",
    {
      reminder_id: z.string().describe("ID of the reminder to delete"),
    },
    withErrorHandling(ctx.slug, async ({ reminder_id }) => {
      const res = await api().reminders.delete({ reminder: reminder_id });
      return textResult({ ok: res.ok });
    })
  );
}
