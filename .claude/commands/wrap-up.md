---
description: End-of-session wrap-up. Run this before closing any Claude Code session.
allowed-tools: Bash, Edit, Write, Read, mcp__task-master-ai__get_tasks, mcp__task-master-ai__get_task, mcp__task-master-ai__set_task_status, mcp__task-master-ai__update_subtask
---

Complete the following in order:

1. **Documentation review** — only if `.claude/session-changed` exists (files were modified this turn):

   a. List every file you edited or created this turn.

   b. For each changed file, identify which feature it belongs to and open the
      corresponding doc in `docs/features/`. Update it with:
      - **What** changed (brief description)
      - **Why** it changed (the motivation or problem being solved)
      - **How** it was implemented (key decisions, patterns used, anything non-obvious)

   c. If any architectural decision was made (technology choice, pattern adoption,
      structural change), add an entry to `docs/infra/decisions.md`.

   d. Append a session entry to `docs/infra/changelog.md` (create the file if it
      does not exist) using this format:
      ```
      ## YYYY-MM-DD — [one-line summary of what this session did]

      **Changed:** [files or areas touched]
      **Why:** [motivation]
      **How:** [implementation notes, decisions made]
      ```

   e. Run: `rm -f .claude/session-changed` to clear the review requirement.

2. For every task worked on this session, update TaskMaster status using MCP tools:
   - Completed work → `set_task_status` to done
   - Started but unfinished → `set_task_status` to in-progress with a note
   - Discovered blocker → `set_task_status` to deferred with reason

3. Use `get_tasks` to review all pending tasks. Ask: does anything discovered
   this session change how any of these should be implemented? If yes, use
   `update_subtask` to update those task descriptions now before closing.

4. Confirm: "Session wrapped. Docs updated: [list]. Tasks updated: [list]."
