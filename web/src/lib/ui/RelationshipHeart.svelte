<script lang="ts" module>
	/** What each heart means. Only shown where people pick theirs, in settings; profiles show the heart alone. */
	export const HEART_MEANING: Record<string, string> = {
		taken: 'In a relationship',
		talking: 'Talking to someone',
		single: 'Single and looking'
	};
</script>

<script lang="ts">
	// The small heart next to someone's name, the same as the apps: full red when
	// taken, half filled in a softer red when talking to someone, an empty
	// outline when single. Nothing when they chose not to show it.
	let { status, size = 20 }: { status: string | null | undefined; size?: number } = $props();

	const full =
		'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
	const outline =
		'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z';
	const id = `half-${Math.random().toString(36).slice(2)}`;
</script>

{#if status && HEART_MEANING[status]}
	<svg class="heart {status}" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={HEART_MEANING[status]}>
		{#if status === 'taken'}
			<path d={full} />
		{:else if status === 'talking'}
			<defs><clipPath {id}><rect width="12" height="24" /></clipPath></defs>
			<path d={outline} />
			<path d={full} clip-path="url(#{id})" />
		{:else}
			<path d={outline} />
		{/if}
	</svg>
{/if}

<style>
	.heart {
		flex: none;
		vertical-align: -0.15em;
	}
	.taken {
		fill: #e5132a;
	}
	.talking {
		fill: #f2788a;
	}
	/* White on the dark theme, black on the light one, like the apps. */
	.single {
		fill: currentColor;
	}
</style>
