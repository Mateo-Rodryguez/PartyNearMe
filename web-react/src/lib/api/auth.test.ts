import { describe, expect, it } from 'vitest';
import { authMessage } from './auth.js';

describe('authMessage', () => {
	it('turns Supabase errors into plain words', () => {
		expect(authMessage({ error_description: 'Invalid login credentials' })).toBe('Wrong email or password');
		expect(authMessage({ msg: 'Email not confirmed' })).toMatch(/Confirm your email/);
		expect(authMessage({ message: 'Password too short' })).toBe('Password too short');
		expect(authMessage(null)).toBe('Sign-in failed');
	});
});
