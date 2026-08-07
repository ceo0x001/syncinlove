/**
 * Generates supabase/seed/questions.sql from the TypeScript question bank.
 *
 * The bank needs to exist in two places: TypeScript renders it, and the
 * database scoring function needs to see facet kinds. Rather than maintain both
 * by hand and let them drift, src/lib/questions/bank.ts is the source of truth
 * and this emits the SQL.
 *
 *   npm run seed:questions
 *
 * Then paste supabase/seed/questions.sql into the Supabase SQL editor. Safe to
 * re-run: it upserts, so editing a prompt or reordering the rotation is one
 * regenerate away.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QUESTIONS, spiralFor, type Pace } from '../src/lib/questions/bank'

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '../supabase/seed/questions.sql')

/** Postgres string literal. Doubling the quote is the whole job. */
function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/*
 * Validation before anything is written.
 *
 * Fail here rather than emitting a file the database will accept and a couple will
 * suffer. A pace missing a question is a pace whose couples never see it, and nothing
 * in the schema catches that — question_order's unique constraints only catch a
 * duplicate within one regeneration.
 */
const PACES: Pace[] = ['gentle', 'standard', 'bold']

for (const pace of PACES) {
  const seq = spiralFor(pace)
  if (seq.length !== QUESTIONS.length || new Set(seq).size !== QUESTIONS.length) {
    throw new Error(`${pace} ordering is not a permutation of the bank`)
  }
  for (const id of seq) {
    if (!QUESTIONS.some((q) => q.id === id)) {
      throw new Error(`${pace} ordering references unknown question "${id}"`)
    }
  }
}

for (const q of QUESTIONS) {
  if (!q.facets.some((f) => f.kind === 'scale')) {
    throw new Error(`Question "${q.id}" has no scale facet — its score could only ever be 0/50/100`)
  }
}

const rows = QUESTIONS.map((q) => {
  const facets = q.facets.map((f) =>
    f.kind === 'choice'
      ? {
          kind: f.kind,
          id: f.id,
          // `neutral` travels with the option so the database scorer can
          // half-score a mutual non-answer without knowing the copy.
          options: f.options.map((o) =>
            o.neutral ? { id: o.id, neutral: true } : { id: o.id },
          ),
        }
      : { kind: f.kind, id: f.id },
  )

  return (
    `  (${sqlString(q.id)}, ${sqlString(q.category)}, ${sqlString(q.prompt)}, ` +
    `${sqlString(JSON.stringify(facets))}::jsonb, ${q.renewable})`
  )
})

/*
 * The three pace orderings.
 *
 * Emitted from the same spiralFor that TypeScript reads, so there is one author of
 * the order even though two places consume it. Regenerated wholesale rather than
 * diffed: the whole table is deleted and rewritten inside the transaction, which is
 * the only way a reorder cannot leave a stale row behind.
 */
const orderRows = PACES.flatMap((pace) =>
  spiralFor(pace).map(
    (id, index) => `  (${sqlString(pace)}, ${index}, ${sqlString(id)})`,
  ),
)

const sql = `-- ============================================================================
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

insert into public.questions (id, category, prompt, facets, renewable) values
${rows.join(',\n')}
on conflict (id) do update set
  category          = excluded.category,
  prompt            = excluded.prompt,
  facets            = excluded.facets,
  renewable         = excluded.renewable;

-- ----------------------------------------------------------------------------
-- The pace orderings
--
-- Deleted and rewritten rather than upserted. A reorder that left a stale row would
-- either serve a question twice or skip one, and both are silent — the unique
-- constraints only catch a duplicate within one regeneration.
--
-- Safe for pairs mid-rotation: what a couple has already been asked lives in
-- pair_days, not here, so reshaping the order only changes what comes next.
-- ----------------------------------------------------------------------------

delete from public.question_order;

insert into public.question_order (pace, position, question_id) values
${orderRows.join(',\n')};

commit;

-- Sanity check. Expect ${QUESTIONS.length} per pace.
select pace, count(*) as ordered, min(position) as first, max(position) as last
from public.question_order
group by pace
order by pace;
`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, sql)

console.log(
  `Wrote ${QUESTIONS.length} questions and ${orderRows.length} order rows ` +
    `(${PACES.length} paces) to supabase/seed/questions.sql`,
)
