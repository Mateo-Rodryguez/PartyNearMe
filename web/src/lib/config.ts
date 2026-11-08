/** Public values only, the same ones the phone apps ship with: RLS protects the data. */
export const config = {
	apiBaseUrl: 'https://partynearme-api.onrender.com',
	supabaseUrl: 'https://vvkckzrhzgdrazhjitse.supabase.co',
	supabaseKey: 'sb_publishable_lU8CqYjRgUy5kr9Y8QbBNQ_NiPtoCil',
	/** The password reset email leads to this page on the API. */
	get resetPasswordPage() {
		return `${this.apiBaseUrl}/reset-password`;
	}
} as const;
