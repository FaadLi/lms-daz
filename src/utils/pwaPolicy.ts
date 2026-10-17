export function mayServeStatic(
  request: Pick<Request, "method" | "headers">,
  url: URL,
  origin: string,
): boolean {
  return (
    request.method === "GET" &&
    url.origin === origin &&
    !url.search &&
    !request.headers.has("authorization") &&
    (/^\/assets\/[^/]+-[\w-]+\.(js|css)$/.test(url.pathname) ||
      /^\/icons\/pwa-(192|512|maskable-512)\.png$/.test(url.pathname) ||
      url.pathname === "/icon.svg")
  );
}
export function mayServeShell(
  request: Pick<Request, "method" | "headers" | "mode">,
  url: URL,
  origin: string,
): boolean {
  return (
    request.method === "GET" &&
    request.mode === "navigate" &&
    url.origin === origin &&
    !request.headers.has("authorization") &&
    ["/", "/index.html"].includes(url.pathname)
  );
}
