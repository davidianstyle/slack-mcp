import { WebClient } from "@slack/web-api";
import { memoizeWithTtl } from "./ttlCache.js";

// The authenticated identity doesn't change for the life of a (one
// process per workspace) run, so we fetch it via auth.test() once and
// share the result across every tool that needs "who am I" (my_mentions,
// usergroups_me).
export function createIdentityLookup(client: WebClient): () => Promise<string> {
  return memoizeWithTtl(async () => {
    const res = await client.auth.test();
    if (!res.user_id) {
      throw new Error("Could not determine authenticated user ID from auth.test()");
    }
    return res.user_id;
  }, Infinity);
}
