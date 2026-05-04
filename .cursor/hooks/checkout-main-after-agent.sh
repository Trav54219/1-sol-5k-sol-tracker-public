#!/usr/bin/env bash
# After an agent run ends, use main when the tree is clean (avoids hijacking in-progress work).
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	exit 0
fi
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
	exit 0
fi
current="$(git branch --show-current 2>/dev/null)" || exit 0
if [ "$current" = "main" ]; then
	exit 0
fi
git checkout main 2>/dev/null || true
exit 0
