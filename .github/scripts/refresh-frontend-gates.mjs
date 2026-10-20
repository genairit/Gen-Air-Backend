const FRONTEND = { owner: 'genairit', repo: 'Gen-Air-Frontend' };
const RELEASE_BRANCHES = { DEV: 'dev', TEST: 'test' };
const PROMOTIONS = {
  [RELEASE_BRANCHES.TEST]: RELEASE_BRANCHES.DEV,
};
const RELEASE_TARGETS = Object.keys(PROMOTIONS);

export const refreshFrontendGates = async ({ github, context, core }) => {
  if (
    context.eventName !== 'push' ||
    context.repo.repo !== 'Gen-Air-Backend' ||
    context.repo.owner !== FRONTEND.owner
  ) {
    throw new Error(
      'Only backend release-branch pushes can refresh frontend gates.',
    );
  }

  const target = context.ref.replace('refs/heads/', '');
  if (!RELEASE_TARGETS.includes(target)) {
    throw new Error('Unsupported backend release branch.');
  }

  const requests = await github.paginate(github.rest.pulls.list, {
    ...FRONTEND,
    state: 'open',
    base: target,
    per_page: 100,
  });
  const expectedSource = PROMOTIONS[target];
  const eligibleRequests = requests.filter((request) => {
    const sameRepository =
      request.head.repo?.full_name === `${FRONTEND.owner}/${FRONTEND.repo}`;
    const validSource = request.head.ref === expectedSource;
    return sameRepository && validSource;
  });
  for (const request of eligibleRequests) {
    await github.rest.repos.createCommitStatus({
      ...FRONTEND,
      sha: request.head.sha,
      context: 'Backend compatibility',
      state: 'pending',
      description: `Backend ${target} changed; a fresh frontend integration result is required.`,
    });
    const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
      ...FRONTEND,
      workflow_id: 'merge-gate.yml',
      event: 'pull_request',
      head_sha: request.head.sha,
      per_page: 100,
    });
    const latestRun = runs.find((run) =>
      run.pull_requests.some((pull) => pull.number === request.number),
    );
    if (!latestRun || latestRun.status !== 'completed') {
      core.warning(
        `PR #${request.number} is blocked until its active check finishes and is rerun.`,
      );
      continue;
    }

    await github.rest.actions.reRunWorkflow({
      ...FRONTEND,
      run_id: latestRun.id,
    });
    core.info(`Refreshed frontend PR #${request.number}, run ${latestRun.id}.`);
  }
};
