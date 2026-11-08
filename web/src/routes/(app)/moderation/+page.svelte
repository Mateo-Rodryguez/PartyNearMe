<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { ModerationAction, ReportedItem } from '#lib/api/types.js';
	import { timeAgo } from '#lib/format.js';
	import { toast } from '#lib/toast.svelte.js';
	import Empty from '#lib/ui/Empty.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../PageHeader.svelte';

	// Open reports for moderators, oldest first, as in the apps; each decision
	// closes the thing's reports. The server checks who's a moderator.
	type Choice = { action: ModerationAction; label: string };
	const actionsFor = (type: string): Choice[] => [
		...(
			{
				post: [{ action: 'remove', label: 'Remove post' }, { action: 'restore', label: 'Put back' }],
				event: [{ action: 'remove', label: 'Remove party' }, { action: 'restore', label: 'Put back' }],
				user: [{ action: 'remove_picture', label: 'Remove picture' }, { action: 'delete_account', label: 'Delete account' }],
				message: [{ action: 'remove', label: 'Delete message' }],
				comment: [{ action: 'remove', label: 'Remove comment' }, { action: 'restore', label: 'Put back' }]
			} as Record<string, Choice[]>
		)[type] ?? [],
		{ action: 'dismiss', label: 'Nothing wrong' }
	];
	const kindName: Record<string, string> = { post: 'Post', event: 'Party', user: 'Person', message: 'Message', comment: 'Comment' };

	let items = $state<ReportedItem[] | null>(null);
	let error = $state<string | null>(null);
	let confirming = $state<{ item: ReportedItem; choice: Choice } | null>(null);
	let open = $state(false);
	let note = $state('');
	let busy = $state(false);

	function load() {
		error = null;
		api.moderationQueue().then(
			(list) => (items = list),
			(e: unknown) => (error = e instanceof Error ? e.message : 'Something went wrong')
		);
	}
	$effect(load);

	function ask(item: ReportedItem, choice: Choice) {
		confirming = { item, choice };
		note = '';
		open = true;
	}

	async function act(e: SubmitEvent) {
		e.preventDefault();
		if (!confirming) return;
		const { item, choice } = confirming;
		busy = true;
		try {
			await api.moderate(item.target_type, item.target_id, choice.action, note.trim());
			items = items?.filter((i) => !(i.target_type === item.target_type && i.target_id === item.target_id)) ?? null;
			open = false;
		} catch (err) {
			toast.show(err instanceof Error ? err.message : "Couldn't do that");
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Reports to review · PartyNearMe</title></svelte:head>

<PageHeader title="Reports to review" back />

{#if error && !items}
	<Empty title="Couldn't load reports">{error}<p><button class="btn" onclick={load}>Try again</button></p></Empty>
{:else if !items}
	<Spinner />
{:else if !items.length}
	<Empty title="Nothing to review">New reports show up here.</Empty>
{:else}
	<div class="list">
		{#each items as item (`${item.target_type}/${item.target_id}`)}
			<article class="card">
				<p class="overline">
					{kindName[item.target_type] ?? item.target_type} · {item.report_count} report{item.report_count === 1 ? '' : 's'} · {timeAgo(item.first_reported_at)}
				</p>
				{#if item.preview}
					<strong>{item.preview.title}</strong>
					{#if item.preview.status}<p class="small">Status: {item.preview.status}</p>{/if}
					{#if item.preview.image_url}<img src={item.preview.image_url} alt="" loading="lazy" />{/if}
					{#if item.preview.body?.trim()}<p>{item.preview.body}</p>{/if}
				{:else}
					<p>This was deleted after it was reported.</p>
				{/if}
				<p class="small muted">Reasons: {[...new Set(item.reasons)].join(' · ')}</p>
				<div class="actions">
					{#if item.preview?.user_id}<a class="btn" href="/u/{item.preview.user_id}">View person</a>{/if}
					{#each item.preview ? actionsFor(item.target_type) : actionsFor(item.target_type).slice(-1) as choice (choice.label)}
						<button class="btn outline" class:danger={choice.action === 'delete_account'} onclick={() => ask(item, choice)}>{choice.label}</button>
					{/each}
				</div>
			</article>
		{/each}
	</div>
{/if}

<Sheet bind:open title={confirming ? `${confirming.choice.label}?` : ''}>
	<form class="confirm" onsubmit={act}>
		{#if confirming?.choice.action === 'delete_account'}
			<p>This deletes the account and everything they posted. It can't be undone.</p>
		{/if}
		<label>
			<span class="overline">Note for the log (optional)</span>
			<input class="field" maxlength="500" bind:value={note} />
		</label>
		<button class="btn block primary" class:danger={confirming?.choice.action === 'delete_account'} disabled={busy}>{confirming?.choice.label}</button>
		<button type="button" class="btn block outline" onclick={() => (open = false)}>Cancel</button>
	</form>
</Sheet>

<style>
	.list {
		display: grid;
		gap: 12px;
		padding: 0 12px 24px;
	}
	.card {
		display: grid;
		gap: 8px;
		padding: 12px;
		border-radius: var(--radius-md);
		background: var(--surface);
	}
	.card p {
		margin: 0;
	}
	.small {
		font-size: 13px;
	}
	img {
		width: 100%;
		height: 220px;
		object-fit: cover;
		border-radius: var(--radius-sm);
		background: var(--surface-high);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.confirm {
		display: grid;
		gap: 12px;
	}
	.confirm p {
		margin: 0;
	}
	label {
		display: grid;
		gap: 6px;
	}
</style>
