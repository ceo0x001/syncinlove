import type { Question } from '../types'

/**
 * Sex, explicitly.
 *
 * `desire.ts` deliberately stops short of sex acts, and the reasoning there still
 * holds for that category. This one is the owner's call to go further: the app is
 * 18+ gated and attested at signup, and a couples app that cannot ask about sex is
 * dodging the thing most couples most need language for.
 *
 * Three rules these are written under, and they are what keep it useful rather
 * than merely lurid.
 *
 * Everything is a preference, never a performance review. "How often would you
 * like it" invites an honest number; "how good is our sex life" invites a lie or a
 * fight, and neither teaches anybody anything.
 *
 * Every option list has a real low end. Wanting less, wanting slower, wanting none
 * this week — those are answers a person must be able to give without the interface
 * implying they picked wrong. A scale whose bottom label reads like a failing grade
 * is a scale nobody answers honestly.
 *
 * And these are gated deep in the sequence. A couple three days in has not agreed
 * to this yet, and the ritual has to earn the right to ask. They renew, because
 * the answers genuinely move — with the month, the mood, and the year.
 */
export const INTIMACY: Question[] = [
  {
    id: 'q-how-often',
    category: 'intimacy',
    renewable: true,
    prompt: 'How often would you actually like sex?',
    facets: [
      {
        kind: 'choice',
        id: 'often',
        ask: 'Be honest rather than diplomatic.',
        askAbout: 'What would {them} say?',
        options: [
          { id: 'daily', label: 'Most days' },
          { id: 'few', label: 'A few times a week' },
          { id: 'weekly', label: 'About once a week' },
          { id: 'rarely', label: 'Less than that — it’s not where my head is' },
        ],
      },
      {
        kind: 'scale',
        id: 'gap',
        ask: 'How far is that from what’s happening?',
        askAbout: 'How far off is it for {them}?',
        minLabel: 'About right',
        maxLabel: 'Miles off',
      },
    ],
  },
  {
    id: 'q-initiate',
    category: 'intimacy',
    renewable: true,
    prompt: 'Who starts it, and who’d you like to?',
    facets: [
      {
        kind: 'choice',
        id: 'prefer',
        ask: 'What you’d prefer.',
        askAbout: 'What would {them} prefer?',
        options: [
          { id: 'me', label: 'Me — I like doing the wanting' },
          { id: 'you', label: 'You — I like being wanted' },
          { id: 'either', label: 'Genuinely either' },
          { id: 'both', label: 'Both, more than happens now' },
        ],
      },
      {
        kind: 'scale',
        id: 'refusal',
        ask: 'How easy is it to say no to you without it becoming a thing?',
        askAbout: 'How easy is it with {them}?',
        minLabel: 'Awkward',
        maxLabel: 'Completely fine',
      },
    ],
  },
  {
    id: 'q-intensity',
    category: 'intimacy',
    renewable: true,
    prompt: 'How rough do you like it?',
    facets: [
      {
        kind: 'scale',
        id: 'rough',
        ask: 'Where do you sit, at your most honest?',
        askAbout: 'Where does {them} sit?',
        minLabel: 'Slow and soft',
        maxLabel: 'Hard, no mercy',
      },
      {
        kind: 'choice',
        id: 'flavour',
        ask: 'What makes it hot for you?',
        askAbout: 'What makes it hot for {them}?',
        options: [
          { id: 'tender', label: 'Being handled gently and looked at' },
          { id: 'urgent', label: 'The urgency — not making it to the bed' },
          { id: 'power', label: 'One of us clearly in charge' },
          { id: 'teasing', label: 'Being made to wait for it' },
        ],
      },
    ],
  },
  {
    id: 'q-in-charge',
    category: 'intimacy',
    renewable: true,
    prompt: 'Who’s in charge, when it’s at its best?',
    facets: [
      {
        kind: 'scale',
        id: 'control',
        ask: 'Where would you put yourself?',
        askAbout: 'Where would {them} put themselves?',
        minLabel: 'I want to be taken',
        maxLabel: 'I want to run it',
      },
      {
        kind: 'choice',
        id: 'how',
        ask: 'How does that look?',
        askAbout: 'How does it look for {them}?',
        options: [
          { id: 'told', label: 'Being told exactly what to do' },
          { id: 'held', label: 'Being held down' },
          { id: 'directing', label: 'Directing you out loud' },
          { id: 'swap', label: 'Swapping, depending on the night' },
        ],
      },
    ],
  },
  {
    id: 'q-fantasy-hold',
    category: 'intimacy',
    renewable: true,
    prompt: 'What have you thought about but never said out loud?',
    facets: [
      {
        kind: 'choice',
        id: 'kind',
        ask: 'The shape of it. You don’t have to spell it out here.',
        askAbout: 'What shape is {them}’s?',
        options: [
          { id: 'role', label: 'Playing at being somebody else' },
          { id: 'watched', label: 'Being watched, or watching' },
          { id: 'restraint', label: 'Being tied, blindfolded, kept still' },
          { id: 'more', label: 'More people in the room' },
        ],
      },
      {
        kind: 'scale',
        id: 'real',
        ask: 'Do you want it real, or is it better as a thought?',
        askAbout: 'Which does {them} want?',
        minLabel: 'Just a thought',
        maxLabel: 'I want it real',
      },
    ],
  },
  {
    id: 'q-what-i-miss',
    category: 'intimacy',
    renewable: true,
    prompt: 'What do you miss most from when we started?',
    facets: [
      {
        kind: 'choice',
        id: 'miss',
        ask: 'The one you’d take back tonight.',
        askAbout: 'Which would {them} take back?',
        options: [
          { id: 'hunger', label: 'How much we couldn’t wait' },
          { id: 'length', label: 'How long we took over it' },
          { id: 'nerve', label: 'How brave we were about asking' },
          { id: 'nothing', label: 'Nothing — it’s better now' },
        ],
      },
      {
        kind: 'scale',
        id: 'nostalgia',
        ask: 'How much do you think about it?',
        askAbout: 'How much does {them} think about it?',
        minLabel: 'Hardly',
        maxLabel: 'Often',
      },
    ],
  },
  {
    id: 'q-hardest-ask',
    category: 'intimacy',
    renewable: true,
    prompt: 'What’s the hardest thing to ask me for in bed?',
    facets: [
      {
        kind: 'choice',
        id: 'why',
        ask: 'What makes it hard?',
        askAbout: 'What makes it hard for {them}?',
        options: [
          { id: 'judged', label: 'You might think less of me' },
          { id: 'obliged', label: 'You’d do it out of duty, not want' },
          { id: 'words', label: 'I don’t have the words for it' },
          { id: 'rejected', label: 'You might just say no' },
        ],
      },
      {
        kind: 'scale',
        id: 'safe',
        ask: 'How safe does asking feel, in general?',
        askAbout: 'How safe does it feel for {them}?',
        minLabel: 'Exposing',
        maxLabel: 'Easy',
      },
    ],
  },
  {
    id: 'q-turned-off',
    category: 'intimacy',
    renewable: true,
    prompt: 'What kills it fastest for you?',
    facets: [
      {
        kind: 'choice',
        id: 'kill',
        ask: 'The one that ends the mood outright.',
        askAbout: 'Which ends it for {them}?',
        options: [
          { id: 'absent', label: 'Feeling like you’re somewhere else' },
          { id: 'pressure', label: 'Feeling like it’s expected of me' },
          { id: 'unresolved', label: 'Something unsaid still sitting between us' },
          { id: 'tired', label: 'Plain exhaustion' },
        ],
      },
      {
        kind: 'scale',
        id: 'recover',
        ask: 'Once it’s gone, can the night be saved?',
        askAbout: 'Can it, for {them}?',
        minLabel: 'That’s it, done',
        maxLabel: 'Easily',
      },
    ],
  },
  {
    id: 'q-body-seen',
    category: 'intimacy',
    renewable: true,
    prompt: 'How do you want to be looked at?',
    facets: [
      {
        kind: 'choice',
        id: 'how',
        ask: 'What you want from my eyes on you.',
        askAbout: 'What does {them} want?',
        options: [
          { id: 'devoured', label: 'Like you can’t help yourself' },
          { id: 'admired', label: 'Slowly, like you’re taking me in' },
          { id: 'told', label: 'With it said out loud' },
          { id: 'dark', label: 'Lights off, honestly' },
        ],
      },
      {
        kind: 'scale',
        id: 'comfort',
        ask: 'How comfortable are you being seen right now?',
        askAbout: 'How comfortable is {them}?',
        minLabel: 'Covered up',
        maxLabel: 'Nothing to hide',
      },
    ],
  },
  {
    id: 'q-after',
    category: 'intimacy',
    renewable: true,
    prompt: 'Afterwards — what do you actually want?',
    facets: [
      {
        kind: 'choice',
        id: 'want',
        ask: 'The first thing.',
        askAbout: 'What does {them} want first?',
        options: [
          { id: 'held', label: 'To be held, no talking' },
          { id: 'talk', label: 'To talk, about anything' },
          { id: 'again', label: 'To not stop yet' },
          { id: 'sleep', label: 'To fall asleep immediately' },
        ],
      },
      {
        kind: 'scale',
        id: 'matters',
        ask: 'How much does the after matter, compared with the during?',
        askAbout: 'How much does it matter to {them}?',
        minLabel: 'Barely',
        maxLabel: 'It’s the best part',
      },
    ],
  },
  {
    id: 'q-out-loud',
    category: 'intimacy',
    renewable: true,
    prompt: 'How much talking do you want during?',
    facets: [
      {
        kind: 'scale',
        id: 'volume',
        ask: 'Where do you sit?',
        askAbout: 'Where does {them} sit?',
        minLabel: 'Quiet',
        maxLabel: 'Say everything',
      },
      {
        kind: 'choice',
        id: 'what',
        ask: 'What you want to hear.',
        askAbout: 'What does {them} want to hear?',
        options: [
          { id: 'filthy', label: 'The filthiest version' },
          { id: 'instructions', label: 'Telling me what to do' },
          { id: 'tender', label: 'Something tender, said badly' },
          { id: 'name', label: 'Just my name' },
        ],
      },
    ],
  },
  {
    id: 'q-anticipation',
    category: 'intimacy',
    renewable: true,
    prompt: 'Would you rather be surprised or made to wait?',
    facets: [
      {
        kind: 'choice',
        id: 'prefer',
        ask: 'Which does more for you?',
        askAbout: 'Which does more for {them}?',
        options: [
          { id: 'surprise', label: 'Out of nowhere' },
          { id: 'warned', label: 'Told this morning it’s happening tonight' },
          { id: 'built', label: 'Built up all week' },
          { id: 'planned', label: 'Planned together, properly' },
        ],
      },
      {
        kind: 'scale',
        id: 'patience',
        ask: 'How well do you handle being made to wait?',
        askAbout: 'How well does {them}?',
        minLabel: 'Badly',
        maxLabel: 'I love it',
      },
    ],
  },
  {
    id: 'q-say-out-loud',
    category: 'intimacy',
    renewable: false,
    prompt: 'What would you say out loud if you knew it landed well?',
    facets: [
      {
        kind: 'scale',
        id: 'nerve',
        ask: 'How much nerve would it take?',
        askAbout: 'How much nerve would it take {them}?',
        minLabel: 'None',
        maxLabel: 'A lot',
      },
      {
        kind: 'choice',
        id: 'kind',
        ask: 'What kind of thing?',
        askAbout: 'What kind of thing, for {them}?',
        options: [
          { id: 'nothing', label: 'Nothing held back', neutral: true },
          { id: 'want', label: 'Something I want done to me' },
          { id: 'do', label: 'Something I want to do' },
          { id: 'idea', label: 'An idea, not an act' },
        ],
      },
    ],
  },
  {
    id: 'q-pace-intensity',
    category: 'intimacy',
    renewable: false,
    prompt: 'Slow, or not slow?',
    facets: [
      {
        kind: 'scale',
        id: 'pace',
        ask: 'Where do you want the pace?',
        askAbout: 'Where does {them} want the pace?',
        minLabel: 'Slow and drawn out',
        maxLabel: 'Urgent',
      },
      {
        kind: 'choice',
        id: 'vary',
        ask: 'How much should it vary?',
        askAbout: 'How much should it vary for {them}?',
        options: [
          { id: 'any', label: 'No preference', neutral: true },
          { id: 'same', label: "I like knowing what's coming" },
          { id: 'mix', label: 'Both, depending' },
          { id: 'surprise', label: 'Surprise me' },
        ],
      },
    ],
  },
  {
    id: 'q-afterwards',
    category: 'intimacy',
    renewable: false,
    prompt: 'Afterwards.',
    facets: [
      {
        kind: 'choice',
        id: 'want',
        ask: 'What do you actually want?',
        askAbout: 'What does {them} want?',
        options: [
          { id: 'held', label: 'To be held, for a while' },
          { id: 'talk', label: 'To talk' },
          { id: 'quiet', label: 'Quiet, close, no words' },
          { id: 'space', label: 'A bit of space, honestly' },
        ],
      },
      {
        kind: 'scale',
        id: 'matters',
        ask: 'How much does that part matter to you?',
        askAbout: 'How much does it matter to {them}?',
        minLabel: 'Not much',
        maxLabel: 'As much as the rest',
      },
    ],
  },
  {
    id: 'q-mood-turns',
    category: 'intimacy',
    renewable: true,
    prompt: 'What most reliably moves you from not-in-the-mood to in-the-mood.',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'What does it?',
        askAbout: 'What does it for {them}?',
        options: [
          { id: 'touch', label: 'Being touched without it going anywhere' },
          { id: 'words', label: 'Being told something' },
          { id: 'load', label: 'Something being taken off my plate' },
          { id: 'time', label: 'Time — knowing nobody needs me' },
        ],
      },
      {
        kind: 'scale',
        id: 'reliable',
        ask: 'How reliable is it?',
        askAbout: 'How reliable is it for {them}?',
        minLabel: 'Hit and miss',
        maxLabel: 'Works every time',
      },
    ],
  },
]
