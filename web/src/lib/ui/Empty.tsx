import type { ReactNode } from 'react';
import s from './Empty.module.css';

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<div className={`${s.empty} empty`}>
			<h2>{title}</h2>
			{children && <div className="muted">{children}</div>}
		</div>
	);
}
