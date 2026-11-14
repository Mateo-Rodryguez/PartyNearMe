import type { ReactNode } from 'react';
import { Icon } from '#lib/ui/Icon.js';
import s from './PageHeader.module.css';

export function PageHeader({ title, back = false, actions }: { title: string; back?: boolean; actions?: ReactNode }) {
	return (
		<header className={s.header}>
			{back && (
				<button className={s.back} aria-label="Back" onClick={() => (history.length > 1 ? history.back() : (location.href = '/feed'))}>
					<Icon name="back" />
				</button>
			)}
			<h1>{title}</h1>
			{actions && <div className={s.actions}>{actions}</div>}
		</header>
	);
}
