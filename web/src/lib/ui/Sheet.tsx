import { useEffect, useRef, type ReactNode } from 'react';
import s from './Sheet.module.css';

/**
 * A dialog that slides up on phones and sits centred on wide screens. Escape
 * and a click outside close it; focus stays inside while it's open.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const d = dialog.current;
		if (!d) return;
		if (open && !d.open) d.showModal();
		if (!open && d.open) d.close();
	}, [open]);
	return (
		<dialog
			ref={dialog}
			className={s.dialog}
			aria-label={title}
			onClose={onClose}
			onClick={(e) => {
				if (e.target === dialog.current) onClose();
			}}
		>
			{open && (
				<div className={s.sheet}>
					<h2>{title}</h2>
					{children}
				</div>
			)}
		</dialog>
	);
}
