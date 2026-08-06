import type { Question } from '../types'

/**
 * Desire.
 *
 * About affection, attraction and wanting — deliberately not about sex acts.
 *
 * Two reasons for that line. The first is coverage: these questions are written
 * by the app and shown to everyone, and "everyone" includes couples three weeks
 * in, couples two thousand miles apart, and couples for whom sex isn't part of
 * it. A question that presumes otherwise doesn't just miss, it tells those people
 * the app isn't for them.
 *
 * The second is that explicit content in Sync is *user-authored*, on the menu,
 * where each person sets their own terms. That's the right place for it. The
 * bank's job is to build toward the menu — to get a couple used to naming what
 * they want at all — not to get there first and set the tone on their behalf.
 *
 * These sit late in the rotation. The ritual has to earn them.
 */
export const DESIRE: Question[] = [
  {
    id: 'q-feel-wanted',
    category: 'desire',
    renewable: true,
    intensity: 2,
    prompt: 'What makes you feel wanted?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'Pick the one that lands hardest.',
        askAbout: 'What lands hardest for {them}?',
        options: [
          { id: 'touch', label: 'Being reached for without a reason' },
          { id: 'words', label: 'Being told, out loud' },
          { id: 'attention', label: 'Having your full attention' },
          { id: 'pursued', label: 'Being pursued a bit' },
        ],
      },
      {
        kind: 'scale',
        id: 'topped-up',
        ask: 'How much of that have you had lately?',
        askAbout: 'How much has {them} had lately?',
        minLabel: 'Not much',
        maxLabel: 'Plenty',
      },
    ],
  },
  {
    id: 'q-touch-timing',
    category: 'desire',
    renewable: true,
    intensity: 2,
    prompt: 'When do you most want to be touched?',
    facets: [
      {
        kind: 'choice',
        id: 'when',
        ask: 'When is it?',
        askAbout: 'When is it for {them}?',
        options: [
          { id: 'low', label: 'When I’m low' },
          { id: 'happy', label: 'When I’m happy' },
          { id: 'unprompted', label: 'Out of nowhere, unprompted' },
          { id: 'winding-down', label: 'At the end of the day' },
        ],
      },
      {
        kind: 'scale',
        id: 'appetite',
        ask: 'How much physical closeness do you want in general?',
        askAbout: 'How much does {them} want?',
        minLabel: 'A little goes far',
        maxLabel: 'Almost constantly',
      },
    ],
  },
  {
    id: 'q-gesture',
    category: 'desire',
    renewable: false,
    intensity: 1,
    prompt: 'The small gesture that undoes you.',
    facets: [
      {
        kind: 'choice',
        id: 'gesture',
        ask: 'Which one?',
        askAbout: 'Which one for {them}?',
        options: [
          { id: 'neck', label: 'A hand on the back of my neck' },
          { id: 'face', label: 'Being held by the face' },
          { id: 'pulled', label: 'Being pulled closer' },
          { id: 'public', label: 'My hand taken in front of people' },
        ],
      },
      {
        kind: 'scale',
        id: 'known',
        ask: 'How well do you think I already know this?',
        askAbout: 'How well does {them} think you know it?',
        minLabel: 'No idea',
        maxLabel: 'You know exactly',
      },
    ],
  },
  {
    id: 'q-flirt',
    category: 'desire',
    renewable: false,
    intensity: 1,
    prompt: 'How do you like being flirted with?',
    facets: [
      {
        kind: 'choice',
        id: 'style',
        ask: 'What works on you?',
        askAbout: 'What works on {them}?',
        options: [
          { id: 'direct', label: 'Say it plainly' },
          { id: 'teasing', label: 'Tease me' },
          { id: 'slow', label: 'Slowly, all day' },
          { id: 'written', label: 'In writing, where I can reread it' },
        ],
      },
      {
        kind: 'scale',
        id: 'boldness',
        ask: 'How bold should it be?',
        askAbout: 'How bold for {them}?',
        minLabel: 'Subtle',
        maxLabel: 'Leave no doubt',
      },
    ],
  },
  {
    id: 'q-short-of',
    category: 'desire',
    renewable: true,
    intensity: 2,
    prompt: 'What kind of closeness are you short of right now?',
    facets: [
      {
        kind: 'choice',
        id: 'kind',
        ask: 'What’s missing?',
        askAbout: 'What’s missing for {them}?',
        options: [
          { id: 'physical', label: 'Physical' },
          { id: 'talking', label: 'Proper conversation' },
          { id: 'presence', label: 'Just being in the same room' },
          { id: 'none', label: 'Nothing — I’m full up', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'ache',
        ask: 'How much are you feeling the lack?',
        askAbout: 'How much is {them} feeling it?',
        minLabel: 'Barely',
        maxLabel: 'A lot',
      },
    ],
  },
  {
    id: 'q-in-public',
    category: 'desire',
    renewable: false,
    intensity: 1,
    prompt: 'Affection in front of other people.',
    facets: [
      {
        kind: 'choice',
        id: 'stance',
        ask: 'Where do you stand?',
        askAbout: 'Where does {them} stand?',
        options: [
          { id: 'love-it', label: 'I like it — let them see' },
          { id: 'small', label: 'Small things only' },
          { id: 'private', label: 'Save it for later' },
          { id: 'depends', label: 'Depends entirely who’s there' },
        ],
      },
      {
        kind: 'scale',
        id: 'comfort',
        ask: 'How comfortable are you being obvious about us?',
        askAbout: 'How comfortable is {them}?',
        minLabel: 'Deeply private',
        maxLabel: 'Completely open',
      },
    ],
  },
  {
    id: 'q-last-desired',
    category: 'desire',
    renewable: true,
    intensity: 3,
    prompt: 'The last time you felt properly wanted.',
    facets: [
      {
        kind: 'scale',
        id: 'recency',
        ask: 'How recently?',
        askAbout: 'How recently for {them}?',
        minLabel: 'Can’t remember',
        maxLabel: 'Today',
      },
      {
        kind: 'choice',
        id: 'source',
        ask: 'What did it?',
        askAbout: 'What did it for {them}?',
        options: [
          { id: 'said', label: 'Something you said' },
          { id: 'did', label: 'Something you did' },
          { id: 'looked', label: 'The way you looked at me' },
          { id: 'effort', label: 'Effort you went to' },
        ],
      },
    ],
  },
  {
    id: 'q-chosen',
    category: 'desire',
    renewable: false,
    intensity: 2,
    prompt: 'What makes you feel chosen, rather than just kept?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'Pick the closest.',
        askAbout: 'Pick the closest for {them}.',
        options: [
          { id: 'time', label: 'Time given up for me' },
          { id: 'defended', label: 'Being taken your side on' },
          { id: 'noticed', label: 'Being noticed without asking' },
          { id: 'planned-for', label: 'Being planned around' },
        ],
      },
      {
        kind: 'scale',
        id: 'degree',
        ask: 'How chosen do you feel these days?',
        askAbout: 'How chosen does {them} feel?',
        minLabel: 'Not much',
        maxLabel: 'Completely',
      },
    ],
  },
  {
    id: 'q-initiating',
    category: 'desire',
    renewable: false,
    intensity: 2,
    prompt: 'Making the first move.',
    facets: [
      {
        kind: 'choice',
        id: 'preference',
        ask: 'What do you prefer?',
        askAbout: 'What does {them} prefer?',
        options: [
          { id: 'me', label: 'I like being the one who does' },
          { id: 'you', label: 'I’d rather be the one asked' },
          { id: 'either', label: 'Either, genuinely' },
          { id: 'depends-mood', label: 'Depends on the day' },
        ],
      },
      {
        kind: 'scale',
        id: 'ease',
        ask: 'How easy is it for you to ask for what you want?',
        askAbout: 'How easy is it for {them}?',
        minLabel: 'Very hard',
        maxLabel: 'Effortless',
      },
    ],
  },
  {
    id: 'q-attention-form',
    category: 'desire',
    renewable: true,
    intensity: 2,
    prompt: 'If I had an hour with nothing else to do but you.',
    facets: [
      {
        kind: 'choice',
        id: 'spend',
        ask: 'How should it go?',
        askAbout: 'How would {them} want it?',
        options: [
          { id: 'talk', label: 'Talk about something real' },
          { id: 'close', label: 'Close, not much talking' },
          { id: 'out', label: 'Get out of the house' },
          { id: 'nothing', label: 'Do nothing, side by side' },
        ],
      },
      {
        kind: 'scale',
        id: 'craving',
        ask: 'How much do you want that hour right now?',
        askAbout: 'How much does {them} want it?',
        minLabel: 'Would be nice',
        maxLabel: 'Badly',
      },
    ],
  },
  {
    id: 'q-desired-how',
    category: 'desire',
    renewable: false,
    intensity: 2,
    prompt: 'How do you most want to be wanted?',
    facets: [
      {
        kind: 'scale',
        id: 'directness',
        ask: 'How direct do you want it?',
        askAbout: 'How direct does {them} want it?',
        minLabel: 'Hinted at',
        maxLabel: 'Said outright',
      },
      {
        kind: 'choice',
        id: 'form',
        ask: 'In what form?',
        askAbout: 'In what form, for {them}?',
        options: [
          { id: 'any', label: 'Any of it works', neutral: true },
          { id: 'words', label: 'Told, in words' },
          { id: 'touch', label: 'Reached for' },
          { id: 'chosen', label: 'Chosen over other options' },
        ],
      },
    ],
  },
  {
    id: 'q-pursue',
    category: 'desire',
    renewable: false,
    intensity: 2,
    prompt: 'Pursuing, or being pursued?',
    facets: [
      {
        kind: 'scale',
        id: 'lean',
        ask: 'Which way do you lean?',
        askAbout: 'Which way does {them} lean?',
        minLabel: 'I want to be pursued',
        maxLabel: 'I want to pursue',
      },
      {
        kind: 'choice',
        id: 'why',
        ask: 'What makes the difference?',
        askAbout: 'What makes the difference for {them}?',
        options: [
          { id: 'either', label: 'Either is fine', neutral: true },
          { id: 'safe', label: 'Being wanted feels safe' },
          { id: 'alive', label: 'Wanting someone feels alive' },
          { id: 'mood', label: 'It depends on the week' },
        ],
      },
    ],
  },
  {
    id: 'q-desire-drop',
    category: 'desire',
    renewable: false,
    intensity: 3,
    prompt: 'What kills it fastest?',
    facets: [
      {
        kind: 'scale',
        id: 'speed',
        ask: 'How quickly does it go?',
        askAbout: 'How quickly does it go for {them}?',
        minLabel: 'Slowly',
        maxLabel: 'Instantly',
      },
      {
        kind: 'choice',
        id: 'cause',
        ask: 'What does it?',
        askAbout: 'What does it for {them}?',
        options: [
          { id: 'nothing', label: 'Not much does', neutral: true },
          { id: 'tired', label: 'Being exhausted' },
          { id: 'unresolved', label: 'Something unsaid between us' },
          { id: 'rushed', label: 'Feeling rushed' },
        ],
      },
    ],
  },
  {
    id: 'q-first-noticed',
    category: 'desire',
    renewable: false,
    intensity: 1,
    prompt: 'What you noticed first about them.',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'What was it?',
        askAbout: 'What does {them} say it was?',
        options: [
          { id: 'face', label: 'Their face' },
          { id: 'body', label: 'How they moved, or carried themselves' },
          { id: 'talk', label: 'The way they talked' },
          { id: 'attention', label: 'How they paid attention to me' },
        ],
      },
      {
        kind: 'scale',
        id: 'still',
        ask: 'How much does that still do it for you?',
        askAbout: 'How much does it still do it for {them}?',
        minLabel: 'Something else does now',
        maxLabel: 'Exactly as much',
      },
    ],
  },
  {
    id: 'q-wanted-pace',
    category: 'desire',
    renewable: true,
    intensity: 1,
    prompt: 'Being wanted slowly, or being wanted urgently.',
    facets: [
      {
        kind: 'scale',
        id: 'pace',
        ask: 'Where are you this month?',
        askAbout: 'Where is {them} this month?',
        minLabel: 'Slow, drawn out',
        maxLabel: 'Urgent, right now',
      },
      {
        kind: 'choice',
        id: 'why',
        ask: 'What’s putting you there?',
        askAbout: 'What’s putting {them} there?',
        options: [
          { id: 'busy', label: 'How full everything is' },
          { id: 'distance', label: 'How much time we’ve had together' },
          { id: 'mood', label: 'Where my head is generally' },
          { id: 'usual', label: 'Nothing — that’s just me', neutral: true },
        ],
      },
    ],
  },
]
