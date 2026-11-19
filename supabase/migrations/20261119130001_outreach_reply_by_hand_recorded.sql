-- A REPLY LAWAL SENT BY HAND IS RECORDED (WINDOW 5A, 19 November 2026; the PM's 12:18 item 1: "Record it as Asia
-- Oasis's reply touch, sent by lawal"). The lawful-touch trigger in force (read from production at 12:30, law 14 (z))
-- demands the outreach unsubscribe link in the body of every email it lets stand as sent, so the Sent Items sync could
-- never record a reply Lawal wrote himself: his replies are signed as his communication law signs a reply (Lawal Adams,
-- Founder, EventLinqs, with no opt out block), and production held no message sent by hand at all on 19 November.
--
-- One condition, changed in place: a message that is a REPLY to a contact who wrote to us (the contact refusal function
-- still refuses a reply to anyone who has not), already SENT, BY HAND (provider by_hand, with who sent it), is recorded
-- without the marketing unsubscribe link. Nothing here sends anything, and every check on what the platform sends stays
-- as it is: a queued, sending or Graph sent message keeps the link rule, and a reply recorded by hand still needs the
-- greeting, EventLinqs named, a subject, no dashes and no exclamation marks, a sender and a time.
--
-- Reversal: put back the condition's one line, 'if position(''https://www.eventlinqs.com.au/unsubscribe/outreach'' in
-- new.body) = 0 then', by the same in place replacement.

do $migrate$
declare
  v_def text;
  v_old text := 'if position(''https://www.eventlinqs.com.au/unsubscribe/outreach'' in new.body) = 0 then';
  v_new text := 'if position(''https://www.eventlinqs.com.au/unsubscribe/outreach'' in new.body) = 0 and not (new.purpose = ''reply'' and new.state = ''sent'' and new.provider = ''by_hand'') then';
  v_count int;
begin
  v_def := pg_get_functiondef('public.outreach_touch_is_lawful()'::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 1 then
    raise exception 'the lawful-touch trigger in force holds its email link rule % times, not once; nothing changed', v_count;
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
  if position('new.purpose = ''reply'' and new.state = ''sent'' and new.provider = ''by_hand''' in v_def) = 0 then
    raise exception 'post-condition: the reply by hand condition is not in the trigger in force';
  end if;
  if position('raise exception ''refused: an email must carry the unsubscribe link' in v_def) = 0 then
    raise exception 'post-condition: the email link rule is gone from the trigger in force';
  end if;
  if position('refused: a message by hand must carry the unsubscribe link or a reply STOP line' in v_def) = 0 then
    raise exception 'post-condition: the rule for messages by hand on other channels is gone';
  end if;
end
$post$;
