"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CampaignView } from "@/components/CampaignView";
import { ContributorView } from "@/components/ContributorView";
import { NetworkView } from "@/components/NetworkView";
import { NewcomerView } from "@/components/NewcomerView";
import { ProjectView } from "@/components/ProjectView";
import { RecordsView } from "@/components/RecordsView";
import { SimulatorView } from "@/components/SimulatorView";
import { VerifyView } from "@/components/VerifyView";
import { useApiResource } from "@/hooks/useApiResource";
import { api } from "@/lib/api";
import { contributorPath, projectPath, recordsPath } from "@/lib/routes";
import snapshot from "@/lib/snapshot.json";

const HEALTH_RETRY_LIMIT = 6;
const HEALTH_RETRY_DELAY = 5000;

export function Dashboard({ initialView = "network" }) {
  const router = useRouter();
  const [asProject, setAsProject] = useState("p10");
  const [contributorId, setContributorId] = useState("c_disputed");
  const [recordProject, setRecordProject] = useState("");
  const [recordTamper, setRecordTamper] = useState("none");
  const [version, setVersion] = useState(0);
  const healthAttempts = useRef(0);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const health = useApiResource(
    (signal) => api.getHealth(signal),
    `health:${version}`,
    version === 0 ? snapshot.health : null,
  );
  const { error: healthError, refetch: refetchHealth } = health;

  /* eslint-disable react-hooks/set-state-in-effect -- The URL is external
     state. This one-time read runs after hydration so the prerendered
     snapshot can paint first, then a deep link takes over. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const as = params.get("as");
    const id = params.get("id");
    const project = params.get("project");
    const tamper = params.get("tamper");
    if (as) setAsProject(as);
    if (id) setContributorId(id);
    if (project) setRecordProject(project);
    if (tamper === "signature" || tamper === "chain") setRecordTamper(tamper);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!healthError) {
      healthAttempts.current = 0;
      return;
    }
    if (healthAttempts.current >= HEALTH_RETRY_LIMIT) return;
    const timer = setTimeout(() => {
      healthAttempts.current += 1;
      refetchHealth();
    }, HEALTH_RETRY_DELAY);
    return () => clearTimeout(timer);
  }, [healthError, refetchHealth]);

  const openProject = useCallback(
    (projectId) => {
      setAsProject(projectId);
      router.push(projectPath(projectId));
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [router],
  );

  const openContributor = useCallback(
    (projectId, id) => {
      if (projectId) setAsProject(projectId);
      setContributorId(id);
      router.push(contributorPath(projectId, id));
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [router],
  );

  const selectProject = useCallback(
    (projectId) => {
      setAsProject(projectId);
      router.replace(
        initialView === "contributor"
          ? contributorPath(projectId, contributorId)
          : projectPath(projectId),
      );
    },
    [router, initialView, contributorId],
  );

  const handleNavigate = useCallback((next) => {
    if (next === "records") {
      setRecordProject("");
      setRecordTamper("none");
    }
  }, []);

  const selectRecordProject = useCallback(
    (projectId) => {
      setRecordProject(projectId);
      router.replace(recordsPath(projectId, recordTamper));
    },
    [router, recordTamper],
  );

  const selectRecordTamper = useCallback(
    (tamper) => {
      setRecordTamper(tamper);
      router.replace(recordsPath(recordProject, tamper));
    },
    [router, recordProject],
  );

  const handleSimulated = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  const handleRecordChange = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  return (
    <AppShell
      view={initialView}
      meta={health.data}
      asProject={asProject}
      contributorId={contributorId}
      hydrated={hydrated}
      onNavigate={handleNavigate}
    >
      {healthError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber/40 bg-amber/5 px-4 py-3"
        >
          <p className="text-xs font-medium text-amber">
            The live demo server is not responding yet. Saved demo data is shown
            below while the page keeps retrying.
          </p>
          <p className="mt-1 text-[11px] text-muted">{healthError.message}</p>
          <button
            type="button"
            onClick={() => {
              healthAttempts.current = 0;
              refetchHealth();
            }}
            className="mt-2 text-xs font-medium text-ink underline underline-offset-2 hover:text-teal"
          >
            Retry connection
          </button>
        </div>
      )}

      {initialView === "network" && (
        <NetworkView
          version={version}
          asProject={asProject}
          onOpenProject={openProject}
        />
      )}

      {initialView === "project" && (
        <ProjectView
          asProject={asProject}
          version={version}
          onSelectProject={selectProject}
          onOpenContributor={openContributor}
        />
      )}

      {initialView === "contributor" && (
        <ContributorView
          contributorId={contributorId}
          asProject={asProject}
          version={version}
          onOpenContributor={openContributor}
        />
      )}

      {initialView === "campaigns" && <CampaignView version={version} />}

      {initialView === "newcomers" && (
        <NewcomerView version={version} onSigned={handleRecordChange} />
      )}

      {initialView === "records" && (
        <RecordsView
          version={version}
          projectId={recordProject}
          tamper={recordTamper}
          onProjectChange={selectRecordProject}
          onTamperChange={selectRecordTamper}
          onRecordChange={handleRecordChange}
        />
      )}

      {initialView === "simulator" && (
        <SimulatorView
          version={version}
          meta={health.data}
          onSimulated={handleSimulated}
        />
      )}

      {initialView === "verify" && <VerifyView />}
    </AppShell>
  );
}
