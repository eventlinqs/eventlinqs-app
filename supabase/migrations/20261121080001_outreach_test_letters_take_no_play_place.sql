-- A LETTER TO OUR OWN TEST DOMAIN NEVER TAKES A REAL ORGANISER'S PLACE IN A PLAY'S DAILY CAP (WINDOW 5A, 21 November 2026).
--
-- The seventh first letter of 'ACQ-FIRST: the 7 organisers of 20 November' (Next Stop Comedy) was refused at the 07:30
-- send run: the play allows 7 a day, and the cap clause of outreach_touch_is_lawful counted 7 sent that day, one of them
-- the greeting test letter to eventlinqs.com (sent at 02:53) that rode in the same play. A test is not a contact made, so
-- the count leaves out every letter whose contact's address is at the sender's own test domain
-- (outreach_sender.test_domain, 'eventlinqs.com'). Nothing else in the clause moves.
--
-- The trigger function is changed IN PLACE from the text in force (law 14 (z)): the one exact line counted before it is
-- replaced, and the post-conditions read the function back.

do $migrate$
declare
  v_def text;
  v_old constant text := $o$where play_id = pl.id and state in ('sent', 'sending') and id <> new.id$o$;
  v_new constant text := $n$where play_id = pl.id and state in ('sent', 'sending') and id <> new.id
           and not exists (select 1 from public.organiser_contacts tc where tc.id = outreach_touches.contact_id
                            and lower(split_part(tc.address, '@', 2)) = lower(snd.test_domain))$n$;
  v_count int;
begin
  v_def := pg_get_functiondef('public.outreach_touch_is_lawful()'::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 1 then
    raise exception 'the lawful-touch trigger in force holds its play cap count % times, not once; nothing changed', v_count;
  end if;
  execute replace(v_def, v_old, v_new);
end
$migrate$;

-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
do $post$
declare
  v_def text := pg_get_functiondef('public.outreach_touch_is_lawful()'::regprocedure);
begin
  if position('lower(split_part(tc.address, ''@'', 2)) = lower(snd.test_domain)' in v_def) = 0 then
    raise exception 'post-condition: the test domain is not left out of the play cap count in the trigger in force';
  end if;
  if position('refused: the play has sent its % for today.' in v_def) = 0 then
    raise exception 'post-condition: the play cap refusal is gone from the trigger in force';
  end if;
  if position('refused: the sender is in test mode and % is not at %.' in v_def) = 0 then
    raise exception 'post-condition: the test mode rule is gone from the trigger in force';
  end if;
end
$post$;
