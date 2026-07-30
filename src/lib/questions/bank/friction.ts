import type { Question } from '../types'

/**
 * Friction.
 *
 * The gap the original bank left: nothing asked about what grates, or what the
 * two of you keep circling back to.
 *
 * Written under one hard rule — **never ask one partner to accuse the other.**
 * "What do I do that annoys you" is an accusation prompt, and an app that mails
 * one of those out every few weeks is a fight generator with a subscription.
 *
 * So these ask about the *dynamic* ("when it goes wrong, what's underneath")
 * or about *yourself* ("in an argument, what do you actually do"). The mechanic
 * does the rest: both people answer and both guess, so the reveal shows whether
 * you even agree on what the recurring problem is — which is far more useful,
 * and far kinder, than a list of grievances.
 */
export const FRICTION: Question[] = [
  {
    id: 'q-argument-mode',
    category: 'friction',
    renewable: false,
    prompt: 'In the middle of an argument, what do you actually do?',
    facets: [
      {
        kind: 'choice',
        id: 'mode',
        ask: 'Be honest about yourself.',
        askAbout: 'What does {them} do?',
        options: [
          { id: 'shut-down', label: 'Go quiet and shut down' },
          { id: 'louder', label: 'Get louder' },
          { id: 'logical', label: 'Turn cold and logical' },
          { id: 'leave', label: 'Need to physically leave' },
        ],
      },
      {
        kind: 'scale',
        id: 'recovery',
        ask: 'How long before you can talk properly again?',
        askAbout: 'How long does {them} need?',
        minLabel: 'Minutes',
        maxLabel: 'Days',
      },
    ],
  },
  {
    id: 'q-underneath',
    category: 'friction',
    renewable: true,
    prompt: 'When it goes wrong between us, what’s usually underneath it?',
    facets: [
      {
        kind: 'choice',
        id: 'root',
        ask: 'Pick the one that’s most often true.',
        askAbout: 'What would {them} say?',
        options: [
          { id: 'unheard', label: 'One of us not feeling heard' },
          { id: 'tired', label: 'We’re both just tired' },
          { id: 'unfair', label: 'Something feels unfair' },
          { id: 'old', label: 'Something older than this argument' },
        ],
      },
      {
        kind: 'scale',
        id: 'frequency',
        ask: 'How often does it come up?',
        askAbout: 'How often would {them} say it comes up?',
        minLabel: 'Rarely',
        maxLabel: 'Same thing every time',
      },
    ],
  },
  {
    id: 'q-after-a-fight',
    category: 'friction',
    renewable: false,
    prompt: 'Straight after a fight, what do you need first?',
    facets: [
      {
        kind: 'choice',
        id: 'need',
        ask: 'What do you need?',
        askAbout: 'What does {them} need?',
        options: [
          { id: 'space', label: 'To be left alone for a bit' },
          { id: 'contact', label: 'To be touched, before any talking' },
          { id: 'resolve', label: 'To finish it properly, now' },
          { id: 'normal', label: 'To pretend it’s normal for an hour' },
        ],
      },
      {
        kind: 'scale',
        id: 'apology',
        ask: 'How much does an apology matter to you?',
        askAbout: 'How much does it matter to {them}?',
        minLabel: 'Barely',
        maxLabel: 'It’s the whole thing',
      },
    ],
  },
  {
    id: 'q-who-folds',
    category: 'friction',
    renewable: false,
    prompt: 'Who tends to fold first?',
    facets: [
      {
        kind: 'choice',
        id: 'who',
        ask: 'Who is it, honestly?',
        askAbout: 'Who would {them} say?',
        options: [
          { id: 'me', label: 'Me, most of the time' },
          { id: 'you', label: 'You, most of the time' },
          { id: 'even', label: 'It’s fairly even' },
          { id: 'neither', label: 'Neither — it just fades', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'fairness',
        ask: 'How fair does that feel?',
        askAbout: 'How fair does it feel to {them}?',
        minLabel: 'Not at all',
        maxLabel: 'Completely',
      },
    ],
  },
  {
    id: 'q-short-with-you',
    category: 'friction',
    renewable: true,
    prompt: 'When I’m short with you, what do you assume?',
    facets: [
      {
        kind: 'choice',
        id: 'assumption',
        ask: 'Where does your mind go?',
        askAbout: 'Where does {them}’s mind go?',
        options: [
          { id: 'my-fault', label: 'That I’ve done something' },
          { id: 'their-day', label: 'That your day was bad' },
          { id: 'us', label: 'That something’s wrong with us' },
          { id: 'nothing', label: 'Nothing — I don’t read into it', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'sting',
        ask: 'How much does it sting?',
        askAbout: 'How much does it sting {them}?',
        minLabel: 'Rolls off',
        maxLabel: 'Sits with me all day',
      },
    ],
  },
  {
    id: 'q-unfair-share',
    category: 'friction',
    renewable: true,
    prompt: 'Something that isn’t split fairly right now.',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'What’s the imbalance?',
        askAbout: 'What would {them} point at?',
        options: [
          { id: 'chores', label: 'The practical stuff' },
          { id: 'planning', label: 'Who does the remembering and planning' },
          { id: 'emotional', label: 'Who holds the emotional weight' },
          { id: 'nothing', label: 'Nothing — it’s about even', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'bother',
        ask: 'How much has it built up?',
        askAbout: 'How built up is it for {them}?',
        minLabel: 'Hardly noticed',
        maxLabel: 'Been counting',
      },
    ],
  },
  {
    id: 'q-ends-it',
    category: 'friction',
    renewable: false,
    prompt: 'What actually ends an argument for you?',
    facets: [
      {
        kind: 'choice',
        id: 'ends',
        ask: 'What closes it?',
        askAbout: 'What closes it for {them}?',
        options: [
          { id: 'sorry', label: 'A real apology' },
          { id: 'understood', label: 'Being understood, even without one' },
          { id: 'change', label: 'Something actually changing' },
          { id: 'time', label: 'Just enough time passing' },
        ],
      },
      {
        kind: 'scale',
        id: 'lingering',
        ask: 'How much tends to be left over afterwards?',
        askAbout: 'How much is left over for {them}?',
        minLabel: 'Nothing, it’s done',
        maxLabel: 'Quite a lot',
      },
    ],
  },
  {
    id: 'q-wish-id-ask',
    category: 'friction',
    renewable: true,
    prompt: 'Something you wish I’d ask you about more.',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'What is it?',
        askAbout: 'What would {them} say?',
        options: [
          { id: 'work', label: 'How work is actually going' },
          { id: 'family', label: 'My family' },
          { id: 'body', label: 'How I’m feeling physically' },
          { id: 'nothing', label: 'Nothing — you ask plenty', neutral: true },
        ],
      },
      {
        kind: 'scale',
        id: 'missed',
        ask: 'How much do you notice it not being asked?',
        askAbout: 'How much does {them} notice?',
        minLabel: 'Not really',
        maxLabel: 'Every time',
      },
    ],
  },
  {
    id: 'q-made-peace',
    category: 'friction',
    renewable: false,
    prompt: 'Something small of mine you’ve stopped minding.',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'Pick the closest.',
        askAbout: 'What would {them} pick?',
        options: [
          { id: 'mess', label: 'How I leave things lying around' },
          { id: 'time', label: 'How I am with time' },
          { id: 'phone', label: 'How much I’m on my phone' },
          { id: 'talking', label: 'How much — or little — I talk' },
        ],
      },
      {
        kind: 'scale',
        id: 'peace',
        ask: 'How settled are you about it now?',
        askAbout: 'How settled is {them} about it?',
        minLabel: 'Still grates',
        maxLabel: 'Genuinely fine',
      },
    ],
  },
  {
    id: 'q-hardest-week',
    category: 'friction',
    renewable: true,
    prompt: 'The thing most likely to make you snap this week.',
    facets: [
      {
        kind: 'choice',
        id: 'trigger',
        ask: 'What’s loaded?',
        askAbout: 'What’s loaded for {them}?',
        options: [
          { id: 'work', label: 'Something at work' },
          { id: 'money', label: 'Money' },
          { id: 'people', label: 'Someone else entirely' },
          { id: 'tired', label: 'Just being this tired' },
        ],
      },
      {
        kind: 'scale',
        id: 'fuse',
        ask: 'How short is the fuse right now?',
        askAbout: 'How short is {them}’s fuse?',
        minLabel: 'Long',
        maxLabel: 'Very short',
      },
    ],
  },
  {
    id: 'q-repeat-argument',
    category: 'friction',
    renewable: false,
    prompt: 'What argument do the two of you keep having?',
    facets: [
      {
        kind: 'scale',
        id: 'frequency',
        ask: 'How often does it come back?',
        askAbout: 'How often does {them} think it comes back?',
        minLabel: 'Almost never',
        maxLabel: 'Over and over',
      },
      {
        kind: 'choice',
        id: 'root',
        ask: "What's it really about?",
        askAbout: "What does {them} think it's really about?",
        options: [
          { id: 'nothing', label: "We don't have one", neutral: true },
          { id: 'effort', label: 'Who does more' },
          { id: 'attention', label: 'Feeling unheard' },
          { id: 'money', label: 'Money' },
        ],
      },
    ],
  },
  {
    id: 'q-tone',
    category: 'friction',
    renewable: false,
    prompt: 'What does tone do to you?',
    facets: [
      {
        kind: 'scale',
        id: 'sensitivity',
        ask: 'How much does tone land on you?',
        askAbout: 'How much does tone land on {them}?',
        minLabel: 'Barely notice',
        maxLabel: 'Hits harder than words',
      },
      {
        kind: 'choice',
        id: 'yours',
        ask: 'What happens when yours slips?',
        askAbout: "What happens when {them}'s slips?",
        options: [
          { id: 'rarely', label: 'It rarely does', neutral: true },
          { id: 'own', label: 'I own it quickly' },
          { id: 'defend', label: 'I get defensive' },
          { id: 'quiet', label: 'I go quiet' },
        ],
      },
    ],
  },
  {
    id: 'q-keep-score',
    category: 'friction',
    renewable: false,
    prompt: 'Do you keep score?',
    facets: [
      {
        kind: 'scale',
        id: 'score',
        ask: 'How much of a tally do you keep?',
        askAbout: 'How much of a tally does {them} keep?',
        minLabel: 'None at all',
        maxLabel: 'A detailed one',
      },
      {
        kind: 'choice',
        id: 'about',
        ask: 'Score about what?',
        askAbout: 'About what, for {them}?',
        options: [
          { id: 'nothing', label: "I really don't", neutral: true },
          { id: 'chores', label: 'Who did what at home' },
          { id: 'effort', label: 'Who tries harder' },
          { id: 'past', label: 'Old things not resolved' },
        ],
      },
    ],
  },
  {
    id: 'q-interrupted',
    category: 'friction',
    renewable: false,
    prompt: 'What happens when you get interrupted?',
    facets: [
      {
        kind: 'scale',
        id: 'bother',
        ask: 'How much does it bother you?',
        askAbout: 'How much does it bother {them}?',
        minLabel: 'Not at all',
        maxLabel: 'A lot',
      },
      {
        kind: 'choice',
        id: 'do',
        ask: 'What do you do?',
        askAbout: 'What does {them} do?',
        options: [
          { id: 'nothing', label: 'Nothing, I let it go', neutral: true },
          { id: 'stop', label: 'I stop talking entirely' },
          { id: 'louder', label: 'I talk over it' },
          { id: 'later', label: 'I bring it up later' },
        ],
      },
    ],
  },
]
