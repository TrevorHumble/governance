# The unchanged-artifact exemption

Read `standards/pipeline/steps/04-pre-review.md` first for the trigger; this file is the one link
deeper that `agents/orchestrator.md` § "Pre-review step" points to, and covers the exemption and
Phase 1.

**The unchanged-artifact exemption.** A repo's declared pre-review process file may define an
exemption under which a change on the declared surface does not re-enter the live owner loop,
because the change leaves the pre-reviewed artifact's output unchanged and the owner's standing
approval of that artifact therefore still holds. The rest of the pipeline runs on such a change
unchanged: the issue is drafted, the issue is reviewed, an implementer is spawned, the pull request
is reviewed, and CI gates it, exactly as for any other change. **Such a change merges on the
standing approval plus the reviewer evidence the exemption requires, in place of a fresh owner
approval**, with adversarial-review PASS and green CI still required; this paragraph is the one
home for that merge rule, and the other statements of the merge gate point here. What evidence the
exemption rests on is the declaring process file's to set, not this file's, and it sets that bar
above, never below, the per-file floor `agents/reviewer-pr.md` imposes on any change asserting the
artifact is unchanged: no exemption is named or enumerated here, and a repo whose process file
defines none has none. This is a different thing from `agents/orchestrator.md` § "Model policy"'s
"The carve-out is a fence, not a blanket permission" paragraph: that paragraph fences which paths
may be edited during phase 1, while this exemption decides whether phase 1 is re-entered at all.

**Phase 1** is the settle-the-artifact-live loop run before an implementer is spawned for the
declared surface; nothing commits until the owner approves, except for a change the
unchanged-artifact exemption above carries, which merges as that paragraph states. When a repo
declares a pre-review process file (named in `repo-profile.json`'s `preReview` field, for example
a live visual-approval loop), that file owns the full mechanics, the freeze, phase 2, and any
two-doors rule; no mechanism is asserted here as belonging to every repo.
