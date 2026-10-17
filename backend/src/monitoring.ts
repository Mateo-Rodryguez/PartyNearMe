import * as Sentry from "@sentry/node";

/** Where unexpected errors go besides the logs. Tests and local runs use the no-op. */
export type ErrorReporter = (err: unknown, context?: Record<string, unknown>) => void;

export const noReporter: ErrorReporter = () => {};

/**
 * Sends unexpected errors to Sentry when SENTRY_DSN is set. Only errors, no
 * tracing, and none of the request, database or local-variable data the SDK
 * collects by default: those can hold messages, emails and tokens.
 */
export function sentryReporter(dsn: string | undefined, environment: string, service: string): ErrorReporter {
  if (!dsn) return noReporter;
  Sentry.init({
    dsn,
    environment,
    // Render sets this to the deployed commit, so each error names its release.
    release: process.env.RENDER_GIT_COMMIT,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    initialScope: { tags: { service } },
  });
  return (err, context) => {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  };
}
