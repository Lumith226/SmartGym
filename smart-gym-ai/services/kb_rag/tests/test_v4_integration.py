"""Contract/provenance/grounding regressions using synthetic text, not an accuracy benchmark."""
from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from kb_service.config import ROOT,Settings
from kb_service.ingest import read_json,write_json
from kb_service.models import ModelChatRequest
from kb_service.v4 import adapt_model_request,coverage_report
from kb_service.engine import Engine
from kb_service.app import create_app
from kb_service.providers import Generator,ProviderError

REAL_CLIENT=httpx.Client

class V4IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.index=Path(self.temp.name)
        catalog=read_json(ROOT/'label_catalog_v4.json')
        claims=read_json(ROOT/'claims.json');chunks=[]
        for i,claim in enumerate(claims):
            cid='fixture_'+str(i);claim['chunk_ids']=[cid]
            chunks.append({'chunk_id':cid,'source_id':claim['source_id'],'title':claim['exercise_code'],
                'publisher':'Synthetic unit-test source','url':'https://example.org/'+claim['source_id'],
                'text':claim['anchor']+' '+claim['text_vi'],'pdf_page':None,'section':'Fixture',
                'exercise_codes':[claim['exercise_code']]})
        self.snapshot={'version':'fixture_v4','label_catalog':catalog,'claims':claims,'chunks':chunks,
            'sources':[],'report':{},'graph':{'nodes':[],'edges':[]}}
        write_json(self.index/'snapshot.json',self.snapshot)
        self.settings=replace(Settings.from_env(),index_dir=self.index,llm_provider='disabled',internal_token='')
        self.env=patch.dict('os.environ',{'KB_GRAPH_BACKEND':'local'});self.env.start()
    def tearDown(self):self.env.stop();self.temp.cleanup()
    def request(self,exercise='PUSHUP',active=('elevated_hips',),scope='video',quality=True):
        spec=self.snapshot['label_catalog']['exercises'][exercise]
        rows=[{**deepcopy(label),'probability':1.0 if label['key'] in active else 0.0,'detected':False}
              for label in spec['labels']]
        return ModelChatRequest(message='Giải thích nhãn và tiêu chí kỹ thuật của bài tập.',generate=False,
            model_result={'exercise':spec['model_exercise'],'schema_version':spec['schema_version'],
                'model_provenance':{'model_sha256':spec['model_sha256']},'scope':scope,
                'quality':{'usable':quality},'status':'attributes_detected','label_results':rows})
    def answer(self,request):return Engine(self.settings).answer(adapt_model_request(request,self.snapshot))
    def test_catalog_accounts_for_all_labels_without_calling_them_all_errors(self):
        report=coverage_report(self.snapshot)
        self.assertEqual(report['total_labels'],83);self.assertEqual(report['error_labels'],23)
    def test_all_four_exercise_contracts_can_be_adapted(self):
        for code in self.snapshot['label_catalog']['exercises']:
            self.assertEqual(adapt_model_request(self.request(code,()),self.snapshot).exercise_code,code)
    def test_client_detected_summary_is_not_authoritative(self):
        req=adapt_model_request(self.request(),self.snapshot)
        self.assertEqual(req.observation.labels,['elevated_hips'])
    def test_wrong_model_hash_and_schema_are_rejected(self):
        for field,value in [('schema_version','legacy_four_classes'),('model_provenance',{'model_sha256':'0'*64})]:
            req=self.request();req.model_result[field]=value
            with self.assertRaises(ValueError):adapt_model_request(req,self.snapshot)
    def test_wrong_label_type_unknown_duplicate_and_threshold_are_rejected(self):
        for field,value in [('kind','context'),('key','invented'),('threshold',0.99999),('probability',float('nan'))]:
            req=self.request();req.model_result['label_results'][0][field]=value
            with self.assertRaises(ValueError):adapt_model_request(req,self.snapshot)
        req=self.request();req.model_result['label_results'][1]=deepcopy(req.model_result['label_results'][0])
        with self.assertRaises(ValueError):adapt_model_request(req,self.snapshot)
    def test_incomplete_or_malformed_label_tables_are_rejected(self):
        for value in [[],[None]*21,{'bad':'rows'}]:
            req=self.request();req.model_result['label_results']=value
            with self.assertRaises(ValueError):adapt_model_request(req,self.snapshot)
    def test_video_only_and_uncalibrated_labels_are_not_activated_in_windows(self):
        req=adapt_model_request(self.request('JUMPING_JACK',('single_repetition','legs_rom_1_5'),scope='window'),self.snapshot)
        self.assertFalse(req.observation.labels)
    def test_unknown_observation_quality_is_rejected(self):
        req=self.request();req.model_result.pop('quality')
        with self.assertRaises(ValueError):adapt_model_request(req,self.snapshot)
    def test_insufficient_observation_cannot_generate_advice(self):
        with patch('kb_service.providers.Generator.select_claims',side_effect=AssertionError('must not call LLM')):
            result=self.answer(self.request(quality=False))
        self.assertEqual(result.status,'insufficient_observation');self.assertFalse(result.evidence)
    def test_model_feedback_cannot_inject_new_medical_claims(self):
        req=self.request();req.model_result['feedback_vi']='INVENTED_MEDICAL_CAUSE'
        req.model_result['comparison']={'ground_truth':['INVENTED_GROUND_TRUTH_LABEL']}
        result=self.answer(req)
        self.assertEqual(result.status,'grounded_guidance');self.assertTrue(result.citations)
        self.assertNotIn('INVENTED_MEDICAL_CAUSE',result.reply)
        self.assertNotIn('INVENTED_GROUND_TRUTH_LABEL',result.reply)
        self.assertIn('pushup_hip_control',[c['id'] for c in result.graph_claims])
        self.assertTrue(all(cid in {e.chunk_id for e in result.evidence} for cid in result.citations))
    def test_attributes_and_positive_labels_do_not_establish_correct_form(self):
        result=self.answer(self.request('SQUAT',('no_obvious_issue','depth_90')))
        self.assertEqual(result.knowledge_coverage['detected_error_labels'],0)
        self.assertEqual(result.status,'insufficient_evidence')
        self.assertIn('không chứng minh',result.reply)
    def test_positive_and_error_labels_require_review(self):
        result=self.answer(self.request('SQUAT',('no_obvious_issue','back_not_straight')))
        self.assertTrue(any('đồng thời' in warning for warning in result.warnings))
        self.assertEqual(result.knowledge_coverage['detected_error_labels'],1)
    def test_uncovered_error_is_explicit_and_does_not_trigger_llm(self):
        with patch('kb_service.providers.Generator.select_claims',side_effect=AssertionError('must not call LLM')):
            result=self.answer(self.request(active=('child_pose_cheat',)))
        self.assertEqual(result.status,'insufficient_evidence');self.assertFalse(result.citations)
        self.assertEqual(result.knowledge_coverage['error_coverage']['none'],1)
    def test_llm_only_orders_source_backed_criteria(self):
        req=self.request();req.generate=True
        with patch('kb_service.providers.Generator.select_claims',return_value=(['pushup_hip_control'],'test-model')):
            result=self.answer(req)
        self.assertTrue(result.generation_used);self.assertEqual(result.generation_mode,'claim_selection')
        self.assertIn('LLM lựa chọn thứ tự',result.reply)
    def test_provider_rejects_invented_criterion_ids(self):
        transport=httpx.MockTransport(lambda req:httpx.Response(200,json={'message':{'content':'{"claim_ids":["invented"]}'}}))
        with patch('kb_service.providers.httpx.Client',side_effect=lambda **kw:REAL_CLIENT(transport=transport,**kw)):
            with self.assertRaises(ProviderError):Generator(replace(self.settings,llm_provider='ollama')).select_claims('q',{},[{'id':'known'}])
    def test_http_adapter_and_coverage_surface(self):
        with TestClient(create_app(self.settings)) as client:
            self.assertEqual(client.get('/v1/kb/coverage').json()['total_labels'],83)
            response=client.post('/v1/chat/from-model',json=self.request().model_dump())
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json()['observation']['exercise_code'],'PUSHUP')
            bad=self.request();bad.model_result['schema_version']='old'
            self.assertEqual(client.post('/v1/chat/from-model',json=bad.model_dump()).status_code,422)

if __name__=='__main__':unittest.main()
