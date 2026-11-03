// Server error tracking: every unhandled error in a page, route or server action
// becomes one JSON line in the hosting logs (Vercel > Logs, filter "server.error").
// Only the error's name, Next's digest and the route are logged: never the
// message, request body, cookies or query string, which can hold personal data.

export function register() {}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const e = error as { name?: string; digest?: string };
  console.error(
    JSON.stringify({
      event: "server.error",
      name: e?.name ?? "Error",
      digest: e?.digest ?? null,
      method: request.method,
      route: context.routePath,
      type: context.routeType,
      at: new Date().toISOString(),
    }),
  );
}
