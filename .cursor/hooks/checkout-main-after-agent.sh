#!/usr/bin/env bash
# Disabled: previously ran `git checkout main` on agent stop when the tree was clean, which
# undid branch checkouts immediately after the agent created/switched branches.
# Re-enable only if you restore a matching "stop" entry in .cursor/hooks.json.
exit 0
