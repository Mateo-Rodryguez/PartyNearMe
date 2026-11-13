import s from './Spinner.module.css';

export function Spinner({ label = 'Loading' }: { label?: string }) {
	return (
		<div className={s.wrap} role="status">
			<span className={s.spinner} aria-hidden="true" />
			<span className="visually-hidden">{label}</span>
		</div>
	);
}
