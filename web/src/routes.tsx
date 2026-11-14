import { createBrowserRouter, useParams } from 'react-router';
import { session } from '#lib/session.js';
import { useStore } from '#lib/store.js';
import AppLayout from './pages/AppLayout.js';
import Callback from './pages/Callback.js';
import Chat from './pages/Chat.js';
import EditEvent from './pages/EditEvent.js';
import EventPage from './pages/Event.js';
import Feed from './pages/Feed.js';
import Feedback from './pages/Feedback.js';
import Guests from './pages/Guests.js';
import Host from './pages/Host.js';
import Inbox from './pages/Inbox.js';
import Invite from './pages/Invite.js';
import Landing from './pages/Landing.js';
import Moderation from './pages/Moderation.js';
import Nearby from './pages/Nearby.js';
import NewPost from './pages/NewPost.js';
import NotFound from './pages/NotFound.js';
import Notifications from './pages/Notifications.js';
import PeopleList from './pages/PeopleList.js';
import PostPage from './pages/PostPage.js';
import Profile from './pages/Profile.js';
import Root from './pages/Root.js';
import Saved from './pages/Saved.js';
import Search from './pages/Search.js';
import Settings from './pages/Settings.js';
import SignIn from './pages/SignIn.js';

/** Remounts [Page] when the :id changes, so its state starts fresh, like a new screen. */
function Keyed({ page: Page }: { page: () => React.ReactNode }) {
	return <Page key={useParams().id} />;
}

/** Someone's profile, or their followers or following, fresh per person. */
function UserPage({ kind }: { kind?: 'followers' | 'following' }) {
	const id = useParams().id ?? '';
	return kind ? <PeopleList key={`${id}.${kind}`} userId={id} kind={kind} /> : <Profile key={id} userId={id} />;
}

/** Your own profile. */
function Me() {
	const { userId } = useStore(session);
	return userId ? <Profile key={userId} userId={userId} /> : null;
}

/**
 * Every address the site has. App pages must also be listed in
 * public/_redirects so Cloudflare Pages serves the app when one is opened directly.
 */
export const router = createBrowserRouter([
	{
		element: <Root />,
		children: [
			{ path: '/', element: <Landing /> },
			{ path: '/signin', element: <SignIn /> },
			{ path: '/auth/callback', element: <Callback /> },
			{
				element: <AppLayout />,
				children: [
					{ path: '/feed', element: <Feed /> },
					{ path: '/p/:id', element: <Keyed page={PostPage} /> },
					{ path: '/nearby', element: <Nearby /> },
					{ path: '/host', element: <Host /> },
					{ path: '/e/:id', element: <Keyed page={EventPage} /> },
					{ path: '/e/:id/edit', element: <Keyed page={EditEvent} /> },
					{ path: '/e/:id/guests', element: <Keyed page={Guests} /> },
					{ path: '/e/:id/invite', element: <Keyed page={Invite} /> },
					{ path: '/u/:id', element: <UserPage /> },
					{ path: '/u/:id/followers', element: <UserPage kind="followers" /> },
					{ path: '/u/:id/following', element: <UserPage kind="following" /> },
					{ path: '/me', element: <Me /> },
					{ path: '/search', element: <Search /> },
					{ path: '/saved', element: <Saved /> },
					{ path: '/new', element: <NewPost /> },
					{ path: '/chat', element: <Inbox /> },
					{ path: '/chat/:id', element: <Keyed page={Chat} /> },
					{ path: '/notifications', element: <Notifications /> },
					{ path: '/settings', element: <Settings /> },
					{ path: '/feedback', element: <Feedback /> },
					{ path: '/moderation', element: <Moderation /> },
					{ path: '*', element: <NotFound /> }
				]
			}
		]
	}
]);
