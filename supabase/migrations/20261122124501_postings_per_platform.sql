-- A POSTING ROW FOR EVERY NETWORK A PIECE WENT TO (the PM's 12:17 of 22 November 2026, item 2; 5C's 11:42). AMCF's final
-- day feed 70329a33 published at 11:40:07 on Instagram and Facebook and left ONE posting row, Facebook's: this table was
-- made in 20261028141001 with piece_id and approval_id each UNIQUE (one row per piece, from the days a person recorded
-- one post by hand), so the second network's insert was refused (23505) and the publisher read that as 'recorded
-- already' (store.ts recordAutoPosting). Now each row names its network and the provider's submission id, one row per
-- piece per network.
--
-- What changes: two columns (platform, provider_ref); platform filled for every existing row from its own address
-- ('sent' is a partner kit); the two single column unique keys replaced by one on (piece_id, platform). Nothing is
-- deleted. Readers that embed this table already take a list or its first row. Forward recovery: the old keys cannot
-- come back once a piece has two rows; a reader that needs one row per piece takes its earliest posting.

alter table public.social_piece_postings add column if not exists platform text;
alter table public.social_piece_postings add column if not exists provider_ref text;

update public.social_piece_postings
   set platform = case when post_url = 'sent' then 'partner' when post_url ~* '^https://(www\.)?instagram\.com/' then 'instagram' else 'facebook' end
 where platform is null;

alter table public.social_piece_postings alter column platform set not null;
alter table public.social_piece_postings drop constraint if exists social_piece_postings_platform_check;
alter table public.social_piece_postings add constraint social_piece_postings_platform_check check (platform in ('instagram', 'facebook', 'partner'));
alter table public.social_piece_postings drop constraint if exists social_piece_postings_provider_ref_check;
alter table public.social_piece_postings add constraint social_piece_postings_provider_ref_check check (provider_ref is null or provider_ref ~ '^blotato:[A-Za-z0-9_-]{1,200}$');

alter table public.social_piece_postings drop constraint if exists social_piece_postings_piece_id_key;
alter table public.social_piece_postings drop constraint if exists social_piece_postings_approval_id_key;
alter table public.social_piece_postings drop constraint if exists social_piece_postings_one_per_platform;
alter table public.social_piece_postings add constraint social_piece_postings_one_per_platform unique (piece_id, platform);
