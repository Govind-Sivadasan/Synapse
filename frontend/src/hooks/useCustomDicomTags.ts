import { useCallback, useState } from "react";

const STORAGE_KEY = "synapse-custom-dicom-tags";

function loadCustomTags(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string" && t.trim()) : [];
  } catch {
    return [];
  }
}

function saveCustomTags(tags: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

export function useCustomDicomTags() {
  const [customTags, setCustomTags] = useState<string[]>(loadCustomTags);

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return false;

    let added = false;
    setCustomTags((prev) => {
      if (prev.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return prev;
      added = true;
      const next = [...prev, trimmed];
      saveCustomTags(next);
      return next;
    });
    return added;
  }, []);

  return { customTags, addTag };
}

export function mergeDicomTags(baseTags: string[], customTags: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tag of [...baseTags, ...customTags]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
  }
  return merged;
}
