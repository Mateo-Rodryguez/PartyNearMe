import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { Event, Interest } from '#lib/api/types.js';
import { coverFor, dayLabel } from '#lib/format.js';
import { currentLocation, lastLocation, type LatLng } from '#lib/location.js';
import { shrink } from '#lib/photos.js';
import { prefs } from '#lib/prefs.js';
import { useStore } from '#lib/store.js';
import { toast } from '#lib/toast.js';
import { Icon } from '#lib/ui/Icon.js';
import { MapPicker } from '#lib/ui/MapPicker.js';
import s from './PartyForm.module.css';

const DURATIONS = [2, 4, 6, 8, 12];
// Without a location the map opens on the whole of Europe, to search from.
const EUROPE = { lat: 48.5, lng: 9 };
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

/**
 * Hosting a party, new or edited: the same fields and defaults as the apps.
 * The form starts from the party as it was; later changes to the prop don't reset what's typed.
 */
export function PartyForm({ editing = null }: { editing?: Event | null }) {
	useStore(prefs);
	const navigate = useNavigate();
	const [initial] = useState(() => {
		const start = editing ? new Date(editing.starts_at) : defaultStart();
		const had = editing?.ends_at ? (new Date(editing.ends_at).getTime() - start.getTime()) / 3600_000 : null;
		return { start, hours: had ? DURATIONS.reduce((a, b) => (Math.abs(b - had) < Math.abs(a - had) ? b : a)) : 4 };
	});
	const [title, setTitle] = useState(editing?.title ?? '');
	const [venue, setVenue] = useState(editing?.venue_name ?? '');
	const [description, setDescription] = useState(editing?.description ?? '');
	const [tickets, setTickets] = useState(editing?.ticket_url ?? '');
	const [isPrivate, setIsPrivate] = useState(editing?.is_private ?? false);
	const [interestId, setInterestId] = useState<number | null>(editing?.interest_id ?? null);
	const [date, setDate] = useState(localDate(initial.start));
	const [time, setTime] = useState(localTime(initial.start));
	const [hours, setHours] = useState(initial.hours);
	const [spot, setSpot] = useState<LatLng | null>(() => (editing ? { lat: editing.lat, lng: editing.lng } : lastLocation()));
	// The place picked from search, to name the spot; moving the map by hand keeps it.
	const [spotName, setSpotName] = useState<string | null>(null);
	const [spotZoom, setSpotZoom] = useState(15);
	const [pickingSpot, setPickingSpot] = useState(false);
	const [cover, setCover] = useState<{ blob: Blob; url: string } | null>(null);
	const [interests, setInterests] = useState<Interest[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const coverInput = useRef<HTMLInputElement>(null);

	const start = new Date(`${date}T${time}`);
	const coverUrl = cover?.url ?? editing?.cover_url ?? null;
	const spotUnpicked = spot?.lat === EUROPE.lat && spot?.lng === EUROPE.lng;

	useEffect(() => {
		api.interests().then(setInterests, () => undefined);
		if (!spot) void currentLocation().then((here) => here && setSpot((s) => s ?? here));
		// Only on first show.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	useEffect(() => () => void (cover && URL.revokeObjectURL(cover.url)), [cover]);

	function pickSpot() {
		if (!spot) {
			setSpot({ ...EUROPE });
			setSpotZoom(4);
		}
		setPickingSpot(true);
	}

	async function pickCover(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		try {
			const blob = await shrink(file);
			setCover({ blob, url: URL.createObjectURL(blob) });
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't read that photo");
		}
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		setError(null);
		if (!title.trim()) return setError('Give the party a name.');
		if (Number.isNaN(start.getTime())) return setError('Pick a date and time.');
		if (!editing && start.getTime() < Date.now() - 3600_000) return setError("Pick a time that hasn't passed.");
		if (tickets && !tickets.startsWith('https://')) return setError('The ticket link starts with https://');
		if (spotUnpicked) return setError('Search for the place or move the map to put the pin on the party.');
		const where = spot ?? (await currentLocation());
		if (!where) return setError('Turn on location or pick the spot on the map, so people can find your party.');
		setBusy(true);
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
			const saved = editing
				? await api.updateEvent(editing.id, { ...fields, interest_id: interestId })
				: await api.createEvent({
						...fields,
						description: fields.description || undefined,
						venue_name: fields.venue_name || undefined,
						ticket_url: fields.ticket_url || undefined,
						interest_id: interestId ?? undefined,
						publish: true
					});
			if (!editing) analytics.capture('party_created', { has_cover: !!cover, has_kind: interestId != null });
			if (cover) {
				try {
					await api.setCover(saved.id, await api.uploadPhoto(cover.blob));
				} catch {
					toast.show("Saved, but the cover didn't upload. Try again from the party's page.");
				}
			}
			toast.show(editing ? 'Changes saved' : 'Your party is live');
			await navigate(`/e/${saved.id}`, { replace: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Something went wrong');
		} finally {
			setBusy(false);
		}
	}

	const whereLabel =
		spotName ??
		(spotUnpicked
			? 'Pick the spot on the map'
			: editing
				? (editing.venue_name ?? "The party's spot")
				: spot
					? 'Where you are now'
					: 'Finding where you are…');

	return (
		<form className={s.form} onSubmit={submit}>
			<button
				type="button"
				className={s.cover}
				style={{ background: coverUrl ? `center / cover url(${coverUrl})` : coverFor(title.trim() || 'New party') }}
				onClick={() => coverInput.current?.click()}
			>
				<span className={s['cover-label']}>
					<Icon name="photo" size={18} /> {coverUrl ? 'Change cover' : 'Add a cover photo'}
				</span>
				<span className={s['cover-text']}>
					<span className="overline">{Number.isNaN(start.getTime()) ? '' : dayLabel(start.toISOString())}</span>
					<strong>{title.trim() || 'Your party'}</strong>
				</span>
			</button>
			<input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => pickCover(e.currentTarget.files)} />

			<label className={s.group}>
				<span className="overline">What's the party?</span>
				<input className="field" maxLength={120} required value={title} onChange={(e) => setTitle(e.target.value)} />
			</label>
			<label className={s.group}>
				<span className="overline">Venue (optional)</span>
				<input className="field" maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} />
			</label>

			{interests.length > 0 && (
				<div className={s.group}>
					<span className="overline">What kind of party?</span>
					<div className={s.chips}>
						{interests.map((interest) => (
							<button
								key={interest.id}
								type="button"
								className="chip"
								aria-pressed={interestId === interest.id}
								onClick={() => setInterestId(interestId === interest.id ? null : interest.id)}
							>
								{interest.name}
							</button>
						))}
					</div>
				</div>
			)}

			<div className={s.group}>
				<span className="overline">When</span>
				<div className={s.two}>
					<label>
						<span className="visually-hidden">Date</span>
						<input className="field" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
					</label>
					<label>
						<span className="visually-hidden">Starts</span>
						<input className="field" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
					</label>
				</div>
				<p className="muted">Lasts about {hours} hours</p>
				<div className={s.durations}>
					{DURATIONS.map((h) => (
						<button key={h} type="button" className="chip" aria-pressed={hours === h} onClick={() => setHours(h)}>
							{h}h
						</button>
					))}
				</div>
			</div>

			<div className={s.group}>
				<span className="overline">Where</span>
				{pickingSpot && spot ? (
					<>
						<MapPicker
							value={spot}
							onChange={setSpot}
							night={prefs.night}
							zoom={spotZoom}
							onPlace={(place) => {
								setSpotName(place.name);
								if (!venue.trim()) setVenue(place.name);
							}}
						/>
						<button type="button" className="btn" onClick={() => setPickingSpot(false)}>
							Done
						</button>
					</>
				) : (
					<button type="button" className={s.where} onClick={pickSpot}>
						<Icon name="place" />
						<span>
							<strong>{whereLabel}</strong>
							<span className="muted">Tap to search or pick the spot on the map</span>
						</span>
					</button>
				)}
			</div>

			<div className={s.group}>
				<span className="overline">Details</span>
				<textarea
					className="field"
					rows={4}
					maxLength={2000}
					placeholder="Dress code, tickets, what to bring (optional)"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
				<input
					className="field"
					type="url"
					maxLength={500}
					placeholder="Ticket link (optional)"
					value={tickets}
					onChange={(e) => setTickets(e.target.value)}
				/>
			</div>

			<label className={s.toggle}>
				<input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
				<span>
					<strong>Private party</strong>
					<span className="muted">Not on Parties near you. You approve who comes, and only they see the venue.</span>
				</span>
			</label>

			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			<button className="btn primary block" disabled={busy}>
				{editing ? 'Save changes' : 'Publish party'}
			</button>
		</form>
	);
}
