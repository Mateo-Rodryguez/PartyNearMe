<script lang="ts">
	import { goto } from '$app/navigation';
	import { session } from '#lib/session.svelte.js';

	// Signed in already: straight to the feed.
	$effect(() => {
		if (session.current) void goto('/feed', { replaceState: true });
	});
</script>

<svelte:head>
	<title>PartyNearMe: find parties near you tonight</title>
	<meta name="description" content="See what's on tonight, find parties near you, RSVP with friends and share the night. Free on the web, Android and iPhone." />
	<meta property="og:title" content="PartyNearMe" />
	<meta property="og:description" content="See what's on tonight, find parties near you, and share the night." />
	<meta property="og:type" content="website" />
</svelte:head>

<main class="landing">
	<div class="glow" aria-hidden="true"></div>
	<section class="hero">
		<img src="/icon.svg" alt="" width="72" height="72" class="logo" />
		<h1 class="wordmark">PartyNearMe</h1>
		<p class="lead">See what's on tonight, find parties near you, and share the night with your friends.</p>
		<div class="cta">
			<a class="btn primary" href="/signin?mode=signup">Create an account</a>
			<a class="btn outline" href="/signin">Sign in</a>
		</div>
	</section>
	<section class="points" aria-label="What you can do">
		<div><h2>What's on tonight</h2><p class="muted">Parties near you, tonight and this weekend, with who's going.</p></div>
		<div><h2>RSVP with friends</h2><p class="muted">Say you're going, see which friends are in, and get the details.</p></div>
		<div><h2>Share the night</h2><p class="muted">Post photos from the party and relive it with everyone who was there.</p></div>
	</section>
	<footer class="muted">
		<a href="https://partynearme-api.onrender.com/privacy">Privacy</a> · <a href="https://partynearme-api.onrender.com/terms">Terms</a>
	</footer>
</main>

<style>
	.landing {
		position: relative;
		min-height: 100dvh;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-content: center;
		gap: 48px;
		padding: 48px 16px;
		overflow: hidden;
	}
	.glow {
		position: absolute;
		inset: -20% -20% auto;
		height: 70%;
		background:
			radial-gradient(closest-side at 30% 50%, var(--glow-a), transparent),
			radial-gradient(closest-side at 70% 40%, var(--glow-b), transparent);
		filter: blur(40px);
		z-index: -1;
	}
	.hero {
		display: grid;
		justify-items: center;
		gap: 16px;
		text-align: center;
		max-width: 560px;
		margin: 0 auto;
	}
	.logo {
		border-radius: 22px;
		box-shadow: 0 12px 40px var(--glow-a);
	}
	.wordmark {
		font-size: clamp(40px, 9vw, 64px);
		background: var(--sunset);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.lead {
		font-size: 18px;
		color: var(--on-surface-variant);
	}
	.cta {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 12px;
		margin-top: 8px;
	}
	.points {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 16px;
		max-width: 900px;
		margin: 0 auto;
		width: 100%;
	}
	.points > div {
		display: grid;
		gap: 6px;
		padding: 20px;
		border-radius: var(--radius-lg);
		background: var(--surface);
		border: 1px solid var(--outline-variant);
	}
	footer {
		text-align: center;
		font-size: 14px;
	}
</style>
