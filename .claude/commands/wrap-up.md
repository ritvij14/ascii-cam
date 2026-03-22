---
description: End-of-session wrap-up. Run this before closing any Claude Code session.
allowed-tools: Bash, Edit, Read, mcp__task-master-ai__get_tasks, mcp__task-master-ai__get_task, mcp__task-master-ai__set_task_status, mcp__task-master-ai__update_subtask
---

Complete the following in order:

1. For every task worked on this session, update TaskMaster status using MCP tools:
   - Completed work → `set_task_status` to done
   - Started but unfinished → `set_task_status` to in-progress with a note
   - Discovered blocker → `set_task_status` to deferred with reason

2. Use `get_tasks` to review all pending tasks. Ask: does anything discovered
   this session change how any of these should be implemented? If yes, use
   `update_subtask` to update those task descriptions now before closing.

3. Confirm: "Session wrapped. Tasks updated: [list]."
