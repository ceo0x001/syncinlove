import type { Question } from './types'

/**
 * The Phase 1 question bank: 30 questions.
 *
 * Written to hold up across very different couples — long-distance, three weeks
 * in, twenty years in, queer, non-monogamous, living apart. So: nothing assumes
 * you share an address, a bed, a bank account, children, a marriage, or a
 * gender. `{them}` is the only name that ever appears.
 *
 * Ordering is not random. See SEQUENCE at the bottom — a pair's second day
 * should never be "what do you worry I don't know about you", and a bank that
 * opens at full intensity churns people on day two.
 */

const LIGHT: Question[] = [
  {
    id: 'q-sleep',
    category: 'light',
    prompt: 'How did you actually sleep?',
    facets: [
      {
        kind: 'scale',
        id: 'quality',
        ask: 'Rate the night.',
        askAbout: "Rate {them}'s night.",
        minLabel: 'Rough',
        maxLabel: 'Like a rock',
      },
      {
        kind: 'choice',
        id: 'culprit',
        ask: 'What got in the way?',
        askAbout: 'What got in the way for {them}?',
        options: [
          { id: 'nothing', label: 'Nothing — slept fine' },
          { id: 'brain', label: 'My own brain' },
          { id: 'noise', label: 'Noise or light' },
          { id: 'body', label: 'Body — too hot, achy, restless' },
        ],
      },
    ],
  },
  {
    id: 'q-free-evening',
    category: 'light',
    prompt: 'A free evening lands in your lap. Nothing owed, nothing to pay for.',
    facets: [
      {
        kind: 'choice',
        id: 'shape',
        ask: 'What do you do with it?',
        askAbout: 'What does {them} do with it?',
        options: [
          { id: 'out-people', label: 'Out, with other people' },
          { id: 'out-two', label: 'Out, just us' },
          { id: 'in-two', label: 'In, just us' },
          { id: 'alone', label: 'Alone, gloriously' },
        ],
      },
      {
        kind: 'scale',
        id: 'craving',
        ask: 'How badly do you want it right now?',
        askAbout: 'How badly does {them} want it right now?',
        minLabel: 'Could take or leave',
        maxLabel: 'Desperately',
      },
    ],
  },
  {
    id: 'q-cancelled',
    category: 'light',
    prompt: 'Plans get cancelled an hour before.',
    facets: [
      {
        kind: 'scale',
        id: 'feeling',
        ask: 'Where do you land?',
        askAbout: 'Where does {them} land?',
        minLabel: 'Genuinely gutted',
        maxLabel: 'Secretly thrilled',
      },
      {
        kind: 'choice',
        id: 'depends',
        ask: 'What does it hinge on?',
        askAbout: 'What does it hinge on for {them}?',
        options: [
          { id: 'who', label: 'Who cancelled' },
          { id: 'what', label: 'What it was' },
          { id: 'mood', label: 'My mood that day' },
          { id: 'nothing', label: "Nothing — it's always the same" },
        ],
      },
    ],
  },
  {
    id: 'q-laugh',
    category: 'light',
    prompt: 'The last thing that made you properly laugh.',
    facets: [
      {
        kind: 'choice',
        id: 'source',
        ask: 'Where did it come from?',
        askAbout: 'Where did it come from for {them}?',
        options: [
          { id: 'them', label: 'Something you said' },
          { id: 'online', label: 'Something online' },
          { id: 'person', label: 'Someone else entirely' },
          { id: 'blank', label: "Honestly can't remember" },
        ],
      },
      {
        kind: 'scale',
        id: 'recency',
        ask: 'How recent?',
        askAbout: 'How recent for {them}?',
        minLabel: 'Been a while',
        maxLabel: 'Today',
      },
    ],
  },
  {
    id: 'q-miss-most',
    category: 'light',
    prompt: 'One of these vanishes tomorrow, permanently.',
    facets: [
      {
        kind: 'choice',
        id: 'thing',
        ask: 'Which would wreck you most?',
        askAbout: 'Which would wreck {them} most?',
        options: [
          { id: 'phone', label: 'Your phone' },
          { id: 'bed', label: 'Your bed' },
          { id: 'caffeine', label: 'Coffee or tea' },
          { id: 'music', label: 'Music' },
        ],
      },
      {
        kind: 'scale',
        id: 'severity',
        ask: 'How wrecked, really?',
        askAbout: 'How wrecked would {them} be?',
        minLabel: "I'd adapt",
        maxLabel: 'Do not do this to me',
      },
    ],
  },
  {
    id: 'q-good-at',
    category: 'light',
    prompt: "Something you're quietly good at.",
    facets: [
      {
        kind: 'choice',
        id: 'skill',
        ask: 'Pick the closest.',
        askAbout: 'Pick the closest for {them}.',
        options: [
          { id: 'details', label: 'Remembering the small details' },
          { id: 'fixing', label: 'Working out how things work' },
          { id: 'room', label: 'Reading a room' },
          { id: 'calm', label: 'Staying calm when it matters' },
        ],
      },
      {
        kind: 'scale',
        id: 'pride',
        ask: 'How much do you rate yourself at it?',
        askAbout: 'How much does {them} rate themselves at it?',
        minLabel: "It's nothing",
        maxLabel: "I'm genuinely great",
      },
    ],
  },
  {
    id: 'q-guilty',
    category: 'light',
    prompt: "A pleasure you'd defend in open court.",
    facets: [
      {
        kind: 'choice',
        id: 'kind',
        ask: 'What kind of thing is it?',
        askAbout: 'What kind of thing is it for {them}?',
        options: [
          { id: 'show', label: 'Something you watch' },
          { id: 'food', label: 'Something you eat' },
          { id: 'habit', label: 'A habit' },
          { id: 'music', label: 'Music you deny liking' },
        ],
      },
      {
        kind: 'scale',
        id: 'shame',
        ask: 'How much shame is attached?',
        askAbout: 'How much shame does {them} attach to it?',
        minLabel: 'None whatsoever',
        maxLabel: 'Taking it to the grave',
      },
    ],
  },
  {
    id: 'q-soundtrack',
    category: 'light',
    prompt: 'If today had a soundtrack.',
    facets: [
      {
        kind: 'choice',
        id: 'genre',
        ask: 'What is it?',
        askAbout: "What's {them}'s?",
        options: [
          { id: 'loud', label: 'Something loud' },
          { id: 'soft', label: 'Something soft' },
          { id: 'sad', label: 'Something sad' },
          { id: 'silence', label: 'Silence, please' },
        ],
      },
      {
        kind: 'scale',
        id: 'volume',
        ask: 'How loud?',
        askAbout: 'How loud for {them}?',
        minLabel: 'Barely on',
        maxLabel: 'Windows down',
      },
    ],
  },
  {
    id: 'q-time-capsule',
    category: 'light',
    prompt: "Something from this month you'd seal in a box for ten years.",
    facets: [
      {
        kind: 'choice',
        id: 'item',
        ask: 'What goes in?',
        askAbout: 'What does {them} put in?',
        options: [
          { id: 'photo', label: 'A photo' },
          { id: 'song', label: 'A song' },
          { id: 'conversation', label: 'A conversation' },
          { id: 'object', label: 'An object' },
        ],
      },
      {
        kind: 'scale',
        id: 'weight',
        ask: 'How much does this month matter, on reflection?',
        askAbout: 'How much does this month matter to {them}?',
        minLabel: 'Forgettable',
        maxLabel: "One I'll keep",
      },
    ],
  },
  {
    id: 'q-swap-phones',
    category: 'light',
    prompt: 'We swap phones for twenty-four hours.',
    facets: [
      {
        kind: 'choice',
        id: 'who',
        ask: 'Who panics first?',
        askAbout: 'Who does {them} think panics first?',
        options: [
          { id: 'me', label: 'Me' },
          { id: 'you', label: 'You' },
          { id: 'neither', label: 'Neither of us' },
          { id: 'both', label: 'Both, immediately' },
        ],
      },
      {
        kind: 'scale',
        id: 'panic',
        ask: 'How much panic are we talking?',
        askAbout: 'How much panic for {them}?',
        minLabel: 'None at all',
        maxLabel: 'Absolutely not',
      },
    ],
  },
]

const LOGISTICS: Question[] = [
  {
    id: 'q-help-this-week',
    category: 'logistics',
    prompt: 'What would actually help you this week?',
    facets: [
      {
        kind: 'choice',
        id: 'kind',
        ask: 'Pick the one that would help most.',
        askAbout: 'Pick the one that would help {them} most.',
        options: [
          { id: 'time-alone', label: 'Time to myself' },
          { id: 'handled', label: 'Something handled without me asking' },
          { id: 'listened', label: 'Being listened to, no advice' },
          { id: 'closeness', label: 'Being close to you' },
        ],
      },
      {
        kind: 'scale',
        id: 'need',
        ask: 'How much do you need it?',
        askAbout: 'How much does {them} need it?',
        minLabel: 'Would be nice',
        maxLabel: 'Running out of road',
      },
    ],
  },
  {
    id: 'q-week-full',
    category: 'logistics',
    prompt: 'How full is your week?',
    facets: [
      {
        kind: 'scale',
        id: 'fullness',
        ask: 'Rate it.',
        askAbout: "Rate {them}'s.",
        minLabel: 'Wide open',
        maxLabel: 'Overflowing',
      },
      {
        kind: 'choice',
        id: 'pressure',
        ask: 'Where is the pressure from?',
        askAbout: 'Where is {them}’s pressure from?',
        options: [
          { id: 'work', label: 'Work' },
          { id: 'people', label: 'People' },
          { id: 'money', label: 'Money' },
          { id: 'diffuse', label: 'Nothing I can point at' },
        ],
      },
    ],
  },
  {
    id: 'q-chore',
    category: 'logistics',
    prompt: "The task you'd pay real money to never do again.",
    facets: [
      {
        kind: 'choice',
        id: 'chore',
        ask: 'Which one?',
        askAbout: 'Which one for {them}?',
        options: [
          { id: 'dishes', label: 'Dishes' },
          { id: 'laundry', label: 'Laundry' },
          { id: 'admin', label: 'Admin and bills' },
          { id: 'tidying', label: 'Tidying up' },
        ],
      },
      {
        kind: 'scale',
        id: 'loathing',
        ask: 'How much do you hate it?',
        askAbout: 'How much does {them} hate it?',
        minLabel: "It's fine",
        maxLabel: 'Genuine dread',
      },
    ],
  },
  {
    id: 'q-energy-clock',
    category: 'logistics',
    prompt: 'When are you actually at your best?',
    facets: [
      {
        kind: 'choice',
        id: 'window',
        ask: 'Pick your window.',
        askAbout: "Pick {them}'s window.",
        options: [
          { id: 'early', label: 'Early morning' },
          { id: 'late-morning', label: 'Late morning' },
          { id: 'evening', label: 'Evening' },
          { id: 'night', label: 'Late night' },
        ],
      },
      {
        kind: 'scale',
        id: 'reliability',
        ask: 'How reliable is that?',
        askAbout: 'How reliable is that for {them}?',
        minLabel: 'Varies wildly',
        maxLabel: 'Like clockwork',
      },
    ],
  },
  {
    id: 'q-money-temp',
    category: 'logistics',
    prompt: 'How is money sitting with you right now?',
    facets: [
      {
        kind: 'scale',
        id: 'comfort',
        ask: 'Rate the feeling, not the balance.',
        askAbout: 'Rate the feeling for {them}, not the balance.',
        minLabel: 'Tight',
        maxLabel: 'Comfortable',
      },
      {
        kind: 'choice',
        id: 'focus',
        ask: "What's it about?",
        askAbout: "What's it about for {them}?",
        options: [
          { id: 'this-month', label: 'Just getting through the month' },
          { id: 'coming', label: 'Something big coming' },
          { id: 'nothing', label: "Not much — it's steady" },
          { id: 'avoiding', label: 'Trying not to look' },
        ],
      },
    ],
  },
  {
    id: 'q-notice',
    category: 'logistics',
    prompt: 'How much warning do you need before a plan?',
    facets: [
      {
        kind: 'scale',
        id: 'notice',
        ask: 'Where do you sit?',
        askAbout: 'Where does {them} sit?',
        minLabel: 'Say the word, I’m out the door',
        maxLabel: 'Days of notice',
      },
      {
        kind: 'choice',
        id: 'depends',
        ask: 'What changes it?',
        askAbout: 'What changes it for {them}?',
        options: [
          { id: 'size', label: 'How big a thing it is' },
          { id: 'who', label: "Who'll be there" },
          { id: 'week', label: 'How my week has gone' },
          { id: 'nothing', label: "Nothing — I'm consistent" },
        ],
      },
    ],
  },
  {
    id: 'q-food-decision',
    category: 'logistics',
    prompt: "Next time we're deciding what to eat.",
    facets: [
      {
        kind: 'choice',
        id: 'want',
        ask: 'What do you actually want?',
        askAbout: 'What does {them} actually want?',
        options: [
          { id: 'new', label: 'Somewhere new' },
          { id: 'usual', label: 'The usual' },
          { id: 'home', label: 'Something at home' },
          { id: 'dont-mind', label: "I truly don't mind" },
        ],
      },
      {
        kind: 'scale',
        id: 'strength',
        ask: 'How strong is that preference?',
        askAbout: 'How strong is it for {them}?',
        minLabel: 'Barely a preference',
        maxLabel: 'I have opinions',
      },
    ],
  },
  {
    id: 'q-inbox',
    category: 'logistics',
    prompt: 'The state of your unread messages.',
    facets: [
      {
        kind: 'scale',
        id: 'control',
        ask: 'How on top of it are you?',
        askAbout: 'How on top of it is {them}?',
        minLabel: 'Drowning',
        maxLabel: 'Spotless',
      },
      {
        kind: 'choice',
        id: 'offender',
        ask: "What's the worst offender?",
        askAbout: "What's the worst offender for {them}?",
        options: [
          { id: 'work', label: 'Work' },
          { id: 'family', label: 'Family' },
          { id: 'admin', label: 'Admin and appointments' },
          { id: 'groups', label: 'Group chats' },
        ],
      },
    ],
  },
  {
    id: 'q-off-your-plate',
    category: 'logistics',
    prompt: 'One thing gets lifted off your plate this week.',
    facets: [
      {
        kind: 'choice',
        id: 'thing',
        ask: 'What goes?',
        askAbout: 'What goes for {them}?',
        options: [
          { id: 'work', label: 'Something at work' },
          { id: 'home', label: 'Something at home' },
          { id: 'conversation', label: "A conversation I'm avoiding" },
          { id: 'errands', label: 'Errands and admin' },
        ],
      },
      {
        kind: 'scale',
        id: 'relief',
        ask: 'How much relief would that be?',
        askAbout: 'How much relief for {them}?',
        minLabel: 'Mild',
        maxLabel: 'Enormous',
      },
    ],
  },
  {
    id: 'q-rest',
    category: 'logistics',
    prompt: 'Where are you on rest?',
    facets: [
      {
        kind: 'scale',
        id: 'tank',
        ask: 'How full is the tank?',
        askAbout: "How full is {them}'s tank?",
        minLabel: 'Running on empty',
        maxLabel: 'Topped up',
      },
      {
        kind: 'choice',
        id: 'refill',
        ask: 'What would refill it fastest?',
        askAbout: 'What would refill {them} fastest?',
        options: [
          { id: 'sleep', label: 'Sleep' },
          { id: 'alone', label: 'Time alone' },
          { id: 'together', label: 'Time with you' },
          { id: 'movement', label: 'Moving my body' },
        ],
      },
    ],
  },
]

const DEEP: Question[] = [
  {
    id: 'q-need-more-of',
    category: 'deep',
    prompt: 'What do you need more of from me right now?',
    facets: [
      {
        kind: 'choice',
        id: 'need',
        ask: 'Pick one.',
        askAbout: 'Pick what {them} would say.',
        options: [
          { id: 'attention', label: 'Attention' },
          { id: 'space', label: 'Space' },
          { id: 'patience', label: 'Patience' },
          { id: 'encouragement', label: 'Encouragement' },
        ],
      },
      {
        kind: 'scale',
        id: 'urgency',
        ask: 'How much more?',
        askAbout: 'How much more does {them} need?',
        minLabel: 'A touch',
        maxLabel: 'A lot',
      },
    ],
  },
  {
    id: 'q-when-upset',
    category: 'deep',
    prompt: 'When you’re upset, what actually helps?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'What works on you?',
        askAbout: 'What works on {them}?',
        options: [
          { id: 'asked', label: 'Being asked about it' },
          { id: 'alone-first', label: 'Being left alone first' },
          { id: 'distraction', label: 'Distraction' },
          { id: 'closeness', label: 'Being held' },
        ],
      },
      {
        kind: 'scale',
        id: 'timing',
        ask: 'How soon do you want it?',
        askAbout: 'How soon does {them} want it?',
        minLabel: 'Give me hours',
        maxLabel: 'Straight away',
      },
    ],
  },
  {
    id: 'q-proudest',
    category: 'deep',
    prompt: 'The thing you’re proudest of this year.',
    facets: [
      {
        kind: 'choice',
        id: 'kind',
        ask: 'What kind of thing?',
        askAbout: 'What kind of thing for {them}?',
        options: [
          { id: 'made', label: 'Something I made' },
          { id: 'survived', label: 'Something I survived' },
          { id: 'changed', label: 'Something I changed about myself' },
          { id: 'helped', label: 'Someone I helped' },
        ],
      },
      {
        kind: 'scale',
        id: 'cost',
        ask: 'What did it cost you?',
        askAbout: 'What did it cost {them}?',
        minLabel: 'Came easily',
        maxLabel: 'Nearly everything',
      },
    ],
  },
  {
    id: 'q-worst-moment',
    category: 'deep',
    prompt: 'On your worst day, what do you need to hear?',
    facets: [
      {
        kind: 'choice',
        id: 'line',
        ask: 'Which one lands?',
        askAbout: 'Which one lands for {them}?',
        options: [
          { id: 'here', label: '“I’m here.”' },
          { id: 'right', label: '“You were right.”' },
          { id: 'not-fault', label: '“It’s not your fault.”' },
          { id: 'nothing', label: 'Nothing. Just stay.' },
        ],
      },
      {
        kind: 'scale',
        id: 'words',
        ask: 'How much do words help you at all?',
        askAbout: 'How much do words help {them}?',
        minLabel: 'Barely',
        maxLabel: 'Enormously',
      },
    ],
  },
  {
    id: 'q-known',
    category: 'deep',
    prompt: 'How known do you feel these days?',
    facets: [
      {
        kind: 'scale',
        id: 'degree',
        ask: 'Rate it honestly.',
        askAbout: 'Rate it for {them}, honestly.',
        minLabel: 'Not really',
        maxLabel: 'Completely',
      },
      {
        kind: 'choice',
        id: 'by-whom',
        ask: 'By whom, mostly?',
        askAbout: 'By whom, for {them}?',
        options: [
          { id: 'you', label: 'You' },
          { id: 'friends', label: 'Friends' },
          { id: 'family', label: 'Family' },
          { id: 'myself', label: 'Only myself' },
        ],
      },
    ],
  },
  {
    id: 'q-dont-know',
    category: 'deep',
    prompt: 'What do you suspect I don’t fully know about you?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'Pick the closest.',
        askAbout: 'Pick the closest for {them}.',
        options: [
          { id: 'tired', label: 'How tired I actually am' },
          { id: 'care', label: 'How much I care' },
          { id: 'scared', label: 'What frightens me' },
          { id: 'changed', label: 'How much I’ve changed' },
        ],
      },
      {
        kind: 'scale',
        id: 'matters',
        ask: 'How much does it matter that I know?',
        askAbout: 'How much does it matter to {them}?',
        minLabel: 'Not much',
        maxLabel: 'More than I let on',
      },
    ],
  },
  {
    id: 'q-hard-to-ask',
    category: 'deep',
    prompt: 'The hardest thing to ask me for.',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'What is it?',
        askAbout: 'What is it for {them}?',
        options: [
          { id: 'help', label: 'Help' },
          { id: 'reassurance', label: 'Reassurance' },
          { id: 'time', label: 'Time' },
          { id: 'forgiveness', label: 'Forgiveness' },
        ],
      },
      {
        kind: 'scale',
        id: 'difficulty',
        ask: 'How hard is it to say out loud?',
        askAbout: 'How hard is it for {them}?',
        minLabel: 'Easy enough',
        maxLabel: 'Nearly impossible',
      },
    ],
  },
  {
    id: 'q-where-we-are',
    category: 'deep',
    prompt: 'How do you feel about where we are?',
    facets: [
      {
        kind: 'scale',
        id: 'settled',
        ask: 'Rate it.',
        askAbout: 'Rate it for {them}.',
        minLabel: 'Uneasy',
        maxLabel: 'Settled',
      },
      {
        kind: 'choice',
        id: 'biggest',
        ask: "What's the biggest thing on it?",
        askAbout: "What's the biggest thing for {them}?",
        options: [
          { id: 'distance', label: 'Distance' },
          { id: 'time', label: 'Time — there’s never enough' },
          { id: 'money', label: 'Money' },
          { id: 'nothing', label: 'Nothing. It’s good.' },
        ],
      },
    ],
  },
  {
    id: 'q-still-looking-for',
    category: 'deep',
    prompt: 'Something you needed early on that you still look for.',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'Pick the closest.',
        askAbout: 'Pick the closest for {them}.',
        options: [
          { id: 'chosen', label: 'Being chosen' },
          { id: 'safe', label: 'Being safe' },
          { id: 'praised', label: 'Being told I did well' },
          { id: 'left-alone', label: 'Being left alone' },
        ],
      },
      {
        kind: 'scale',
        id: 'pull',
        ask: 'How strong is the pull, still?',
        askAbout: 'How strong is it for {them}?',
        minLabel: 'Faint',
        maxLabel: 'Constant',
      },
    ],
  },
  {
    id: 'q-ten-years',
    category: 'deep',
    prompt: 'Ten years from now, still doing this.',
    facets: [
      {
        kind: 'choice',
        id: 'changed',
        ask: 'What do you hope is different?',
        askAbout: 'What does {them} hope is different?',
        options: [
          { id: 'where', label: 'Where we are' },
          { id: 'time', label: 'How we spend our time' },
          { id: 'conflict', label: 'How we handle it when it’s bad' },
          { id: 'nothing', label: 'Honestly — not much' },
        ],
      },
      {
        kind: 'scale',
        id: 'want',
        ask: 'How much do you want that change?',
        askAbout: 'How much does {them} want it?',
        minLabel: 'Idle wish',
        maxLabel: 'Badly',
      },
    ],
  },
]

export const QUESTIONS: Question[] = [...LIGHT, ...LOGISTICS, ...DEEP]

/**
 * The order every pair walks, starting at day 0.
 *
 * Deliberately not shuffled per pair. The ramp is the point: the first week
 * stays light and practical, the deep questions arrive once the ritual has
 * proved itself, and the two heaviest sit at the very end of the cycle. A pair
 * whose second question was "what do you suspect I don't fully know about you"
 * does not come back for a third.
 *
 * Categories alternate so no two consecutive days feel like the same kind of
 * work. Phase 5 extends this past 30; the wrap is intentional until then.
 */
export const SEQUENCE: string[] = [
  // Week one — easy, warm, quick. Earn the right to ask harder things.
  'q-sleep',
  'q-help-this-week',
  'q-free-evening',
  'q-rest',
  'q-laugh',
  'q-week-full',
  'q-need-more-of',

  // Week two — practical texture, first real feelings.
  'q-cancelled',
  'q-energy-clock',
  'q-when-upset',
  'q-good-at',
  'q-chore',
  'q-known',
  'q-soundtrack',

  // Week three — deeper, still interleaved with lightness.
  'q-food-decision',
  'q-proudest',
  'q-miss-most',
  'q-notice',
  'q-hard-to-ask',
  'q-guilty',
  'q-money-temp',

  // Week four — the heavier end, with breathing room between.
  'q-worst-moment',
  'q-swap-phones',
  'q-off-your-plate',
  'q-where-we-are',
  'q-time-capsule',
  'q-inbox',
  'q-still-looking-for',
  'q-dont-know',
  'q-ten-years',
]

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]))

export function questionById(id: string): Question | undefined {
  return BY_ID.get(id)
}

/**
 * Which question a pair sees on a given day. Pure function of the day index —
 * no scheduler, no cron, no backfill. A pair created ninety seconds ago has
 * today's question immediately, and a pair that goes dormant for a month
 * resumes exactly where the arithmetic says it should.
 */
export function questionForDay(dayIndex: number): Question {
  const id = SEQUENCE[((dayIndex % SEQUENCE.length) + SEQUENCE.length) % SEQUENCE.length]
  const question = BY_ID.get(id)
  if (!question) {
    throw new Error(`SEQUENCE references unknown question id "${id}"`)
  }
  return question
}

/** Renders `{them}` in facet copy. Falls back to something neutral pre-pairing. */
export function withPartnerName(text: string, partnerFirstName?: string | null): string {
  return text.replaceAll('{them}', partnerFirstName?.trim() || 'your partner')
}
