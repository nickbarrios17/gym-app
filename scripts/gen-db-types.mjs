#!/usr/bin/env node
/**
 * Generador de tipos de RESPALDO para cuando `supabase gen types typescript --local` no está disponible
 * (necesita Docker). Lee el esquema `public` de un PostgreSQL con las migraciones aplicadas (vía psql)
 * y escribe packages/domain/src/db.types.ts con la misma forma que el generador oficial.
 *
 * Uso: PGHOST=… PGPORT=… PGUSER=postgres node scripts/gen-db-types.mjs
 * Preferible: npm run db:types (oficial) cuando Supabase local esté levantado.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sql = `
with cols as (
  select c.relname as rel, c.relkind as kind, a.attname as col, a.attnum as num,
         format_type(a.atttypid, null) as type, t.typcategory as cat, et.typname as elem,
         t.typname as tname, not a.attnotnull as nullable,
         (a.atthasdef or a.attidentity <> '') as has_default
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
  where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
),
fns as (
  select p.proname as name,
         coalesce(p.proargnames, '{}') as argnames,
         (select array_agg(t.typname order by o) from unnest(p.proargtypes::oid[]) with ordinality as x(oid, o)
          join pg_type t on t.oid = x.oid) as argtypes,
         p.pronargs as nargs, p.pronargdefaults as ndefaults,
         rt.typname as rettype, p.proretset as retset
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public' and p.prokind = 'f'
)
select json_build_object(
  'cols', (select json_agg(cols order by rel, num) from cols),
  'fns', (select json_agg(fns order by name) from fns)
);`;

const raw = execFileSync('psql', ['-X', '-At', '-c', sql], { encoding: 'utf8' });
const { cols, fns } = JSON.parse(raw);

const scalar = (typname) => {
  if (['int2', 'int4', 'int8', 'float4', 'float8', 'numeric'].includes(typname)) return 'number';
  if (typname === 'bool') return 'boolean';
  if (['json', 'jsonb'].includes(typname)) return 'Json';
  if (typname === 'void') return 'undefined';
  return 'string';
};
const tsType = (c) => (c.cat === 'A' ? `${scalar(c.elem)}[]` : scalar(c.tname));

const rels = {};
for (const c of cols) (rels[c.rel] ??= { kind: c.kind, cols: [] }).cols.push(c);

const block = (cs, mode) =>
  cs
    .map((c) => {
      const t = tsType(c) + (c.nullable ? ' | null' : '');
      const opt = mode === 'Update' || (mode === 'Insert' && (c.nullable || c.has_default)) ? '?' : '';
      return `          ${c.col}${opt}: ${t}`;
    })
    .join('\n');

const tables = Object.entries(rels).filter(([, r]) => r.kind === 'r');
const views = Object.entries(rels).filter(([, r]) => r.kind === 'v');

const tableTs = tables
  .map(
    ([name, r]) => `      ${name}: {
        Row: {
${block(r.cols, 'Row')}
        }
        Insert: {
${block(r.cols, 'Insert')}
        }
        Update: {
${block(r.cols, 'Update')}
        }
        Relationships: []
      }`,
  )
  .join('\n');

const viewTs = views
  .map(
    ([name, r]) => `      ${name}: {
        Row: {
${r.cols.map((c) => `          ${c.col}: ${tsType(c)} | null`).join('\n')}
        }
        Relationships: []
      }`,
  )
  .join('\n');

const fnTs = (fns ?? [])
  .map((f) => {
    const firstDefault = f.nargs - f.ndefaults;
    const args = (f.argtypes ?? [])
      .map((t, i) => {
        const isArray = t.startsWith('_');
        const base = scalar(isArray ? t.slice(1) : t) + (isArray ? '[]' : '');
        return `          ${f.argnames[i]}${i >= firstDefault ? '?' : ''}: ${base}`;
      })
      .join('\n');
    return `      ${f.name}: {
        Args: ${args ? `{\n${args}\n        }` : 'Record<PropertyKey, never>'}
        Returns: ${scalar(f.rettype)}${f.retset ? '[]' : ''}
      }`;
  })
  .join('\n');

const out = `// ARCHIVO GENERADO — no editar a mano.
// Generado por scripts/gen-db-types.mjs a partir del esquema real (migraciones aplicadas en PostgreSQL local).
// Cuando Supabase local esté disponible, regenerar con el generador oficial: \`npm run db:types\`.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
${tableTs}
    }
    Views: {
${viewTs}
    }
    Functions: {
${fnTs}
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type Views<T extends keyof Database['public']['Views']> = Database['public']['Views'][T]['Row']
`;

const target = fileURLToPath(new URL('../packages/domain/src/db.types.ts', import.meta.url));
writeFileSync(target, out);
console.log(`db.types.ts: ${tables.length} tablas, ${views.length} vistas, ${(fns ?? []).length} funciones`);
