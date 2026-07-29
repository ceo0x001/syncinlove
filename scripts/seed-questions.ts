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
import { QUESTIONS, SEQUENCE } from '../src/lib/questions/bank'

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '../supabase/seed/questions.sql')

/** Postgres string literal. Doubling the quote is the whole job. */
function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

const position = new Map(SEQUENCE.map((id, index) => [id, index]))

// Fail loudly here rather than shipping a bank the database will reject.
for (const id of SEQUENCE) {
  if (!QUESTIONS.some((q) => q.id === id)) {
    throw new Error(`SEQUENCE references unknown question "${id}"`)
  }
}
for (const q of QUESTIONS) {
  if (!position.has(q.id)) {
    throw new Error(`Question "${q.id}" is not in SEQUENCE, so no pair would ever see it`)
  }
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
    `${sqlString(JSON.stringify(facets))}::jsonb, ${position.get(q.id)}, ${q.renewable})`
  )
})

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

-- Cleared first so reordering the rotation can't transiently collide with the
-- unique index on sequence_position.
update public.questions set sequence_position = null;

insert into public.questions (id, category, prompt, facets, sequence_position, renewable) values
${rows.join(',\n')}
on conflict (id) do update set
  category          = excluded.category,
  prompt            = excluded.prompt,
  facets            = excluded.facets,
  sequence_position = excluded.sequence_position,
  renewable         = excluded.renewable;

commit;

-- Sanity check. Expect ${QUESTIONS.length}.
select count(*) as questions_in_rotation
from public.questions
where sequence_position is not null;
`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, sql)

console.log(`Wrote ${QUESTIONS.length} questions to supabase/seed/questions.sql`)
