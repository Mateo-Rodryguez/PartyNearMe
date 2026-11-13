import s from './Skeleton.module.css';

type Kind = 'post' | 'party' | 'row' | 'profile';

const Bone = ({ w, h, round }: { w?: number; h?: number; round?: boolean }) => (
	<span className={`${s.bone} ${round ? s.round : ''}`} style={{ width: w, height: h }} />
);

/**
 * Grey shapes in the layout of what's loading, with a soft light sweeping across,
 * as Instagram and Facebook use instead of a spinner. Same shapes as the apps.
 * Still when the person asks for reduced motion.
 */
export function Skeleton({ kind = 'row', count = 1 }: { kind?: Kind; count?: number }) {
	const many = Array.from({ length: count }, (_, i) => i);
	return (
		<div className={`${s.skeleton} ${s[kind]}`} role="status" aria-label="Loading">
			{kind === 'profile' ? (
				<>
					<Bone w={88} h={88} round />
					<Bone w={150} h={18} />
					<div className={s.counts}>
						{[0, 1, 2].map((i) => (
							<div key={i}>
								<Bone w={28} h={16} />
								<Bone w={56} h={10} />
							</div>
						))}
					</div>
					<div className={s.grid}>
						{Array.from({ length: 9 }, (_, i) => (
							<span key={i} className={`${s.bone} ${s.tile}`} />
						))}
					</div>
				</>
			) : (
				many.map((i) =>
					kind === 'post' ? (
						<div key={i} className={s.post}>
							<div className={s.head}>
								<Bone w={38} h={38} round />
								<div className={s.lines}>
									<Bone w={120} />
									<Bone w={80} h={10} />
								</div>
							</div>
							<span className={`${s.bone} ${s.photo}`} />
							<div className={s.lines}>
								<Bone w={220} />
								<Bone w={160} />
							</div>
						</div>
					) : kind === 'party' ? (
						<div key={i} className={s.party}>
							<span className={`${s.bone} ${s.cover}`} />
							<Bone w={200} h={14} />
							<Bone w={140} />
						</div>
					) : (
						<div key={i} className={s.row}>
							<Bone w={52} h={52} round />
							<div className={s.lines}>
								<Bone w={170} />
								<Bone w={110} h={10} />
							</div>
						</div>
					)
				)
			)}
		</div>
	);
}
