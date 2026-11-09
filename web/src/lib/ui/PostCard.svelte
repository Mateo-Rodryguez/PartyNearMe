<script lang="ts">
	import { analytics } from '#lib/analytics.js';
	import { api } from '#lib/api/client.js';
	import type { Person, Placement, Post } from '#lib/api/types.js';
	import { count, nameOf, timeAgo } from '#lib/format.js';
	import { interactions } from '#lib/interactions.js';
	import { postLink, share } from '#lib/share.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import PeoplePicker from './PeoplePicker.svelte';
	import Photo from './Photo.svelte';
	import ReportSheet from './ReportSheet.svelte';
	import Sheet from './Sheet.svelte';
	import { session } from '#lib/session.svelte.js';

	let {
		post = $bindable(),
		eager = false,
		detail = false,
		placement,
		ongone
	}: {
		post: Post;
		eager?: boolean;
		detail?: boolean;
		/** Which list the post is in, and where, for measuring the ranking. */
		placement?: Placement;
		ongone?: () => void;
	} = $props();

	const own = $derived(post.author.id === session.userId);
	const taggedMe = $derived(post.tags.some((t) => t.id === session.userId));
	let menu = $state(false);
	let reporting = $state(false);
	let editing = $state(false);
	let caption = $state('');
	let tagging = $state(false);
	let savingTags = $state(false);

	let card = $state<HTMLElement>();
	let index = $state(0);
	let strip = $state<HTMLElement>();
	let burst = $state(false);

	// An impression once half the post is on screen, and how long it stays there.
	$effect(() => {
		if (!card || detail) return;
		let since = 0;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					interactions.impression(post.id, placement);
					since = performance.now();
				} else if (since) {
					interactions.dwell(post.id, performance.now() - since, placement);
					since = 0;
				}
			},
			{ threshold: 0.5 }
		);
		observer.observe(card);
		return () => {
			if (since) interactions.dwell(post.id, performance.now() - since, placement);
			observer.disconnect();
		};
	});

	async function toggleLike(on = !post.liked_by_me) {
		if (on === post.liked_by_me) return;
		const before = post;
		post = { ...post, liked_by_me: on, like_count: post.like_count + (on ? 1 : -1) };
		try {
			await api.like(post.id, on);
		} catch {
			post = before;
			toast.show("Couldn't save that. Try again.");
		}
	}

	async function toggleSave() {
		const on = !post.saved_by_me;
		post = { ...post, saved_by_me: on };
		try {
			await api.savePost(post.id, on);
			toast.show(on ? 'Saved' : 'Removed from saved');
		} catch {
			post = { ...post, saved_by_me: !on };
			toast.show("Couldn't save that. Try again.");
		}
	}

	function doubleTap() {
		burst = true;
		setTimeout(() => (burst = false), 700);
		void toggleLike(true);
	}

	async function sharePost() {
		const result = await share(`${nameOf(post.author)} on PartyNearMe`, postLink(post.id), { postId: post.id });
		if (result) analytics.capture('link_shared', { kind: 'post' });
		if (result === 'copied') toast.show('Link copied');
	}

	async function act(what: 'delete' | 'untag' | 'block') {
		menu = false;
		const ask = {
			delete: 'Delete this post? This cannot be undone.',
			untag: 'Take yourself off this post?',
			block: `Block ${nameOf(post.author)}? You won't see each other's posts or parties, and they can't message you.`
		}[what];
		if (!confirm(ask)) return;
		try {
			if (what === 'delete') await api.deletePost(post.id);
			if (what === 'untag') {
				await api.untagMe(post.id);
				post = { ...post, tags: post.tags.filter((t) => t.id !== session.userId) };
				return;
			}
			if (what === 'block') await api.block(post.author.id, true);
			toast.show(what === 'delete' ? 'Post deleted' : 'Blocked');
			ongone?.();
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't do that");
		}
	}

	async function saveCaption(e: SubmitEvent) {
		e.preventDefault();
		try {
			post = await api.updateCaption(post.id, caption.trim());
			editing = false;
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		}
	}

	async function saveTags(people: Person[]) {
		savingTags = true;
		try {
			post = await api.setTags(post.id, people.map((p) => p.id));
			tagging = false;
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		} finally {
			savingTags = false;
		}
	}

	function onScroll() {
		if (strip) index = Math.round(strip.scrollLeft / strip.clientWidth);
	}
</script>

<article class="post" bind:this={card} aria-label="Post by {nameOf(post.author)}">
	<header>
		<a href="/u/{post.author.id}" class="who">
			<Avatar person={post.author} size={36} />
			<span class="names">
				<strong>{nameOf(post.author)}</strong>
				{#if post.event_title || post.place_name}
					<span class="where muted">{post.event_title ?? post.place_name}</span>
				{/if}
			</span>
		</a>
		{#if post.event_id}
			<a class="party-link" href="/e/{post.event_id}" aria-label="Open the party">
				<Icon name="event" size={20} />
			</a>
		{/if}
		<time class="muted" datetime={post.created_at}>{timeAgo(post.created_at)}</time>
		<button class="icon small" aria-label="More options" onclick={() => (menu = true)}><Icon name="more" size={20} /></button>
	</header>

	{#if post.media.length}
		<div class="media" role="presentation" ondblclick={doubleTap}>
			<div class="strip" bind:this={strip} onscroll={onScroll}>
				{#each post.media as media, i (media.position)}
					<div class="slide">
						<Photo {media} eager={eager && i === 0} alt={post.caption ? `Photo: ${post.caption}` : `Photo by ${nameOf(post.author)}`} />
					</div>
				{/each}
			</div>
			{#if post.media.length > 1}
				<div class="dots" aria-hidden="true">
					{#each post.media as media, i (media.position)}<span class:on={i === index}></span>{/each}
				</div>
			{/if}
			{#if burst}<span class="burst" aria-hidden="true"><Icon name="heart" size={96} /></span>{/if}
		</div>
	{/if}

	<div class="actions">
		<button class="icon" class:liked={post.liked_by_me} aria-pressed={post.liked_by_me} aria-label="Like" onclick={() => toggleLike()}>
			<Icon name={post.liked_by_me ? 'heart' : 'heartOutline'} />
		</button>
		<a class="icon" href="/p/{post.id}#comments" aria-label="Comments"><Icon name="comment" /></a>
		<button class="icon" aria-label="Share" onclick={sharePost}><Icon name="share" /></button>
		<span class="spacer"></span>
		<button class="icon" aria-pressed={post.saved_by_me} aria-label="Save" onclick={toggleSave}>
			<Icon name={post.saved_by_me ? 'bookmark' : 'bookmarkOutline'} />
		</button>
	</div>

	<div class="text">
		{#if post.like_count > 0}<strong>{count(post.like_count, 'like')}</strong>{/if}
		{#if post.caption}
			<p><a href="/u/{post.author.id}"><strong>{nameOf(post.author)}</strong></a> {post.caption}</p>
		{/if}
		{#if post.tags.length}
			<p class="muted">
				With {#each post.tags as tag, i (tag.id)}{i > 0 ? ', ' : ''}<a href="/u/{tag.id}">{nameOf(tag)}</a>{/each}
			</p>
		{/if}
		{#if !detail && post.comment_count > 0}
			<a class="muted" href="/p/{post.id}#comments">View {count(post.comment_count, 'comment')}</a>
		{/if}
		{#if editing}
			<form class="edit" onsubmit={saveCaption}>
				<textarea class="field" rows="3" maxlength="2200" bind:value={caption} aria-label="Caption"></textarea>
				<div class="row">
					<button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
					<button class="btn primary">Save</button>
				</div>
			</form>
		{/if}
		{#if post.status !== 'visible'}
			<p class="muted">Only you can see this while we check it.</p>
		{/if}
	</div>
</article>

<Sheet bind:open={menu} title="Post">
	<div class="menu">
		{#if own}
			<button class="btn block" onclick={() => { menu = false; caption = post.caption ?? ''; editing = true; }}>Edit caption</button>
			<button class="btn block" onclick={() => { menu = false; tagging = true; }}>Tag people</button>
			<button class="btn block danger" onclick={() => act('delete')}>Delete post</button>
		{:else}
			<button class="btn block" onclick={() => { menu = false; reporting = true; }}>Report post</button>
			{#if taggedMe}<button class="btn block" onclick={() => act('untag')}>Remove me from this post</button>{/if}
			<button class="btn block danger" onclick={() => act('block')}>Block {nameOf(post.author)}</button>
		{/if}
		<button class="btn block outline" onclick={() => (menu = false)}>Cancel</button>
	</div>
</Sheet>
<ReportSheet bind:open={reporting} target="post" targetId={post.id} />
{#if own}
	<Sheet bind:open={tagging} title="Tag people">
		<PeoplePicker button="Save" initial={post.tags} busy={savingTags} ondone={saveTags} />
	</Sheet>
{/if}

<style>
	.post {
		display: grid;
		gap: 8px;
		padding-bottom: 16px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		flex: 1;
	}
	.names {
		display: grid;
		min-width: 0;
		line-height: 1.25;
	}
	.names > * {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.where {
		font-size: 13px;
	}
	.party-link {
		color: var(--on-surface-variant);
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
	}
	time {
		font-size: 13px;
	}
	.media {
		position: relative;
		user-select: none;
	}
	.strip {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}
	.strip::-webkit-scrollbar {
		display: none;
	}
	.slide {
		flex: 0 0 100%;
		scroll-snap-align: start;
	}
	@media (min-width: 640px) {
		.media {
			border-radius: var(--radius-md);
			overflow: hidden;
		}
	}
	.dots {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 10px;
		display: flex;
		justify-content: center;
		gap: 5px;
	}
	.dots span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.5);
	}
	.dots span.on {
		background: #fff;
	}
	.burst {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #fff;
		filter: drop-shadow(0 4px 16px rgb(0 0 0 / 0.4));
		animation: pop 0.7s ease-out forwards;
		pointer-events: none;
	}
	@keyframes pop {
		0% {
			transform: scale(0.4);
			opacity: 0;
		}
		30% {
			transform: scale(1.1);
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 0;
		}
	}
	.actions {
		display: flex;
		align-items: center;
		padding: 0 4px;
	}
	.spacer {
		flex: 1;
	}
	.icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		background: none;
		border-radius: 50%;
	}
	.icon.liked {
		color: var(--primary);
	}
	.icon.small {
		width: 36px;
		height: 36px;
		color: var(--on-surface-variant);
	}
	.menu {
		display: grid;
		gap: 8px;
	}
	.edit {
		display: grid;
		gap: 8px;
	}
	.edit .row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.text {
		display: grid;
		gap: 4px;
		padding: 0 12px;
		overflow-wrap: anywhere;
	}
</style>
