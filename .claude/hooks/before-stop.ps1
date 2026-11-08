# before-stop: an empty stub. The length note moved to before-reply.ps1 (#181), because a note added
# at Stop comes back as a new turn and draws a second reply. A child's .claude/settings.json does not
# sync, so a child may still wire this file to Stop; it reads nothing, prints nothing, and exits 0.
# Once no child wires it, put it on the manifest's retired list.
exit 0
