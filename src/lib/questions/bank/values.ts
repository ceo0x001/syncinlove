import type { Question } from '../types'

/**
 * Values, behaviour, dealbreakers, goals.
 *
 * The category that does the heaviest lifting for the product's actual claim —
 * "find out if they really know you". Light questions build the habit and desire
 * questions build heat, but this is where a couple discovers whether they have
 * been assuming the same thing for a year.
 *
 * Written so a mismatch is informative rather than damning. "How would you split
 * an inheritance" has no right answer; the value is in one person finding out
 * their partner assumed something different. Anything phrased so one option is
 * obviously correct teaches nobody anything, because everyone picks it.
 *
 * Mostly NOT renewable. What you'd do if a friend crossed a line is a trait, and
 * asking it twice wastes a day. The ones about goals renew, because a two-year
 * plan at 26 is not the plan at 28.
 */
export const VALUES: Question[] = [
  {
    id: 'q-dealbreaker-real',
    category: 'values',
    renewable: false,
    prompt: 'What would actually end this?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'The one you couldn’t come back from.',
        askAbout: 'Which one couldn’t {them} come back from?',
        options: [
          { id: 'lying', label: 'Being lied to about something that mattered' },
          { id: 'cheating', label: 'Sleeping with somebody else' },
          { id: 'contempt', label: 'Being talked down to, repeatedly' },
          { id: 'checked-out', label: 'Them going numb and staying there' },
        ],
      },
      {
        kind: 'scale',
        id: 'absolute',
        ask: 'How absolute is that, honestly?',
        askAbout: 'How absolute is it for {them}?',
        minLabel: 'Depends',
        maxLabel: 'No route back',
      },
    ],
  },
  {
    id: 'q-money-instinct',
    category: 'values',
    renewable: false,
    prompt: 'Money arrives unexpectedly. What’s your first instinct?',
    facets: [
      {
        kind: 'choice',
        id: 'instinct',
        ask: 'Before you think about it.',
        askAbout: 'What’s {them}’s first instinct?',
        options: [
          { id: 'save', label: 'Put it away and don’t touch it' },
          { id: 'clear', label: 'Clear something owed' },
          { id: 'spend', label: 'Spend some of it now, properly' },
          { id: 'give', label: 'Give some of it to somebody who needs it' },
        ],
      },
      {
        kind: 'scale',
        id: 'tight',
        ask: 'How tightly do you hold money in general?',
        askAbout: 'How tightly does {them} hold it?',
        minLabel: 'Open hand',
        maxLabel: 'Closed fist',
      },
    ],
  },
  {
    id: 'q-friend-crossed',
    category: 'values',
    renewable: false,
    prompt: 'A close friend of yours disrespects me. What happens?',
    facets: [
      {
        kind: 'choice',
        id: 'response',
        ask: 'What do you actually do?',
        askAbout: 'What would {them} actually do?',
        options: [
          { id: 'immediate', label: 'Say something there and then' },
          { id: 'later', label: 'Take it up with them privately after' },
          { id: 'distance', label: 'Quietly see less of them' },
          { id: 'nothing', label: 'Let it go — they didn’t mean it' },
        ],
      },
      {
        kind: 'scale',
        id: 'loyalty',
        ask: 'When it comes to it, who gets the benefit of the doubt?',
        askAbout: 'Who gets it, for {them}?',
        minLabel: 'My friend',
        maxLabel: 'You, always',
      },
    ],
  },
  {
    id: 'q-apology-shape',
    category: 'values',
    renewable: false,
    prompt: 'What does a real apology have in it?',
    facets: [
      {
        kind: 'choice',
        id: 'shape',
        ask: 'The part that makes it count.',
        askAbout: 'Which part makes it count for {them}?',
        options: [
          { id: 'named', label: 'Naming exactly what they did' },
          { id: 'why', label: 'Understanding why it landed the way it did' },
          { id: 'changed', label: 'Something visibly different afterwards' },
          { id: 'said', label: 'Just hearing the words, meant' },
        ],
      },
      {
        kind: 'scale',
        id: 'grudge',
        ask: 'How long does it take you to actually let go?',
        askAbout: 'How long does it take {them}?',
        minLabel: 'Minutes',
        maxLabel: 'Weeks',
      },
    ],
  },
  {
    id: 'q-two-years',
    category: 'values',
    renewable: true,
    prompt: 'Two years out — what has to be different?',
    facets: [
      {
        kind: 'choice',
        id: 'area',
        ask: 'The one that would bother you most if nothing moved.',
        askAbout: 'Which would bother {them} most?',
        options: [
          { id: 'work', label: 'What I do all day' },
          { id: 'money', label: 'How much room money gives us' },
          { id: 'place', label: 'Where we live' },
          { id: 'us', label: 'How we are with each other' },
        ],
      },
      {
        kind: 'scale',
        id: 'urgency',
        ask: 'How restless are you about it right now?',
        askAbout: 'How restless is {them}?',
        minLabel: 'Patient',
        maxLabel: 'Itching',
      },
    ],
  },
  {
    id: 'q-conflict-style',
    category: 'values',
    renewable: false,
    prompt: 'Mid-argument, what do you do?',
    facets: [
      {
        kind: 'choice',
        id: 'move',
        ask: 'Your actual move, not the one you’d like it to be.',
        askAbout: 'What’s {them}’s actual move?',
        options: [
          { id: 'push', label: 'Push until it’s settled' },
          { id: 'withdraw', label: 'Go quiet and leave the room' },
          { id: 'concede', label: 'Give in to end it' },
          { id: 'sharpen', label: 'Get precise and a bit cutting' },
        ],
      },
      {
        kind: 'scale',
        id: 'repair',
        ask: 'How quickly do you want contact again afterwards?',
        askAbout: 'How quickly does {them} want it?',
        minLabel: 'Give me space',
        maxLabel: 'Hold me now',
      },
    ],
  },
  {
    id: 'q-family-pull',
    category: 'values',
    renewable: false,
    prompt: 'How much say should family have in our decisions?',
    facets: [
      {
        kind: 'choice',
        id: 'say',
        ask: 'Where do you land?',
        askAbout: 'Where does {them} land?',
        options: [
          { id: 'none', label: 'None. It’s ours' },
          { id: 'heard', label: 'Heard, then we decide' },
          { id: 'weight', label: 'Real weight — they know things' },
          { id: 'blessing', label: 'Some things need their blessing' },
        ],
      },
      {
        kind: 'scale',
        id: 'pressure',
        ask: 'How much pressure do you feel from yours?',
        askAbout: 'How much does {them} feel?',
        minLabel: 'None',
        maxLabel: 'Constant',
      },
    ],
  },
  {
    id: 'q-privacy-line',
    category: 'values',
    renewable: false,
    prompt: 'What’s allowed to stay private, even from me?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'The one you’d defend.',
        askAbout: 'Which would {them} defend?',
        options: [
          { id: 'phone', label: 'My phone' },
          { id: 'past', label: 'Details of who came before' },
          { id: 'therapy', label: 'What I work on privately' },
          { id: 'nothing', label: 'Nothing, genuinely' },
        ],
      },
      {
        kind: 'scale',
        id: 'open',
        ask: 'How open a book do you want us to be?',
        askAbout: 'How open does {them} want us?',
        minLabel: 'Some doors shut',
        maxLabel: 'Everything shared',
      },
    ],
  },
  {
    id: 'q-effort-fair',
    category: 'values',
    renewable: true,
    prompt: 'Right now, does the effort feel evenly split?',
    facets: [
      {
        kind: 'scale',
        id: 'balance',
        ask: 'Who’s carrying more this month?',
        askAbout: 'Who does {them} think is carrying more?',
        minLabel: 'Me, clearly',
        maxLabel: 'You, clearly',
      },
      {
        kind: 'choice',
        id: 'kind',
        ask: 'The kind of effort you mean.',
        askAbout: 'Which kind does {them} mean?',
        options: [
          { id: 'practical', label: 'The practical running of things' },
          { id: 'emotional', label: 'Holding the mood together' },
          { id: 'money', label: 'Bringing money in' },
          { id: 'initiating', label: 'Starting things — plans, sex, talks' },
        ],
      },
    ],
  },
  {
    id: 'q-lie-size',
    category: 'values',
    renewable: false,
    prompt: 'Which lie would you rather be told?',
    facets: [
      {
        kind: 'choice',
        id: 'which',
        ask: 'If it has to be one.',
        askAbout: 'Which would {them} rather?',
        options: [
          { id: 'kind', label: 'A kind one, to spare me' },
          { id: 'omission', label: 'Nothing said at all' },
          { id: 'none', label: 'Neither — tell me and let it hurt' },
        ],
      },
      {
        kind: 'scale',
        id: 'bluntness',
        ask: 'How blunt do you want me, as a rule?',
        askAbout: 'How blunt does {them} want you?',
        minLabel: 'Gently',
        maxLabel: 'Straight',
      },
    ],
  },
  {
    id: 'q-ambition-cost',
    category: 'values',
    renewable: true,
    prompt: 'What are you willing to sacrifice for what you want?',
    facets: [
      {
        kind: 'choice',
        id: 'cost',
        ask: 'What you’d actually give up.',
        askAbout: 'What would {them} actually give up?',
        options: [
          { id: 'time', label: 'Time together, for a while' },
          { id: 'comfort', label: 'Comfort and stability' },
          { id: 'place', label: 'Living where we live' },
          { id: 'nothing', label: 'Nothing that costs us' },
        ],
      },
      {
        kind: 'scale',
        id: 'drive',
        ask: 'How hard are you pushing at the moment?',
        askAbout: 'How hard is {them} pushing?',
        minLabel: 'Coasting',
        maxLabel: 'Flat out',
      },
    ],
  },
  {
    id: 'q-forgive-what',
    category: 'values',
    renewable: false,
    prompt: 'What do you find easiest to forgive?',
    facets: [
      {
        kind: 'choice',
        id: 'what',
        ask: 'The one that barely registers.',
        askAbout: 'Which barely registers for {them}?',
        options: [
          { id: 'careless', label: 'Carelessness — they weren’t thinking' },
          { id: 'temper', label: 'A temper, said and regretted' },
          { id: 'flake', label: 'Letting me down on plans' },
          { id: 'secret', label: 'Keeping something back out of fear' },
        ],
      },
      {
        kind: 'scale',
        id: 'second-chance',
        ask: 'How readily do you give a second chance?',
        askAbout: 'How readily does {them}?',
        minLabel: 'Rarely',
        maxLabel: 'Always',
      },
    ],
  },
]
