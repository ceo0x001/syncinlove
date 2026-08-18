import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { loadHome } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/**
 * The share card.
 *
 * The only thing that leaves the app, and the only growth loop it has. So what
 * it contains is a deliberate, narrow list:
 *
 *   the sync percentage · the streak · two first names
 *
 * and nothing else, ever. No question, no answers, and — once Phase 3 lands — no
 * menu. This card gets screenshotted into group chats; anything on it is public
 * forever.
 *
 * Auth-gated: you can only render a card for a reveal you are part of. That
 * means it can't be used as an OG image for link unfurls, which is fine, because
 * it isn't a link preview — it's an image people save and post.
 */

export const runtime = 'nodejs'

const SIZE = { width: 1080, height: 1350 } // 4:5, the shape that fills a phone feed

let fontCache: { serif: Buffer; sans: Buffer; sansSemi: Buffer } | null = null
let logoCache: string | null = null

async function fonts() {
  if (fontCache) return fontCache

  const dir = path.join(process.cwd(), 'src/lib/og/fonts')
  const [serif, sans, sansSemi] = await Promise.all([
    readFile(path.join(dir, 'InstrumentSerif-Regular.ttf')),
    readFile(path.join(dir, 'Inter-Regular.ttf')),
    readFile(path.join(dir, 'Inter-SemiBold.ttf')),
  ])

  fontCache = { serif, sans, sansSemi }
  return fontCache
}

/**
 * The real lockup, inlined as a data URI.
 *
 * Inlined rather than fetched so rendering a card never depends on a network
 * round trip back to our own origin — which would also have to carry the
 * caller's cookies to get through. A card-sized copy, not the full-resolution
 * asset, because the original is heavier than the finished PNG.
 */
async function logoDataUri(): Promise<string> {
  if (logoCache) return logoCache
  const file = await readFile(path.join(process.cwd(), 'src/lib/og/synclogo-card.png'))
  logoCache = `data:image/png;base64,${file.toString('base64')}`
  return logoCache
}

/** "Ada" → "A". For anyone who doesn't want their name on a shared image. */
function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dayIndex: string }> },
) {
  const { dayIndex: raw } = await params
  const dayIndex = Number(raw)

  if (!Number.isInteger(dayIndex) || dayIndex < 0) {
    return new Response('Not found', { status: 404 })
  }

  const home = await loadHome()
  if (!home?.pair || !home.me.firstName) {
    return new Response('Not signed in', { status: 401 })
  }

  const supabase = await createClient()
  const { data: reveal } = await supabase
    .from('reveals')
    .select('sync_score')
    .eq('pair_id', home.pair.id)
    .eq('day_index', dayIndex)
    .maybeSingle()

  // RLS already scopes this to the caller's pair, so a missing row means either
  // no reveal or not theirs. Same answer either way.
  if (!reveal) return new Response('Not found', { status: 404 })

  // ?initials=1 swaps both names for single letters.
  const useInitials = new URL(request.url).searchParams.get('initials') === '1'
  const mine = useInitials ? initial(home.me.firstName) : home.me.firstName
  const theirs = useInitials
    ? initial(home.partner?.firstName ?? '?')
    : (home.partner?.firstName ?? '—')

  const streak = home.streak
  const [{ serif, sans, sansSemi }, logo] = await Promise.all([fonts(), logoDataUri()])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          background: '#FFFCFA',
          fontFamily: 'Inter',
          /*
            Room for the footer, which is absolutely positioned and therefore invisible
            to justifyContent.

            Without it the stack centres on the full 1350 as though nothing were pinned
            below, and the measurements say what that costs: 230px of space above the
            logo against 55px under the invitation. The composition was bottom-heavy by
            175px — the kind of thing that reads as "slightly off" without anyone being
            able to say why.

            Reserving the footer's own height plus its offset makes the centring honest:
            the stack is centred in the space it actually occupies.

            240 rather than the footer's exact height, on purpose. A composition centred
            geometrically reads as sitting low, because the eye places the centre of a
            frame slightly above the middle. The measured result is 110 above and 89
            below — a shade top-heavy by the ruler, level to the eye.
          */
          paddingBottom: 240,
        }}
      >
        {/* The brand gradient as three soft pools, same as the app's page wash.
            Satori has no radial-gradient support, so these are blurred blocks. */}
        <div
          style={{
            position: 'absolute',
            top: -260,
            left: -200,
            width: 760,
            height: 760,
            borderRadius: 999,
            background: '#F43F8E',
            opacity: 0.16,
            filter: 'blur(120px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -220,
            right: -220,
            width: 720,
            height: 720,
            borderRadius: 999,
            background: '#FF8A3D',
            opacity: 0.16,
            filter: 'blur(120px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -300,
            left: 180,
            width: 780,
            height: 780,
            borderRadius: 999,
            background: '#FF6B6B',
            opacity: 0.13,
            filter: 'blur(130px)',
          }}
        />

        {/*
            marginLeft nudges the lockup back onto the same axis as everything else.

            Measured, not guessed: the ink in this bitmap spans x 362–694, centring on
            528 while the score, the names, the streak and the footer all centre on 540.
            The IMG is centred correctly — the artwork inside it is not, so the whole
            card had one element hanging 12px to the left. A flex item's margin is part
            of its box, so 24 here moves the content 12.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders
            this to a bitmap server-side; next/image has no meaning here. */}
        <img
          src={logo}
          alt="SyncinLove"
          width={359}
          height={156}
          style={{ marginBottom: 64, marginLeft: 24 }}
        />

        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#5B6478',
            fontFamily: 'InterSemi',
          }}
        >
          Today, together
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            fontFamily: 'Instrument Serif',
            color: '#0F172A',
            lineHeight: 1,
            marginTop: 18,
          }}
        >
          <span style={{ fontSize: 380 }}>{reveal.sync_score}</span>
          {/*
              The negative margin is what centres the NUMBER rather than the lockup.

              With the % inside the centred box, the box centred and the numeral did not:
              measured at 41–45px left of the card's axis at every score — 9, 75 and 100
              alike, because the % is a constant 68px wide. The one thing the card is
              about was the one thing off centre, consistently, and it never looked wrong
              enough to notice.

              Discounting exactly the %'s own width leaves the numeral 10px left of the
              geometric centre with the % hanging right, and that residual is the point
              rather than an error: the % still has mass, so a perfectly centred numeral
              would read right-heavy. Ten pixels of counterweight against a mark that is
              a third the height and a lighter grey puts the optical centre on the axis.
          */}
          <span
            style={{ fontSize: 130, color: '#5B6478', marginTop: 46, marginRight: -68 }}
          >
            %
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'Instrument Serif',
            fontSize: 76,
            color: '#0F172A',
            marginTop: 44,
          }}
        >
          {mine} &amp; {theirs}
        </div>

        {streak > 0 ? (
          <div
            style={{
              display: 'flex',
              marginTop: 40,
              paddingLeft: 34,
              paddingRight: 34,
              paddingTop: 16,
              paddingBottom: 16,
              borderRadius: 999,
              background: '#FFF3F0',
              color: '#0F172A',
              fontSize: 30,
              fontFamily: 'InterSemi',
            }}
          >
            {streak} day{streak === 1 ? '' : 's'} running
          </div>
        ) : null}

        {/*
            The invitation, and the only piece of this card addressed to whoever
            it gets shared WITH rather than to the couple who made it.

            Kept to two quiet lines at the foot, below everything else, because
            the card has to remain something a couple is happy to post. A score
            and two names is a nice thing to share; an advertisement is not, and
            an ad wearing a couple's evening as a costume is worse. So it stays
            small, stays last, and does not touch the score, the names or the
            streak — the arrangement above this is unchanged.

            Absolutely positioned as one block, so adding it moves nothing that
            was already on the card.
        */}
        <div
          style={{
            position: 'absolute',
            bottom: 88,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Instrument Serif',
              fontSize: 38,
              color: '#5B6478',
            }}
          >
            How well do you know your person?
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 18,
            }}
          >
            <span style={{ fontFamily: 'InterSemi', fontSize: 30, color: '#0F172A' }}>
              Challenge your person
            </span>

            {/*
                Drawn rather than typed.

                An arrow character would depend on U+2192 existing in Inter at the
                weight embedded here, and a missing glyph in Satori is a blank box
                on an image that gets posted publicly — silent, and only visible
                once somebody has already shared it. An inline SVG cannot go
                missing.
            */}
            <svg
              width="54"
              height="20"
              viewBox="0 0 54 20"
              fill="none"
              style={{ marginLeft: 20, marginRight: 20 }}
            >
              <path
                d="M2 10 H48 M40 3 L49 10 L40 17"
                stroke="#FF6B6B"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/*
                Darkened from #97A0B0 to the muted tone already used for "Today,
                together" — an existing colour on this card, not a new one.

                It was the faintest text here when nothing pointed at it, which was
                right. Now an arrow leads the eye to it, and a destination that is
                the weakest thing on the line is the wrong end of the gesture. It
                also has to survive being screenshotted and recompressed by a
                messaging app, which is the only way anyone will ever see it.
            */}
            <span
              style={{
                fontFamily: 'InterSemi',
                fontSize: 28,
                letterSpacing: 3,
                color: '#5B6478',
              }}
            >
              syncin.love
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: [
        { name: 'Instrument Serif', data: serif, style: 'normal', weight: 400 },
        { name: 'Inter', data: sans, style: 'normal', weight: 400 },
        { name: 'InterSemi', data: sansSemi, style: 'normal', weight: 600 },
      ],
      headers: {
        // Private to one couple, so never cached by a CDN or shared proxy.
        'Cache-Control': 'private, no-store',
      },
    },
  )
}
