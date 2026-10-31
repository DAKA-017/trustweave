"use client";

import { useCallback, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CampaignView } from "@/components/CampaignView";
import { ContributorView } from "@/components/ContributorView";
import { NetworkView } from "@/components/NetworkView";
import { NewcomerView } from "@/components/NewcomerView";
import { ProjectView } from "@/components/ProjectView";
import { RecordsView } from "@/components/RecordsView";
import { SimulatorView } from "@/components/SimulatorView";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";

export default function Home() {
  const [view, setView] = useState("network");
  const [asProject, setAsProject] = useState("p10");
  const [contributorId, setContributorId] = useState("c_disputed");
  const [version, setVersion] = useState(0);

  const health = useApiResource(
    (signal) => api.getHealth(signal),
    `health:${version}`,
  );

  const navigate = useCallback((next) => {
    setView(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const openProject = useCallback((projectId) => {
    setAsProject(projectId);
    setView("project");
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const openContributor = useCallback((projectId, id) => {
    if (projectId) setAsProject(projectId);
    setContributorId(id);
    setView("contributor");
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const handleSimulated = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  const handleRecordChange = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  return (
    <AppShell view={view} onNavigate={navigate} meta={health.data}>
      {health.error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3"
        >
          <p className="text-xs font-medium text-danger">
            {health.error.message}
          </p>
          <button
            type="button"
            onClick={health.refetch}
            className="mt-2 text-xs font-medium text-ink underline underline-offset-2 hover:text-teal"
          >
            Retry connection
          </button>
        </div>
      )}

      {view === "network" && (
        <NetworkView
          version={version}
          asProject={asProject}
          onOpenProject={openProject}
        />
      )}

      {view === "project" && (
        <ProjectView
          asProject={asProject}
          version={version}
          onSelectProject={setAsProject}
          onOpenContributor={openContributor}
        />
      )}

      {view === "contributor" && (
        <ContributorView
          contributorId={contributorId}
          asProject={asProject}
          version={version}
          onOpenContributor={openContributor}
          onSelectProject={setAsProject}
        />
      )}

      {view === "campaigns" && <CampaignView version={version} />}

      {view === "newcomers" && (
        <NewcomerView version={version} onSigned={handleRecordChange} />
      )}

      {view === "records" && (
        <RecordsView version={version} onRecordChange={handleRecordChange} />
      )}

      {view === "simulator" && (
        <SimulatorView
          version={version}
          meta={health.data}
          onSimulated={handleSimulated}
        />
      )}
    </AppShell>
  );
}
