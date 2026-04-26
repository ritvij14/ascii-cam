# Task Master AI - Usage Guide

> **IMPORTANT:** Task Master is used via MCP server in this project. CLI commands are not supported. If MCP tools are unavailable, report to user immediately.

## MCP Tools (Primary Interface)

Use these MCP tools instead of CLI commands:

| Operation | MCP Tool |
|-----------|----------|
| Get next task | `mcp__task-master-ai__next_task` |
| List all tasks | `mcp__task-master-ai__get_tasks` |
| View task details | `mcp__task-master-ai__get_task` |
| Parse PRD to tasks | `mcp__task-master-ai__parse_prd` |
| Expand task into subtasks | `mcp__task-master-ai__expand_task` |
| Analyze complexity | `mcp__task-master-ai__analyze_project_complexity` |
| Update task | `mcp__task-master-ai__update_task` |
| Update multiple tasks | `mcp__task-master-ai__update` |
| Set task status | `mcp__task-master-ai__set_task_status` |
| Add new task | `mcp__task-master-ai__add_task` |
| Add dependency | `mcp__task-master-ai__add_dependency` |
| Validate dependencies | `mcp__task-master-ai__validate_dependencies` |


## Task Structure

### ID Format
- Main tasks: `1`, `2`, `3`
- Subtasks: `1.1`, `1.2`, `2.1`
- Sub-subtasks: `1.1.1`, `1.1.2`

### Status Values
- `pending` — Ready to work on
- `in-progress` — Currently being worked on
- `done` — Completed and verified
- `deferred` — Postponed
- `cancelled` — No longer needed
- `blocked` — Waiting on external factors

### Task Fields
```json
{
  "id": "1.2",
  "title": "Implement user authentication",
  "description": "Set up JWT-based auth system",
  "status": "pending",
  "priority": "high",
  "dependencies": ["1.1"],
  "details": "Implementation instructions...",
  "testStrategy": "How to verify...",
  "subtasks": []
}
```

## Iterative Subtask Implementation

1. Use `mcp__task-master-ai__get_task` with subtask ID — Understand requirements
2. Explore codebase and plan implementation
3. Use `mcp__task-master-ai__update_task` — Log plan
4. Use `mcp__task-master-ai__set_task_status` with status "in-progress" — Start work
5. Implement code following logged plan
6. Use `mcp__task-master-ai__update_task` — Log progress
7. Use `mcp__task-master-ai__set_task_status` with status "done" — Complete task

## Adding New Features via PRD

When new features need to be added to an existing project:
1. Write a focused PRD in `.taskmaster/docs/<feature-name>.md`
2. Use `mcp__task-master-ai__parse_prd` with the PRD path and append mode
3. Use `mcp__task-master-ai__analyze_project_complexity` on the new task IDs
4. Use `mcp__task-master-ai__expand_task` to break into subtasks

## Rules

- Never manually edit `tasks.json` — use MCP tools instead
- Never manually edit `.taskmaster/config.json` — use MCP tools
- Task files in `.taskmaster/tasks/` are auto-generated from tasks.json
- AI-powered operations make MCP calls and may take up to a minute
- Do not re-initialize — it will not do anything beyond re-adding the same core files

## Efficiency Guidelines

**Use these tools in this priority order:**

1. `mcp__task-master-ai__next_task` — Get next available task. Use this FIRST.
2. `mcp__task-master-ai__get_task` — For getting single task details and dependencies
3. `mcp__task-master-ai__update_task` — Update task details as you work
4. `mcp__task-master-ai__set_task_status` — Mark tasks in-progress/done

These 4 tools should cover 90% of your Task Master usage.

**When NOT to use get_tasks:**
- If you need all tasks and the output is large, it writes to a file and wastes memory
- Instead, for specific searches, use grep on `tasks. json` directly
- If you genuinely need all tasks, read `tasks. json` file directly

The goal is to be efficient: next_task → get_task → update → set_status. That's it.
