-- Inviting people to a party through chat: the invite is a message that
-- points at the party, so the app can draw it as a card that opens it.

alter table public.messages add column event_id uuid references public.events (id) on delete set null;
