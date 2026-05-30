import type { Session } from "@supabase/supabase-js";
import {
  getCreditSummary,
  listProjects,
  type CreditSummaryResponse,
  type WorkListItemResponse
} from "@/lib/api-client";

const cacheTtlMs = 5 * 60 * 1000;
const workListPrefix = "fontasy:work-list:v1";
const creditSummaryPrefix = "fontasy:credit-summary:v1";

type CachedPayload<T> = {
  cachedAt: string;
  value: T;
};

export function readCachedWorkList(userId: string) {
  return readCachedValue<WorkListItemResponse[]>(cacheKey(workListPrefix, userId));
}

export function writeCachedWorkList(userId: string, items: WorkListItemResponse[]) {
  writeCachedValue(cacheKey(workListPrefix, userId), items);
}

export async function fetchAndCacheWorkList(session: Session) {
  const items = await listProjects(session);
  writeCachedWorkList(session.user.id, items);
  return items;
}

export function readCachedCreditSummary(userId: string) {
  return readCachedValue<CreditSummaryResponse>(cacheKey(creditSummaryPrefix, userId));
}

export function writeCachedCreditSummary(userId: string, summary: CreditSummaryResponse) {
  writeCachedValue(cacheKey(creditSummaryPrefix, userId), summary);
}

export async function fetchAndCacheCreditSummary(session: Session) {
  const summary = await getCreditSummary(session);
  writeCachedCreditSummary(session.user.id, summary);
  return summary;
}

export function clearCachedReadModels(userId?: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  const prefixes = [workListPrefix, creditSummaryPrefix];
  if (userId) {
    prefixes.forEach((prefix) => window.localStorage.removeItem(cacheKey(prefix, userId)));
    return;
  }
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(`${prefix}:`))) {
      window.localStorage.removeItem(key);
    }
  }
}

function cacheKey(prefix: string, userId: string) {
  return `${prefix}:${userId}`;
}

function readCachedValue<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const saved = window.localStorage.getItem(key);
    const parsed = saved ? (JSON.parse(saved) as CachedPayload<T>) : null;
    if (!parsed?.cachedAt || parsed.value === undefined) {
      return null;
    }
    if (Date.now() - Date.parse(parsed.cachedAt) > cacheTtlMs) {
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCachedValue<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        value
      } satisfies CachedPayload<T>)
    );
  } catch {
    // Cache writes should never block the primary server-backed flow.
  }
}
