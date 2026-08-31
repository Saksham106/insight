export function redactPrivateAnalyticsUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!url.pathname.startsWith("/statement/")) return value;
    url.pathname = "/statement/private";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.startsWith("/statement/") ? "/statement/private" : value;
  }
}
