# 04-pre-review

Read `preReview` in `repo-profile.json`. If it is `none`, go to step 05.

If it names a process and the change touches the paths in `surfaceGlobs`, settle the artifact live with the owner, by that process, before step 05. The process file owns its edit scope and its approval rules. Until the owner approves, edit only the paths in `surfaceGlobs`.

One exemption: a change the process file's unchanged-artifact exemption covers goes straight to step 05 on the owner's standing approval. The process file says what counts. Every other step still runs.
