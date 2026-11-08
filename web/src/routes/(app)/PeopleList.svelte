<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { ListedPerson, PublicProfile } from '#lib/api/types.js';
	import { nameOf } from '#lib/format.js';
	import { Paged } from '#lib/paged.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Empty from '#lib/ui/Empty.svelte';
	import LoadMore from '#lib/ui/LoadMore.svelte';
	import PageHeader from './PageHeader.svelte';

	// Someone's followers or the people they follow, a page at a time, with a
	// Follow button on each row like the apps.
	let { userId, kind }: { userId: string; kind: 'followers' | 'following' } = $props();
	let owner = $state<PublicProfile | null>(null);
	let list = $state<Paged<ListedPerson> | null>(null);

	$effect(() => {
		const uid = userId;
		const which = kind;
		api.user(uid).then((p) => (owner = p), () => undefined);
		const paged = new Paged<ListedPerson>(async (cursor) => {
			const page = await (which === 'followers' ? api.followers(uid, cursor) : api.following(uid, cursor));
			return { items: page.users, next: page.next_cursor ?? null };
		});
		list = paged;
		void paged.refresh();
	});

	async function toggle(person: ListedPerson, i: number) {
		if (!list) return;
		const on = !person.is_following;
		list.items[i] = { ...person, is_following: on };
		try {
			await api.follow(person.id, on);
		} catch {
			if (list) list.items[i] = { ...person, is_following: !on };
			toast.show("Couldn't do that");
		}
	}

	const title = $derived(kind === 'followers' ? 'Followers' : 'Following');
</script>

<svelte:head><title>{title} · PartyNearMe</title></svelte:head>

<PageHeader title={owner ? `${title} · ${nameOf(owner)}` : title} back />

<nav class="tabs" aria-label="Followers and following">
	<a href="/u/{userId}/followers" aria-current={kind === 'followers' ? 'page' : undefined}>Followers{owner ? ` ${owner.followers}` : ''}</a>
	<a href="/u/{userId}/following" aria-current={kind === 'following' ? 'page' : undefined}>Following{owner ? ` ${owner.following}` : ''}</a>
</nav>

{#if list}
	{#if list.loadedOnce && !list.items.length && !list.error}
		<Empty title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
	{/if}
	<ul>
		{#each list.items as person, i (person.id)}
			<li>
				<a href="/u/{person.id}">
					<Avatar {person} size={44} />
					<span>
						<strong>{nameOf(person)}</strong>
						{#if person.username && person.display_name}<span class="muted">@{person.username}</span>{/if}
					</span>
				</a>
				{#if person.id !== session.userId}
					<button class="btn" class:primary={!person.is_following} onclick={() => toggle(person, i)}>
						{person.is_following ? 'Following' : 'Follow'}
					</button>
				{/if}
			</li>
		{/each}
	</ul>
	<LoadMore {list} />
{/if}

<style>
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--outline-variant);
		margin: 0 0 8px;
	}
	.tabs a {
		flex: 1;
		padding: 12px;
		text-align: center;
		font-weight: 600;
		color: var(--on-surface-variant);
		border-bottom: 2px solid transparent;
	}
	.tabs a[aria-current='page'] {
		color: var(--on-background);
		border-color: var(--primary);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0 12px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 0;
	}
	li a {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	li a > span {
		display: grid;
		min-width: 0;
	}
	li strong,
	li .muted {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
