import { readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function prepareCatalog(sourceRoot, outputFile) {
  const source = await realpath(sourceRoot);
  const output = resolve(outputFile);
  const outputDirectory = await realpath(dirname(output));
  if (!outputDirectory.startsWith(resolve(projectRoot) + sep) || outputDirectory.startsWith(source + sep)) {
    throw new Error('Snapshot output must stay inside SmartGym_Web and outside source');
  }
  try {
    if ((await lstat(output)).isSymbolicLink()) throw new Error('Snapshot output cannot be a symbolic link');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const mappingFile = new URL('../backend/apps/catalog/data/taxonomy-mapping.json', import.meta.url);
  const mappingBytes = await readFile(mappingFile);
  const mapping = JSON.parse(mappingBytes.toString('utf8'));
  const catalogPath = resolve(source, 'exercise_catalog.json');
  const catalogBytes = await readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  const entries = [...catalog.exercises, ...catalog.camera_supplement];
  if (entries.length !== new Set(entries.map(item => item.id)).size) throw new Error('Duplicate source ID');
  if (Object.keys(mapping.exercises).length !== entries.length) throw new Error('Taxonomy/source coverage differs');
  const files = [{ path: 'exercise_catalog.json', sha256: hash(catalogBytes) }];
  const exercises = [];
  for (const entry of entries) {
    const file = await realpath(resolve(source, entry.wiki_path));
    if (!file.startsWith(source + sep)) throw new Error('Source path escapes Knowledge Base');
    const bytes = await readFile(file);
    const text = bytes.toString('utf8').replaceAll('\r\n', '\n');
    if (!text.startsWith('---\n') || !text.includes('\nid: ' + entry.id + '\n')) throw new Error('Front matter ID mismatch: ' + entry.id);
    const taxonomy = mapping.exercises[entry.id];
    if (!taxonomy) throw new Error('Missing taxonomy: ' + entry.id);
    const summary = text.split(/^# .+$/m)[1]?.trim().split('\n\n')[0];
    const stepsSection = text.split('## Cách thực hiện\n')[1]?.split(/\n## |\n\*\*Cách tính/)[0];
    const instructions = (stepsSection ?? '').split('\n').filter(line => /^\d+\. /.test(line)).map(line => line.replace(/^\d+\. /, ''));
    const errorSection = text.split('## Lỗi thường gặp và cách sửa\n')[1]?.split(/\n## /)[0] ?? '';
    const commonMistakes = [...errorSection.matchAll(/^### (.+)$/gm)].map(match => match[1]);
    if (!summary || !instructions.length) throw new Error('Unrecognized wiki sections: ' + entry.id);
    const needsClipCheck = ['side_plank', 'yoga_push_up', 'squat_kick', 'inchworm'].includes(entry.id);
    files.push({ path: relative(source, file).split(sep).join('/'), sha256: hash(bytes), exerciseId: entry.id, needsClipCheck });
    exercises.push({
      id: entry.id, slug: entry.id === 'bodyweight_squat' ? 'squat-khong-ta' : entry.id.replaceAll('_', '-'),
      nameVi: entry.name_vi, nameEn: entry.name_en, summary,
      primaryMuscleIds: taxonomy.primary, secondaryMuscleIds: taxonomy.secondary,
      equipmentIds: taxonomy.equipment ?? ['bodyweight'], instructions, commonMistakes,
      media: [], variants: [], publishedRevision: '',
    });
  }
  const digest = hash(JSON.stringify({ files, mapping: hash(mappingBytes) }));
  const revision = 'kb-m2-' + digest.slice(0, 20);
  for (const item of exercises) item.publishedRevision = revision;
  const snapshot = {
    revision, approval: 'development-only',
    source: {
      path: 'exercise_catalog.json + wiki/exercises + ' + mapping.version,
      sha256: digest, rights: 'Nguồn SmartGym và taxonomy phục vụ phát triển local. Quyền công bố, nội dung, phân nhóm và biến thể còn chờ duyệt. Không sao chép media.',
      files,
    },
    muscleGroups: mapping.muscleGroups, equipment: mapping.equipment, exercises,
  };
  const { validateSnapshot } = await import('../backend/apps/catalog/dist/import.js');
  validateSnapshot(snapshot);
  await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n');
  return snapshot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output) throw new Error('Usage: node scripts/prepare-catalog.mjs <knowledge-base-root> <output.json>');
  const snapshot = await prepareCatalog(source, output);
  console.log('Prepared ' + snapshot.exercises.length + ' exercises at revision ' + snapshot.revision);
}
