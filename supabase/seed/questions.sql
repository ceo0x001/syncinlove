-- ============================================================================
-- Sync — question bank
--
-- GENERATED FILE. Do not edit.
-- Source: src/lib/questions/bank.ts
-- Regenerate: npm run seed:questions
--
-- Only the structure the database needs to score is stored here — facet kinds,
-- facet ids and option ids. Prompt and label copy lives in TypeScript, so
-- rewording a question never touches a stored answer.
-- ============================================================================

begin;

-- Cleared first so reordering the rotation can't transiently collide with the
-- unique index on sequence_position.
update public.questions set sequence_position = null;

insert into public.questions (id, category, prompt, facets, sequence_position) values
  ('q-sleep', 'light', 'How did you actually sleep?', '[{"kind":"scale","id":"quality"},{"kind":"choice","id":"culprit","options":[{"id":"nothing"},{"id":"brain"},{"id":"noise"},{"id":"body"}]}]'::jsonb, 0),
  ('q-free-evening', 'light', 'A free evening lands in your lap. Nothing owed, nothing to pay for.', '[{"kind":"choice","id":"shape","options":[{"id":"out-people"},{"id":"out-two"},{"id":"in-two"},{"id":"alone"}]},{"kind":"scale","id":"craving"}]'::jsonb, 2),
  ('q-cancelled', 'light', 'Plans get cancelled an hour before.', '[{"kind":"scale","id":"feeling"},{"kind":"choice","id":"depends","options":[{"id":"who"},{"id":"what"},{"id":"mood"},{"id":"nothing"}]}]'::jsonb, 7),
  ('q-laugh', 'light', 'The last thing that made you properly laugh.', '[{"kind":"choice","id":"source","options":[{"id":"them"},{"id":"online"},{"id":"person"},{"id":"blank"}]},{"kind":"scale","id":"recency"}]'::jsonb, 4),
  ('q-miss-most', 'light', 'One of these vanishes tomorrow, permanently.', '[{"kind":"choice","id":"thing","options":[{"id":"phone"},{"id":"bed"},{"id":"caffeine"},{"id":"music"}]},{"kind":"scale","id":"severity"}]'::jsonb, 16),
  ('q-good-at', 'light', 'Something you''re quietly good at.', '[{"kind":"choice","id":"skill","options":[{"id":"details"},{"id":"fixing"},{"id":"room"},{"id":"calm"}]},{"kind":"scale","id":"pride"}]'::jsonb, 10),
  ('q-guilty', 'light', 'A pleasure you''d defend in open court.', '[{"kind":"choice","id":"kind","options":[{"id":"show"},{"id":"food"},{"id":"habit"},{"id":"music"}]},{"kind":"scale","id":"shame"}]'::jsonb, 19),
  ('q-soundtrack', 'light', 'If today had a soundtrack.', '[{"kind":"choice","id":"genre","options":[{"id":"loud"},{"id":"soft"},{"id":"sad"},{"id":"silence"}]},{"kind":"scale","id":"volume"}]'::jsonb, 13),
  ('q-time-capsule', 'light', 'Something from this month you''d seal in a box for ten years.', '[{"kind":"choice","id":"item","options":[{"id":"photo"},{"id":"song"},{"id":"conversation"},{"id":"object"}]},{"kind":"scale","id":"weight"}]'::jsonb, 25),
  ('q-swap-phones', 'light', 'We swap phones for twenty-four hours.', '[{"kind":"choice","id":"who","options":[{"id":"me"},{"id":"you"},{"id":"neither"},{"id":"both"}]},{"kind":"scale","id":"panic"}]'::jsonb, 22),
  ('q-help-this-week', 'logistics', 'What would actually help you this week?', '[{"kind":"choice","id":"kind","options":[{"id":"time-alone"},{"id":"handled"},{"id":"listened"},{"id":"closeness"}]},{"kind":"scale","id":"need"}]'::jsonb, 1),
  ('q-week-full', 'logistics', 'How full is your week?', '[{"kind":"scale","id":"fullness"},{"kind":"choice","id":"pressure","options":[{"id":"work"},{"id":"people"},{"id":"money"},{"id":"diffuse"}]}]'::jsonb, 5),
  ('q-chore', 'logistics', 'The task you''d pay real money to never do again.', '[{"kind":"choice","id":"chore","options":[{"id":"dishes"},{"id":"laundry"},{"id":"admin"},{"id":"tidying"}]},{"kind":"scale","id":"loathing"}]'::jsonb, 11),
  ('q-energy-clock', 'logistics', 'When are you actually at your best?', '[{"kind":"choice","id":"window","options":[{"id":"early"},{"id":"late-morning"},{"id":"evening"},{"id":"night"}]},{"kind":"scale","id":"reliability"}]'::jsonb, 8),
  ('q-money-temp', 'logistics', 'How is money sitting with you right now?', '[{"kind":"scale","id":"comfort"},{"kind":"choice","id":"focus","options":[{"id":"this-month"},{"id":"coming"},{"id":"nothing"},{"id":"avoiding"}]}]'::jsonb, 20),
  ('q-notice', 'logistics', 'How much warning do you need before a plan?', '[{"kind":"scale","id":"notice"},{"kind":"choice","id":"depends","options":[{"id":"size"},{"id":"who"},{"id":"week"},{"id":"nothing"}]}]'::jsonb, 17),
  ('q-food-decision', 'logistics', 'Next time we''re deciding what to eat.', '[{"kind":"choice","id":"want","options":[{"id":"new"},{"id":"usual"},{"id":"home"},{"id":"dont-mind"}]},{"kind":"scale","id":"strength"}]'::jsonb, 14),
  ('q-inbox', 'logistics', 'The state of your unread messages.', '[{"kind":"scale","id":"control"},{"kind":"choice","id":"offender","options":[{"id":"work"},{"id":"family"},{"id":"admin"},{"id":"groups"}]}]'::jsonb, 26),
  ('q-off-your-plate', 'logistics', 'One thing gets lifted off your plate this week.', '[{"kind":"choice","id":"thing","options":[{"id":"work"},{"id":"home"},{"id":"conversation"},{"id":"errands"}]},{"kind":"scale","id":"relief"}]'::jsonb, 23),
  ('q-rest', 'logistics', 'Where are you on rest?', '[{"kind":"scale","id":"tank"},{"kind":"choice","id":"refill","options":[{"id":"sleep"},{"id":"alone"},{"id":"together"},{"id":"movement"}]}]'::jsonb, 3),
  ('q-need-more-of', 'deep', 'What do you need more of from me right now?', '[{"kind":"choice","id":"need","options":[{"id":"attention"},{"id":"space"},{"id":"patience"},{"id":"encouragement"}]},{"kind":"scale","id":"urgency"}]'::jsonb, 6),
  ('q-when-upset', 'deep', 'When you’re upset, what actually helps?', '[{"kind":"choice","id":"what","options":[{"id":"asked"},{"id":"alone-first"},{"id":"distraction"},{"id":"closeness"}]},{"kind":"scale","id":"timing"}]'::jsonb, 9),
  ('q-proudest', 'deep', 'The thing you’re proudest of this year.', '[{"kind":"choice","id":"kind","options":[{"id":"made"},{"id":"survived"},{"id":"changed"},{"id":"helped"}]},{"kind":"scale","id":"cost"}]'::jsonb, 15),
  ('q-worst-moment', 'deep', 'On your worst day, what do you need to hear?', '[{"kind":"choice","id":"line","options":[{"id":"here"},{"id":"right"},{"id":"not-fault"},{"id":"nothing"}]},{"kind":"scale","id":"words"}]'::jsonb, 21),
  ('q-known', 'deep', 'How known do you feel these days?', '[{"kind":"scale","id":"degree"},{"kind":"choice","id":"by-whom","options":[{"id":"you"},{"id":"friends"},{"id":"family"},{"id":"myself"}]}]'::jsonb, 12),
  ('q-dont-know', 'deep', 'What do you suspect I don’t fully know about you?', '[{"kind":"choice","id":"what","options":[{"id":"tired"},{"id":"care"},{"id":"scared"},{"id":"changed"}]},{"kind":"scale","id":"matters"}]'::jsonb, 28),
  ('q-hard-to-ask', 'deep', 'The hardest thing to ask me for.', '[{"kind":"choice","id":"what","options":[{"id":"help"},{"id":"reassurance"},{"id":"time"},{"id":"forgiveness"}]},{"kind":"scale","id":"difficulty"}]'::jsonb, 18),
  ('q-where-we-are', 'deep', 'How do you feel about where we are?', '[{"kind":"scale","id":"settled"},{"kind":"choice","id":"biggest","options":[{"id":"distance"},{"id":"time"},{"id":"money"},{"id":"nothing"}]}]'::jsonb, 24),
  ('q-still-looking-for', 'deep', 'Something you needed early on that you still look for.', '[{"kind":"choice","id":"what","options":[{"id":"chosen"},{"id":"safe"},{"id":"praised"},{"id":"left-alone"}]},{"kind":"scale","id":"pull"}]'::jsonb, 27),
  ('q-ten-years', 'deep', 'Ten years from now, still doing this.', '[{"kind":"choice","id":"changed","options":[{"id":"where"},{"id":"time"},{"id":"conflict"},{"id":"nothing"}]},{"kind":"scale","id":"want"}]'::jsonb, 29)
on conflict (id) do update set
  category          = excluded.category,
  prompt            = excluded.prompt,
  facets            = excluded.facets,
  sequence_position = excluded.sequence_position;

commit;

-- Sanity check. Expect 30.
select count(*) as questions_in_rotation
from public.questions
where sequence_position is not null;
