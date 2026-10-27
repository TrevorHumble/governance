---
name: scaffold-project
description: Spin up a new self-enforcing AI-built project from the orchestrator template repo. Use when the user wants to start a new project, "scaffold a project", "new project from the template", "clone the template", or bootstrap a repo that already has the orchestrator agent, adversarial reviewer agents, the enforcement hooks (commit/goal/loop gate), CI/CD, and doc stubs baked in.
---

# Scaffold a new project from the orchestrator template

Creates a new GitHub repo from **`TrevorHumble/blender-orchestrator-template`**, which already ships the orchestrator agent, the adversarial reviewer agents, the three enforcement hooks (commit gate, goal gate, loop gate), the CI/CD pipeline, and the doc stubs, then turns enforcement on. The result is a clone-and-go project where the AI builds through a review pipeline the owner never has to police.

## Inputs

- **Project name** (required, kebab-case). Ask only if it wasn't given.
- **Visibility** (default `public`). Public so the free CodeQL security scan runs; private works too but drops only CodeQL (tests, commit gate, Dependabot are unaffected).
- **Parent directory** (default: current directory).

## Procedure

Use the full gh path (`gh` is not on PATH on this machine). PowerShell syntax only.

1. **Check auth**: `& 'C:\Program Files\GitHub CLI\gh.exe' auth status`. If not logged in, tell the user to run `gh auth login` themselves; do not authenticate for them.
2. **Create + clone from the template:**
   ```powershell
   & 'C:\Program Files\GitHub CLI\gh.exe' repo create <name> --template TrevorHumble/blender-orchestrator-template --public --clone
   ```
   (Swap `--public` for `--private` if the user asked; note CodeQL won't run on a private repo.)
3. **Activate enforcement (one command):**
   ```powershell
   Set-Location <name>; powershell -ExecutionPolicy Bypass -File setup.ps1
   ```
4. **Verify**: `setup.ps1` prints the gate status; the commit gate must read `[ON]`. If not, re-run `powershell -ExecutionPolicy Bypass -File setup.ps1` **once**. Still not `[ON]` after the re-run: stop retrying. Read the script's error output, fix the named cause (most likely `core.hooksPath` not set, or PowerShell execution policy), and verify with `powershell -File tools/check-enforcement.ps1`. Two failed attempts means something is broken, not flaky.

## Failure fallbacks

- **`gh repo create --template` fails** (template renamed/private/name collision): report the exact error. For a name collision, pick a new name with the user. If the template repo itself is gone, rebuild the pipeline by copying `agents/`, `standards/`, `tools/`, `.githooks/`, and `.claude/commands/build.md` from another of Trevor's pipeline repos (e.g. the wedding-scavenger-hunt repo); the global CLAUDE.md names this as the sanctioned fallback.
- **`setup.ps1` errors outright** (not just gate `[OFF]`): quote the error, do not loop. Missing prerequisite (git, node) → name it and stop.

5. **Hand off in plain language:** the project is ready. Tell the user to (a) open `CLAUDE.md` and fill in the North Star, one sentence: who it's for and what it builds; (b) open the folder in Claude Code and say what to build. The orchestrator drives the rest.

## Rules

- Creating the repo is the user's explicitly requested action: proceed without asking; only confirm the name if it's missing.
- Never run `gh auth login` or enter credentials for the user; direct them to do it.
- Full gh path always: `C:\Program Files\GitHub CLI\gh.exe`. PowerShell only (no `&&`/`||`).
- If a hook seems not to fire after setup, tell the user to close and reopen the folder in Claude Code once (hooks load at session start).
