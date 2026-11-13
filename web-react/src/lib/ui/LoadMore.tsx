import { useEffect, useRef } from 'react';
import { Spinner } from './Spinner.js';
import s from './LoadMore.module.css';

/** Loads the next page as this comes near the screen. */
export function LoadMore({ list }: { list: { error: string | null; ended: boolean; more: () => Promise<void> } }) {
	const sentinel = useRef<HTMLDivElement>(null);
	const error = list.error;
	useEffect(() => {
		const el = sentinel.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting) && !list.error) void list.more();
			},
			{ rootMargin: '800px 0px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [list, error, list.ended]);

	if (list.error)
		return (
			<div className={s.retry}>
				<p className="error">{list.error}</p>
				<button className="btn" onClick={() => list.more()}>
					Try again
				</button>
			</div>
		);
	if (list.ended) return null;
	return (
		<div ref={sentinel}>
			<Spinner />
		</div>
	);
}
