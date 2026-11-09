<script lang="ts">
	import { goto } from '$app/navigation';
	import { analytics, isSharingUsage, setShareUsage } from '#lib/analytics.js';
	import { api } from '#lib/api/client.js';
	import type { AccountSettings, Interest, ListedPerson, OwnProfile } from '#lib/api/types.js';
	import { config } from '#lib/config.js';
	import { nameOf } from '#lib/format.js';
	import { me as own } from '#lib/me.svelte.js';
	import { shrink } from '#lib/photos.js';
	import { prefs, type Theme } from '#lib/prefs.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../PageHeader.svelte';

	let me = $state<OwnProfile | null>(null);
	let settings = $state<AccountSettings | null>(null);
	let interests = $state<Interest[]>([]);
	let blocked = $state<ListedPerson[]>([]);
	let displayName = $state('');
	let username = $state('');
	let bio = $state('');
	let saving = $state(false);
	let avatarInput = $state<HTMLInputElement>();
	let deleting = $state(false);
	let sharing = $state(isSharingUsage());
	let leavingReason = $state('');
	let confirmText = $state('');
	let deleteBusy = $state(false);

	const hearts = [
		{ id: null, label: 'Not shown' },
		{ id: 'single', label: '💖 Single' },
		{ id: 'talking', label: '💬 Talking to someone' },
		{ id: 'taken', label: '❤️ Taken' }
	] as const;
	const themes: { id: Theme; label: string }[] = [
		{ id: 'system', label: 'Same as device' },
		{ id: 'night', label: 'Night' },
		{ id: 'day', label: 'Day' }
	];

	$effect(() => {
		api.me().then((p) => {
			me = p;
			displayName = p.display_name ?? '';
			username = p.username ?? '';
			bio = p.bio ?? '';
		}, () => undefined);
		api.settings().then((s) => (settings = s), () => undefined);
		api.interests().then((list) => (interests = list), () => undefined);
		api.blockedUsers().then((list) => (blocked = list), () => undefined);
	});

	async function saveProfile(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		try {
			me = await api.updateMe({ display_name: displayName.trim(), username: username.trim().replace(/^@/, ''), bio: bio.trim() });
			own.set(me);
			toast.show('Saved');
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		} finally {
			saving = false;
		}
	}

	async function setHeart(status: string | null) {
		try {
			me = await api.updateMe({ relationship_status: status });
		} catch {
			toast.show("Couldn't save that");
		}
	}

	async function toggleInterest(id: number) {
		if (!me) return;
		const ids = me.interest_ids.includes(id) ? me.interest_ids.filter((i) => i !== id) : [...me.interest_ids, id];
		try {
			me = await api.setInterests(ids);
		} catch {
			toast.show("Couldn't save that");
		}
	}

	async function changeAvatar(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		try {
			await api.setAvatar(await api.uploadPhoto(await shrink(file)));
			toast.show('New picture shows once we check it');
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't upload that");
		}
	}

	async function setMessagesFrom(value: AccountSettings['messages_from']) {
		try {
			settings = await api.updateSettings({ messages_from: value });
		} catch {
			toast.show("Couldn't save that");
		}
	}

	async function unblock(person: ListedPerson) {
		try {
			await api.block(person.id, false);
			blocked = blocked.filter((b) => b.id !== person.id);
		} catch {
			toast.show("Couldn't unblock");
		}
	}

	async function signOut() {
		analytics.capture('signed_out');
		analytics.flush();
		await session.signOut();
		await goto('/', { replaceState: true });
	}

	async function deleteAccount(e: SubmitEvent) {
		e.preventDefault();
		deleteBusy = true;
		try {
			// Why people leave is the strongest signal there is; it's optional and never blocks deleting.
			if (leavingReason.trim()) await api.sendFeedback('leaving', { body: leavingReason, screen: 'settings' }).catch(() => undefined);
			await api.deleteAccount();
			analytics.flush(); // Sends account_deleted, the strongest "didn't like it" there is.
			session.set(null);
			await goto('/', { replaceState: true });
		} catch (err) {
			toast.show(err instanceof Error ? err.message : "Couldn't delete the account");
		} finally {
			deleteBusy = false;
		}
	}
</script>

<svelte:head><title>Settings · PartyNearMe</title></svelte:head>

<PageHeader title="Settings" back />

{#if !me}
	<Spinner />
{:else}
	<div class="page">
		<section>
			<h2>Profile</h2>
			<div class="avatar-row">
				<Avatar person={me} size={64} />
				<button class="btn" onclick={() => avatarInput?.click()}>Change picture</button>
				{#if me.avatar_url}
					<button class="btn outline" onclick={() => api.removeAvatar().then(() => me && (me = { ...me, avatar_url: null }))}>Remove</button>
				{/if}
				<input bind:this={avatarInput} type="file" accept="image/*" hidden onchange={(e) => changeAvatar(e.currentTarget.files)} />
			</div>
			<form onsubmit={saveProfile}>
				<label><span class="overline">Name</span><input class="field" maxlength="50" bind:value={displayName} /></label>
				<label><span class="overline">Username</span><input class="field" maxlength="30" autocapitalize="off" bind:value={username} /></label>
				<label><span class="overline">Bio</span><textarea class="field" maxlength="300" rows="3" bind:value={bio}></textarea></label>
				<button class="btn primary" disabled={saving}>Save profile</button>
			</form>
		</section>

		<section>
			<h2>Heart on your profile</h2>
			<div class="chips" role="radiogroup" aria-label="Relationship status">
				{#each hearts as h (h.label)}
					<button class="chip" role="radio" aria-checked={me.relationship_status === h.id || (!me.relationship_status && h.id === null)} onclick={() => setHeart(h.id)}>{h.label}</button>
				{/each}
			</div>
		</section>

		{#if interests.length}
			<section>
				<h2>What you're into</h2>
				<p class="muted">Helps us show you parties you'll like.</p>
				<div class="chips">
					{#each interests as interest (interest.id)}
						<button class="chip" aria-pressed={me.interest_ids.includes(interest.id)} onclick={() => toggleInterest(interest.id)}>{interest.name}</button>
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<h2>Look</h2>
			<div class="chips" role="radiogroup" aria-label="Theme">
				{#each themes as t (t.id)}
					<button class="chip" role="radio" aria-checked={prefs.theme === t.id} onclick={() => prefs.setTheme(t.id)}>{t.label}</button>
				{/each}
			</div>
			<h3 class="overline">Distances in</h3>
			<div class="chips" role="radiogroup" aria-label="Distances in">
				<button class="chip" role="radio" aria-checked={!prefs.display.miles} onclick={() => prefs.setDisplay({ miles: false })}>Kilometres</button>
				<button class="chip" role="radio" aria-checked={prefs.display.miles} onclick={() => prefs.setDisplay({ miles: true })}>Miles</button>
			</div>
			<label class="toggle">
				<span>
					<strong>Hide like counts</strong>
					<span class="muted">On other people's posts</span>
				</span>
				<input type="checkbox" role="switch" checked={prefs.display.hideLikeCounts} onchange={(e) => prefs.setDisplay({ hideLikeCounts: e.currentTarget.checked })} />
			</label>
		</section>

		{#if settings}
			<section>
				<h2>Who can message you</h2>
				<div class="chips" role="radiogroup" aria-label="Who can message you">
					<button class="chip" role="radio" aria-checked={settings.messages_from === 'everyone'} onclick={() => setMessagesFrom('everyone')}>Everyone</button>
					<button class="chip" role="radio" aria-checked={settings.messages_from === 'following'} onclick={() => setMessagesFrom('following')}>People I follow</button>
				</div>
			</section>
		{/if}

		{#if config.posthogKey}
			<section>
				<h2>Privacy</h2>
				<label class="toggle">
					<span>
						<strong>Share usage stats</strong>
						<span class="muted">Which pages and features get used, never what you post or say</span>
					</span>
					<input type="checkbox" role="switch" checked={sharing} onchange={(e) => setShareUsage((sharing = e.currentTarget.checked))} />
				</label>
			</section>
		{/if}

		<section>
			<h2>Your stuff</h2>
			<a class="row" href="/saved">Saved posts and parties</a>
			{#if blocked.length}
				<h3 class="overline">Blocked</h3>
				{#each blocked as person (person.id)}
					<div class="row person">
						<Avatar {person} size={32} />
						<span>{nameOf(person)}</span>
						<button class="btn outline" onclick={() => unblock(person)}>Unblock</button>
					</div>
				{/each}
			{/if}
		</section>

		{#if me.is_moderator}
			<section>
				<h2>Moderation</h2>
				<a class="row" href="/moderation">Reports to review</a>
			</section>
		{/if}

		<section>
			<h2>Help us improve</h2>
			<a class="row" href="/feedback">Send feedback</a>
		</section>

		<section>
			<h2>About</h2>
			<a class="row" href="{config.apiBaseUrl}/privacy">Privacy policy</a>
			<a class="row" href="{config.apiBaseUrl}/terms">Terms</a>
		</section>

		<section class="account">
			<p class="muted">Signed in as {session.current?.email ?? nameOf(me)}</p>
			<button class="btn block" onclick={signOut}>Sign out</button>
			<button class="btn block danger outline" onclick={() => (deleting = true)}>Delete account</button>
		</section>
	</div>
{/if}

<Sheet bind:open={deleting} title="Delete your account?">
	<form class="delete" onsubmit={deleteAccount}>
		<p class="muted">Your profile, photos, parties and messages are deleted for good. This can't be undone.</p>
		<label>
			<span class="overline">Why are you leaving? (optional)</span>
			<textarea class="field" rows="3" maxlength="2000" bind:value={leavingReason}></textarea>
		</label>
		<label>
			<span class="overline">Type DELETE to confirm</span>
			<input class="field" autocapitalize="characters" autocomplete="off" bind:value={confirmText} />
		</label>
		<button class="btn block danger" disabled={confirmText.trim() !== 'DELETE' || deleteBusy}>{deleteBusy ? 'Deleting…' : 'Delete for good'}</button>
		<button type="button" class="btn block outline" onclick={() => (deleting = false)}>Keep my account</button>
	</form>
</Sheet>

<style>
	.page {
		display: grid;
		gap: 28px;
		padding: 8px 16px 32px;
	}
	section {
		display: grid;
		gap: 12px;
	}
	form {
		display: grid;
		gap: 12px;
	}
	label {
		display: grid;
		gap: 6px;
	}
	.avatar-row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 0 4px;
		border-bottom: 1px solid var(--outline-variant);
	}
	.person span {
		flex: 1;
	}
	.account {
		gap: 10px;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.toggle > span {
		flex: 1;
		display: grid;
		gap: 2px;
	}
	.toggle input {
		width: 22px;
		height: 22px;
		accent-color: var(--primary);
	}
	.delete {
		display: grid;
		gap: 12px;
	}
	.delete p {
		margin: 0;
	}
</style>
