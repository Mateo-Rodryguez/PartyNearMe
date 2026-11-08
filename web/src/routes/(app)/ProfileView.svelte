<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '#lib/api/client.js';
	import type { Event, Post, PublicProfile } from '#lib/api/types.js';
	import { nameOf } from '#lib/format.js';
	import { Paged } from '#lib/paged.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Empty from '#lib/ui/Empty.svelte';
	import EventCard from '#lib/ui/EventCard.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import LoadMore from '#lib/ui/LoadMore.svelte';
	import Photo from '#lib/ui/Photo.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import ReportSheet from '#lib/ui/ReportSheet.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import PageHeader from './PageHeader.svelte';

	let { userId }: { userId: string } = $props();
	const own = $derived(userId === session.userId);
	let profile = $state<PublicProfile | null>(null);
	let error = $state<string | null>(null);
	let posts = $state<Paged<Post> | null>(null);
	let tab = $state<'photos' | 'parties'>('photos');
	let parties = $state<Event[] | null>(null);

	const hearts: Record<string, string> = { taken: '❤️ Taken', talking: '💬 Talking', single: '💖 Single' };

	$effect(() => {
		const uid = userId;
		profile = null;
		error = null;
		parties = null;
		tab = 'photos';
		api.user(uid).then(
			(p) => (profile = p),
			(e: unknown) => (error = e instanceof Error ? e.message : 'Something went wrong')
		);
		const list = new Paged<Post>(async (cursor) => {
			const p = await api.userPosts(uid, cursor);
			return { items: p.posts, next: p.next_cursor ?? null };
		});
		posts = list;
		void list.refresh();
	});

	async function showParties() {
		tab = 'parties';
		if (parties) return;
		const [hosting, going] = await Promise.all([api.myEvents(true), api.myEvents(false)]).catch(() => [[], []] as Event[][]);
		const seen = new Set<string>();
		parties = [...hosting, ...going]
			.filter((e) => !seen.has(e.id) && seen.add(e.id))
			.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
	}

	async function toggleFollow() {
		if (!profile) return;
		const on = !profile.is_following;
		profile = { ...profile, is_following: on, followers: profile.followers + (on ? 1 : -1) };
		try {
			await api.follow(profile.id, on);
		} catch (e) {
			profile = { ...profile, is_following: !on, followers: profile.followers + (on ? -1 : 1) };
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		}
	}

	async function message() {
		if (!profile) return;
		try {
			const chat = await api.startConversation(profile.id);
			await goto(`/chat/${chat.id}`);
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't start a chat");
		}
	}

	let menu = $state(false);
	let reporting = $state(false);

	async function toggleBlock() {
		if (!profile) return;
		menu = false;
		const on = !profile.is_blocked;
		if (on && !confirm(`Block ${nameOf(profile)}? You won't see each other's posts or parties, and they can't message you.`)) return;
		try {
			await api.block(profile.id, on);
			profile = { ...profile, is_blocked: on, is_following: on ? false : profile.is_following };
			toast.show(on ? 'Blocked' : 'Unblocked');
		} catch {
			toast.show("Couldn't do that");
		}
	}
</script>

<svelte:head><title>{profile ? nameOf(profile) : 'Profile'} · PartyNearMe</title></svelte:head>

<PageHeader title={profile?.username ? `@${profile.username}` : (profile ? nameOf(profile) : 'Profile')} back={!own}>
	{#snippet actions()}
		{#if own}
			<a class="icon" href="/settings" aria-label="Settings" title="Settings"><Icon name="settings" /></a>
		{:else if profile}
			<button class="icon" aria-label="More options" onclick={() => (menu = true)}><Icon name="more" /></button>
		{/if}
	{/snippet}
</PageHeader>

{#if profile && !own}
	<Sheet bind:open={menu} title={nameOf(profile)}>
		<div class="menu">
			<button class="btn block" onclick={() => { menu = false; reporting = true; }}>Report</button>
			<button class="btn block danger" onclick={toggleBlock}>{profile.is_blocked ? 'Unblock' : 'Block'}</button>
			<button class="btn block outline" onclick={() => (menu = false)}>Cancel</button>
		</div>
	</Sheet>
	<ReportSheet bind:open={reporting} target="user" targetId={profile.id} />
{/if}

{#if error}
	<Empty title="Couldn't open this profile">{error}</Empty>
{:else if !profile}
	<Spinner />
{:else}
	<section class="top">
		<Avatar person={profile} size={88} ring />
		<div class="stats">
			<div><strong>{profile.parties}</strong><span>Parties</span></div>
			<div><strong>{posts?.items.length ?? 0}{posts && !posts.ended ? '+' : ''}</strong><span>Photos</span></div>
			<a href="/u/{profile.id}/followers"><strong>{profile.followers}</strong><span>Followers</span></a>
			<a href="/u/{profile.id}/following"><strong>{profile.following}</strong><span>Following</span></a>
		</div>
	</section>
	<section class="about">
		<h1>{nameOf(profile)}</h1>
		{#if profile.relationship_status && hearts[profile.relationship_status]}
			<p class="muted">{hearts[profile.relationship_status]}</p>
		{/if}
		{#if profile.bio}<p class="bio">{profile.bio}</p>{/if}
		{#if !own && profile.is_blocked}
			<button class="btn block outline" onclick={toggleBlock}>Unblock</button>
		{:else if !own}
			<div class="actions">
				<button class="btn" class:primary={!profile.is_following} onclick={toggleFollow}>
					{profile.is_following ? 'Following' : 'Follow'}
				</button>
				<button class="btn" onclick={message}>Message</button>
			</div>
		{/if}
	</section>

	{#if own}
		<div class="tabs" role="tablist">
			<button role="tab" aria-selected={tab === 'photos'} onclick={() => (tab = 'photos')}>Photos</button>
			<button role="tab" aria-selected={tab === 'parties'} onclick={showParties}>Your parties</button>
		</div>
	{/if}

	{#if tab === 'photos' && posts}
		<div class="grid">
			{#each posts.items as post (post.id)}
				{#if post.media[0]}
					<a href="/p/{post.id}" aria-label={post.caption ?? 'Photo'}><Photo media={post.media[0]} sizes="(min-width: 640px) 210px, 33vw" /></a>
				{/if}
			{/each}
		</div>
		{#if posts.loadedOnce && !posts.items.length}
			<Empty title="No photos yet">{own ? 'Photos you post from parties show up here.' : ''}</Empty>
		{:else}
			<LoadMore list={posts} />
		{/if}
	{:else if tab === 'parties'}
		{#if !parties}
			<Spinner />
		{:else if !parties.length}
			<Empty title="No parties yet">Parties you host or say you're going to show up here.</Empty>
		{:else}
			<div class="parties">
				{#each parties as event (event.id)}<EventCard {event} />{/each}
			</div>
		{/if}
	{/if}
{/if}

<style>
	.icon {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: inherit;
	}
	.menu {
		display: grid;
		gap: 8px;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 16px;
	}
	.stats {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		text-align: center;
	}
	.stats div,
	.stats a {
		display: grid;
	}
	.stats strong {
		font-size: 18px;
	}
	.stats span {
		font-size: 12px;
		color: var(--on-surface-variant);
	}
	.about {
		display: grid;
		gap: 6px;
		padding: 8px 16px 16px;
	}
	.about h1 {
		font-size: 18px;
		letter-spacing: 0;
	}
	.bio {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.about .btn {
		margin-top: 8px;
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--outline-variant);
	}
	.tabs button {
		flex: 1;
		min-height: 44px;
		border: 0;
		background: none;
		font-weight: 600;
		color: var(--on-surface-variant);
		border-bottom: 2px solid transparent;
	}
	.tabs button[aria-selected='true'] {
		color: var(--on-background);
		border-bottom-color: var(--primary);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 3px;
		margin-top: 3px;
	}
	.grid :global(.photo) {
		aspect-ratio: 1 !important;
	}
	.parties {
		display: grid;
		gap: 16px;
		padding: 16px 12px;
	}
</style>
