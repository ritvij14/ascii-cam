#!/bin/bash

# generate-tree.sh
# Generates a clean file tree of the project and writes it to docs/infra/file-tree.md
# Called automatically via Claude Code hooks on Stop and SubagentStop events
# Can also be run manually: bash scripts/generate-tree.sh
#
# Skips update entirely if the tree hasn't changed.
# Section 3 of CLAUDE.md is a static reference to docs/infra/file-tree.md — not auto-updated.

set -e

# --- Configuration ---
# Directories to exclude from the tree
EXCLUDE_DIRS=(
  "node_modules"
  ".git"
  "dist"
  "build"
  "out"
  ".next"
  ".nuxt"
  "coverage"
  ".cache"
  ".turbo"
  ".taskmaster/cache"
  "__pycache__"
  ".pytest_cache"
  "venv"
  ".venv"
  "env"
  ".env"
  "target"          # Rust/Java build output
  ".dart_tool"      # Flutter
  "build"           # Flutter/Android
  "Pods"            # iOS
  ".gradle"
  ".idea"
  ".vscode"
  "*.egg-info"
)

# Files to exclude
EXCLUDE_FILES=(
  ".DS_Store"
  "*.pyc"
  "*.pyo"
  "*.class"
  "*.o"
  "*.lock"          # Remove this if you want lock files shown
  "*.log"
)

# Output file
OUTPUT_FILE="docs/infra/file-tree.md"

# Max depth (adjust as needed — deeper = more detail but longer output)
MAX_DEPTH=6

# --- Script ---

# Find the project root (where this script is called from)
# Always run from project root: bash scripts/generate-tree.sh
PROJECT_ROOT="$(pwd)"

# Build the exclude string for the `find` command
EXCLUDE_PATTERN=""
for dir in "${EXCLUDE_DIRS[@]}"; do
  EXCLUDE_PATTERN="$EXCLUDE_PATTERN -not -path '*/$dir/*' -not -path '*/$dir'"
done
for file in "${EXCLUDE_FILES[@]}"; do
  EXCLUDE_PATTERN="$EXCLUDE_PATTERN -not -name '$file'"
done

# --- Generate tree output ---
if command -v tree &> /dev/null; then
  TREE_IGNORE=$(IFS="|"; echo "${EXCLUDE_DIRS[*]}")

  TREE_OUTPUT=$(tree \
    --dirsfirst \
    -a \
    --noreport \
    -L "$MAX_DEPTH" \
    -I "$TREE_IGNORE" \
    "$PROJECT_ROOT" 2>/dev/null || echo "[tree command failed — using find fallback]")
else
  TREE_OUTPUT="[tree command not available — install with: brew install tree / apt-get install tree]\n\n"
  TREE_OUTPUT+=$(eval "find . -maxdepth $MAX_DEPTH $EXCLUDE_PATTERN -not -path '.'" | \
    sort | \
    sed 's|^\./||' | \
    awk -F'/' '{
      depth = NF - 1
      indent = ""
      for (i=0; i<depth; i++) indent = indent "  "
      print indent "├── " $NF
    }')
fi

# --- Check if tree content actually changed (ignore timestamp) ---
if [ -f "$OUTPUT_FILE" ]; then
  # Extract just the tree block from the existing file (between ``` markers)
  EXISTING_TREE=$(sed -n '/^```$/,/^```$/p' "$OUTPUT_FILE" | sed '1d;$d')

  if [ "$EXISTING_TREE" = "$TREE_OUTPUT" ]; then
    echo "• No file tree changes detected — skipping update."
    exit 0
  fi
fi

# --- Tree changed — update file-tree.md ---
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

mkdir -p "$(dirname "$OUTPUT_FILE")"

cat > "$OUTPUT_FILE" << EOF
# File Tree

> **Auto-generated. Do not edit manually.**
> Updated automatically after every Claude Code session via the \`Stop\` and \`SubagentStop\` hooks.
> To regenerate manually: \`bash scripts/generate-tree.sh\`
> Last generated: $TIMESTAMP

---

\`\`\`
$TREE_OUTPUT
\`\`\`

---

## Notes

- Excluded from tree: ${EXCLUDE_DIRS[*]}
- Max depth shown: $MAX_DEPTH levels
- To show deeper: edit \`MAX_DEPTH\` in \`scripts/generate-tree.sh\`
EOF

echo "✓ File tree updated: $OUTPUT_FILE"
