import type { Question } from '../types'

/**
 * The future.
 *
 * The original bank covered money as a *feeling* but never the concrete future —
 * where you'll be, what you're saving toward, who's in the house, whose career
 * bends. Those are exactly the things couples discover late and expensively.
 *
 * Careful with the presumptions here, more than anywhere else. Nothing assumes
 * you live together, want children, share money, or intend to marry. "Who's
 * around in a few years" gets at the children question without asking a couple
 * who have decided against it — or a couple who can't — to answer a question
 * built for somebody else.
 */
export const FUTURE: Question[] = [
  {
    id: 'q-where-based',
    category: 'future',
    renewable: false,
    prompt: 'Five years out — where are you?',
    facets: [
      {
        kind: 'choice',
        id: 'where',
        ask: 'Where do you want to be based?',
        askAbout: 'Where does {them} want to be?',
        options: [
          { id: 'here', label: 'Right about here' },
          { id: 'same-country', label: 'Same country, different place' },
          { id: 'abroad', label: 'Somewhere else entirely' },
          { id: 'open', label: 'Genuinely no strong view', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'certainty',
        ask: 'How settled are you on that?',
        askAbout: 'How settled is {them}?',
        minLabel: 'Wide open',
        maxLabel: 'Decided',
      },
    ],
  },
  {
    id: 'q-whos-around',
    category: 'future',
    renewable: false,
    prompt: 'A few years from now, picture the room. Who’s in it?',
    facets: [
      {
        kind: 'choice',
        id: 'who',
        ask: 'Who’s around?',
        askAbout: 'Who does {them} picture?',
        options: [
          { id: 'just-us', label: 'Just us' },
          { id: 'us-plus', label: 'Us and someone small' },
          { id: 'full', label: 'A full, noisy house' },
          { id: 'unclear', label: 'Honestly haven’t pictured it', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'talked',
        ask: 'How much have we actually talked about this?',
        askAbout: 'How much would {them} say we have?',
        minLabel: 'Never properly',
        maxLabel: 'Plenty',
      },
    ],
  },
  {
    id: 'q-saving-for',
    category: 'future',
    renewable: true,
    prompt: 'What are you really saving for?',
    facets: [
      {
        kind: 'choice',
        id: 'goal',
        ask: 'What’s the thing?',
        askAbout: 'What’s {them}’s thing?',
        options: [
          { id: 'safety', label: 'A cushion, so nothing can knock us over' },
          { id: 'place', label: 'Somewhere of our own' },
          { id: 'freedom', label: 'The freedom to stop working for a while' },
          { id: 'nothing', label: 'Not saving for anything specific', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'progress',
        ask: 'How close does it feel?',
        askAbout: 'How close does it feel to {them}?',
        minLabel: 'Distant',
        maxLabel: 'Within reach',
      },
    ],
  },
  {
    id: 'q-work-three-years',
    category: 'future',
    renewable: false,
    prompt: 'Work, three years from now.',
    facets: [
      {
        kind: 'choice',
        id: 'want',
        ask: 'What do you want?',
        askAbout: 'What does {them} want?',
        options: [
          { id: 'same-better', label: 'This, but further along' },
          { id: 'different', label: 'Something completely different' },
          { id: 'own', label: 'Working for myself' },
          { id: 'less', label: 'Less of it, frankly' },
        ],
      },
      {
        kind: 'scale',
        id: 'urgency',
        ask: 'How restless are you about it?',
        askAbout: 'How restless is {them}?',
        minLabel: 'Content',
        maxLabel: 'Itching to move',
      },
    ],
  },
  {
    id: 'q-whose-career',
    category: 'future',
    renewable: false,
    prompt: 'If one of us had to bend for the other’s work, who bends?',
    facets: [
      {
        kind: 'choice',
        id: 'who',
        ask: 'Who bends?',
        askAbout: 'Who would {them} say?',
        options: [
          { id: 'me', label: 'Me — I’d rather be the flexible one' },
          { id: 'you', label: 'You, honestly' },
          { id: 'take-turns', label: 'It should take turns' },
          { id: 'never', label: 'Neither — we’d find another way' },
        ],
      },
      {
        kind: 'scale',
        id: 'ease',
        ask: 'How comfortable are you with that answer?',
        askAbout: 'How comfortable is {them}?',
        minLabel: 'Uneasy',
        maxLabel: 'Fine with it',
      },
    ],
  },
  {
    id: 'q-pace-of-change',
    category: 'future',
    renewable: true,
    prompt: 'How much do you want to change in the next year?',
    facets: [
      {
        kind: 'scale',
        id: 'appetite',
        ask: 'How much upheaval do you want?',
        askAbout: 'How much does {them} want?',
        minLabel: 'Keep it steady',
        maxLabel: 'Turn it over',
      },
      {
        kind: 'choice',
        id: 'where',
        ask: 'Where should the change come from?',
        askAbout: 'Where would {them} want it?',
        options: [
          { id: 'work', label: 'Work' },
          { id: 'place', label: 'Where we live' },
          { id: 'habits', label: 'How we spend our days' },
          { id: 'us', label: 'Us — how we are together' },
        ],
      },
    ],
  },
  {
    id: 'q-regret',
    category: 'future',
    renewable: false,
    prompt: 'What would you regret not having done?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'What is it?',
        askAbout: 'What is it for {them}?',
        options: [
          { id: 'seen', label: 'Somewhere I never got to' },
          { id: 'made', label: 'Something I never made' },
          { id: 'said', label: 'Something I never said to someone' },
          { id: 'risk', label: 'A risk I didn’t take' },
        ],
      },
      {
        kind: 'scale',
        id: 'pressing',
        ask: 'How much is it pressing on you?',
        askAbout: 'How much is it pressing on {them}?',
        minLabel: 'Idle thought',
        maxLabel: 'Feels urgent',
      },
    ],
  },
  {
    id: 'q-crisis',
    category: 'future',
    renewable: false,
    prompt: 'If something big went wrong tomorrow — money, health, family.',
    facets: [
      {
        kind: 'scale',
        id: 'confidence',
        ask: 'How well would we handle it?',
        askAbout: 'How well does {them} think we’d handle it?',
        minLabel: 'Badly',
        maxLabel: 'We’d be fine',
      },
      {
        kind: 'choice',
        id: 'weak-point',
        ask: 'Where would we struggle first?',
        askAbout: 'Where does {them} think we’d struggle?',
        options: [
          { id: 'money', label: 'Money' },
          { id: 'talking', label: 'Actually talking about it' },
          { id: 'blame', label: 'Not turning it on each other' },
          { id: 'help', label: 'Asking anyone for help' },
        ],
      },
    ],
  },
  {
    id: 'q-afraid-changes',
    category: 'future',
    renewable: false,
    prompt: 'What are you most afraid will change?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'Pick the closest.',
        askAbout: 'Pick the closest for {them}.',
        options: [
          { id: 'this', label: 'How easy this is right now' },
          { id: 'me', label: 'Who I am' },
          { id: 'health', label: 'Somebody’s health' },
          { id: 'nothing', label: 'Nothing, really — change is fine', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'weight',
        ask: 'How often does that thought turn up?',
        askAbout: 'How often for {them}?',
        minLabel: 'Rarely',
        maxLabel: 'Often',
      },
    ],
  },
  {
    id: 'q-next-milestone',
    category: 'future',
    renewable: true,
    prompt: 'The next thing you want to happen for us.',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'What’s next?',
        askAbout: 'What would {them} say?',
        options: [
          { id: 'trip', label: 'Go somewhere together' },
          { id: 'closer', label: 'Be physically closer, more of the time' },
          { id: 'commit', label: 'Make something more official' },
          { id: 'calm', label: 'Just a stretch where nothing’s hard' },
        ],
      },
      {
        kind: 'scale',
        id: 'soon',
        ask: 'How soon do you want it?',
        askAbout: 'How soon does {them} want it?',
        minLabel: 'No rush',
        maxLabel: 'Soon as possible',
      },
    ],
  },
  {
    id: 'q-one-year-home',
    category: 'future',
    renewable: false,
    prompt: 'Where is home a year from now?',
    facets: [
      {
        kind: 'scale',
        id: 'certainty',
        ask: 'How settled does that feel?',
        askAbout: 'How settled does it feel to {them}?',
        minLabel: 'Completely unknown',
        maxLabel: 'Decided',
      },
      {
        kind: 'choice',
        id: 'want',
        ask: 'What do you want it to be?',
        askAbout: 'What does {them} want it to be?',
        options: [
          { id: 'open', label: "I genuinely don't mind", neutral: true },
          { id: 'same', label: 'Exactly where we are' },
          { id: 'near', label: 'Same place, different home' },
          { id: 'far', label: 'Somewhere else entirely' },
        ],
      },
    ],
  },
  {
    id: 'q-children-honest',
    category: 'future',
    renewable: false,
    prompt: 'Children — where are you, honestly?',
    facets: [
      {
        kind: 'scale',
        id: 'certainty',
        ask: 'How settled is your answer?',
        askAbout: "How settled is {them}'s answer?",
        minLabel: 'Still working it out',
        maxLabel: 'Completely settled',
      },
      {
        kind: 'choice',
        id: 'where',
        ask: 'Which is closest?',
        askAbout: 'Which is closest for {them}?',
        options: [
          { id: 'unsure', label: 'Genuinely undecided', neutral: true },
          { id: 'yes', label: 'Yes, and soon' },
          { id: 'later', label: 'Yes, but not yet' },
          { id: 'no', label: 'No' },
        ],
      },
    ],
  },
  {
    id: 'q-stop-working',
    category: 'future',
    renewable: false,
    prompt: 'What does stopping work look like for you?',
    facets: [
      {
        kind: 'scale',
        id: 'urgency',
        ask: 'How much do you want it?',
        askAbout: 'How much does {them} want it?',
        minLabel: 'Never thought about it',
        maxLabel: 'Constantly',
      },
      {
        kind: 'choice',
        id: 'shape',
        ask: 'What would you do with it?',
        askAbout: 'What would {them} do with it?',
        options: [
          { id: 'unsure', label: 'No idea', neutral: true },
          { id: 'rest', label: 'Rest, properly' },
          { id: 'make', label: 'Make something' },
          { id: 'travel', label: 'Be somewhere else' },
        ],
      },
    ],
  },
  {
    id: 'q-future-scares',
    category: 'future',
    renewable: false,
    prompt: 'What about the future actually scares you?',
    facets: [
      {
        kind: 'scale',
        id: 'fear',
        ask: 'How much does it sit with you?',
        askAbout: 'How much does it sit with {them}?',
        minLabel: 'Barely',
        maxLabel: 'Often',
      },
      {
        kind: 'choice',
        id: 'what',
        ask: "What's the shape of it?",
        askAbout: "What's the shape of it for {them}?",
        options: [
          { id: 'none', label: 'Nothing much', neutral: true },
          { id: 'money', label: 'Not having enough' },
          { id: 'health', label: "Health \u2014 mine or someone's" },
          { id: 'alone', label: 'Ending up alone' },
        ],
      },
    ],
  },
]
