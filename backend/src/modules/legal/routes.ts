import type { FastifyPluginAsync } from "fastify";
import { privacyPage, termsPage } from "./pages.js";

/** Public pages (no sign-in): the stores and the app link to them. */
export const legalRoutes: FastifyPluginAsync<{ contactEmail: string | undefined }> = async (app, { contactEmail }) => {
  const privacy = privacyPage(contactEmail);
  const terms = termsPage(contactEmail);
  app.get("/privacy", (_request, reply) => reply.type("text/html; charset=utf-8").send(privacy));
  app.get("/terms", (_request, reply) => reply.type("text/html; charset=utf-8").send(terms));
};
