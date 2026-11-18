import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function prepareComposeRagIndex(source, destination, registryFile, options = {}) {
  const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
  const approved = await readJson(options.approvedSourceFile || new URL('../infra/config/rag-sources.json', import.meta.url));
  const allowed = new Set(approved.map(item => item.id));
  const snapshot = await readJson(join(source, 'snapshot.json'));
  const dense = await readJson(join(source, 'embeddings.json'));
  if (options.preserveVersion) {
    if (snapshot.sources.length !== allowed.size || dense.kb_version !== snapshot.version ||
      snapshot.sources.some(s => !allowed.has(s.id) || !approved.find(a => a.id === s.id)?.allowedOrigins.includes(new URL(s.url).origin)) ||
      approved.some(s => s.rightsStatus !== 'APPROVED') ||
      snapshot.chunks.some(c => !Array.isArray(dense.vectors[c.chunk_id]) || dense.vectors[c.chunk_id].length !== dense.dimension) ||
      Object.keys(dense.vectors).length !== snapshot.chunks.length) {
      throw new Error('The complete versioned local release and source registry must match');
    }
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, 'snapshot.json'), await readFile(join(source, 'snapshot.json')));
    await writeFile(join(destination, 'embeddings.json'), await readFile(join(source, 'embeddings.json')));
    await writeFile(registryFile, JSON.stringify(approved));
    console.log('Preserved complete local RAG release:', snapshot.version, snapshot.chunks.length, 'chunks.');
    return;
  }
  const sources = snapshot.sources.filter(item => allowed.has(item.id));
  if (!sources.length || sources.length !== allowed.size || dense.kb_version !== snapshot.version) {
    throw new Error('The approved RAG sources and embeddings must match the handoff index');
  }
  for (const item of sources) {
    const row = approved.find(value => value.id === item.id);
    if (row.rightsStatus !== 'APPROVED' || !row.allowedOrigins.includes(new URL(item.url).origin)) {
      throw new Error('Unapproved source origin in the RAG index: ' + item.id);
    }
  }
  const chunks = snapshot.chunks.filter(chunk => allowed.has(chunk.source_id));
  const chunkIds = new Set(chunks.map(chunk => chunk.chunk_id));
  const claims = snapshot.claims.filter(claim => allowed.has(claim.source_id) && claim.chunk_ids.every(id => chunkIds.has(id)));
  const removed = new Set([
    ...snapshot.sources.filter(item => !allowed.has(item.id)).map(item => item.id),
    ...snapshot.chunks.filter(item => !chunkIds.has(item.chunk_id)).map(item => item.chunk_id),
    ...snapshot.claims.filter(item => !claims.includes(item)).map(item => item.id),
  ]);
  const nodes = snapshot.graph.nodes.filter(node => !removed.has(node.id));
  const ids = new Set(nodes.map(node => node.id));
  const edges = snapshot.graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to));
  const vectors = Object.fromEntries(chunks.map(chunk => {
    const vector = dense.vectors[chunk.chunk_id];
    if (!Array.isArray(vector) || vector.length !== dense.dimension) throw new Error('Missing approved chunk embedding');
    return [chunk.chunk_id, vector];
  }));
  const version = 'kb_local_' + createHash('sha256').update(JSON.stringify([snapshot.version, approved])).digest('hex').slice(0, 16);
  const report = { version, chunk_count: chunks.length, source_count: sources.length, graph_nodes: nodes.length, graph_edges: edges.length,
    note: 'Local academic corpus restricted to operator-approved sources.' };
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'snapshot.json'), JSON.stringify({ ...snapshot, version, sources, chunks, claims, graph: { nodes, edges }, report }));
  await writeFile(join(destination, 'embeddings.json'), JSON.stringify({ ...dense, kb_version: version, vectors }));
  await writeFile(registryFile, JSON.stringify(approved));
  console.log('Prepared approved RAG index:', sources.length, 'source(s),', chunks.length, 'chunks.');
}
