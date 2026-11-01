import { getSessionId, getWorld, rememberWorld } from "./session";

const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000/api";

// The desktop wrapper starts the API on a free port and injects that base URL
// through a preload bridge. Browsers never see this override.
function resolveBaseUrl() {
  if (typeof window !== "undefined") {
    const injected = window.__TRUSTWEAVE_ENV__?.apiBaseUrl;
    if (typeof injected === "string" && injected.length > 0) return injected;
  }
  return DEFAULT_BASE_URL;
}

const BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(message, { status = 0, code = "API_ERROR" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const sessionId = getSessionId();
  if (sessionId) headers["X-TrustWeave-Session"] = sessionId;
  const world = getWorld();
  if (world) headers["X-TrustWeave-World"] = JSON.stringify(world);

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      cache: "no-store",
      headers,
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
  simulate: async (params) => {
    const data = await request("/simulate", { method: "POST", body: params });
    rememberWorld(data.simulation);
    return data;
  },
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
