/** 生产环境若前端与 API 不同域，设置 VITE_API_BASE_URL=https://api.你的域名 */

export function getApiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
}

export function apiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${p}` : p;
}

export function withCacheBust(url: string, t: number | string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${t}`;
}

/** 相对路径会拼上 API Base；已是 http(s) 则原样返回 */
export function resolveMediaUrl(pathOrUrl: string, cacheBust?: number | string): string {
  let u =
    pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : apiPath(pathOrUrl);
  if (cacheBust !== undefined) {
    u = withCacheBust(u, cacheBust);
  }
  return u;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  accessToken?: string | null
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (
    !headers.has("Content-Type") &&
    init.body != null &&
    !(init.body instanceof FormData) &&
    !(init.body instanceof Blob)
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(apiPath(path), { ...init, headers });
}
