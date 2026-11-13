import { Empty } from '#lib/ui/Empty.js';
import { PageHeader } from './PageHeader.js';

/** Pages still being moved over from the Svelte site (removed before the React site goes live). */
export default function Soon() {
	return (
		<>
			<PageHeader title="PartyNearMe" back />
			<Empty title="Coming soon">This page is being rebuilt.</Empty>
		</>
	);
}
