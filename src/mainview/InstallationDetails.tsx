export type AppInfo = { version: string; packaging: string };

export function InstallationDetails({ version, info, error }: { version: string; info: AppInfo | null; error: string }) {
  return (
    <>
      <p style={{ color: "var(--muted)" }}>Version {version}</p>
      {info && <p style={{ color: "var(--muted)" }}>Installation: {info.packaging}. Backend version: {info.version || "unknown"}.</p>}
      {info && info.version && info.version !== version && <p role="alert" style={{ color: "#fca5a5" }}>The editor and backend are different versions. Close all GhoaxtWriter windows, then launch the intended installation again.</p>}
      {error && <p role="alert" style={{ color: "#fca5a5" }}>{error}</p>}
    </>
  );
}
