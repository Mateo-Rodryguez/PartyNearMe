import type { FastifyPluginAsync } from "fastify";
import { resetPasswordCsp, resetPasswordPage } from "./resetPassword.js";

/** Public web pages that need no sign-in, besides the legal ones. */
export const webRoutes: FastifyPluginAsync<{ supabaseUrl: string; publishableKey: string | undefined }> = async (
  app,
  { supabaseUrl, publishableKey },
) => {
  const reset = resetPasswordPage(supabaseUrl, publishableKey);
  app.get("/reset-password", (_request, reply) =>
    reply
      .type("text/html; charset=utf-8")
      .header("content-security-policy", resetPasswordCsp(supabaseUrl))
      .header("cache-control", "no-store")
      .send(reset),
  );
};
