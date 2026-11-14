import type { Person } from '#lib/api/types.js';
import { nameOf } from '#lib/format.js';
import s from './Avatar.module.css';

export function Avatar({ person, size = 36, ring = false }: { person: Person; size?: number; ring?: boolean }) {
	const initial = nameOf(person).replace('@', '').charAt(0).toUpperCase();
	return (
		<span className={`${s.avatar} ${ring ? s.ring : ''}`} style={{ '--size': `${size}px` } as React.CSSProperties}>
			{person.avatar_url ? (
				<img src={person.avatar_url} alt="" width={size} height={size} loading="lazy" decoding="async" />
			) : (
				<span className={s.initial} aria-hidden="true">
					{initial}
				</span>
			)}
		</span>
	);
}
