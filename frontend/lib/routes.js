export const VIEW_PATHS = {
  network: "/network",
  project: "/project",
  contributor: "/contributor",
  campaigns: "/campaigns",
  newcomers: "/newcomers",
  records: "/records",
  simulator: "/simulator",
};

export function projectPath(projectId) {
  return projectId
    ? `/project?as=${encodeURIComponent(projectId)}`
    : VIEW_PATHS.project;
}

export function contributorPath(projectId, contributorId) {
  const params = new URLSearchParams();
  if (projectId) params.set("as", projectId);
  if (contributorId) params.set("id", contributorId);
  const query = params.toString();
  return query ? `${VIEW_PATHS.contributor}?${query}` : VIEW_PATHS.contributor;
}

export function recordsPath(projectId, tamper = "none") {
  const params = new URLSearchParams();
  if (projectId) params.set("project", projectId);
  if (tamper && tamper !== "none") params.set("tamper", tamper);
  const query = params.toString();
  return query ? `${VIEW_PATHS.records}?${query}` : VIEW_PATHS.records;
}

export function pathForView(view, { projectId, contributorId } = {}) {
  if (view === "project") return projectPath(projectId);
  if (view === "contributor") return contributorPath(projectId, contributorId);
  return VIEW_PATHS[view] ?? "/";
}
