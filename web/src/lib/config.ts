/** Public values only, the same ones the phone apps ship with: RLS protects the data. */
export const config = {
	apiBaseUrl: 'https://partynearme-api.onrender.com',
	supabaseUrl: 'https://vvkckzrhzgdrazhjitse.supabase.co',
	supabaseKey: 'sb_publishable_lU8CqYjRgUy5kr9Y8QbBNQ_NiPtoCil',
	/** PostHog's project key (public, write-only), the same project as the apps; null turns analytics off. */
	posthogKey: 'phc_B4hyjqciBxdUAianpS5sdiwKvHqwccTDQpu6wLTdGcyw' as string | null,
	posthogHost: 'https://eu.i.posthog.com',
	/**
	 * Shows "Continue with Apple" once Apple sign-in for the web is set up in
	 * Supabase (a Services ID and key; see docs/web.md). The iPhone's native
	 * Apple sign-in doesn't need those, so the provider being on isn't enough.
	 */
	appleOnWeb: false,
	/** The commit this build came from (set by vite.config.ts), sent with feedback so a bad release shows up. */
	version: __APP_VERSION__,
	/** The password reset email leads to this page on the API. */
	get resetPasswordPage() {
		return `${this.apiBaseUrl}/reset-password`;
	}
} as const;
