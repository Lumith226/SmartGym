"""Reproducible structural/source audit and isolated update lifecycle exercise."""
import json,hashlib,sys,tempfile,copy
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.ingest import build_index,write_json
from kb_service.config import Settings
from kb_service.retrieval import Retriever
from kb_service.graph import NODE_TYPES,REL_TYPES

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    release=Settings.from_env().index_dir
    snap=json.loads((release/'snapshot.json').read_text(encoding='utf-8'))
    chunks={c['chunk_id']:c for c in snap['chunks']};nodes=snap['graph']['nodes'];edges=snap['graph']['edges']
    ids={n['id'] for n in nodes};sources={s['id']:s for s in snap['sources']}
    source_checks=[{'id':s['id'],'file':s['file'],'sha256_matches':digest(ROOT/'data/raw'/s['file'])==s['sha256'],
                    'chunks':s['chunks'],'format':s['format'],'role':s.get('source_role','external_reference'),
                    'ocr_pages':s['ocr_pages']} for s in sources.values()]
    anchors=[]
    for c in snap['claims']:
        clean=lambda x:' '.join(x.casefold().split())
        anchors.append({'id':c['id'],'matched':all(clean(c['anchor']) in clean(chunks[i]['text']) for i in c['chunk_ids']),
                        'same_source':all(chunks[i]['source_id']==c['source_id'] for i in c['chunk_ids']),
                        'domain_review_pending':'domain_review_pending' in c.get('review_status','')})
    vectors=json.loads((release/'embeddings.json').read_text(encoding='utf-8'))
    checks={'source_file_hashes':all(x['sha256_matches'] for x in source_checks),
       'exact_claim_anchors':all(x['matched'] and x['same_source'] for x in anchors),
       'unique_node_ids':len(ids)==len(nodes),'known_node_types':all(n['type'] in NODE_TYPES for n in nodes),
       'unique_edges':len({(e['from'],e['type'],e['to']) for e in edges})==len(edges),
       'known_relation_types':all(e['type'] in REL_TYPES for e in edges),
       'all_endpoints_exist':all(e['from'] in ids and e['to'] in ids for e in edges),
       'all_chunks_have_source':all(c['source_id'] in sources for c in chunks.values()),
       'all_source_occurrences_linked':all({'from':c['source_id'],'to':c['chunk_id'],'type':'HAS_CHUNK'} in edges for c in chunks.values()),
       'embedding_version_and_ids':vectors['kb_version']==snap['version'] and set(vectors['vectors'])==set(chunks)}
    label_coverage={code:{'labels':len(spec['labels']),'error_coverage':dict(Counter(l['coverage'] for l in spec['labels'] if l['kind']=='error'))}
                   for code,spec in snap['label_catalog']['exercises'].items()}
    lifecycle=[]
    # Tiny fabricated source only inside TemporaryDirectory. Never ingest this
    # fixture into the real KB; the purpose is update/stale/rollback mechanics.
    with tempfile.TemporaryDirectory(prefix='smartgym_update_audit_') as tmp:
        root=Path(tmp);(root/'data/raw').mkdir(parents=True)
        a={'id':'fixture_a','file':'a.txt','format':'txt','title':'Isolated fixture A','publisher':'TEST ONLY',
           'url':'https://example.invalid/a','exercise_codes':['SQUAT']}
        b={**a,'id':'fixture_b','file':'b.txt','title':'Isolated fixture B','url':'https://example.invalid/b'}
        (root/'data/raw/a.txt').write_text('Synthetic update fixture alpha. This is test data for release lifecycle, never exercise guidance. '*3,encoding='utf-8')
        (root/'data/raw/b.txt').write_text('Synthetic update fixture beta. This is test data for source withdrawal and stale-vector checks. '*3,encoding='utf-8')
        write_json(root/'sources.json',[a]);write_json(root/'claims.json',[])
        def build(name):
            idx=root/name;build_index(root,idx);return json.loads((idx/'snapshot.json').read_text(encoding='utf-8'))
        initial=build('v1');same=build('v1_repeat')
        lifecycle.append({'test':'deterministic_repeat','pass':initial['version']==same['version']})
        write_json(root/'sources.json',[{**a,'title':'Changed metadata only'}]);metadata=build('metadata')
        lifecycle.append({'test':'metadata_change_versions_release','pass':metadata['version']!=initial['version']})
        write_json(root/'sources.json',[a,b]);added=build('added')
        lifecycle.append({'test':'add_source_isolated','pass':len(added['sources'])==2 and added['version']!=initial['version']})
        (root/'data/raw/a.txt').write_text('Revised synthetic alpha fixture with new content and new stable chunk identifiers for update testing. '*3,encoding='utf-8')
        modified=build('modified');old_ids={c['chunk_id'] for c in added['chunks'] if c['source_id']=='fixture_a'}
        new_ids={c['chunk_id'] for c in modified['chunks'] if c['source_id']=='fixture_a'}
        lifecycle.append({'test':'edited_content_replaces_chunk_ids','pass':not old_ids.intersection(new_ids) and modified['version']!=added['version']})
        write_json(root/'sources.json',[b]);withdrawn=build('withdrawn')
        lifecycle.append({'test':'withdraw_source_removes_chunks_and_graph','pass':all(c['source_id']=='fixture_b' for c in withdrawn['chunks']) and not any(n['id']=='fixture_a' for n in withdrawn['graph']['nodes'])})
        write_json(root/'withdrawn/embeddings.json',{'kb_version':added['version'],'model':'test-embed','vectors':{}})
        settings=Settings(root/'withdrawn','lexical','ollama','http://127.0.0.1:11434','qwen3:8b','test-embed',120,'')
        lifecycle.append({'test':'stale_vectors_rejected','pass':Retriever(settings).dense_status=='stale_or_different_model'})
        write_json(root/'sources.json',[a]);(root/'data/raw/a.txt').write_text('Synthetic update fixture alpha. This is test data for release lifecycle, never exercise guidance. '*3,encoding='utf-8')
        rollback=build('rollback')
        lifecycle.append({'test':'rebuild_old_manifest_restores_version','pass':rollback['version']==initial['version']})
    result={'kb_version':snap['version'],'structural_checks':checks,'sources':source_checks,'claims':anchors,
            'model_label_coverage':label_coverage,'isolated_update_tests':lifecycle,
            'all_mechanical_checks_pass':all(checks.values()) and all(x['pass'] for x in lifecycle),
            'limits':['Anchor existence does not prove a paraphrase is scientifically correct.',
              'No independent domain expert has approved the current claims.',
              'Update fixtures are synthetic; not observations of real source disagreements.',
              'No automatic contradiction detector or fuzzy inference system is claimed.']}
    out=ROOT/'artifacts/six_exercises_20261117/releases'/snap['version']/'quality_audit.json'
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['sources','claims']},ensure_ascii=False,indent=2))
    if not result['all_mechanical_checks_pass']:raise SystemExit(1)

if __name__=='__main__':main()
