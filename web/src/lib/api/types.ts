// The API's JSON, the same shapes as app/core/.../model/Models.kt and
// ios/PartyNearMe/Core. Timestamps stay ISO-8601 strings; screens format them.

export interface Person {
	id: string;
	username?: string | null;
	display_name?: string | null;
	avatar_url?: string | null;
}

export interface OwnProfile extends Person {
	bio?: string | null;
	relationship_status?: string | null;
	created_at: string;
	interest_ids: number[];
	is_moderator?: boolean;
}

export interface PublicProfile extends Person {
	bio?: string | null;
	relationship_status?: string | null;
	/** Parties hosted plus parties said "going" to. */
	parties: number;
	followers: number;
	following: number;
	is_following: boolean;
	is_blocked?: boolean;
}

export interface ListedPerson extends Person {
	relationship_status?: string | null;
	is_following?: boolean;
}

export interface PeoplePage {
	users: ListedPerson[];
	next_cursor?: string | null;
}

export interface Interest {
	id: number;
	slug: string;
	name: string;
}

export interface Media {
	position: number;
	url?: string | null;
	/** Width in pixels ("150", "640", "1080") to address. */
	thumbnails: Record<string, string>;
	width?: number | null;
	height?: number | null;
	blurhash?: string | null;
}

export interface TaggedPerson {
	id: string;
	username?: string | null;
	display_name?: string | null;
}

export interface Post {
	id: string;
	author: Person;
	event_id?: string | null;
	event_title?: string | null;
	caption?: string | null;
	place_name?: string | null;
	lat?: number | null;
	lng?: number | null;
	status: string;
	like_count: number;
	comment_count: number;
	liked_by_me: boolean;
	saved_by_me: boolean;
	media: Media[];
	tags: TaggedPerson[];
	created_at: string;
}

export interface PostPage {
	posts: Post[];
	next_cursor?: string | null;
}

export type Rsvp = 'going' | 'interested' | 'requested';

export interface Event {
	id: string;
	organiser: Person;
	title: string;
	description?: string | null;
	starts_at: string;
	ends_at?: string | null;
	venue_name?: string | null;
	lat: number;
	lng: number;
	cover_url?: string | null;
	interest_id?: number | null;
	/** "published", "cancelled" or "draft". */
	status: string;
	going_count: number;
	interested_count: number;
	my_rsvp?: Rsvp | null;
	is_private?: boolean;
	/** You can't see the venue yet; lat and lng are only the rough area. */
	details_hidden?: boolean;
	requested_count?: number;
	ticket_url?: string | null;
	saved_by_me?: boolean;
	friends_going?: Person[];
	friends_going_count?: number;
	chat_id?: string | null;
	created_at: string;
	distance_m?: number | null;
}

export interface EventPage {
	events: Event[];
	next_cursor?: string | null;
}

export interface Comment {
	id: string;
	post_id: string;
	author: Person;
	body: string;
	status?: string;
	can_delete?: boolean;
	created_at: string;
}

export interface CommentPage {
	comments: Comment[];
	next_cursor?: string | null;
}

export interface Interaction {
	kind: 'impression' | 'dwell' | 'open' | 'share' | 'not_interested';
	post_id?: string;
	event_id?: string;
	dwell_ms?: number;
}

export interface UploadTicket {
	upload_id: string;
	upload_url: string;
	headers: Record<string, string>;
}

export interface NewPost {
	upload_ids: string[];
	caption?: string;
	event_id?: string;
	lat?: number;
	lng?: number;
	place_name?: string;
	tag_ids?: string[];
}

/** Settings kept on the server: who can message the user and which pushes they get. */
export interface AccountSettings {
	messages_from: 'everyone' | 'following';
	push_messages: boolean;
	push_rsvps: boolean;
	push_reminders: boolean;
	push_comments: boolean;
}

export interface Notification {
	id: string;
	/** "like", "comment", "tag", "follow", "rsvp", "request" or "reminder"; others are skipped. */
	type: string;
	actor?: Person | null;
	comment_text?: string | null;
	post_id?: string | null;
	post_thumbnail_url?: string | null;
	event_id?: string | null;
	event_title?: string | null;
	event_cover_url?: string | null;
	created_at: string;
	unread?: boolean;
}

export interface NotificationPage {
	notifications: Notification[];
	unread_count: number;
}

export type ReportTarget = 'post' | 'event' | 'user' | 'message' | 'comment';
