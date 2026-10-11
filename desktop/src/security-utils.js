const ALLOWED_EXTERNAL_HOSTS = new Set(["github.com", "objects.githubusercontent.com"]);

export function isAllowedExternalUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_EXTERNAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
