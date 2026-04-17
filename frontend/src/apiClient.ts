export type JsonResponse<T = unknown> = {
  res: Response;
  data: T;
};

/**
 * Uniform JSON request helper used across the app.
 * It always returns the raw response plus parsed JSON body (or {} fallback).
 */
export async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const res = await fetch(url, init);
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { res, data: data as T };
}

