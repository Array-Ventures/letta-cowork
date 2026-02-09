import { useState } from "react";
import type { ClientEvent, AppConfig } from "../types";

interface SettingsModalProps {
  config: AppConfig;
  sendEvent: (event: ClientEvent) => void;
  onClose: () => void;
}

export function SettingsModal({ config, sendEvent, onClose }: SettingsModalProps) {
  const [letta, setLetta] = useState({
    baseUrl: config.letta.baseUrl,
    apiKey: config.letta.apiKey,
  });
  const [daytona, setDaytona] = useState({
    apiKey: config.daytona.apiKey,
    apiUrl: config.daytona.apiUrl,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    const updated: AppConfig = {
      letta: { ...config.letta, baseUrl: letta.baseUrl, apiKey: letta.apiKey },
      organization: config.organization,
      identity: config.identity,
      daytona: { apiKey: daytona.apiKey, apiUrl: daytona.apiUrl },
    };
    sendEvent({ type: "config.save", payload: updated });
    onClose();
  };

  const handleReset = () => {
    sendEvent({ type: "config.reset" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ink-900">Settings</h2>
          <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-6 p-6">
          {/* Server Section */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-semibold text-ink-900">Server</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-muted">Base URL</label>
              <input
                type="url"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink-900 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                value={letta.baseUrl}
                onChange={(e) => setLetta({ ...letta, baseUrl: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-muted">API Key</label>
              <input
                type="password"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink-900 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                value={letta.apiKey}
                onChange={(e) => setLetta({ ...letta, apiKey: e.target.value })}
              />
            </div>
          </section>

          {/* Organization & Identity (read-only) */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-semibold text-ink-900">Organization & Identity</h3>
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="text-[12px] text-muted">Organization</span>
                <span className="text-[13px] font-medium text-ink-900">{config.organization.name}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[12px] text-muted">Identity</span>
                <span className="text-[13px] font-medium text-ink-900">{config.identity.name}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted">To change organization or identity, reset and re-run setup.</p>
          </section>

          {/* Daytona Section */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-semibold text-ink-900">Daytona Cloud</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-muted">API Key</label>
              <input
                type="password"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink-900 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                value={daytona.apiKey}
                onChange={(e) => setDaytona({ ...daytona, apiKey: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-muted">API URL</label>
              <input
                type="url"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink-900 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                value={daytona.apiUrl}
                onChange={(e) => setDaytona({ ...daytona, apiUrl: e.target.value })}
              />
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            className="text-[12px] text-error hover:text-error/80 transition-colors"
            onClick={handleReset}
          >
            Reset Configuration
          </button>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
