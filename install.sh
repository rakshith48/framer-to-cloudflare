#!/bin/bash

# Install the replicate-framer skill into Claude Code

SKILL_DIR="$HOME/.claude/skills/replicate-framer"

echo "Installing replicate-framer skill..."

mkdir -p "$SKILL_DIR/scripts"
mkdir -p "$SKILL_DIR/templates"

cp SKILL.md "$SKILL_DIR/SKILL.md"
cp scripts/extract.js "$SKILL_DIR/scripts/extract.js"
cp templates/worker.js "$SKILL_DIR/templates/worker.js"
cp templates/wrangler.toml "$SKILL_DIR/templates/wrangler.toml"
cp templates/package.json "$SKILL_DIR/templates/package.json"

echo "✅ Installed to $SKILL_DIR"
echo ""
echo "You can now use it in Claude Code:"
echo "  /replicate-framer https://your-site.framer.app"
