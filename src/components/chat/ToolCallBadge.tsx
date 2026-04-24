"use client";

import { Loader2, CheckCircle2 } from "lucide-react";

interface ToolCallBadgeProps {
  toolName: string;
  state: string;
  input?: Record<string, any>;
}

function getDescription(toolName: string, input?: Record<string, any>): string {
  if (!input) return toolName;

  if (toolName === "str_replace_editor") {
    const path = input.path ?? "";
    switch (input.command) {
      case "create":   return `Creating ${path}`;
      case "str_replace":
      case "insert":   return `Editing ${path}`;
      case "view":     return `Reading ${path}`;
      case "undo_edit": return `Reverting ${path}`;
    }
  }

  if (toolName === "file_manager") {
    switch (input.command) {
      case "rename": return `Renaming ${input.path} → ${input.new_path ?? ""}`;
      case "delete": return `Deleting ${input.path ?? ""}`;
    }
  }

  return toolName;
}

export function ToolCallBadge({ toolName, state, input }: ToolCallBadgeProps) {
  const done = state === "output-available" || state === "output-error";
  const description = getDescription(toolName, input);

  return (
    <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-mono border border-neutral-200">
      {done ? (
        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin text-blue-600 shrink-0" />
      )}
      <span className="text-neutral-700">{description}</span>
    </div>
  );
}

export { getDescription };
