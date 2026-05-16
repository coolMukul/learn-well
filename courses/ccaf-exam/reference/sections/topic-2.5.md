# Task 2.5 — Select and apply built-in tools (Read, Write, Edit, Bash, Grep, Glob) effectively

> Domain 2: Tool Design & MCP Integration. Excerpted from the official guide.

## Knowledge of
- **Grep** for content search (searching file contents for patterns like function names, error messages, or import statements).
- **Glob** for file path pattern matching (finding files by name or extension patterns).
- **Read/Write** for full file operations; **Edit** for targeted modifications using unique text matching.
- When `Edit` fails due to non-unique text matches, using **Read + Write** as a fallback for reliable file modifications.

## Skills in
- Selecting **Grep** for searching code content across a codebase (e.g., finding all callers of a function, locating error messages).
- Selecting **Glob** for finding files matching naming patterns (e.g., `**/*.test.tsx`).
- Using **Read** to load full file contents followed by **Write** when `Edit` cannot find unique anchor text.
- Building codebase understanding **incrementally**: starting with Grep to find entry points, then using Read to follow imports and trace flows, rather than reading all files upfront.
- Tracing function usage across wrapper modules by first identifying all exported names, then searching for each name across the codebase.
