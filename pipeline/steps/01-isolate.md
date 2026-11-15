# 01-isolate

Run `tools/start-run.ps1 -Goal "<a few words>"`, adding `-Issue <N>` when the goal is a backlog issue, or `-Lane` for the configuration lane, which files no issue. It gives the run an issue number (a placeholder issue if there was none), its own up-to-date worktree, the sync of step 02, the run note, and the to-do list. Do every later step in the worktree it prints. If it stops, do what it says and run it again.

Rename this session to the `session name` it prints, such as `194 start and ship scripts`, with the app's session-title tool (`set_session_title`, session `self`). If there is no such tool, or the app declines, carry on.
