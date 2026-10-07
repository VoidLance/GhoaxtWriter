export const API_BASE = "http://localhost:4310";

export type ApiFetch = <T>(path: string, options?: RequestInit) => Promise<T>;

export type ElementItem = {
  id: string;
  name: string;
  type: string;
  notes: string;
  image: string | null;
  imageVersion: number;
};

export type ResearchSection = {
  name: string;
  description: string;
  image: string | null;
  version: number;
};

export type ResearchItem = {
  id: string;
  kind: "note" | "link" | "image" | "document";
  title: string;
  section: string | null;
  description: string;
  url?: string;
  text?: string;
  file?: string;
  preview: string | null;
  version: number;
  size: number;
};

export function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    return JSON.parse(raw).error ?? raw;
  } catch {
    return raw;
  }
}

// rel is a path inside the novel's Elements or Research folder.
export function novelFileUrl(novelPath: string, rel: string, version = 0) {
  return `${API_BASE}/api/novel/file?novel=${encodeURIComponent(novelPath)}&path=${encodeURIComponent(rel)}&v=${Math.round(version)}`;
}

export function loadElements(apiFetch: ApiFetch, novelPath: string) {
  return apiFetch<{ items: ElementItem[] }>(`/api/elements?novel=${encodeURIComponent(novelPath)}`).then((result) => result.items);
}

export function loadResearch(apiFetch: ApiFetch, novelPath: string) {
  return apiFetch<{ sections: ResearchSection[]; items: ResearchItem[] }>(`/api/research?novel=${encodeURIComponent(novelPath)}`);
}

export function post<T>(apiFetch: ApiFetch, path: string, body: Record<string, unknown>) {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}
