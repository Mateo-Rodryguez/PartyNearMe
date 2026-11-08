import { config } from '#lib/config.js';

/** A signed-in user's tokens, as Supabase Auth hands them out. */
export interface Session {
	accessToken: string;
	refreshToken: string;
	/** Seconds since 1970. */
	expiresAt: number;
	userId: string;
	email?: string | null;
}

export class AuthError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

const base = `${config.supabaseUrl}/auth/v1`;
const headers = { apikey: config.supabaseKey, 'content-type': 'application/json' };
const now = () => Math.floor(Date.now() / 1000);

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	expires_at?: number;
	user: { id: string; email?: string | null };
}

function toSession(t: TokenResponse): Session {
	return {
		accessToken: t.access_token,
		refreshToken: t.refresh_token,
		expiresAt: t.expires_at ?? now() + t.expires_in,
		userId: t.user.id,
		email: t.user.email
	};
}

/** Supabase uses a few error shapes over its versions; pick whichever message is there. */
export function authMessage(body: unknown): string {
	const obj = (body ?? {}) as Record<string, unknown>;
	const raw = ['msg', 'error_description', 'message', 'error']
		.map((key) => obj[key])
		.find((value): value is string => typeof value === 'string');
	if (!raw) return 'Sign-in failed';
	if (/invalid login credentials/i.test(raw)) return 'Wrong email or password';
	if (/email not confirmed/i.test(raw)) return 'Confirm your email first, using the link we sent you';
	return raw;
}

async function post(path: string, body: unknown, init: RequestInit = {}): Promise<Record<string, unknown>> {
	const response = await fetch(`${base}${path}`, {
		method: 'POST',
		headers: { ...headers, ...(init.headers as Record<string, string>) },
		body: JSON.stringify(body)
	});
	const json = await response.json().catch(() => ({}));
	if (!response.ok) throw new AuthError(response.status, authMessage(json));
	return json;
}

export async function signIn(email: string, password: string): Promise<Session> {
	return toSession((await post('/token?grant_type=password', { email, password })) as unknown as TokenResponse);
}

/** Null when the project wants the email confirmed first. */
export async function signUp(email: string, password: string): Promise<Session | null> {
	const json = await post('/signup', { email, password });
	return 'access_token' in json ? toSession(json as unknown as TokenResponse) : null;
}

/** Supabase answers the same whether or not the address has an account. */
export async function recover(email: string): Promise<void> {
	await post(`/recover?redirect_to=${encodeURIComponent(config.resetPasswordPage)}`, { email });
}

/** Null when the refresh token is no longer valid. */
export async function refresh(refreshToken: string): Promise<Session | null> {
	try {
		return toSession((await post('/token?grant_type=refresh_token', { refresh_token: refreshToken })) as unknown as TokenResponse);
	} catch (e) {
		if (e instanceof AuthError && e.status >= 400 && e.status < 500) return null;
		throw e;
	}
}

export async function signOut(accessToken: string): Promise<void> {
	// Best effort: the local session is cleared either way.
	await fetch(`${base}/logout`, { method: 'POST', headers: { ...headers, authorization: `Bearer ${accessToken}` } }).catch(
		() => undefined
	);
}

/** The sign-in providers switched on in Supabase, such as "google". */
export async function providers(): Promise<string[]> {
	const response = await fetch(`${base}/settings`, { headers: { apikey: config.supabaseKey } });
	if (!response.ok) return [];
	const external = ((await response.json()) as { external?: Record<string, unknown> }).external ?? {};
	return Object.entries(external)
		.filter(([, on]) => on === true)
		.map(([name]) => name);
}

// Browser sign-in (Google) with PKCE: the verifier waits in sessionStorage while
// the page goes to Google and back to /auth/callback.

const VERIFIER_KEY = 'pnm.pkce';

function base64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}

export async function authorizeUrl(provider: string, redirectTo: string): Promise<string> {
	const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
	const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
	sessionStorage.setItem(VERIFIER_KEY, verifier);
	const url = new URL(`${base}/authorize`);
	url.searchParams.set('provider', provider);
	url.searchParams.set('redirect_to', redirectTo);
	url.searchParams.set('code_challenge', challenge);
	url.searchParams.set('code_challenge_method', 's256');
	return url.toString();
}

/** Reads where browser sign-in came back to and swaps the code for a session. */
export async function finishBrowserSignIn(href: string): Promise<Session> {
	const url = new URL(href);
	const fragment = new URLSearchParams(url.hash.slice(1));
	const code = url.searchParams.get('code');
	const verifier = sessionStorage.getItem(VERIFIER_KEY);
	sessionStorage.removeItem(VERIFIER_KEY);
	if (!code || !verifier) {
		const error =
			url.searchParams.get('error_description') ??
			fragment.get('error_description') ??
			url.searchParams.get('error') ??
			fragment.get('error');
		throw new AuthError(400, error ?? 'Sign-in failed');
	}
	return toSession((await post('/token?grant_type=pkce', { auth_code: code, code_verifier: verifier })) as unknown as TokenResponse);
}
