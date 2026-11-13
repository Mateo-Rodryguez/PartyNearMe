import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import Landing from './pages/Landing.js';

/**
 * The landing page as HTML, made at build time (scripts/shell.mjs) so search
 * engines and link previews see it, and it paints before the JavaScript runs.
 */
export function render(): string {
	return renderToString(
		<MemoryRouter>
			<Landing />
		</MemoryRouter>
	);
}
