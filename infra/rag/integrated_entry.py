"""Restore the bundled, namespaced KB before starting the mTLS RAG service."""
from pathlib import Path
import hashlib
import json
import os
import sys
from neo4j import GraphDatabase

def restore_graph(index: Path, export: Path):
    manifest = json.loads((export / 'manifest.json').read_text(encoding='utf-8'))
    snapshot_bytes = (index / 'snapshot.json').read_bytes()
    cypher_bytes = (export / 'smartgym_six_kb.cypher').read_bytes()
    if hashlib.sha256(snapshot_bytes).hexdigest() != manifest['snapshot_sha256'] or hashlib.sha256(cypher_bytes).hexdigest() != manifest['cypher_sha256']:
        raise ValueError('KB reconstruction export hash mismatch')
    snapshot = json.loads(snapshot_bytes)
    if snapshot['version'] != manifest['kb_version']:
        raise ValueError('KB reconstruction version mismatch')
    statements = [line.strip() for line in cypher_bytes.decode('utf-8').splitlines() if line.strip() and not line.lstrip().startswith('//')]
    if not all(line.endswith(';') for line in statements):
        raise ValueError('Expected one complete Cypher statement per line')
    with GraphDatabase.driver(os.environ['NEO4J_URI'], auth=(os.environ['NEO4J_USER'], os.environ['NEO4J_PASSWORD'])) as driver:
        driver.verify_connectivity()
        with driver.session() as session:
            # Schema commands commit before the data transaction.
            schema = [s for s in statements if s.startswith('CREATE CONSTRAINT ')]
            for statement in schema: session.run(statement[:-1]).consume()
            def write(tx):
                for statement in statements:
                    if statement not in schema: tx.run(statement[:-1]).consume()
            session.execute_write(write)
            row = session.run('MATCH (n:SmartGymKB {kb_version:$v}) RETURN count(n) AS n', v=snapshot['version']).single()
            edges = session.run('MATCH (a:SmartGymKB {kb_version:$v})-[r]->(b:SmartGymKB {kb_version:$v}) RETURN count(r) AS n', v=snapshot['version']).single()
            if row['n'] != manifest['nodes'] or edges['n'] != manifest['edges']:
                raise ValueError('Reconstructed graph does not match manifest counts')
    print('Restored KB', snapshot['version'], manifest['nodes'], 'nodes,', manifest['edges'], 'edges', flush=True)

if __name__ == '__main__':
    if os.getenv('KB_GRAPH_BACKEND') == 'neo4j':
        restore_graph(Path(os.environ['KB_INDEX_DIR']), Path('/kb-export'))
    os.execvp(sys.executable, [sys.executable, '-m', 'uvicorn', 'integrated_app:app', *sys.argv[1:]])
