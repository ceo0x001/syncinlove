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

insert into public.questions (id, category, prompt, facets, sequence_position, renewable) values
  ('q-sleep', 'light', 'How did you actually sleep?', '[{"kind":"scale","id":"quality"},{"kind":"choice","id":"culprit","options":[{"id":"nothing","neutral":true},{"id":"brain"},{"id":"noise"},{"id":"body"}]}]'::jsonb, 0, true),
  ('q-free-evening', 'light', 'A free evening lands in your lap. Nothing owed, nothing to pay for.', '[{"kind":"choice","id":"shape","options":[{"id":"out-people"},{"id":"out-two"},{"id":"in-two"},{"id":"alone"}]},{"kind":"scale","id":"craving"}]'::jsonb, 2, false),
  ('q-cancelled', 'light', 'Plans get cancelled an hour before.', '[{"kind":"scale","id":"feeling"},{"kind":"choice","id":"depends","options":[{"id":"who"},{"id":"what"},{"id":"mood"},{"id":"nothing","neutral":true}]}]'::jsonb, 7, false),
  ('q-laugh', 'light', 'The last thing that made you properly laugh.', '[{"kind":"choice","id":"source","options":[{"id":"them"},{"id":"online"},{"id":"person"},{"id":"blank","neutral":true}]},{"kind":"scale","id":"recency"}]'::jsonb, 4, true),
  ('q-miss-most', 'light', 'One of these vanishes tomorrow, permanently.', '[{"kind":"choice","id":"thing","options":[{"id":"phone"},{"id":"bed"},{"id":"caffeine"},{"id":"music"}]},{"kind":"scale","id":"severity"}]'::jsonb, 23, false),
  ('q-good-at', 'light', 'Something you''re quietly good at.', '[{"kind":"choice","id":"skill","options":[{"id":"details"},{"id":"fixing"},{"id":"room"},{"id":"calm"}]},{"kind":"scale","id":"pride"}]'::jsonb, 10, false),
  ('q-guilty', 'light', 'A pleasure you''d defend in open court.', '[{"kind":"choice","id":"kind","options":[{"id":"show"},{"id":"food"},{"id":"habit"},{"id":"music"}]},{"kind":"scale","id":"shame"}]'::jsonb, 19, false),
  ('q-soundtrack', 'light', 'If today had a soundtrack.', '[{"kind":"choice","id":"genre","options":[{"id":"loud"},{"id":"soft"},{"id":"sad"},{"id":"silence"}]},{"kind":"scale","id":"volume"}]'::jsonb, 13, true),
  ('q-time-capsule', 'light', 'Something from this month you''d seal in a box for ten years.', '[{"kind":"choice","id":"item","options":[{"id":"photo"},{"id":"song"},{"id":"conversation"},{"id":"object"}]},{"kind":"scale","id":"weight"}]'::jsonb, 25, true),
  ('q-swap-phones', 'light', 'We swap phones for twenty-four hours.', '[{"kind":"choice","id":"who","options":[{"id":"me"},{"id":"you"},{"id":"neither","neutral":true},{"id":"both"}]},{"kind":"scale","id":"panic"}]'::jsonb, 28, false),
  ('q-help-this-week', 'logistics', 'What would actually help you this week?', '[{"kind":"choice","id":"kind","options":[{"id":"time-alone"},{"id":"handled"},{"id":"listened"},{"id":"closeness"}]},{"kind":"scale","id":"need"}]'::jsonb, 1, true),
  ('q-week-full', 'logistics', 'How full is your week?', '[{"kind":"scale","id":"fullness"},{"kind":"choice","id":"pressure","options":[{"id":"work"},{"id":"people"},{"id":"money"},{"id":"diffuse","neutral":true}]}]'::jsonb, 5, true),
  ('q-chore', 'logistics', 'The task you''d pay real money to never do again.', '[{"kind":"choice","id":"chore","options":[{"id":"dishes"},{"id":"laundry"},{"id":"admin"},{"id":"tidying"}]},{"kind":"scale","id":"loathing"}]'::jsonb, 35, false),
  ('q-energy-clock', 'logistics', 'When are you actually at your best?', '[{"kind":"choice","id":"window","options":[{"id":"early"},{"id":"late-morning"},{"id":"evening"},{"id":"night"}]},{"kind":"scale","id":"reliability"}]'::jsonb, 8, false),
  ('q-money-temp', 'logistics', 'How is money sitting with you right now?', '[{"kind":"scale","id":"comfort"},{"kind":"choice","id":"focus","options":[{"id":"this-month"},{"id":"coming"},{"id":"nothing","neutral":true},{"id":"avoiding"}]}]'::jsonb, 21, true),
  ('q-notice', 'logistics', 'How much warning do you need before a plan?', '[{"kind":"scale","id":"notice"},{"kind":"choice","id":"depends","options":[{"id":"size"},{"id":"who"},{"id":"week"},{"id":"nothing","neutral":true}]}]'::jsonb, 33, false),
  ('q-food-decision', 'logistics', 'Next time we''re deciding what to eat.', '[{"kind":"choice","id":"want","options":[{"id":"new"},{"id":"usual"},{"id":"home"},{"id":"dont-mind","neutral":true}]},{"kind":"scale","id":"strength"}]'::jsonb, 14, false),
  ('q-inbox', 'logistics', 'The state of your unread messages.', '[{"kind":"scale","id":"control"},{"kind":"choice","id":"offender","options":[{"id":"work"},{"id":"family"},{"id":"admin"},{"id":"groups"}]}]'::jsonb, 17, true),
  ('q-off-your-plate', 'logistics', 'One thing gets lifted off your plate this week.', '[{"kind":"choice","id":"thing","options":[{"id":"work"},{"id":"home"},{"id":"conversation"},{"id":"errands"}]},{"kind":"scale","id":"relief"}]'::jsonb, 30, true),
  ('q-rest', 'logistics', 'Where are you on rest?', '[{"kind":"scale","id":"tank"},{"kind":"choice","id":"refill","options":[{"id":"sleep"},{"id":"alone"},{"id":"together"},{"id":"movement"}]}]'::jsonb, 3, true),
  ('q-need-more-of', 'deep', 'What do you need more of from me right now?', '[{"kind":"choice","id":"need","options":[{"id":"attention"},{"id":"space"},{"id":"patience"},{"id":"encouragement"}]},{"kind":"scale","id":"urgency"}]'::jsonb, 6, true),
  ('q-when-upset', 'deep', 'When you’re upset, what actually helps?', '[{"kind":"choice","id":"what","options":[{"id":"asked"},{"id":"alone-first"},{"id":"distraction"},{"id":"closeness"}]},{"kind":"scale","id":"timing"}]'::jsonb, 9, false),
  ('q-proudest', 'deep', 'The thing you’re proudest of this year.', '[{"kind":"choice","id":"kind","options":[{"id":"made"},{"id":"survived"},{"id":"changed"},{"id":"helped"}]},{"kind":"scale","id":"cost"}]'::jsonb, 16, true),
  ('q-worst-moment', 'deep', 'On your worst day, what do you need to hear?', '[{"kind":"choice","id":"line","options":[{"id":"here"},{"id":"right"},{"id":"not-fault"},{"id":"nothing"}]},{"kind":"scale","id":"words"}]'::jsonb, 54, false),
  ('q-known', 'deep', 'How known do you feel these days?', '[{"kind":"scale","id":"degree"},{"kind":"choice","id":"by-whom","options":[{"id":"you"},{"id":"friends"},{"id":"family"},{"id":"myself"}]}]'::jsonb, 12, true),
  ('q-dont-know', 'deep', 'What do you suspect I don’t fully know about you?', '[{"kind":"choice","id":"what","options":[{"id":"tired"},{"id":"care"},{"id":"scared"},{"id":"changed"}]},{"kind":"scale","id":"matters"}]'::jsonb, 57, false),
  ('q-hard-to-ask', 'deep', 'The hardest thing to ask me for.', '[{"kind":"choice","id":"what","options":[{"id":"help"},{"id":"reassurance"},{"id":"time"},{"id":"forgiveness"}]},{"kind":"scale","id":"difficulty"}]'::jsonb, 24, false),
  ('q-where-we-are', 'deep', 'How do you feel about where we are?', '[{"kind":"scale","id":"settled"},{"kind":"choice","id":"biggest","options":[{"id":"distance"},{"id":"time"},{"id":"money"},{"id":"nothing","neutral":true}]}]'::jsonb, 31, true),
  ('q-still-looking-for', 'deep', 'Something you needed early on that you still look for.', '[{"kind":"choice","id":"what","options":[{"id":"chosen"},{"id":"safe"},{"id":"praised"},{"id":"left-alone"}]},{"kind":"scale","id":"pull"}]'::jsonb, 41, false),
  ('q-ten-years', 'deep', 'Ten years from now, still doing this.', '[{"kind":"choice","id":"changed","options":[{"id":"where"},{"id":"time"},{"id":"conflict"},{"id":"nothing","neutral":true}]},{"kind":"scale","id":"want"}]'::jsonb, 59, false),
  ('q-argument-mode', 'friction', 'In the middle of an argument, what do you actually do?', '[{"kind":"choice","id":"mode","options":[{"id":"shut-down"},{"id":"louder"},{"id":"logical"},{"id":"leave"}]},{"kind":"scale","id":"recovery"}]'::jsonb, 18, false),
  ('q-underneath', 'friction', 'When it goes wrong between us, what’s usually underneath it?', '[{"kind":"choice","id":"root","options":[{"id":"unheard"},{"id":"tired"},{"id":"unfair"},{"id":"old"}]},{"kind":"scale","id":"frequency"}]'::jsonb, 15, true),
  ('q-after-a-fight', 'friction', 'Straight after a fight, what do you need first?', '[{"kind":"choice","id":"need","options":[{"id":"space"},{"id":"contact"},{"id":"resolve"},{"id":"normal"}]},{"kind":"scale","id":"apology"}]'::jsonb, 22, false),
  ('q-who-folds', 'friction', 'Who tends to fold first?', '[{"kind":"choice","id":"who","options":[{"id":"me"},{"id":"you"},{"id":"even"},{"id":"neither","neutral":true}]},{"kind":"scale","id":"fairness"}]'::jsonb, 50, false),
  ('q-short-with-you', 'friction', 'When I’m short with you, what do you assume?', '[{"kind":"choice","id":"assumption","options":[{"id":"my-fault"},{"id":"their-day"},{"id":"us"},{"id":"nothing","neutral":true}]},{"kind":"scale","id":"sting"}]'::jsonb, 27, true),
  ('q-unfair-share', 'friction', 'Something that isn’t split fairly right now.', '[{"kind":"choice","id":"what","options":[{"id":"chores"},{"id":"planning"},{"id":"emotional"},{"id":"nothing","neutral":true}]},{"kind":"scale","id":"bother"}]'::jsonb, 43, true),
  ('q-ends-it', 'friction', 'What actually ends an argument for you?', '[{"kind":"choice","id":"ends","options":[{"id":"sorry"},{"id":"understood"},{"id":"change"},{"id":"time"}]},{"kind":"scale","id":"lingering"}]'::jsonb, 46, false),
  ('q-wish-id-ask', 'friction', 'Something you wish I’d ask you about more.', '[{"kind":"choice","id":"what","options":[{"id":"work"},{"id":"family"},{"id":"body"},{"id":"nothing","neutral":true}]},{"kind":"scale","id":"missed"}]'::jsonb, 37, true),
  ('q-made-peace', 'friction', 'Something small of mine you’ve stopped minding.', '[{"kind":"choice","id":"what","options":[{"id":"mess"},{"id":"time"},{"id":"phone"},{"id":"talking"}]},{"kind":"scale","id":"peace"}]'::jsonb, 53, false),
  ('q-hardest-week', 'friction', 'The thing most likely to make you snap this week.', '[{"kind":"choice","id":"trigger","options":[{"id":"work"},{"id":"money"},{"id":"people"},{"id":"tired"}]},{"kind":"scale","id":"fuse"}]'::jsonb, 40, true),
  ('q-feel-wanted', 'desire', 'What makes you feel wanted?', '[{"kind":"choice","id":"what","options":[{"id":"touch"},{"id":"words"},{"id":"attention"},{"id":"pursued"}]},{"kind":"scale","id":"topped-up"}]'::jsonb, 29, true),
  ('q-touch-timing', 'desire', 'When do you most want to be touched?', '[{"kind":"choice","id":"when","options":[{"id":"low"},{"id":"happy"},{"id":"unprompted"},{"id":"winding-down"}]},{"kind":"scale","id":"appetite"}]'::jsonb, 32, true),
  ('q-gesture', 'desire', 'The small gesture that undoes you.', '[{"kind":"choice","id":"gesture","options":[{"id":"neck"},{"id":"face"},{"id":"pulled"},{"id":"public"}]},{"kind":"scale","id":"known"}]'::jsonb, 39, false),
  ('q-flirt', 'desire', 'How do you like being flirted with?', '[{"kind":"choice","id":"style","options":[{"id":"direct"},{"id":"teasing"},{"id":"slow"},{"id":"written"}]},{"kind":"scale","id":"boldness"}]'::jsonb, 49, false),
  ('q-short-of', 'desire', 'What kind of closeness are you short of right now?', '[{"kind":"choice","id":"kind","options":[{"id":"physical"},{"id":"talking"},{"id":"presence"},{"id":"none","neutral":true}]},{"kind":"scale","id":"ache"}]'::jsonb, 36, true),
  ('q-in-public', 'desire', 'Affection in front of other people.', '[{"kind":"choice","id":"stance","options":[{"id":"love-it"},{"id":"small"},{"id":"private"},{"id":"depends"}]},{"kind":"scale","id":"comfort"}]'::jsonb, 45, false),
  ('q-last-desired', 'desire', 'The last time you felt properly wanted.', '[{"kind":"scale","id":"recency"},{"kind":"choice","id":"source","options":[{"id":"said"},{"id":"did"},{"id":"looked"},{"id":"effort"}]}]'::jsonb, 42, true),
  ('q-chosen', 'desire', 'What makes you feel chosen, rather than just kept?', '[{"kind":"choice","id":"what","options":[{"id":"time"},{"id":"defended"},{"id":"noticed"},{"id":"planned-for"}]},{"kind":"scale","id":"degree"}]'::jsonb, 52, false),
  ('q-initiating', 'desire', 'Making the first move.', '[{"kind":"choice","id":"preference","options":[{"id":"me"},{"id":"you"},{"id":"either"},{"id":"depends-mood"}]},{"kind":"scale","id":"ease"}]'::jsonb, 56, false),
  ('q-attention-form', 'desire', 'If I had an hour with nothing else to do but you.', '[{"kind":"choice","id":"spend","options":[{"id":"talk"},{"id":"close"},{"id":"out"},{"id":"nothing"}]},{"kind":"scale","id":"craving"}]'::jsonb, 47, true),
  ('q-where-based', 'future', 'Five years out — where are you?', '[{"kind":"choice","id":"where","options":[{"id":"here"},{"id":"same-country"},{"id":"abroad"},{"id":"open","neutral":true}]},{"kind":"scale","id":"certainty"}]'::jsonb, 44, false),
  ('q-whos-around', 'future', 'A few years from now, picture the room. Who’s in it?', '[{"kind":"choice","id":"who","options":[{"id":"just-us"},{"id":"us-plus"},{"id":"full"},{"id":"unclear","neutral":true}]},{"kind":"scale","id":"talked"}]'::jsonb, 38, false),
  ('q-saving-for', 'future', 'What are you really saving for?', '[{"kind":"choice","id":"goal","options":[{"id":"safety"},{"id":"place"},{"id":"freedom"},{"id":"nothing","neutral":true}]},{"kind":"scale","id":"progress"}]'::jsonb, 26, true),
  ('q-work-three-years', 'future', 'Work, three years from now.', '[{"kind":"choice","id":"want","options":[{"id":"same-better"},{"id":"different"},{"id":"own"},{"id":"less"}]},{"kind":"scale","id":"urgency"}]'::jsonb, 34, false),
  ('q-whose-career', 'future', 'If one of us had to bend for the other’s work, who bends?', '[{"kind":"choice","id":"who","options":[{"id":"me"},{"id":"you"},{"id":"take-turns"},{"id":"never"}]},{"kind":"scale","id":"ease"}]'::jsonb, 55, false),
  ('q-pace-of-change', 'future', 'How much do you want to change in the next year?', '[{"kind":"scale","id":"appetite"},{"kind":"choice","id":"where","options":[{"id":"work"},{"id":"place"},{"id":"habits"},{"id":"us"}]}]'::jsonb, 20, true),
  ('q-regret', 'future', 'What would you regret not having done?', '[{"kind":"choice","id":"what","options":[{"id":"seen"},{"id":"made"},{"id":"said"},{"id":"risk"}]},{"kind":"scale","id":"pressing"}]'::jsonb, 51, false),
  ('q-crisis', 'future', 'If something big went wrong tomorrow — money, health, family.', '[{"kind":"scale","id":"confidence"},{"kind":"choice","id":"weak-point","options":[{"id":"money"},{"id":"talking"},{"id":"blame"},{"id":"help"}]}]'::jsonb, 48, false),
  ('q-afraid-changes', 'future', 'What are you most afraid will change?', '[{"kind":"choice","id":"what","options":[{"id":"this"},{"id":"me"},{"id":"health"},{"id":"nothing","neutral":true}]},{"kind":"scale","id":"weight"}]'::jsonb, 58, false),
  ('q-next-milestone', 'future', 'The next thing you want to happen for us.', '[{"kind":"choice","id":"what","options":[{"id":"trip"},{"id":"closer"},{"id":"commit"},{"id":"calm"}]},{"kind":"scale","id":"soon"}]'::jsonb, 11, true)
on conflict (id) do update set
  category          = excluded.category,
  prompt            = excluded.prompt,
  facets            = excluded.facets,
  sequence_position = excluded.sequence_position,
  renewable         = excluded.renewable;

commit;

-- Sanity check. Expect 60.
select count(*) as questions_in_rotation
from public.questions
where sequence_position is not null;
