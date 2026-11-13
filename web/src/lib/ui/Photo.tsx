import { useState } from 'react';
import type { Media } from '#lib/api/types.js';
import { blurhashUrl } from '#lib/blurhash.js';
import { photoUrl, srcset } from '#lib/format.js';
import s from './Photo.module.css';

/** A post's photo: the blurred preview first, then the smallest size that looks sharp. */
export function Photo({
	media,
	sizes = '(min-width: 640px) 600px, 100vw',
	alt = '',
	eager = false,
	square = false
}: {
	media: Media;
	sizes?: string;
	alt?: string;
	eager?: boolean;
	/** Cropped to a square, for grids of photos. */
	square?: boolean;
}) {
	const [loaded, setLoaded] = useState(false);
	const ratio = square ? 1 : media.width && media.height ? Math.max(0.8, Math.min(1.91, media.width / media.height)) : 1;
	const placeholder = blurhashUrl(media.blurhash);
	return (
		<div className={s.photo} style={{ aspectRatio: ratio, backgroundImage: placeholder ? `url(${placeholder})` : undefined }}>
			<img
				src={photoUrl(media, 640) ?? undefined}
				srcSet={srcset(media) || undefined}
				sizes={sizes}
				alt={alt}
				loading={eager ? 'eager' : 'lazy'}
				fetchPriority={eager ? 'high' : undefined}
				decoding="async"
				className={loaded ? s.loaded : undefined}
				onLoad={() => setLoaded(true)}
			/>
		</div>
	);
}
