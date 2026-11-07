import os
from neo4j import GraphDatabase
from .providers import ProviderError

NODE_TYPES={'Source','Exercise','Chunk','TechniqueCriterion','ModelLabel'}
REL_TYPES={'HAS_CHUNK','MENTIONS','HAS_CRITERION','SUPPORTED_BY','HAS_LABEL','RETRIEVES_CRITERION'}

def connection():
    return GraphDatabase.driver(os.getenv('NEO4J_URI','bolt://127.0.0.1:7687'),
        auth=(os.getenv('NEO4J_USER','neo4j'),os.getenv('NEO4J_PASSWORD','neo4j123')),
        connection_timeout=5)

def sync(snapshot: dict):
    """Add/update only namespaced SmartGym nodes; never clear someone else's graph."""
    version=snapshot['version']
    chunks={c['chunk_id']:c for c in snapshot['chunks']}
    sources={s['id']:s for s in snapshot['sources']}
    claims={c['id']:c for c in snapshot['claims']}
    with connection() as driver:
        driver.verify_connectivity()
        with driver.session() as session:
            session.run('CREATE CONSTRAINT smartgym_key IF NOT EXISTS FOR (n:SmartGymKB) REQUIRE n.key IS UNIQUE').consume()
            def write(tx):
                for node in snapshot['graph']['nodes']:
                    kind=node['type']
                    if kind not in NODE_TYPES: raise ValueError('Unsupported node type')
                    props={k:v for k,v in node.items() if v is not None}
                    props.update(kb_version=version,node_id=node['id'])
                    if kind=='Source':props.update({k:v for k,v in sources[node['id']].items() if k in ['title','publisher','url','file','sha256','license','attribution'] and v is not None})
                    if kind=='Chunk':props.update({k:v for k,v in chunks[node['id']].items() if v is not None})
                    if kind=='TechniqueCriterion':props['labels']=claims[node['id']].get('labels',[])
                    tx.run(f'MERGE (n:SmartGymKB:{kind} {{key:$key}}) SET n += $props',key=version+':'+node['id'],props=props).consume()
                for edge in snapshot['graph']['edges']:
                    rel=edge['type']
                    if rel not in REL_TYPES: raise ValueError('Unsupported relation type')
                    tx.run(f'MATCH (a:SmartGymKB {{key:$a}}), (b:SmartGymKB {{key:$b}}) MERGE (a)-[:{rel}]->(b)',a=version+':'+edge['from'],b=version+':'+edge['to']).consume()
            session.execute_write(write)
    return {'kb_version':version,'nodes':len(snapshot['graph']['nodes']),'edges':len(snapshot['graph']['edges'])}

def claim_support(version: str, exercise: str | None):
    try:
        with connection() as driver:
            with driver.session() as session:
                rows=session.run('''MATCH (e:SmartGymKB:Exercise)-[:HAS_CRITERION]->(t:SmartGymKB:TechniqueCriterion)-[:SUPPORTED_BY]->(c:SmartGymKB:Chunk)
                    WHERE e.kb_version=$version AND t.kb_version=$version AND c.kb_version=$version
                    AND ($exercise IS NULL OR e.node_id=$exercise)
                    RETURN t.node_id AS claim_id, collect(c.node_id) AS chunk_ids''',version=version,exercise=exercise)
                support={r['claim_id']:r['chunk_ids'] for r in rows}
                if not support:raise ProviderError('Neo4j has no criterion support for this KB version/exercise')
                return support
    except Exception as exc:
        raise ProviderError('Neo4j unavailable; using the same versioned local graph snapshot') from exc
