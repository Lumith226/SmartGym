from dataclasses import replace
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pypdf import PdfWriter
from kb_service.app import create_app
from kb_service.config import Settings
from kb_service.engine import Engine, with_attribution
from kb_service.ingest import build_index, read_json, write_json, sources, file_sha256, sha, extract_source
from kb_service.models import ChatRequest, Observation
from kb_service.providers import Generator, OllamaEmbedder, ProviderError
from kb_service.retrieval import Retriever

REAL_CLIENT=httpx.Client

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        (self.root/'data/raw').mkdir(parents=True)
        self.registry=[{'id':'push','title':'Push-up','publisher':'Test source','url':'https://example.org/push',
            'file':'push.html','format':'html','exercise_codes':['PUSHUP'],'selector':'ace_steps'},
            {'id':'squat','title':'Squat','publisher':'Test source','url':'https://example.org/squat',
            'file':'squat.txt','format':'txt','exercise_codes':['SQUAT']}]
        write_json(self.root/'sources.json',self.registry)
        write_json(self.root/'claims.json',[{'id':'hip_control','exercise_code':'PUSHUP','text_vi':'Chống đẩy giữ thân ổn định, tránh hông nâng cao.',
            'source_id':'push','anchor':'hips to hike upwards','labels':['HIP_TOO_HIGH']},
            {'id':'unsupported','exercise_code':'PUSHUP','text_vi':'This is never supported.','source_id':'push','anchor':'invented missing quote','labels':[]}])
        (self.root/'data/raw/push.html').write_text('<html><nav>BUY NOW advertisement</nav><main><h2>Step 1</h2><p>Keep a rigid torso and do not allow your hips to hike upwards when lowering the body towards the floor.</p><h2>Step 2</h2><p>Extend the arms while keeping your head aligned with your spine and maintaining control of the movement.</p></main></html>',encoding='utf-8')
        (self.root/'data/raw/squat.txt').write_text('Squat: maintain your back position and keep your knees aligned over your toes. Brace the core while lowering your hips.',encoding='utf-8')
        self.settings=replace(Settings.from_env(),index_dir=self.root/'data/index',llm_provider='disabled',retrieval_mode='hybrid',internal_token='')
        build_index(self.root)
    def tearDown(self): self.temp.cleanup()
    def test_citation_provenance_and_navigation_removed(self):
        snap=read_json(self.settings.index_dir/'snapshot.json')
        push=[c for c in snap['chunks'] if c['source_id']=='push']
        self.assertEqual(len(push),2)
        self.assertEqual(push[0]['section'],'Step 1')
        self.assertFalse(any('BUY NOW' in c['text'] for c in push))
        self.assertEqual(push[0]['url'],'https://example.org/push')
    def test_graph_only_contains_supported_claims(self):
        snap=read_json(self.settings.index_dir/'snapshot.json')
        self.assertEqual([c['id'] for c in snap['claims']],['hip_control'])
        self.assertIn('unsupported',snap['report']['unsupported_claims_not_published'])
        ids={n['id'] for n in snap['graph']['nodes']}
        self.assertTrue(all(e['from'] in ids and e['to'] in ids for e in snap['graph']['edges']))
    def test_version_and_chunk_ids_stable_across_reingest(self):
        a=read_json(self.settings.index_dir/'snapshot.json')
        build_index(self.root)
        b=read_json(self.settings.index_dir/'snapshot.json')
        self.assertEqual(a['version'],b['version'])
        self.assertEqual(a['chunks'],b['chunks'])
    def test_failed_build_preserves_previous_index(self):
        before=(self.settings.index_dir/'snapshot.json').read_bytes()
        self.registry.append({'id':'bad','title':'bad','publisher':'test','url':'https://example.org/bad','file':'bad.pdf','format':'pdf'})
        write_json(self.root/'sources.json',self.registry)
        (self.root/'data/raw/bad.pdf').write_bytes(b'not a PDF')
        with self.assertRaises(ValueError):build_index(self.root)
        self.assertEqual(before,(self.settings.index_dir/'snapshot.json').read_bytes())
    def test_source_path_cannot_escape_raw_directory(self):
        self.registry[0]['file']='../../../secret.txt'
        write_json(self.root/'sources.json',self.registry)
        with self.assertRaises(ValueError):sources(self.root)
    def test_windows_write_only_acl_fallback(self):
        target=self.root/'write_only.json'
        write_json(target,{'old':True})
        with patch.object(Path,'replace',side_effect=PermissionError('Windows ACL denies replace')):
            write_json(target,{'complete':'new snapshot'})
        self.assertEqual(read_json(target),{'complete':'new snapshot'})
    def test_blank_pdf_is_flagged_for_ocr(self):
        writer=PdfWriter();writer.add_blank_page(width=100,height=100)
        with (self.root/'data/raw/blank.pdf').open('wb') as f:writer.write(f)
        self.registry.append({'id':'blank','title':'Blank PDF','publisher':'test','url':'https://example.org/blank','file':'blank.pdf','format':'pdf'})
        write_json(self.root/'sources.json',self.registry)
        build_index(self.root)
        blank=next(s for s in read_json(self.settings.index_dir/'snapshot.json')['sources'] if s['id']=='blank')
        self.assertEqual(blank['ocr_pages'],[1]);self.assertEqual(blank['chunks'],0)
    def test_pdf_edition_guard_prevents_wrong_page_map(self):
        writer=PdfWriter();writer.add_blank_page(width=100,height=100)
        path=self.root/'data/raw/edition.pdf'
        with path.open('wb') as f:writer.write(f)
        with self.assertRaisesRegex(ValueError,'edition differs'):
            list(extract_source(path,{'format':'pdf','verified_total_pdf_pages':2,'page_ranges':[[1,1]]}))
    def test_pdf_section_uses_file_page_position(self):
        writer=PdfWriter();writer.add_blank_page(width=100,height=100)
        path=self.root/'data/raw/section.pdf'
        with path.open('wb') as f:writer.write(f)
        pages=list(extract_source(path,{'format':'pdf','page_ranges':[[1,1]],'page_sections':[{'start':1,'end':1,'title':'Joint movements'}]}))
        self.assertEqual(pages[0]['pdf_page'],1)
        self.assertEqual(pages[0]['section'],'Joint movements')
    def test_streaming_hash_matches_file_contents(self):
        data=b'PDF source fingerprint\x00'*100000
        path=self.root/'large_source.bin';path.write_bytes(data)
        self.assertEqual(file_sha256(path),sha(data))
    def test_general_anatomy_question_does_not_force_exercise_graph(self):
        self.registry.append({'id':'anatomy','title':'Muscle roles','publisher':'Test source','url':'https://example.org/anatomy','file':'anatomy.txt','format':'txt','exercise_codes':[]})
        write_json(self.root/'sources.json',self.registry)
        (self.root/'data/raw/anatomy.txt').write_text('The agonist is the prime mover. The antagonist opposes the movement, and synergist muscles assist the agonist.',encoding='utf-8')
        build_index(self.root)
        evidence,claims,trace=Retriever(self.settings).search(ChatRequest(message='Cơ chủ vận và cơ đối kháng có vai trò gì trong vận động?',generate=False))
        self.assertEqual(evidence[0].source_id,'anatomy')
        self.assertFalse(claims)
        self.assertNotIn('graph',trace['channels_used'])
    def test_attribution_is_added_only_for_cited_evidence(self):
        evidence,_,_=Retriever(self.settings).search(ChatRequest(message='Chống đẩy hông cao',exercise_code='PUSHUP',generate=False))
        attributed=evidence[0].model_copy(update={'attribution':'Required source attribution.'})
        self.assertNotIn('Required source attribution.',with_attribution('Reply',[attributed],[]))
        self.assertEqual(with_attribution('Reply',[attributed],[attributed.chunk_id]),'Reply\n\nRequired source attribution.')
    def test_exercise_filter_and_graph_path(self):
        req=ChatRequest(message='Chống đẩy hông nâng cao cần chú ý gì?',exercise_code='PUSHUP',observation={'exercise_code':'PUSHUP','labels':['HIP_TOO_HIGH']},generate=False)
        evidence,claims,trace=Retriever(self.settings).search(req)
        self.assertTrue(evidence)
        self.assertTrue(all(e.source_id=='push' for e in evidence))
        self.assertIn('hip_control',[c['id'] for c in claims])
        self.assertIn('graph',trace['channels_used'])
    def test_unrelated_question_abstains(self):
        result=Engine(self.settings).answer(ChatRequest(message='Giá bitcoin hôm nay?',generate=False))
        self.assertEqual(result.status,'insufficient_evidence');self.assertFalse(result.evidence)
    def test_unrelated_question_not_overridden_by_workout_context(self):
        result=Engine(self.settings).answer(ChatRequest(message='Giá bitcoin hôm nay?',exercise_code='PUSHUP',
            observation={'exercise_code':'PUSHUP','labels':['HIP_TOO_HIGH']},generate=False))
        self.assertEqual(result.status,'insufficient_evidence')
    def test_no_llm_is_explicit_evidence_only(self):
        result=Engine(self.settings).answer(ChatRequest(message='How to perform push-up?',exercise_code='PUSHUP'))
        self.assertEqual(result.status,'evidence_only');self.assertFalse(result.generation_used)
    def test_insufficient_observation_never_generates_advice(self):
        result=Engine(self.settings).answer(ChatRequest(message='Giải thích chống đẩy',observation={'exercise_code':'PUSHUP','observation_status':'insufficient','labels':['HIP_TOO_HIGH']}))
        self.assertEqual(result.status,'insufficient_observation');self.assertFalse(result.evidence)
    def test_mismatched_exercise_and_wrong_rep_unit_rejected(self):
        with self.assertRaises(ValidationError):ChatRequest(message='test',exercise_code='SQUAT',observation={'exercise_code':'PUSHUP'})
        with self.assertRaises(ValidationError):Observation(exercise_code='PUSHUP',unit='video',rep_number=1)
    def test_stale_embedding_index_not_used(self):
        write_json(self.settings.index_dir/'embeddings.json',{'kb_version':'old','model':self.settings.embed_model,'vectors':{}})
        r=Retriever(self.settings)
        self.assertIsNone(r.embeddings);self.assertEqual(r.dense_status,'stale_or_different_model')
    def test_neo4j_failure_is_visible_and_uses_local_evidence(self):
        with patch.dict('os.environ',{'KB_GRAPH_BACKEND':'neo4j'}),patch('kb_service.graph.claim_support',side_effect=ProviderError('offline')):
            evidence,claims,trace=Retriever(self.settings).search(ChatRequest(message='Chống đẩy hông cao cần chú ý gì?',exercise_code='PUSHUP'))
        self.assertTrue(evidence)
        self.assertEqual(trace['graph_backend'],'neo4j_unavailable_local_snapshot_fallback')
    def test_internal_token_and_empty_kb(self):
        with TestClient(create_app(replace(self.settings,internal_token='test-token'))) as client:
            self.assertEqual(client.get('/v1/kb/stats').status_code,401)
            self.assertEqual(client.get('/v1/kb/stats',headers={'Authorization':'Bearer test-token'}).status_code,200)
        with TestClient(create_app(replace(self.settings,index_dir=self.root/'empty'))) as client:
            self.assertFalse(client.get('/health').json()['kb_ready'])
            self.assertEqual(client.post('/v1/chat',json={'message':'hello'}).status_code,503)
    def test_api_schema_and_real_retrieval(self):
        with TestClient(create_app(self.settings)) as client:
            self.assertEqual(client.post('/v1/chat',json={'message':'x'}).status_code,422)
            out=client.post('/v1/chat',json={'message':'How do I perform a push-up?','exercise_code':'PUSHUP','generate':False})
            self.assertEqual(out.status_code,200)
            self.assertEqual(out.json()['status'],'evidence_only')
            self.assertTrue(out.json()['evidence'][0]['chunk_id'].startswith('push_'))
    def generator_with(self,payload):
        transport=httpx.MockTransport(lambda request:httpx.Response(200,json={'message':{'content':json.dumps(payload)}}))
        return patch('kb_service.providers.httpx.Client',side_effect=lambda **kwargs:REAL_CLIENT(transport=transport,**kwargs))
    def evidence(self):
        return [{'chunk_id':'push_123','url':'https://example.org/push','text':'Keep hips controlled.'}]
    def test_generator_rejects_invented_citation(self):
        with self.generator_with({'answer':'Advice [invented_123]','citations':['invented_123'],'insufficient_evidence':False}):
            with self.assertRaises(ProviderError):Generator(replace(self.settings,llm_provider='ollama')).generate('question',None,self.evidence(),[])
    def test_generator_rejects_invented_url(self):
        with self.generator_with({'answer':'Advice [push_123] https://invented.example/book','citations':['push_123'],'insufficient_evidence':False}):
            with self.assertRaises(ProviderError):Generator(replace(self.settings,llm_provider='ollama')).generate('question',None,self.evidence(),[])
    def test_generator_accepts_only_retrieved_citation(self):
        with self.generator_with({'answer':'Giữ hông ổn định [push_123]','citations':['push_123'],'insufficient_evidence':False}):
            out=Generator(replace(self.settings,llm_provider='ollama')).generate('question',None,self.evidence(),[])
            self.assertEqual(out['citations'],['push_123'])
    def test_generator_drops_unused_but_known_bibliography_entries(self):
        evidence=self.evidence()+[{'chunk_id':'push_456','url':'https://example.org/push','text':'Other retrieved passage.'}]
        with self.generator_with({'answer':'Giữ hông ổn định [push_123]','citations':['push_123','push_456'],'insufficient_evidence':False}):
            out=Generator(replace(self.settings,llm_provider='ollama')).generate('question',None,evidence,[])
            self.assertEqual(out['citations'],['push_123'])
    def test_generator_rejects_answer_without_inline_evidence(self):
        with self.generator_with({'answer':'Uncited advice','citations':['push_123'],'insufficient_evidence':False}):
            with self.assertRaises(ProviderError):Generator(replace(self.settings,llm_provider='ollama')).generate('question',None,self.evidence(),[])
    def test_embedder_checks_count_and_normalizes(self):
        transport=httpx.MockTransport(lambda request:httpx.Response(200,json={'embeddings':[[3,4]]}))
        with patch('kb_service.providers.httpx.Client',side_effect=lambda **kwargs:REAL_CLIENT(transport=transport,**kwargs)):
            self.assertEqual(OllamaEmbedder(self.settings).embed(['text']),[[0.6,0.8]])
            with self.assertRaises(ProviderError):OllamaEmbedder(self.settings).embed(['one','two'])

if __name__=='__main__':unittest.main()
