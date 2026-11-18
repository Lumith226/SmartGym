// First run: python -m kb_service.cli sync-neo4j
// Use the kb_version returned by /health, not a made-up version.
:param version => 'REPLACE_WITH_ACTUAL_KB_VERSION';

MATCH (e:SmartGymKB:Exercise)-[:HAS_CRITERION]->(t:SmartGymKB:TechniqueCriterion)
      -[:SUPPORTED_BY]->(c:SmartGymKB:Chunk)<-[:HAS_CHUNK]-(s:SmartGymKB:Source)
WHERE e.kb_version=$version
RETURN e,t,c,s LIMIT 50;

MATCH (e:SmartGymKB:Exercise {node_id:'PUSHUP'})-[:HAS_CRITERION]->(t)
      -[:SUPPORTED_BY]->(c)<-[:HAS_CHUNK]-(s)
WHERE e.kb_version=$version
RETURN e.node_id AS exercise,t.text_vi AS criterion,s.title AS source,
       c.pdf_page AS file_page,c.section AS section,c.text AS evidence,s.url AS url;

MATCH (n:SmartGymKB) WHERE n.kb_version=$version
RETURN labels(n) AS node_labels,count(n) AS quantity;
