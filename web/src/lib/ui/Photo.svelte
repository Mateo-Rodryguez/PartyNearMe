<script lang="ts">
	import type { Media } from '#lib/api/types.js';
	import { blurhashUrl } from '#lib/blurhash.js';
	import { photoUrl, srcset } from '#lib/format.js';

	// A post's photo: the blurred preview first, then the smallest size that looks sharp.
	let {
		media,
		sizes = '(min-width: 640px) 600px, 100vw',
		alt = '',
		eager = false
	}: { media: Media; sizes?: string; alt?: string; eager?: boolean } = $props();
	let loaded = $state(false);
	const ratio = $derived(media.width && media.height ? Math.max(0.8, Math.min(1.91, media.width / media.height)) : 1);
	const placeholder = $derived(blurhashUrl(media.blurhash));
</script>

<div class="photo" style:aspect-ratio={ratio} style:background-image={placeholder ? `url(${placeholder})` : undefined}>
	<img
		src={photoUrl(media, 640)}
		srcset={srcset(media) || undefined}
		{sizes}
		{alt}
		loading={eager ? 'eager' : 'lazy'}
		fetchpriority={eager ? 'high' : undefined}
		decoding="async"
		class:loaded
		onload={() => (loaded = true)}
	/>
</div>

<style>
	.photo {
		position: relative;
		width: 100%;
		background-color: var(--surface-high);
		background-size: cover;
		overflow: hidden;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		transition: opacity 0.25s;
	}
	img.loaded {
		opacity: 1;
	}
</style>
