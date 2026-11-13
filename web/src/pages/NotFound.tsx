import { Link } from 'react-router';
import { Empty } from '#lib/ui/Empty.js';
import { PageHeader } from './PageHeader.js';

/** An address the site doesn't have, such as an old or mistyped link. */
export default function NotFound() {
	return (
		<>
			<title>Not found · PartyNearMe</title>
			<PageHeader title="PartyNearMe" back />
			<Empty title="This page doesn't exist">
				The link may be old or mistyped.{' '}
				<Link to="/feed" style={{ color: 'var(--primary)', fontWeight: 600 }}>
					Go home
				</Link>
			</Empty>
		</>
	);
}
