# GenAir automatic QA policy

Task: https://trello.com/c/OdmZMmFp/87-restrict-automatic-e2e-to-frontend-release-prs

For GenAir this policy overrides the shared instructions to launch full Playwright regression
before every feature PR. Keep code review and maintain coverage for each feature, but run automatic
end-to-end integration only through a Gen-Air-Frontend release PR: feature → dev, dev → test,
test → main. Pair it with the latest backend commit on the matching destination branch, after
backend dependencies have been merged/promoted there. Test the frontend candidate merge and record
immutable frontend, backend and Automation revisions.

Backend and Automation PRs receive code review and relevant local unit/contract/type checks; they
do not automatically run the browser suite. Their QA report identifies integration coverage as
pending the consuming frontend gate rather than inventing a browser pass. A PASSED scoped report
can cover their local criteria while explicitly deferring integration to that frontend release.
Do not trigger standalone Automation workflows, independent pushes or scheduled browser runs.
Existing eligible frontend PR gates can be rerun. Local exploratory browser execution remains
available when explicitly requested. Preserve isolated test data and mocked external integrations.

Before opening a frontend PR, the QA agent verifies local workflow/contract checks and reports
integration as pending that PR gate. Opening the PR is the trigger for the full suite; a local
scoped pass does not authorize merge. A frontend release PR requires the full existing suite
and fresh backend compatibility to pass before merge.
An absent backend dependency or stale backend revision blocks merge. See Gen-Air-Automation
`docs/release-gate-rollout.md` for required checks, notifier credentials and coordinated activation.
The lightweight backend notifier invalidates and refreshes eligible frontend checks; it runs no
Playwright itself. GitHub notification delivery is asynchronous, so wait for backend promotion
and notifier completion before merging frontend. Never report an untested live rollout as passed.
