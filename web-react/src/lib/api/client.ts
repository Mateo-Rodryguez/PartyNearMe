import { analytics } from '#lib/analytics.js';
import { config } from '#lib/config.js';
import { session, SignedOutError } from '#lib/session.js';
import type {
	AccountSettings,
	Comment,
	CommentPage,
	Conversation,
	ConversationPage,
	Message,
	MessagePage,
	ModerationAction,
	Event,
	EventPage,
	EventUpdate,
	FeedbackKind,
	ForYouPage,
	GuestList,
	NewEvent,
	Interaction,
	Interest,
	NewPost,
	NotificationPage,
	OwnProfile,
	PeoplePage,
	Post,
	PostPage,
	PublicProfile,
	RecommendationStats,
	ReportedItem,
	ReportTarget,
	Rsvp,
	UploadTicket
} from './types';

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

/** The feed snapshot behind a cursor has expired; reload from the top. */
export class FeedExpiredError extends ApiError {
	constructor() {
		super(410, 'The feed has moved on');
	}
}

type Query = Record<string, string | number | boolean | null | undefined>;

function url(path: string, query: Query = {}) {
	const u = new URL(`${config.apiBaseUrl}${path}`);
	for (const [key, value] of Object.entries(query)) if (value != null) u.searchParams.set(key, String(value));
	return u;
}

const id = (value: string) => encodeURIComponent(value);

/** Every call is signed in; a 401 triggers one token refresh and a retry. */
async function call<T>(method: string, path: string, { query, body }: { query?: Query; body?: unknown } = {}): Promise<T> {
	const attempt = (token: string) =>
		fetch(url(path, query), {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				...(body !== undefined ? { 'content-type': 'application/json' } : {})
			},
			body: body !== undefined ? JSON.stringify(body) : undefined
		});
	const token = await session.accessToken();
	let response: Response;
	try {
		response = await attempt(token);
		if (response.status === 401) response = await attempt(await session.refresh(token));
	} catch (e) {
		if (!(e instanceof SignedOutError)) analytics.apiResult(method, path, 0); // No connection.
		throw e;
	}
	analytics.apiResult(method, path, response.status);
	if (response.status === 410 && path === '/feed') throw new FeedExpiredError();
	const text = await response.text();
	if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, text));
	return (text ? JSON.parse(text) : undefined) as T;
}

function errorMessage(status: number, text: string) {
	if (status >= 500) return 'Something went wrong on our side. Try again in a moment.';
	try {
		const message = (JSON.parse(text) as { message?: unknown }).message;
		if (typeof message === 'string') return message;
	} catch {
		// Not JSON.
	}
	return `Request failed (${status})`;
}

export const api = {
	// Feed
	feed: (lat: number | null, lng: number | null, cursor?: string | null) =>
		call<PostPage>('GET', '/feed', { query: { lat, lng, cursor, limit: 20 } }),
	logInteractions: (events: Interaction[]) => call<void>('POST', '/interactions', { body: { events } }),

	// Posts
	post: (postId: string) => call<Post>('GET', `/posts/${id(postId)}`),
	like: (postId: string, liked: boolean) => call<void>(liked ? 'PUT' : 'DELETE', `/posts/${id(postId)}/like`),
	savePost: (postId: string, saved: boolean) => call<void>(saved ? 'PUT' : 'DELETE', `/posts/${id(postId)}/save`),
	comments: (postId: string, cursor?: string | null) =>
		call<CommentPage>('GET', `/posts/${id(postId)}/comments`, { query: { cursor } }),
	addComment: (postId: string, body: string) => call<Comment>('POST', `/posts/${id(postId)}/comments`, { body: { body } }),
	deleteComment: (commentId: string) => call<void>('DELETE', `/comments/${id(commentId)}`),
	userPosts: (userId: string, cursor?: string | null) =>
		call<PostPage>('GET', `/users/${id(userId)}/posts`, { query: { cursor } }),

	/** Uploads one photo straight to storage with a signed address; the API never sees the bytes. */
	uploadPhoto: async (photo: Blob): Promise<string> => {
		const ticket = await call<UploadTicket>('POST', '/uploads', { body: { content_type: photo.type, size_bytes: photo.size } });
		const headers = Object.fromEntries(Object.entries(ticket.headers).filter(([name]) => name.toLowerCase() !== 'content-length'));
		const response = await fetch(ticket.upload_url, { method: 'PUT', headers, body: photo }).catch((e: unknown) => {
			analytics.apiResult('PUT', '/photo-upload', 0);
			throw e;
		});
		if (!response.ok) analytics.apiResult('PUT', '/photo-upload', response.status);
		if (!response.ok) throw new ApiError(response.status, "The photo didn't upload. Try again.");
		return ticket.upload_id;
	},
	createPost: (post: NewPost) => call<Post>('POST', '/posts', { body: post }),
	deletePost: (postId: string) => call<void>('DELETE', `/posts/${id(postId)}`),
	/** An empty caption removes it. The server checks the new words. */
	updateCaption: (postId: string, caption: string) => call<Post>('PATCH', `/posts/${id(postId)}`, { body: { caption } }),
	/** Sets everyone tagged on your post; people left out are untagged. */
	setTags: (postId: string, userIds: string[]) => call<Post>('PUT', `/posts/${id(postId)}/tags`, { body: { user_ids: userIds } }),
	untagMe: (postId: string) => call<void>('DELETE', `/posts/${id(postId)}/tags/me`),
	savedPosts: (cursor?: string | null) => call<PostPage>('GET', '/me/saved/posts', { query: { cursor } }),

	// Parties
	nearbyEvents: (q: { lat: number; lng: number; radiusKm?: number; cursor?: string | null; from?: string; to?: string; interestId?: number | null }) =>
		call<EventPage>('GET', '/events/nearby', {
			query: { lat: q.lat, lng: q.lng, radius_km: q.radiusKm ?? 10, cursor: q.cursor, from: q.from, to: q.to, interest_id: q.interestId }
		}),
	/** Parties around the user ranked by what they like, each with a reason. */
	forYouEvents: (q: { lat: number; lng: number; radiusKm?: number; from?: string; to?: string; interestId?: number | null }) =>
		call<ForYouPage>('GET', '/events/for-you', {
			query: { lat: q.lat, lng: q.lng, radius_km: q.radiusKm ?? 25, from: q.from, to: q.to, interest_id: q.interestId }
		}),
	event: (eventId: string) => call<Event>('GET', `/events/${id(eventId)}`),
	eventPosts: (eventId: string, cursor?: string | null) =>
		call<PostPage>('GET', `/events/${id(eventId)}/posts`, { query: { cursor } }),
	myEvents: (organising: boolean) => call<Event[]>('GET', '/me/events', { query: { role: organising ? 'organising' : 'going' } }),
	/** Null takes the RSVP off. */
	rsvp: async (eventId: string, status: Exclude<Rsvp, 'requested'> | null): Promise<Event> => {
		if (status) return call<Event>('PUT', `/events/${id(eventId)}/rsvp`, { body: { status } });
		await call<void>('DELETE', `/events/${id(eventId)}/rsvp`);
		return api.event(eventId);
	},
	createEvent: (event: NewEvent) => call<Event>('POST', '/events', { body: event }),
	/** Host only. Cancelling tells guests with a push. A null interest_id takes the kind off. */
	updateEvent: (eventId: string, update: EventUpdate) => call<Event>('PATCH', `/events/${id(eventId)}`, { body: update }),
	deleteEvent: (eventId: string) => call<void>('DELETE', `/events/${id(eventId)}`),
	/** The cover shows once the server has checked the photo. */
	setCover: (eventId: string, uploadId: string) => call<void>('PUT', `/events/${id(eventId)}/cover`, { body: { upload_id: uploadId } }),
	removeCover: (eventId: string) => call<void>('DELETE', `/events/${id(eventId)}/cover`),
	/** Who asked to come and who's going, for the host of a private party. */
	guests: (eventId: string) => call<GuestList>('GET', `/events/${id(eventId)}/guests`),
	approveGuest: (eventId: string, userId: string) => call<void>('POST', `/events/${id(eventId)}/guests/${id(userId)}/approve`),
	/** Declines a request, or takes someone off the guest list. */
	removeGuest: (eventId: string, userId: string) => call<void>('DELETE', `/events/${id(eventId)}/guests/${id(userId)}`),
	/** Sends a party invite to each person as a chat message. */
	invite: (eventId: string, userIds: string[]) =>
		call<{ sent: number; skipped: number }>('POST', `/events/${id(eventId)}/invites`, { body: { user_ids: userIds } }),
	saveEvent: (eventId: string, saved: boolean) => call<void>(saved ? 'PUT' : 'DELETE', `/events/${id(eventId)}/save`),
	savedEvents: async () => (await call<{ events: Event[] }>('GET', '/me/saved/events')).events,

	// People
	me: () => call<OwnProfile>('GET', '/me'),
	interests: () => call<Interest[]>('GET', '/interests'),
	user: (userId: string) => call<PublicProfile>('GET', `/users/${id(userId)}`),
	follow: (userId: string, following: boolean) => call<void>(following ? 'PUT' : 'DELETE', `/users/${id(userId)}/follow`),
	searchUsers: (q: string) => call<PeoplePage>('GET', '/users/search', { query: { q } }),
	followers: (userId: string, cursor?: string | null) =>
		call<PeoplePage>('GET', `/users/${id(userId)}/followers`, { query: { cursor } }),
	following: (userId: string, cursor?: string | null) =>
		call<PeoplePage>('GET', `/users/${id(userId)}/following`, { query: { cursor } }),
	updateMe: (fields: { username?: string; display_name?: string; bio?: string; relationship_status?: string | null }) =>
		call<OwnProfile>('PATCH', '/me', { body: fields }),
	setAvatar: (uploadId: string) => call<void>('PUT', '/me/avatar', { body: { upload_id: uploadId } }),
	removeAvatar: () => call<void>('DELETE', '/me/avatar'),
	setInterests: (ids: number[]) => call<OwnProfile>('PUT', '/me/interests', { body: { interest_ids: ids } }),
	settings: () => call<AccountSettings>('GET', '/me/settings'),
	updateSettings: (settings: Partial<AccountSettings>) => call<AccountSettings>('PATCH', '/me/settings', { body: settings }),
	/** Deletes the signed-in account and everything it owns. */
	deleteAccount: () => call<void>('DELETE', '/me'),

	// Safety
	report: (target: ReportTarget, targetId: string, reason: string) =>
		call<void>('POST', '/reports', { body: { target_type: target, target_id: targetId, reason } }),
	block: (userId: string, blocked: boolean) => call<void>(blocked ? 'PUT' : 'DELETE', `/users/${id(userId)}/block`),
	/** Open reports, one entry per reported thing. Moderators only. */
	moderationQueue: async () => (await call<{ items: ReportedItem[] }>('GET', '/moderation/queue')).items,
	/** How well recommendations work: impressions and what came of them. Moderators only. */
	recommendationStats: (days = 14) => call<RecommendationStats>('GET', '/moderation/recommendation-stats', { query: { days } }),
	/** Acts on a reported thing and closes its reports. Moderators only. */
	moderate: (targetType: string, targetId: string, action: ModerationAction, note?: string) =>
		call<void>('POST', '/moderation/actions', { body: { target_type: targetType, target_id: targetId, action, note: note || undefined } }),
	blockedUsers: async () => (await call<PeoplePage>('GET', '/me/blocks')).users,

	// Chat
	inbox: (cursor?: string | null) => call<ConversationPage>('GET', '/conversations', { query: { cursor } }),
	startConversation: (userId: string) => call<Conversation>('POST', '/conversations', { body: { user_id: userId } }),
	conversation: (conversationId: string) => call<Conversation>('GET', `/conversations/${id(conversationId)}`),
	unreadMessages: async () => (await call<{ unread_count: number }>('GET', '/conversations/unread')).unread_count,
	/** Newest first; pass the oldest id you have as [before] to page back. */
	messages: (conversationId: string, before?: string | null) =>
		call<MessagePage>('GET', `/conversations/${id(conversationId)}/messages`, { query: { before } }),
	send: (conversationId: string, body: string) => call<Message>('POST', `/conversations/${id(conversationId)}/messages`, { body: { body } }),
	markRead: (conversationId: string) => call<void>('POST', `/conversations/${id(conversationId)}/read`),

	// Notifications
	notifications: () => call<NotificationPage>('GET', '/notifications'),
	unreadNotifications: async () => (await call<{ unread_count: number }>('GET', '/notifications/unread')).unread_count,
	markNotificationsSeen: () => call<void>('POST', '/notifications/seen'),

	// Feedback (see docs/analytics.md): what people tell us themselves.
	sendFeedback: async (kind: FeedbackKind, fields: { body?: string; score?: number; screen?: string } = {}) => {
		await call<void>('POST', '/feedback', {
			body: {
				kind,
				body: fields.body?.trim() || undefined,
				score: fields.score,
				screen: fields.screen?.slice(0, 40),
				platform: 'web',
				app_version: config.version
			}
		});
		analytics.capture('feedback_sent', { kind, score: fields.score, has_text: !!fields.body?.trim() });
	}
};
