import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToolCallBadge, getDescription } from "../ToolCallBadge";

afterEach(() => cleanup());

describe("getDescription", () => {
  it("str_replace_editor create", () => {
    expect(getDescription("str_replace_editor", { command: "create", path: "/App.jsx" }))
      .toBe("Creating /App.jsx");
  });

  it("str_replace_editor str_replace", () => {
    expect(getDescription("str_replace_editor", { command: "str_replace", path: "/components/Card.tsx" }))
      .toBe("Editing /components/Card.tsx");
  });

  it("str_replace_editor insert", () => {
    expect(getDescription("str_replace_editor", { command: "insert", path: "/App.jsx" }))
      .toBe("Editing /App.jsx");
  });

  it("str_replace_editor view", () => {
    expect(getDescription("str_replace_editor", { command: "view", path: "/App.jsx" }))
      .toBe("Reading /App.jsx");
  });

  it("file_manager rename", () => {
    expect(getDescription("file_manager", { command: "rename", path: "/old.jsx", new_path: "/new.jsx" }))
      .toBe("Renaming /old.jsx → /new.jsx");
  });

  it("file_manager delete", () => {
    expect(getDescription("file_manager", { command: "delete", path: "/unused.jsx" }))
      .toBe("Deleting /unused.jsx");
  });

  it("falls back to tool name for unknown tools", () => {
    expect(getDescription("some_unknown_tool", {})).toBe("some_unknown_tool");
  });

  it("falls back to tool name when input is missing", () => {
    expect(getDescription("str_replace_editor", undefined)).toBe("str_replace_editor");
  });
});

describe("ToolCallBadge", () => {
  it("shows spinner when in progress", () => {
    render(
      <ToolCallBadge toolName="str_replace_editor" state="input-available" input={{ command: "create", path: "/App.jsx" }} />
    );
    expect(screen.getByText("Creating /App.jsx")).toBeTruthy();
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows check icon when done", () => {
    render(
      <ToolCallBadge toolName="str_replace_editor" state="output-available" input={{ command: "create", path: "/App.jsx" }} />
    );
    expect(screen.getByText("Creating /App.jsx")).toBeTruthy();
    expect(document.querySelector(".animate-spin")).toBeFalsy();
  });

  it("shows check icon on output-error state", () => {
    render(
      <ToolCallBadge toolName="file_manager" state="output-error" input={{ command: "delete", path: "/App.jsx" }} />
    );
    expect(screen.getByText("Deleting /App.jsx")).toBeTruthy();
    expect(document.querySelector(".animate-spin")).toBeFalsy();
  });
});
