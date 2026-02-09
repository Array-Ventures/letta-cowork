import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import type { ClientEvent, AppConfig, IdentityInfo } from "../types";

interface OnboardingWizardProps {
  sendEvent: (event: ClientEvent) => void;
}

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${i === step ? "bg-accent" : "bg-muted/40"}`}
        />
      ))}
    </div>
  );
}

// Step 0: Connect Your Server
function StepServer({ sendEvent }: { sendEvent: (event: ClientEvent) => void }) {
  const { data, testResult } = useAppStore(useShallow((s) => ({ data: s.onboardingData, testResult: s.onboardingTestResult })));
  const setData = useAppStore((s) => s.setOnboardingData);
  const setStep = useAppStore((s) => s.setOnboardingStep);
  const [testing, setTesting] = useState(false);

  const serverSuccess = testResult?.type === "server" && testResult.success;

  const handleTest = () => {
    if (!data.serverBaseUrl.trim()) return;
    setTesting(true);
    sendEvent({ type: "config.testServer", payload: { baseUrl: data.serverBaseUrl.trim(), apiKey: data.serverApiKey.trim() } });
  };

  useEffect(() => {
    if (testResult?.type === "server") setTesting(false);
  }, [testResult]);

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" />
          </svg>
        </div>
        <h2 className="text-[22px] font-bold text-ink-900">Connect Your Server</h2>
        <p className="text-[13px] text-muted text-center">Enter your organization's server URL and API key to get started.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-700">Server URL</label>
          <input
            type="text"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
            placeholder="https://api.example.com"
            value={data.serverBaseUrl}
            onChange={(e) => setData({ serverBaseUrl: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-700">API Key</label>
          <input
            type="password"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
            placeholder="sk-letta-••••••••••••"
            value={data.serverApiKey}
            onChange={(e) => setData({ serverApiKey: e.target.value })}
          />
        </div>
      </div>

      {serverSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-success-light px-4 py-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-success" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          <span className="text-[13px] font-medium text-success">Connected — Server v{testResult?.version}</span>
        </div>
      )}

      {testResult?.type === "server" && !testResult.success && (
        <div className="flex items-center gap-2 rounded-lg bg-error-light px-4 py-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-error" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" x2="9" y1="9" y2="15" /><line x1="9" x2="15" y1="9" y2="15" /></svg>
          <span className="text-[13px] text-error">Connection failed</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors disabled:opacity-50"
          onClick={handleTest}
          disabled={testing || !data.serverBaseUrl.trim()}
        >
          {testing ? (
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
          )}
          Test Connection
        </button>
        <button
          className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          onClick={() => {
            if (serverSuccess) {
              setData({ serverVersion: testResult?.version || "" });
              setStep(1);
              // Auto-fetch orgs
              sendEvent({ type: "config.listOrgs", payload: { baseUrl: data.serverBaseUrl.trim(), apiKey: data.serverApiKey.trim() } });
            }
          }}
          disabled={!serverSuccess}
        >
          Next
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </div>
    </>
  );
}

// Step 1: Choose Organization
function StepOrganization({ sendEvent }: { sendEvent: (event: ClientEvent) => void }) {
  const { data, orgs } = useAppStore(useShallow((s) => ({ data: s.onboardingData, orgs: s.onboardingOrgs })));
  const setData = useAppStore((s) => s.setOnboardingData);
  const setStep = useAppStore((s) => s.setOnboardingStep);

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
          </svg>
        </div>
        <h2 className="text-[22px] font-bold text-ink-900">Choose Organization</h2>
        <p className="text-[13px] text-muted text-center">Select the organization you want to work with</p>
      </div>

      <div className="flex flex-col gap-2">
        {orgs.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[13px] text-muted">Loading organizations...</div>
        )}
        {orgs.map((org) => (
          <button
            key={org.id}
            className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors ${
              data.orgId === org.id
                ? "border-accent bg-accent-light"
                : "border-border bg-surface hover:border-border-hover"
            }`}
            onClick={() => setData({ orgId: org.id, orgName: org.name })}
          >
            <span className="text-[14px] font-medium text-ink-900">{org.name}</span>
            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
              data.orgId === org.id ? "border-accent" : "border-border"
            }`}>
              {data.orgId === org.id && <div className="h-2.5 w-2.5 rounded-full bg-accent" />}
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
          onClick={() => setStep(0)}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" x2="5" y1="12" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Back
        </button>
        <button
          className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          onClick={() => {
            setStep(2);
            sendEvent({ type: "config.listIdentities", payload: { baseUrl: data.serverBaseUrl, apiKey: data.serverApiKey } });
          }}
          disabled={!data.orgId}
        >
          Next
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </div>
    </>
  );
}

// Step 2: Your Identity
function StepIdentity({ sendEvent }: { sendEvent: (event: ClientEvent) => void }) {
  const { data, identities, testResult } = useAppStore(
    useShallow((s) => ({ data: s.onboardingData, identities: s.onboardingIdentities, testResult: s.onboardingTestResult }))
  );
  const setData = useAppStore((s) => s.setOnboardingData);
  const setStep = useAppStore((s) => s.setOnboardingStep);
  const [tab, setTab] = useState<"existing" | "create">(identities.length > 0 ? "existing" : "create");
  const [creating, setCreating] = useState(false);

  // If creating and we get a result, stop creating state
  useEffect(() => {
    if (testResult?.type === "identity") {
      setCreating(false);
      if (testResult.success && testResult.identityId) {
        setData({ identityId: testResult.identityId });
      }
    }
  }, [testResult, setData]);

  // Switch to existing tab when identities load
  useEffect(() => {
    if (identities.length > 0 && tab === "create") setTab("existing");
  }, [identities.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    if (!data.identityName.trim() || !data.identityKey.trim()) return;
    setCreating(true);
    sendEvent({
      type: "config.createIdentity",
      payload: { baseUrl: data.serverBaseUrl, apiKey: data.serverApiKey, name: data.identityName.trim(), identifierKey: data.identityKey.trim() },
    });
  };

  const selectExisting = (identity: IdentityInfo) => {
    setData({ identityId: identity.id, identityName: identity.name, identityKey: identity.identifierKey });
  };

  const canProceed = !!data.identityId;

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h2 className="text-[22px] font-bold text-ink-900">Your Identity</h2>
        <p className="text-[13px] text-muted text-center">Set up your user identity on the server. This lets agents know who you are.</p>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-xl bg-surface-tertiary p-1 gap-1">
        <button
          className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition-all ${
            tab === "existing" ? "bg-surface text-ink-900 shadow-sm font-semibold" : "text-muted hover:text-ink-700"
          }`}
          onClick={() => setTab("existing")}
        >
          Choose Existing
        </button>
        <button
          className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition-all ${
            tab === "create" ? "bg-surface text-ink-900 shadow-sm font-semibold" : "text-muted hover:text-ink-700"
          }`}
          onClick={() => setTab("create")}
        >
          Create New
        </button>
      </div>

      {tab === "existing" ? (
        <div className="flex flex-col gap-2">
          {identities.length === 0 && (
            <div className="flex items-center justify-center py-6 text-[13px] text-muted">No existing identities found</div>
          )}
          {identities.map((identity) => (
            <button
              key={identity.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                data.identityId === identity.id
                  ? "border-accent bg-accent-light"
                  : "border-border bg-surface hover:border-border-hover"
              }`}
              onClick={() => selectExisting(identity)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-ink-900">{identity.name}</span>
                <span className="text-[11px] text-muted">{identity.identifierKey}</span>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                data.identityId === identity.id ? "border-accent" : "border-border"
              }`}>
                {data.identityId === identity.id && <div className="h-2.5 w-2.5 rounded-full bg-accent" />}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-700">Display Name</label>
            <input
              type="text"
              className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              placeholder="Parth Modi"
              value={data.identityName}
              onChange={(e) => setData({ identityName: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-700">Identifier Key</label>
            <input
              type="text"
              className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              placeholder="parth@example.com"
              value={data.identityKey}
              onChange={(e) => setData({ identityKey: e.target.value })}
            />
            <span className="text-[11px] text-muted">A unique key (e.g. email) that identifies you to your agents</span>
          </div>
          {testResult?.type === "identity" && testResult.success && (
            <div className="flex items-center gap-2 rounded-lg bg-success-light px-4 py-2.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-success" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              <span className="text-[13px] font-medium text-success">Identity created</span>
            </div>
          )}
          {testResult?.type === "identity" && !testResult.success && (
            <div className="flex items-center gap-2 rounded-lg bg-error-light px-4 py-2.5">
              <span className="text-[13px] text-error">Failed to create identity</span>
            </div>
          )}
          <button
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            onClick={handleCreate}
            disabled={creating || !data.identityName.trim() || !data.identityKey.trim()}
          >
            {creating ? "Creating..." : "Create Identity"}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
          onClick={() => setStep(1)}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" x2="5" y1="12" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Back
        </button>
        <button
          className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          onClick={() => setStep(3)}
          disabled={!canProceed}
        >
          Next
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </div>
    </>
  );
}

// Step 3: Daytona Cloud
function StepDaytona({ sendEvent }: { sendEvent: (event: ClientEvent) => void }) {
  const { data, testResult } = useAppStore(useShallow((s) => ({ data: s.onboardingData, testResult: s.onboardingTestResult })));
  const setData = useAppStore((s) => s.setOnboardingData);
  const setStep = useAppStore((s) => s.setOnboardingStep);
  const [testing, setTesting] = useState(false);

  const daytonaSuccess = testResult?.type === "daytona" && testResult.success;

  const handleTest = () => {
    if (!data.daytonaApiKey.trim()) return;
    setTesting(true);
    sendEvent({ type: "config.testDaytona", payload: { apiKey: data.daytonaApiKey.trim(), apiUrl: data.daytonaApiUrl.trim() } });
  };

  useEffect(() => {
    if (testResult?.type === "daytona") setTesting(false);
  }, [testResult]);

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
        </div>
        <h2 className="text-[22px] font-bold text-ink-900">Daytona Cloud</h2>
        <p className="text-[13px] text-muted text-center">Connect your Daytona account for cloud sandbox computation. Agents will use sandboxes to run code securely.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-700">API Key</label>
          <input
            type="password"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
            placeholder="daytona-••••••••••••"
            value={data.daytonaApiKey}
            onChange={(e) => setData({ daytonaApiKey: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-700">API URL</label>
          <input
            type="text"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
            placeholder="https://app.daytona.io/api"
            value={data.daytonaApiUrl}
            onChange={(e) => setData({ daytonaApiUrl: e.target.value })}
          />
        </div>
      </div>

      {daytonaSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-success-light px-4 py-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-success" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          <span className="text-[13px] font-medium text-success">Connected — Daytona ready</span>
        </div>
      )}

      {testResult?.type === "daytona" && !testResult.success && (
        <div className="flex items-center gap-2 rounded-lg bg-error-light px-4 py-3">
          <span className="text-[13px] text-error">Connection failed</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
            onClick={() => setStep(2)}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" x2="5" y1="12" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Back
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            onClick={handleTest}
            disabled={testing || !data.daytonaApiKey.trim()}
          >
            {testing ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            )}
            Test
          </button>
        </div>
        <button
          className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          onClick={() => setStep(4)}
          disabled={!daytonaSuccess}
        >
          Next
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" x2="19" y1="12" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </div>
    </>
  );
}

// Step 4: Summary
function StepSummary({ sendEvent }: { sendEvent: (event: ClientEvent) => void }) {
  const data = useAppStore((s) => s.onboardingData);
  const setStep = useAppStore((s) => s.setOnboardingStep);
  const [saving, setSaving] = useState(false);

  const handleComplete = () => {
    setSaving(true);
    const config: AppConfig = {
      letta: { baseUrl: data.serverBaseUrl, apiKey: data.serverApiKey, serverVersion: data.serverVersion },
      organization: { id: data.orgId, name: data.orgName },
      identity: { id: data.identityId, name: data.identityName, identifierKey: data.identityKey },
      daytona: { apiKey: data.daytonaApiKey, apiUrl: data.daytonaApiUrl },
    };
    sendEvent({ type: "config.save", payload: config });
  };

  const rows = [
    { label: "Server", value: `${new URL(data.serverBaseUrl).host} — v${data.serverVersion}` },
    { label: "Organization", value: data.orgName },
    { label: "Identity", value: `${data.identityName} (${data.identityKey})` },
    { label: "Daytona Cloud", value: new URL(data.daytonaApiUrl).host },
  ];

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-light">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-success" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2 className="text-[22px] font-bold text-ink-900">You're all set!</h2>
        <p className="text-[13px] text-muted text-center">Here's a summary of your configuration.</p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-center justify-between px-4 py-3 ${i < rows.length - 1 ? "border-b border-border" : ""}`}
          >
            <span className="text-[12px] text-muted">{row.label}</span>
            <span className="text-[13px] font-medium text-ink-900">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
          onClick={() => setStep(3)}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" x2="5" y1="12" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Back
        </button>
        <button
          className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          onClick={handleComplete}
          disabled={saving}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          {saving ? "Saving..." : "Complete Setup"}
        </button>
      </div>
    </>
  );
}

export function OnboardingWizard({ sendEvent }: OnboardingWizardProps) {
  const step = useAppStore((s) => s.onboardingStep);

  return (
    <div className="flex h-screen items-center justify-center bg-surface-secondary">
      <div className="w-full max-w-[520px] rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex flex-col gap-6 p-8">
          <ProgressDots step={step} total={5} />
          {step === 0 && <StepServer sendEvent={sendEvent} />}
          {step === 1 && <StepOrganization sendEvent={sendEvent} />}
          {step === 2 && <StepIdentity sendEvent={sendEvent} />}
          {step === 3 && <StepDaytona sendEvent={sendEvent} />}
          {step === 4 && <StepSummary sendEvent={sendEvent} />}
        </div>
      </div>
    </div>
  );
}
