import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const api = JSON.parse(await readFile(new URL('docs/api/openapi.yaml', root), 'utf8'));
const names = new Set(['Jwks', 'Problem', 'WorkoutPlanCreate', 'WorkoutPlan', 'WorkoutPlanPage', 'ExerciseRefBatch', 'ExerciseRefList',
  'WorkoutScheduleCreate', 'WorkoutSchedule', 'WorkoutSchedulePage', 'WorkoutOccurrence', 'WorkoutOccurrencePage', 'WorkoutOccurrenceChange']);
for (const name of names) for (const match of JSON.stringify(api.components.schemas[name]).matchAll(/#\/components\/schemas\/(\w+)/g)) names.add(match[1]);
const content = JSON.stringify({ $id: 'workout-contract', components: { schemas: Object.fromEntries([...names].map(name => [name, api.components.schemas[name]])) } }, null, 2) + '\n';
const target = new URL('backend/services/workout/data/contracts.json', root);
const eventContent = await readFile(new URL('docs/api/events.yaml', root), 'utf8');
const eventTarget = new URL('backend/services/workout/data/events.json', root);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')).replaceAll('\r\n', '\n') !== content) throw new Error('Stale Workout contracts');
  if ((await readFile(eventTarget, 'utf8')).replaceAll('\r\n', '\n') !== eventContent.replaceAll('\r\n', '\n')) throw new Error('Stale Workout events');
  console.log('Workout schemas match OpenAPI');
} else { await writeFile(target, content); await writeFile(eventTarget, eventContent); }
