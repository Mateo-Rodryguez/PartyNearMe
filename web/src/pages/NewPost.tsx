import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { Event, ListedPerson } from '#lib/api/types.js';
import { nameOf } from '#lib/format.js';
import { currentLocation } from '#lib/location.js';
import { shrink } from '#lib/photos.js';
import { toast } from '#lib/toast.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Icon } from '#lib/ui/Icon.js';
import { PageHeader } from './PageHeader.js';
import s from './NewPost.module.css';

const MAX_PHOTOS = 10;
/** Parties you can post to: ones that started up to 3 days ago, or haven't started yet. */
const RECENT_PARTY_MS = 3 * 24 * 3600_000;

type Picked = { blob: Blob; url: string };

/** Posting photos: up to ten, a caption, the party, tagged people and the place. */
export default function NewPost() {
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const [photos, setPhotos] = useState<Picked[]>([]);
	const [caption, setCaption] = useState('');
	const [place, setPlace] = useState('');
	const [tagLocation, setTagLocation] = useState(true);
	const [parties, setParties] = useState<Event[]>([]);
	const [partyId, setPartyId] = useState(() => params.get('party') ?? '');
	const [tagged, setTagged] = useState<ListedPerson[]>([]);
	const [tagQuery, setTagQuery] = useState('');
	const [tagResults, setTagResults] = useState<ListedPerson[]>([]);
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	// For freeing the previews when leaving, whatever was picked by then.
	const picked = useRef<Picked[]>([]);
	picked.current = photos;

	useEffect(() => {
		const cutoff = Date.now() - RECENT_PARTY_MS;
		Promise.all([api.myEvents(false), api.myEvents(true)]).then(([going, hosting]) => {
			const seen = new Set<string>();
			setParties(
				[...going, ...hosting]
					.filter((e) => e.status === 'published' && new Date(e.starts_at).getTime() >= cutoff && !seen.has(e.id) && seen.add(e.id))
					.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
			);
		}, () => undefined);
		return () => picked.current.forEach((p) => URL.revokeObjectURL(p.url));
	}, []);

	// People search for tagging, a moment after typing stops.
	useEffect(() => {
		const q = tagQuery.trim();
		if (q.length < 2) {
			setTagResults([]);
			return;
		}
		let stale = false;
		const timer = setTimeout(() => {
			api.searchUsers(q).then(
				(r) => !stale && setTagResults(r.users.filter((u) => !tagged.some((t) => t.id === u.id))),
				() => undefined
			);
		}, 250);
		return () => {
			stale = true;
			clearTimeout(timer);
		};
	}, [tagQuery, tagged]);

	async function add(files: FileList | File[] | null | undefined) {
		const list = [...(files ?? [])]
			.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
			.slice(0, MAX_PHOTOS - picked.current.length);
		for (const file of list) {
			try {
				const blob = await shrink(file);
				setPhotos((p) => [...p, { blob, url: URL.createObjectURL(blob) }]);
			} catch (e) {
				toast.show(e instanceof Error ? e.message : "Couldn't read that photo");
			}
		}
	}

	function removePhoto(i: number) {
		URL.revokeObjectURL(photos[i].url);
		setPhotos(photos.filter((_, j) => j !== i));
	}

	async function share(e: FormEvent) {
		e.preventDefault();
		if (!photos.length) return;
		setError(null);
		setProgress(0);
		try {
			const ids: string[] = [];
			for (const [i, photo] of photos.entries()) {
				ids.push(await api.uploadPhoto(photo.blob));
				setProgress((i + 1) / (photos.length + 1));
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
			analytics.capture('post_created', { photos: ids.length, tagged: tagged.length, at_party: !!partyId });
			toast.show('Posted. It shows to others once we check it.');
			await navigate(`/p/${post.id}`, { replace: true });
		} catch (e) {
			setError(
				e instanceof TypeError
					? "The photo couldn't be sent. Check your connection and try again."
					: e instanceof Error
						? e.message
						: 'Something went wrong'
			);
		} finally {
			setProgress(null);
		}
	}

	return (
		<>
			<title>New post · PartyNearMe</title>
			<PageHeader
				title="New post"
				back
				actions={
					<Link className={s.host} to="/host">
						Host a party instead
					</Link>
				}
			/>
			<form className={s.form} onSubmit={share}>
				<div
					className={dragging ? `${s.drop} ${s.dragging}` : s.drop}
					role="group"
					aria-label="Photos"
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(e) => {
						e.preventDefault();
						setDragging(false);
						void add(e.dataTransfer?.files);
					}}
				>
					{photos.map((photo, i) => (
						<div key={photo.url} className={s.thumb}>
							<img src={photo.url} alt={`Photo ${i + 1}`} />
							<button type="button" className={s.remove} aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(i)}>
								<Icon name="close" size={18} />
							</button>
						</div>
					))}
					{photos.length < MAX_PHOTOS && (
						<button type="button" className={s.pick} onClick={() => input.current?.click()}>
							<Icon name="photo" size={32} />
							<span>{photos.length ? 'Add more' : 'Choose photos'}</span>
						</button>
					)}
					<input
						ref={input}
						type="file"
						accept="image/*"
						multiple
						hidden
						onChange={(e) => {
							void add(e.currentTarget.files);
							e.currentTarget.value = '';
						}}
					/>
				</div>

				<label className={s.group}>
					<span className="overline">Caption</span>
					<textarea
						className="field"
						rows={3}
						maxLength={2200}
						placeholder="Say something about the night…"
						value={caption}
						onChange={(e) => setCaption(e.target.value)}
					/>
				</label>

				{parties.length > 0 && (
					<label className={s.group}>
						<span className="overline">Party</span>
						<select className="field" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
							<option value="">No party</option>
							{parties.map((party) => (
								<option key={party.id} value={party.id}>
									{party.title}
								</option>
							))}
						</select>
					</label>
				)}

				<div className={s.group}>
					<span className="overline">Tag people</span>
					{tagged.length > 0 && (
						<div className={s.tags}>
							{tagged.map((person) => (
								<button
									key={person.id}
									type="button"
									className="chip"
									onClick={() => setTagged(tagged.filter((t) => t.id !== person.id))}
									aria-label={`Untag ${nameOf(person)}`}
								>
									{nameOf(person)} <Icon name="close" size={14} />
								</button>
							))}
						</div>
					)}
					<input
						className="field"
						type="search"
						placeholder="Search people"
						autoComplete="off"
						value={tagQuery}
						onChange={(e) => setTagQuery(e.target.value)}
					/>
					{tagResults.map((person) => (
						<button
							key={person.id}
							type="button"
							className={s.person}
							onClick={() => {
								setTagged([...tagged, person]);
								setTagQuery('');
							}}
						>
							<Avatar person={person} size={32} />
							{nameOf(person)}
						</button>
					))}
				</div>

				<label className={s.group}>
					<span className="overline">Place</span>
					<input className="field" maxLength={120} placeholder="Where was this? (optional)" value={place} onChange={(e) => setPlace(e.target.value)} />
				</label>
				<label className={s.toggle}>
					<input type="checkbox" checked={tagLocation} onChange={(e) => setTagLocation(e.target.checked)} />
					<span>Add my location, so people nearby see it</span>
				</label>

				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}
				{progress !== null && <progress max={1} value={progress} aria-label="Posting" />}
				<button className="btn primary block" disabled={!photos.length || progress !== null}>
					Share
				</button>
			</form>
		</>
	);
}
