# Task Master AI - Command Reference

## CLI Commands

```bash
# Daily Workflow
task-master list                                   # Show all tasks with status
task-master next                                   # Get next available task to work on
task-master show <id>                              # View task details (e.g., task-master show 1.2)
task-master set-status --id=<id> --status=done     # Mark task complete

# Task Management
task-master add-task --prompt="description" --research        # Add new task with AI
task-master expand --id=<id> --research --force               # Break task into subtasks
task-master update-task --id=<id> --prompt="changes"          # Update specific task
task-master update --from=<id> --prompt="changes"             # Update multiple tasks from ID onwards
task-master update-subtask --id=<id> --prompt="notes"         # Append implementation notes to subtask

# Analysis & Planning
task-master analyze-complexity --research          # Analyze task complexity
task-master complexity-report                      # View complexity analysis
task-master expand --all --research                # Expand all eligible tasks

# Dependencies & Organization
task-master add-dependency --id=<id> --depends-on=<id>       # Add task dependency
task-master remove-dependency --id=<id> --depends-on=<id>    # Remove task dependency
task-master move --from=<id> --to=<id>                       # Reorganize task hierarchy
task-master validate-dependencies                             # Check for dependency issues
task-master fix-dependencies                                  # Auto-fix invalid dependencies

# PRD Parsing
task-master parse-prd .taskmaster/docs/<name>.md              # Generate tasks from PRD
task-master parse-prd .taskmaster/docs/<name>.md --append     # Add tasks from new PRD to existing list

# Generation
task-master generate                               # Regenerate individual task files from tasks.json
```

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

1. `task-master show <subtask-id>` — Understand requirements
2. Explore codebase and plan implementation
3. `task-master update-subtask --id=<id> --prompt="detailed plan"` — Log plan
4. `task-master set-status --id=<id> --status=in-progress` — Start work
5. Implement code following logged plan
6. `task-master update-subtask --id=<id> --prompt="what worked/didn't work"` — Log progress
7. `task-master set-status --id=<id> --status=done` — Complete task

## Adding New Features via PRD

When new features need to be added to an existing project:
1. Write a focused PRD in `.taskmaster/docs/<feature-name>.md`
2. Parse with `--append`: `task-master parse-prd .taskmaster/docs/<feature-name>.md --append`
3. Run `task-master analyze-complexity --research` on the new task IDs
4. Expand: `task-master expand --all --research`

## Rules

- Never manually edit `tasks.json` — use commands instead
- Never manually edit `.taskmaster/config.json` — use `task-master models`
- Task files in `.taskmaster/tasks/` are auto-generated from tasks.json
- AI-powered operations (`parse-prd`, `expand`, `add-task`, `update`, `update-task`, `update-subtask`, `analyze-complexity`) make AI calls and may take up to a minute
- Do not re-initialize — it will not do anything beyond re-adding the same core files
