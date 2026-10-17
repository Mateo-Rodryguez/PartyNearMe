# Moderation

Both app stores require that people can report content and block users, and that
reports are acted on quickly (Apple guideline 1.2, Google's user-generated content
policy). The terms promise a review within 24 hours.

## What happens automatically

- Every photo and caption is checked by OpenAI moderation before a post goes public.
- Anyone can report a post, party or user from the app. A post reported by three
  different people is hidden straight away until a moderator looks at it.
- Blocking a user stops them messaging you and removes their posts from your feed.

## Reviewing reports

Open the Supabase dashboard, go to **SQL Editor**, and run:

```sql
select r.created_at, r.target_type, r.target_id, r.reason, p.username as reporter, r.id
from public.reports r join public.profiles p on p.id = r.reporter_id
where r.status = 'open'
order by r.created_at;
```

Look at the reported thing (Table Editor, `posts`, `events` or `profiles`, filtered
by the id), then:

| To | Run |
| --- | --- |
| Remove a post | `update public.posts set status = 'removed' where id = '…';` |
| Put back a post hidden by reports | `update public.posts set status = 'visible' where id = '…';` |
| Remove a party | `update public.events set status = 'removed' where id = '…';` |
| Delete a user and everything they posted | `delete from auth.users where id = '…';` |
| Close the report | `update public.reports set status = 'actioned' where id = '…';` (or `'dismissed'`) |

Removed posts and parties disappear for everyone except their author.
