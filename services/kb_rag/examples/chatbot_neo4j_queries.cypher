// Run artifacts/chatbot/neo4j_import.cypher first (or the export script --apply).
// Input -> retrieved evidence -> output, including the original source.
MATCH p=(q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput)-[:CITES]->(c:SmartGymKB:Chunk)<-[:HAS_CHUNK]-(s:Source)
WHERE q.suite='smartgym-chatbot-v1'
RETURN p LIMIT 60;

// Four functions, readable input/output table. Knowledge cases may have no session.
MATCH (q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput)
WHERE q.suite='smartgym-chatbot-v1'
RETURN q.case AS example,q.task AS function,q.message AS input,a.reply AS output,
       a.status AS status,a.generation_mode AS generation_mode,a.kb_version AS kb_version;

// Why a predicted error retrieves a criterion, and where that criterion came from.
MATCH p=(q:SmartGymTrace:ChatInput)-[:HAS_OBSERVATION]->(o:Observation)-[:PREDICTS]->(l:SmartGymKB:ModelLabel)-[:RETRIEVES_CRITERION]->(t:TechniqueCriterion)-[:SUPPORTED_BY]->(c:Chunk)<-[:HAS_CHUNK]-(s:Source)
WHERE q.task='score' AND q.suite='smartgym-chatbot-v1'
RETURN p LIMIT 40;

// Book PDF evidence for anatomy Q&A. pdf_page is the 1-based file page.
MATCH (q:SmartGymTrace:ChatInput)-[:PRODUCED]->(a:ChatOutput)-[:CITES]->(c:SmartGymKB:Chunk)<-[:HAS_CHUNK]-(s:Source)
WHERE c.pdf_page IS NOT NULL AND q.suite='smartgym-chatbot-v1'
RETURN q.message AS input,a.reply AS output,s.title AS book,s.url AS url,c.pdf_page AS pdf_file_page,c.text AS supporting_text;

// Source inventory, with file hashes and URLs (including the textbook).
MATCH (s:SmartGymKB:Source)
RETURN s.kb_version,s.title,s.publisher,s.file,s.sha256,s.url;

// Repeated source imports do not produce new observations for habit detection.
MATCH (q:SmartGymTrace:ChatInput)-[:HAS_OBSERVATION]->(o:Observation)
WHERE q.suite='smartgym-chatbot-v1'
RETURN q.case,o.source_id,o.scope,o.usable,o.simulated,o.error_labels;
