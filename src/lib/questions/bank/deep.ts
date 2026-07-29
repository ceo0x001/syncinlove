import type { Question } from '../types'

/** Needs, self-perception, and what somebody carries. */
export const DEEP: Question[] = [
  {
    id: 'q-need-more-of',
    category: 'deep',
    renewable: true,
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
    renewable: false,
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
    renewable: true,
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
    renewable: false,
    prompt: 'On your worst day, what do you need to hear?',
    facets: [
      {
        kind: 'choice',
        id: 'line',
        ask: 'Which one lands?',
        askAbout: 'Which one lands for {them}?',
        // "Nothing. Just stay." is not an opt-out — it's a specific answer about
        // preferring presence to words, so it scores like any other choice.
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
    renewable: true,
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
    renewable: false,
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
    renewable: false,
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
    renewable: true,
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
          { id: 'nothing', label: 'Nothing. It’s good.', neutral: true },
        ],
      },
    ],
  },
  {
    id: 'q-still-looking-for',
    category: 'deep',
    renewable: false,
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
    renewable: false,
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
          { id: 'nothing', label: 'Honestly — not much', neutral: true },
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
