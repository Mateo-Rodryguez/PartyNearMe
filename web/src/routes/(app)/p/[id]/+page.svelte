<script lang="ts">
	import { page } from '$app/state';
	import { api } from '#lib/api/client.js';
	import type { Comment, Post } from '#lib/api/types.js';
	import { nameOf, timeAgo } from '#lib/format.js';
	import { interactions } from '#lib/interactions.js';
	import { Paged } from '#lib/paged.svelte.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Empty from '#lib/ui/Empty.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import LoadMore from '#lib/ui/LoadMore.svelte';
	import PostCard from '#lib/ui/PostCard.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../../PageHeader.svelte';

	const id = $derived(page.params.id ?? '');
	let post = $state<Post | null>(null);
	let error = $state<string | null>(null);
	let comments = $state<Paged<Comment> | null>(null);
	let draft = $state('');
	let sending = $state(false);

	$effect(() => {
		const postId = id;
		post = null;
		error = null;
		api.post(postId).then(
			(p) => {
				post = p;
				interactions.open(p.id);
			},
			(e: unknown) => (error = e instanceof Error ? e.message : 'Something went wrong')
		);
		const list = new Paged<Comment>(async (cursor) => {
			const p = await api.comments(postId, cursor);
			return { items: p.comments, next: p.next_cursor ?? null };
		});
		comments = list;
		void list.refresh();
	});

	async function send(e: SubmitEvent) {
		e.preventDefault();
		const body = draft.trim();
		if (!body || !comments || !post) return;
		sending = true;
		try {
			const added = await api.addComment(post.id, body);
			comments.items = [added, ...comments.items];
			post = { ...post, comment_count: post.comment_count + 1 };
			draft = '';
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't post that");
		} finally {
			sending = false;
		}
	}

	async function remove(comment: Comment) {
		if (!comments || !confirm('Delete this comment?')) return;
		try {
			await api.deleteComment(comment.id);
			comments.items = comments.items.filter((c) => c.id !== comment.id);
			if (post) post = { ...post, comment_count: Math.max(0, post.comment_count - 1) };
		} catch {
			toast.show("Couldn't delete that");
		}
	}
</script>

<svelte:head><title>{post ? `${nameOf(post.author)} on PartyNearMe` : 'Post · PartyNearMe'}</title></svelte:head>

<PageHeader title="Post" back />

{#if error}
	<Empty title="Couldn't open this post">{error}</Empty>
{:else if !post}
	<Spinner />
{:else}
	<PostCard bind:post eager detail ongone={() => history.back()} />

	<section id="comments" aria-label="Comments">
		<form class="compose" onsubmit={send}>
			<label class="visually-hidden" for="comment">Add a comment</label>
			<input id="comment" class="field" placeholder="Add a comment…" maxlength="500" bind:value={draft} autocomplete="off" />
			<button class="send" aria-label="Post comment" disabled={sending || !draft.trim()}><Icon name="send" /></button>
		</form>

		{#if comments}
			<ul>
				{#each comments.items as comment (comment.id)}
					<li>
						<a href="/u/{comment.author.id}"><Avatar person={comment.author} size={32} /></a>
						<div class="bubble">
							<p>
								<a href="/u/{comment.author.id}"><strong>{nameOf(comment.author)}</strong></a>
								<span class="muted small">{timeAgo(comment.created_at)}</span>
							</p>
							<p class="body">{comment.body}</p>
							{#if comment.status === 'hidden'}<p class="muted small">Hidden: only you can see this.</p>{/if}
						</div>
						{#if comment.can_delete}
							<button class="delete muted" onclick={() => remove(comment)}>Delete</button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if comments.loadedOnce && !comments.items.length}
				<p class="muted none">No comments yet. Say something nice.</p>
			{/if}
			<LoadMore list={comments} />
		{/if}
	</section>
{/if}

<style>
	section {
		padding: 0 12px;
	}
	.compose {
		display: flex;
		gap: 8px;
		margin: 8px 0 16px;
	}
	.send {
		flex: none;
		width: 48px;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--gradient);
		color: var(--on-primary);
		display: grid;
		place-items: center;
	}
	.send:disabled {
		opacity: 0.4;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 14px;
	}
	li {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.bubble {
		flex: 1;
		min-width: 0;
	}
	.body {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.small {
		font-size: 12px;
		margin-left: 6px;
	}
	.delete {
		border: 0;
		background: none;
		font-size: 13px;
		padding: 4px;
	}
	.none {
		text-align: center;
		padding: 16px;
	}
</style>
