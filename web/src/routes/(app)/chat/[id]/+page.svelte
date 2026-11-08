<script lang="ts">
	import { page } from '$app/state';
	import { api } from '#lib/api/client.js';
	import type { Conversation, Message } from '#lib/api/types.js';
	import { clockTime, nameOf } from '#lib/format.js';
	import { listen } from '#lib/realtime.js';
	import { session } from '#lib/session.svelte.js';
	import { toast } from '#lib/toast.svelte.js';
	import { unread } from '#lib/unread.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';
	import ReportSheet from '#lib/ui/ReportSheet.svelte';
	import PageHeader from '../../PageHeader.svelte';

	const id = $derived(page.params.id ?? '');
	let conversation = $state<Conversation | null>(null);
	/** Oldest first, for reading top to bottom. */
	let messages = $state<Message[]>([]);
	let hasMore = $state(false);
	let error = $state<string | null>(null);
	let draft = $state('');
	let sending = $state(false);
	let reportOpen = $state(false);
	let reportId = $state('');
	let list = $state<HTMLElement>();
	let loadingOlder = $state(false);

	const byId = (a: Message, b: Message) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

	function merge(fresh: Message[]) {
		const hidden = new Set(conversation?.hidden_sender_ids ?? []);
		const known = new Set(messages.map((m) => m.id));
		const added = fresh.filter((m) => !known.has(m.id) && !hidden.has(m.sender_id));
		if (!added.length) return false;
		const atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
		messages = [...messages, ...added].sort(byId);
		if (atBottom) requestAnimationFrame(() => list?.scrollTo({ top: list.scrollHeight }));
		return true;
	}

	$effect(() => {
		const conversationId = id;
		messages = [];
		error = null;
		api.conversation(conversationId).then((c) => (conversation = c), () => undefined);
		let first = true;
		// New messages arrive live; a slow check also catches anything missed while offline.
		const poll = async () => {
			try {
				const page = await api.messages(conversationId);
				const changed = merge(page.messages);
				if (first) hasMore = page.has_more;
				if (first || changed) {
					await api.markRead(conversationId).catch(() => undefined);
					void unread.check();
				}
				first = false;
			} catch (e) {
				if (first) error = e instanceof Error ? e.message : 'Something went wrong';
			}
		};
		void poll();
		const timer = setInterval(poll, 30_000);
		const stop = listen(conversationId, (m) => {
			merge([m]);
			if (m.sender_id !== session.userId) void api.markRead(conversationId).catch(() => undefined);
		});
		return () => {
			clearInterval(timer);
			stop();
		};
	});

	async function older() {
		if (!hasMore || loadingOlder || !messages.length || !list) return;
		loadingOlder = true;
		const height = list.scrollHeight;
		try {
			const page = await api.messages(id, messages[0].id);
			const known = new Set(messages.map((m) => m.id));
			messages = [...page.messages.filter((m) => !known.has(m.id)), ...messages].sort(byId);
			hasMore = page.has_more;
			// Keep the same messages in view.
			requestAnimationFrame(() => list && (list.scrollTop += list.scrollHeight - height));
		} finally {
			loadingOlder = false;
		}
	}

	async function send(e: SubmitEvent) {
		e.preventDefault();
		const body = draft.trim();
		if (!body) return;
		sending = true;
		try {
			const sent = await api.send(id, body);
			draft = '';
			merge([sent]);
			requestAnimationFrame(() => list?.scrollTo({ top: list.scrollHeight }));
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't send that");
		} finally {
			sending = false;
		}
	}

	const title = $derived(conversation?.party?.title ?? (conversation?.other ? nameOf(conversation.other) : 'Chat'));
	const titleHref = $derived(conversation?.party ? `/e/${conversation.party.id}` : conversation?.other ? `/u/${conversation.other.id}` : null);
	const senderName = (senderId: string) => nameOf(conversation?.members?.find((m) => m.id === senderId) ?? {});
</script>

<svelte:head><title>{title} · PartyNearMe</title></svelte:head>

<div class="chat">
	<PageHeader title={title} back>
		{#snippet actions()}
			{#if titleHref}<a class="open" href={titleHref}>{conversation?.party ? 'Party' : 'Profile'}</a>{/if}
		{/snippet}
	</PageHeader>

	<div class="messages" bind:this={list} onscroll={() => list && list.scrollTop < 120 && older()} role="log" aria-live="polite">
		{#if error && !messages.length}
			<p class="error center">{error}</p>
		{/if}
		{#each messages as m, i (m.id)}
			{@const mine = m.sender_id === session.userId}
			{@const runStart = messages[i - 1]?.sender_id !== m.sender_id}
			{#if conversation?.party && !mine && runStart}<p class="sender">{senderName(m.sender_id)}</p>{/if}
			<div class="row" class:mine>
				{#if m.event_id}
					<a class="bubble invite" href="/e/{m.event_id}">
						<span class="overline">Party invite</span>
						<span>{m.body}</span>
						<span class="hint">Tap to see the party</span>
					</a>
				{:else}
					<p class="bubble" title={clockTime(m.created_at)}>{m.body}</p>
				{/if}
				{#if !mine}
					<button class="report" aria-label="Report message" title="Report message" onclick={() => {
						reportId = m.id;
						reportOpen = true;
					}}><Icon name="more" size={16} /></button>
				{/if}
			</div>
		{/each}
	</div>

	<form class="compose" onsubmit={send}>
		<label class="visually-hidden" for="message">Message</label>
		<textarea
			id="message"
			class="field"
			rows="1"
			maxlength="4000"
			placeholder="Message…"
			bind:value={draft}
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					e.currentTarget.form?.requestSubmit();
				}
			}}
		></textarea>
		<button class="send" aria-label="Send" disabled={sending || !draft.trim()}><Icon name="send" size={20} /></button>
	</form>
</div>

<ReportSheet bind:open={reportOpen} target="message" targetId={reportId} />

<style>
	.chat {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - 80px - env(safe-area-inset-bottom));
	}
	@media (min-width: 900px) {
		.chat {
			height: calc(100dvh - 72px);
		}
	}
	.open {
		color: var(--primary);
		font-weight: 600;
		padding: 8px;
	}
	.messages {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px;
	}
	.messages > :first-child {
		margin-top: auto;
	}
	.center {
		text-align: center;
	}
	.sender {
		margin: 8px 0 2px 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--on-surface-variant);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.row.mine {
		justify-content: flex-end;
	}
	.bubble {
		max-width: 78%;
		padding: 9px 14px;
		border-radius: 20px;
		background: var(--surface-high);
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.mine .bubble {
		background: var(--gradient);
		color: var(--on-primary);
	}
	.invite {
		display: grid;
		gap: 2px;
	}
	.invite .overline,
	.invite .hint {
		color: inherit;
		opacity: 0.75;
		font-size: 11px;
	}
	.report {
		opacity: 0;
		border: 0;
		background: none;
		color: var(--on-surface-variant);
		padding: 4px;
	}
	.row:hover .report,
	.report:focus-visible {
		opacity: 1;
	}
	@media (hover: none) {
		.report {
			opacity: 0.6;
		}
	}
	.compose {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		padding: 8px 12px;
		border-top: 1px solid var(--outline-variant);
	}
	.compose textarea {
		min-height: 44px;
		max-height: 140px;
		border-radius: 22px;
		resize: none;
		field-sizing: content;
	}
	.send {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: var(--gradient);
		color: var(--on-primary);
	}
	.send:disabled {
		background: var(--surface-high);
		color: var(--on-surface-variant);
	}
</style>
