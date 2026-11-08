<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api/client.js';
	import type { Event, ListedPerson } from '#lib/api/types.js';
	import { nameOf } from '#lib/format.js';
	import { currentLocation } from '#lib/location.js';
	import { shrink } from '#lib/photos.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import PageHeader from '../PageHeader.svelte';

	const MAX_PHOTOS = 10;
	/** Parties you can post to: ones that started up to 3 days ago, or haven't started yet. */
	const RECENT_PARTY_MS = 3 * 24 * 3600_000;

	let photos = $state<{ blob: Blob; url: string }[]>([]);
	let caption = $state('');
	let place = $state('');
	let tagLocation = $state(true);
	let parties = $state<Event[]>([]);
	let partyId = $state<string>(page.url.searchParams.get('party') ?? '');
	let tagged = $state<ListedPerson[]>([]);
	let tagQuery = $state('');
	let tagResults = $state<ListedPerson[]>([]);
	let progress = $state<number | null>(null);
	let error = $state<string | null>(null);
	let input = $state<HTMLInputElement>();
	let dragging = $state(false);

	$effect(() => {
		const cutoff = Date.now() - RECENT_PARTY_MS;
		Promise.all([api.myEvents(false), api.myEvents(true)]).then(([going, hosting]) => {
			const seen = new Set<string>();
			parties = [...going, ...hosting]
				.filter((e) => e.status === 'published' && new Date(e.starts_at).getTime() >= cutoff && !seen.has(e.id) && seen.add(e.id))
				.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
		}, () => undefined);
		return () => photos.forEach((p) => URL.revokeObjectURL(p.url));
	});

	// People search for tagging, a moment after typing stops.
	$effect(() => {
		const q = tagQuery.trim();
		if (q.length < 2) {
			tagResults = [];
			return;
		}
		let stale = false;
		const timer = setTimeout(() => {
			api.searchUsers(q).then((r) => !stale && (tagResults = r.users.filter((u) => !tagged.some((t) => t.id === u.id))), () => undefined);
		}, 250);
		return () => {
			stale = true;
			clearTimeout(timer);
		};
	});

	async function add(files: FileList | File[] | null | undefined) {
		const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)).slice(0, MAX_PHOTOS - photos.length);
		for (const file of list) {
			try {
				const blob = await shrink(file);
				photos = [...photos, { blob, url: URL.createObjectURL(blob) }];
			} catch (e) {
				toast.show(e instanceof Error ? e.message : "Couldn't read that photo");
			}
		}
	}

	function removePhoto(i: number) {
		URL.revokeObjectURL(photos[i].url);
		photos = photos.filter((_, j) => j !== i);
	}

	async function share(e: SubmitEvent) {
		e.preventDefault();
		if (!photos.length) return;
		error = null;
		progress = 0;
		try {
			const ids: string[] = [];
			for (const [i, photo] of photos.entries()) {
				ids.push(await api.uploadPhoto(photo.blob));
				progress = (i + 1) / (photos.length + 1);
			}
			const here = tagLocation ? await currentLocation() : null;
			const post = await api.createPost({
				upload_ids: ids,
				caption: caption.trim() || undefined,
				event_id: partyId || undefined,
				lat: here?.lat,
				lng: here?.lng,
				place_name: place.trim() || undefined,
				tag_ids: tagged.length ? tagged.map((t) => t.id) : undefined
			});
			toast.show('Posted. It shows to others once we check it.');
			await goto(`/p/${post.id}`, { replaceState: true });
		} catch (e) {
			error =
				e instanceof TypeError
					? "The photo couldn't be sent. Check your connection and try again."
					: e instanceof Error
						? e.message
						: 'Something went wrong';
		} finally {
			progress = null;
		}
	}
</script>

<svelte:head><title>New post · PartyNearMe</title></svelte:head>

<PageHeader title="New post" back />

<form class="form" onsubmit={share}>
	<div
		class="drop"
		class:dragging
		role="group"
		aria-label="Photos"
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={(e) => {
			e.preventDefault();
			dragging = false;
			void add(e.dataTransfer?.files);
		}}
	>
		{#each photos as photo, i (photo.url)}
			<div class="thumb">
				<img src={photo.url} alt="Photo {i + 1}" />
				<button type="button" class="remove" aria-label="Remove photo {i + 1}" onclick={() => removePhoto(i)}><Icon name="close" size={18} /></button>
			</div>
		{/each}
		{#if photos.length < MAX_PHOTOS}
			<button type="button" class="pick" onclick={() => input?.click()}>
				<Icon name="photo" size={32} />
				<span>{photos.length ? 'Add more' : 'Choose photos'}</span>
			</button>
		{/if}
		<input bind:this={input} type="file" accept="image/*" multiple hidden onchange={(e) => add(e.currentTarget.files)} />
	</div>

	<label class="block">
		<span class="overline">Caption</span>
		<textarea class="field" rows="3" maxlength="2200" placeholder="Say something about the night…" bind:value={caption}></textarea>
	</label>

	{#if parties.length}
		<label class="block">
			<span class="overline">Party</span>
			<select class="field" bind:value={partyId}>
				<option value="">No party</option>
				{#each parties as party (party.id)}<option value={party.id}>{party.title}</option>{/each}
			</select>
		</label>
	{/if}

	<div class="block">
		<span class="overline">Tag people</span>
		{#if tagged.length}
			<div class="tags">
				{#each tagged as person (person.id)}
					<button type="button" class="chip" onclick={() => (tagged = tagged.filter((t) => t.id !== person.id))} aria-label="Untag {nameOf(person)}">
						{nameOf(person)} <Icon name="close" size={14} />
					</button>
				{/each}
			</div>
		{/if}
		<input class="field" type="search" placeholder="Search people" autocomplete="off" bind:value={tagQuery} />
		{#each tagResults as person (person.id)}
			<button
				type="button"
				class="person"
				onclick={() => {
					tagged = [...tagged, person];
					tagQuery = '';
				}}
			>
				<Avatar {person} size={32} />
				{nameOf(person)}
			</button>
		{/each}
	</div>

	<label class="block">
		<span class="overline">Place</span>
		<input class="field" maxlength="120" placeholder="Where was this? (optional)" bind:value={place} />
	</label>
	<label class="toggle">
		<input type="checkbox" bind:checked={tagLocation} />
		<span>Add my location, so people nearby see it</span>
	</label>

	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if progress !== null}
		<progress max="1" value={progress} aria-label="Posting"></progress>
	{/if}
	<button class="btn primary block" disabled={!photos.length || progress !== null}>Share</button>
</form>

<style>
	.form {
		display: grid;
		gap: 18px;
		padding: 8px 16px 24px;
	}
	.drop {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 8px;
		padding: 8px;
		border: 2px dashed var(--outline-variant);
		border-radius: var(--radius-md);
	}
	.drop.dragging {
		border-color: var(--primary);
	}
	.thumb {
		position: relative;
		aspect-ratio: 1;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-sm);
	}
	.remove {
		position: absolute;
		top: 4px;
		right: 4px;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 50%;
		background: rgb(0 0 0 / 0.6);
		color: #fff;
	}
	.pick {
		display: grid;
		place-items: center;
		align-content: center;
		gap: 4px;
		aspect-ratio: 1;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--on-surface-variant);
		font-weight: 600;
		font-size: 13px;
	}
	.block {
		display: grid;
		gap: 8px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tags .chip {
		gap: 4px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 4px;
		border: 0;
		background: none;
		text-align: left;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.toggle input {
		width: 20px;
		height: 20px;
		accent-color: var(--primary);
	}
	progress {
		width: 100%;
		accent-color: var(--primary);
	}
</style>
