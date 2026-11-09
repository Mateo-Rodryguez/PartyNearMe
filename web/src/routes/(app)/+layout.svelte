<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { flush } from '#lib/interactions.js';
	import { analytics } from '#lib/analytics.js';
	import { me } from '#lib/me.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { unread } from '#lib/unread.svelte.js';
	import Icon, { type IconName } from '#lib/ui/Icon.svelte';
	import type { LayoutProps } from './$types';
	import Setup from './Setup.svelte';

	let { children }: LayoutProps = $props();

	// Signed out (or the session ran out): to sign in, then back here.
	$effect(() => {
		if (!session.current) {
			const next = page.url.pathname + page.url.search;
			void goto(`/signin?next=${encodeURIComponent(next)}`, { replaceState: true });
		}
	});

	// A new account picks a username before anything else, as on the phones.
	$effect(() => {
		const userId = session.userId;
		if (userId) void me.load(userId);
	});

	// Counted once per visit, once the account is set up; first_run right after setup.
	let opened = false;
	let firstRun = false;
	$effect(() => {
		const profile = me.current;
		if (!profile || opened) return;
		if (!profile.username) firstRun = true;
		else {
			opened = true;
			analytics.capture('app_opened', { first_run: firstRun });
		}
	});

	// Send what the user looked at when they leave or switch tabs.
	$effect(() => {
		void unread.check();
		const onHide = () => {
			if (document.visibilityState === 'hidden') void flush();
			else void unread.check();
		};
		document.addEventListener('visibilitychange', onHide);
		return () => document.removeEventListener('visibilitychange', onHide);
	});

	// The same tabs as the apps; Search sits in the feed's header on phones.
	const tabs: { href: string; label: string; icon: IconName; wideOnly?: boolean }[] = [
		{ href: '/feed', label: 'Home', icon: 'home' },
		{ href: '/nearby', label: 'Parties', icon: 'place' },
		{ href: '/search', label: 'Search', icon: 'search', wideOnly: true },
		{ href: '/new', label: 'Post', icon: 'add' },
		{ href: '/chat', label: 'Chat', icon: 'comment' },
		{ href: '/me', label: 'Profile', icon: 'person' }
	];
	const current = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

{#if session.current && me.current && !me.current.username}
	<Setup profile={me.current} ondone={(profile) => me.set(profile)} />
{:else if session.current}
	<div class="shell">
		<nav aria-label="Main">
			<a href="/feed" class="brand" aria-label="PartyNearMe home">
				<img src="/icon.svg" alt="" width="32" height="32" />
				<span>PartyNearMe</span>
			</a>
			{#each tabs as tab (tab.href)}
				<a href={tab.href} class="tab" class:wide-only={tab.wideOnly} aria-current={current(tab.href) ? 'page' : undefined}>
					<span class="glyph">
						<Icon name={tab.icon} size={26} />
						{#if tab.href === '/chat' && unread.messages}<span class="dot" aria-label="{unread.messages} unread"></span>{/if}
					</span>
					<span>{tab.label}</span>
				</a>
			{/each}
		</nav>
		<main>
			{@render children()}
		</main>
	</div>
{/if}

<style>
	.shell {
		min-height: 100dvh;
	}
	main {
		max-width: 640px;
		margin: 0 auto;
		padding-bottom: calc(80px + env(safe-area-inset-bottom));
	}
	/* Phones: a tab bar at the bottom, like the apps. */
	nav {
		position: fixed;
		z-index: 20;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: space-around;
		padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
		background: color-mix(in srgb, var(--background) 88%, transparent);
		backdrop-filter: blur(16px);
		border-top: 1px solid var(--outline-variant);
	}
	.brand {
		display: none;
	}
	.tab {
		display: grid;
		justify-items: center;
		gap: 2px;
		min-width: 56px;
		padding: 4px 8px;
		font-size: 11px;
		font-weight: 600;
		color: var(--on-surface-variant);
	}
	.tab[aria-current='page'] {
		color: var(--primary);
	}
	.wide-only {
		display: none;
	}
	.glyph {
		position: relative;
		display: grid;
	}
	.dot {
		position: absolute;
		top: 0;
		right: -2px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--gradient);
		border: 2px solid var(--background);
		box-sizing: content-box;
	}
	/* Wider screens: a rail down the left, Instagram-style, with the content centred. */
	@media (min-width: 900px) {
		nav {
			top: 0;
			right: auto;
			width: 240px;
			flex-direction: column;
			justify-content: flex-start;
			gap: 4px;
			padding: 24px 12px;
			border-top: 0;
			border-right: 1px solid var(--outline-variant);
		}
		.brand {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 0 12px 24px;
			font-weight: 800;
			font-size: 20px;
		}
		.brand img {
			border-radius: 10px;
		}
		.tab,
		.wide-only {
			display: flex;
			align-items: center;
			gap: 14px;
			padding: 12px;
			border-radius: var(--radius-sm);
			font-size: 16px;
			color: var(--on-background);
		}
		.tab:hover {
			background: var(--surface);
		}
		.tab[aria-current='page'] {
			font-weight: 800;
			color: var(--on-background);
		}
		.tab[aria-current='page'] :global(svg) {
			color: var(--primary);
		}
		main {
			padding: 24px 0 48px 240px;
			max-width: calc(640px + 240px);
		}
	}
	@media (min-width: 1200px) {
		main {
			margin-left: max(240px, calc(50vw - 320px));
			padding-left: 0;
			max-width: 640px;
		}
	}
</style>
