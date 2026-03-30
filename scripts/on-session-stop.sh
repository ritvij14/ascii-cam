#!/bin/bash

# on-session-stop.sh
# Called via Claude Code Stop hook after every response turn.
#
# - If no files were modified this turn (pure conversation): exits silently.
# - If files were modified: runs generate-tree.sh, then enforces documentation
#   review by exiting 2 (stderr fed back to Claude). Claude is blocked and must
#   update docs before the session can end cleanly.
#
# The review requirement is cleared by /wrap-up, which deletes .claude/session-changed.

FLAG_FILE=".claude/session-changed"

# No file changes this turn — nothing to do
if [ ! -f "$FLAG_FILE" ]; then
  exit 0
fi

# Files were changed — update the file tree first
bash scripts/generate-tree.sh

# Enforce documentation review — exit 2 blocks Claude and feeds stderr back as feedback
{
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DOCUMENTATION REVIEW REQUIRED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Files were modified this turn. Before this response ends:"
echo ""
echo "  1. Update the relevant feature doc in docs/features/"
echo "     Capture: what changed, WHY it changed, HOW it was implemented."
echo ""
echo "  2. If an architectural decision was made, record it in"
echo "     docs/infra/decisions.md"
echo ""
echo "  3. Run /wrap-up to complete the review and clear this requirement."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
} >&2
exit 2
