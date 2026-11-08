<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { analytics } from '#lib/analytics.js';
	import { api } from '#lib/api/client.js';
	import type { Event, Interest } from '#lib/api/types.js';
	import { coverFor, dayLabel } from '#lib/format.js';
	import { currentLocation, lastLocation, type LatLng } from '#lib/location.js';
	import { shrink } from '#lib/photos.js';
	import { prefs } from '#lib/prefs.svelte.js';
	import { toast } from '#lib/toast.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';
	import MapPicker from '#lib/ui/MapPicker.svelte';

	// Hosting a party, new or edited: the same fields and defaults as the apps.
	let { editing = null }: { editing?: Event | null } = $props();
	const DURATIONS = [2, 4, 6, 8, 12];
	/** The form starts from the party as it was; later changes to the prop don't reset what's typed. */
	const initial = untrack(() => editing);

	const pad = (n: number) => String(n).padStart(2, '0');
	const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

	/** Tonight at 21:00, or tomorrow if that's already passed. */
	function defaultStart() {
		const d = new Date();
		d.setHours(21, 0, 0, 0);
		if (d <= new Date()) d.setDate(d.getDate() + 1);
		return d;
	}

	const initialStart = initial ? new Date(initial.starts_at) : defaultStart();
	const hadHours = initial?.ends_at ? (new Date(initial.ends_at).getTime() - initialStart.getTime()) / 3600_000 : null;

	let title = $state(initial?.title ?? '');
	let venue = $state(initial?.venue_name ?? '');
	let description = $state(initial?.description ?? '');
	let tickets = $state(initial?.ticket_url ?? '');
	let isPrivate = $state(initial?.is_private ?? false);
	let interestId = $state<number | null>(initial?.interest_id ?? null);
	let date = $state(localDate(initialStart));
	let time = $state(localTime(initialStart));
	let hours = $state(hadHours ? DURATIONS.reduce((a, b) => (Math.abs(b - hadHours) < Math.abs(a - hadHours) ? b : a)) : 4);
	let spot = $state<LatLng | null>(initial ? { lat: initial.lat, lng: initial.lng } : lastLocation());
	let pickingSpot = $state(false);
	let cover = $state<{ blob: Blob; url: string } | null>(null);
	let interests = $state<Interest[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let coverInput = $state<HTMLInputElement>();

	const start = $derived(new Date(`${date}T${time}`));
	const coverUrl = $derived(cover?.url ?? editing?.cover_url ?? null);

	$effect(() => {
		api.interests().then((list) => (interests = list), () => undefined);
		if (!spot) void currentLocation().then((here) => here && !spot && (spot = here));
		return () => cover && URL.revokeObjectURL(cover.url);
	});

	async function pickCover(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		try {
			const blob = await shrink(file);
			if (cover) URL.revokeObjectURL(cover.url);
			cover = { blob, url: URL.createObjectURL(blob) };
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't read that photo");
		}
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		if (!title.trim()) return (error = 'Give the party a name.');
		if (Number.isNaN(start.getTime())) return (error = 'Pick a date and time.');
		if (!editing && start.getTime() < Date.now() - 3600_000) return (error = 'Pick a time that hasn\'t passed.');
		if (tickets && !tickets.startsWith('https://')) return (error = 'The ticket link starts with https://');
		const where = spot ?? (await currentLocation());
		if (!where) return (error = 'Turn on location or pick the spot on the map, so people can find your party.');
		busy = true;
		const fields = {
			title: title.trim(),
			description: description.trim(),
			starts_at: start.toISOString(),
			ends_at: new Date(start.getTime() + hours * 3600_000).toISOString(),
			venue_name: venue.trim(),
			is_private: isPrivate,
			ticket_url: tickets.trim(),
			lat: where.lat,
			lng: where.lng
		};
		try {
			let saved: Event;
			if (editing) {
				saved = await api.updateEvent(editing.id, { ...fields, interest_id: interestId });
			} else {
				saved = await api.createEvent({
					...fields,
					description: fields.description || undefined,
					venue_name: fields.venue_name || undefined,
					ticket_url: fields.ticket_url || undefined,
					interest_id: interestId ?? undefined,
					publish: true
				});
			}
			if (!editing) analytics.capture('party_created', { has_cover: !!cover, has_kind: interestId != null });
			if (cover) {
				try {
					await api.setCover(saved.id, await api.uploadPhoto(cover.blob));
				} catch {
					toast.show("Saved, but the cover didn't upload. Try again from the party's page.");
				}
			}
			toast.show(editing ? 'Changes saved' : 'Your party is live');
			await goto(`/e/${saved.id}`, { replaceState: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			busy = false;
		}
	}
</script>

<form class="form" onsubmit={submit}>
	<button type="button" class="cover" style:background={coverUrl ? `center / cover url(${coverUrl})` : coverFor(title.trim() || 'New party')} onclick={() => coverInput?.click()}>
		<span class="cover-label"><Icon name="photo" size={18} /> {coverUrl ? 'Change cover' : 'Add a cover photo'}</span>
		<span class="cover-text">
			<span class="overline">{dayLabel(start.toISOString())}</span>
			<strong>{title.trim() || 'Your party'}</strong>
		</span>
	</button>
	<input bind:this={coverInput} type="file" accept="image/*" hidden onchange={(e) => pickCover(e.currentTarget.files)} />

	<label class="block"><span class="overline">What's the party?</span><input class="field" maxlength="120" required bind:value={title} /></label>
	<label class="block"><span class="overline">Venue (optional)</span><input class="field" maxlength="120" bind:value={venue} /></label>

	{#if interests.length}
		<div class="block">
			<span class="overline">What kind of party?</span>
			<div class="chips">
				{#each interests as interest (interest.id)}
					<button type="button" class="chip" aria-pressed={interestId === interest.id} onclick={() => (interestId = interestId === interest.id ? null : interest.id)}>{interest.name}</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="block">
		<span class="overline">When</span>
		<div class="two">
			<label><span class="visually-hidden">Date</span><input class="field" type="date" required bind:value={date} /></label>
			<label><span class="visually-hidden">Starts</span><input class="field" type="time" required bind:value={time} /></label>
		</div>
		<p class="muted">Lasts about {hours} hours</p>
		<div class="durations">
			{#each DURATIONS as h (h)}
				<button type="button" class="chip" aria-pressed={hours === h} onclick={() => (hours = h)}>{h}h</button>
			{/each}
		</div>
	</div>

	<div class="block">
		<span class="overline">Where</span>
		{#if pickingSpot && spot}
			<MapPicker bind:value={spot} night={prefs.night} />
			<button type="button" class="btn" onclick={() => (pickingSpot = false)}>Done</button>
		{:else}
			<button type="button" class="where" onclick={() => (pickingSpot = true)} disabled={!spot}>
				<Icon name="place" />
				<span>
					<strong>{editing ? (editing.venue_name ?? "The party's spot") : spot ? 'Where you are now' : 'Finding where you are…'}</strong>
					<span class="muted">Tap to pick the spot on the map</span>
				</span>
			</button>
		{/if}
	</div>

	<div class="block">
		<span class="overline">Details</span>
		<textarea class="field" rows="4" maxlength="2000" placeholder="Dress code, tickets, what to bring (optional)" bind:value={description}></textarea>
		<input class="field" type="url" maxlength="500" placeholder="Ticket link (optional)" bind:value={tickets} />
	</div>

	<label class="toggle">
		<input type="checkbox" bind:checked={isPrivate} />
		<span>
			<strong>Private party</strong>
			<span class="muted">Not on Parties near you. You approve who comes, and only they see the venue.</span>
		</span>
	</label>

	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<button class="btn primary block" disabled={busy}>{editing ? 'Save changes' : 'Publish party'}</button>
</form>

<style>
	.form {
		display: grid;
		gap: 18px;
		padding: 8px 16px 24px;
	}
	.cover {
		position: relative;
		aspect-ratio: 16 / 9;
		border: 0;
		border-radius: var(--radius-lg);
		overflow: hidden;
		color: #fff;
		text-align: left;
	}
	.cover::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(transparent 40%, rgb(0 0 0 / 0.7));
	}
	.cover-label {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 999px;
		background: rgb(0 0 0 / 0.5);
		font-size: 13px;
		font-weight: 600;
	}
	.cover-text {
		position: absolute;
		left: 16px;
		right: 16px;
		bottom: 14px;
		z-index: 1;
		display: grid;
		font-size: 22px;
	}
	.cover-text .overline {
		color: rgb(255 255 255 / 0.85);
	}
	.block {
		display: grid;
		gap: 8px;
	}
	.chips,
	.durations {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.durations .chip {
		flex: 1;
		justify-content: center;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.where {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border: 1px solid var(--outline-variant);
		border-radius: var(--radius-md);
		background: var(--surface);
		text-align: left;
	}
	.where :global(svg) {
		color: var(--primary);
		flex: none;
	}
	.where span {
		display: grid;
	}
	.toggle {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.toggle input {
		width: 20px;
		height: 20px;
		margin-top: 2px;
		accent-color: var(--primary);
		flex: none;
	}
	.toggle span {
		display: grid;
	}
</style>
