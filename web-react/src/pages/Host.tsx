import { PageHeader } from './PageHeader.js';
import { PartyForm } from './PartyForm.js';

/** Hosting a new party. */
export default function Host() {
	return (
		<>
			<title>Host a party · PartyNearMe</title>
			<PageHeader title="New party" back />
			<PartyForm />
		</>
	);
}
