export type ToolResult = { content: Array<{ type: "text"; text: string }> };

export function textResult(data: unknown): ToolResult {
  // Compact (non-indented) JSON — tool output is consumed by an LLM, not a
  // human reading raw text, so pretty-printing only burns tokens.
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text" as const, text }] };
}
