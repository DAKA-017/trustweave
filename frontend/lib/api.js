const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000/api";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "API_ERROR" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      `Cannot reach the TrustWeave API at ${BASE_URL}. Start the backend and check the port.`,
      { code: "NETWORK_ERROR" },
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      {
        status: response.status,
        code: payload?.error?.code ?? "API_ERROR",
      },
    );
  }
  return payload;
}

const id = encodeURIComponent;

export const api = {
  getHealth: (signal) => request("/health", { signal }),
  simulate: (params) =>
    request("/simulate", { method: "POST", body: params }),
  getProjects: (signal) => request("/projects", { signal }),
  getProjectView: (projectId, signal) =>
    request(`/projects/${id(projectId)}/view`, { signal }),
  getAssessment: (contributorId, asProject, signal) =>
    request(
      `/contributors/${id(contributorId)}/assessment?asProject=${id(asProject)}`,
      { signal },
    ),
  getNewcomers: (signal) => request("/newcomers", { signal }),
  getCampaigns: (signal) => request("/campaigns", { signal }),
  getRecords: (projectId, tamper = "none", signal) =>
    request(
      `/records?projectId=${id(projectId)}&tamper=${id(tamper)}`,
      { signal },
    ),
  getRecordSummaries: (signal) => request("/records", { signal }),
  postRecord: (body) => request("/records", { method: "POST", body }),
  getMetrics: (signal) => request("/metrics", { signal }),
  getMultiMetrics: (signal) => request("/metrics?multi=1", { signal }),
  getExplainer: (signal) => request("/demo/explainer", { signal }),
};
