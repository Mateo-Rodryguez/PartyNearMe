import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import type { FastifyRequest } from "fastify";

/** Returns the signed-in user's id for a valid access token, or throws. */
export type TokenVerifier = (token: string) => Promise<string>;

export class UnauthorizedError extends Error {
  readonly statusCode = 401;
}

const claimsSchema = z.object({
  sub: z.guid(),
  role: z.literal("authenticated"),
});

export function createTokenVerifier(
  getKey: JWTVerifyGetKey,
  options: { issuer: string; audience: string },
): TokenVerifier {
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["ES256", "RS256", "EdDSA"],
      });
      const claims = claimsSchema.safeParse(payload);
      if (!claims.success) throw new UnauthorizedError("Token is not a signed-in user");
      return claims.data.sub;
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      if (err instanceof errors.JOSEError) throw new UnauthorizedError("Invalid or expired token");
      throw err;
    }
  };
}

/** Verifies Supabase Auth access tokens against the project's public signing keys. */
export function supabaseTokenVerifier(supabaseUrl: string): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  return createTokenVerifier(jwks, { issuer: `${supabaseUrl}/auth/v1`, audience: "authenticated" });
}

declare module "fastify" {
  interface FastifyRequest {
    /** The signed-in user's id, taken only from the verified token. */
    userId: string;
  }
}

export function authenticate(verify: TokenVerifier) {
  return async (request: FastifyRequest): Promise<void> => {
    const header = request.headers.authorization;
    const match = header?.match(/^Bearer\s+(\S+)$/i);
    if (!match?.[1]) throw new UnauthorizedError("Missing bearer token");
    request.userId = await verify(match[1]);
  };
}
