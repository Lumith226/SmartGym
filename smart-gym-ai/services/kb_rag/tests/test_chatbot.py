"""Session/score invariants. Fixtures are synthetic, not training evaluation."""
import unittest
from copy import deepcopy
import test_v4_integration as fixtures
from kb_service.chatbot import ChatbotRequest, answer_chatbot
from kb_service.engine import Engine
from kb_service.app import create_app
from fastapi.testclient import TestClient

class ChatbotTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixtures.V4IntegrationTests();self.fixture.setUp();self.engine=Engine(self.fixture.settings)
    def tearDown(self):self.fixture.tearDown()
    def record(self,source='video_1',active=('elevated_hips',),quality=True):
        return {'observation_id':source,'source_id':source,'simulated':True,
                'model_result':self.fixture.request(active=active,quality=quality).model_result}
    def answer(self,task='summary',records=None,**kw):
        return answer_chatbot(self.engine,ChatbotRequest(message='Giải thích kỹ thuật buổi tập.',task=task,
            records=records if records is not None else [self.record()],generate=False,**kw))
    def test_no_score_invented_without_policy(self):
        out=self.answer('score');self.assertIsNone(out['session']['penalty_total']);self.assertIn('chưa có bảng quy tắc',out['reply'])
        self.assertFalse(out['citations']);self.assertNotIn('Bạn có thể đối chiếu',out['reply'])
    def test_supplied_score_rule_has_exact_ledger(self):
        out=self.answer('score',rules=[{'exercise_code':'PUSHUP','label_key':'elevated_hips','points':5}],scoring_policy='Synthetic unit-test policy')
        self.assertEqual(out['session']['penalty_total'],5);self.assertEqual(len(out['session']['penalty_ledger']),1)
        self.assertTrue(out['citations']);self.assertIn('do ứng dụng cung cấp',out['reply'])
    def test_attributes_cannot_be_penalized(self):
        with self.assertRaises(ValueError):self.answer('score',rules=[{'exercise_code':'PUSHUP','label_key':'wide_hands','points':5}],scoring_policy='Test')
    def test_same_video_hash_deduplicates_even_different_names(self):
        a=self.record('one');b=self.record('two')
        for r in [a,b]:r['model_result']['source']={'video_sha256':'a'*64}
        out=self.answer('practice',[a,b]);self.assertEqual(len(out['session']['units']),1);self.assertIn('Chưa đủ',out['reply'])
    def test_repeated_error_requires_independent_sources(self):
        out=self.answer('practice',[self.record('one'),self.record('two')])
        self.assertEqual(out['session']['errors'][0]['observed_units'],2);self.assertIn('lặp lại',out['reply'])
        self.assertIn('chưa có phác đồ',out['reply']);self.assertNotIn('yếu cơ',out['reply'])
        self.assertTrue(out['session']['practice_suggestions'])
        self.assertTrue(all(p['citations'] for p in out['session']['practice_suggestions']))
    def test_unusable_observation_never_scored(self):
        out=self.answer('score',[self.record(quality=False)],rules=[{'exercise_code':'PUSHUP','label_key':'elevated_hips','points':5}],scoring_policy='Test')
        self.assertEqual(out['session']['penalty_ledger'],[]);self.assertFalse(out['graph_claims'])
    def test_empty_session_asks_for_actual_input(self):
        self.assertEqual(self.answer(records=[])['status'],'insufficient_observation')
    def test_two_point_summary_limits_display_without_discarding_observation_errors(self):
        record=self.record(active=('elevated_hips','butt_sinking','too_deep'))
        out=answer_chatbot(self.engine,ChatbotRequest(message='Nêu hai điểm đáng chú ý nhất.',task='summary',records=[record],generate=False))
        self.assertEqual(len(out['session']['errors']),3)
        self.assertNotIn(out['session']['errors'][2]['name_vi'],out['reply'])
        self.assertFalse(out['citations'])
    def test_duplicate_rule_and_observation_ids_rejected(self):
        with self.assertRaises(ValueError):self.answer(records=[self.record(),self.record()])
        r={'exercise_code':'PUSHUP','label_key':'elevated_hips','points':5}
        with self.assertRaises(ValueError):self.answer('score',rules=[r,r],scoring_policy='Test')
    def test_endpoint_incomplete_model_table_rejected(self):
        with TestClient(create_app(self.fixture.settings)) as client:
            self.assertEqual(client.post('/v1/chatbot',json={'message':'Tóm tắt buổi tập','task':'summary','records':[{'observation_id':'a','source_id':'a','model_result':{}}]}).status_code,422)
            out=client.post('/v1/chatbot',json={'message':'Tóm tắt buổi tập','task':'summary','records':[self.record()],'generate':False})
            self.assertEqual(out.status_code,200)
            self.assertTrue(set(out.json()['citations']).issubset({e['chunk_id'] for e in out.json()['evidence']}))
    def test_plain_session_question_still_retrieves_label_criteria(self):
        out=answer_chatbot(self.engine,ChatbotRequest(message='Tóm tắt buổi tập',task='summary',records=[self.record()],generate=False))
        self.assertTrue(out['graph_claims']);self.assertTrue(out['citations'])
    def test_technique_qa_can_inspect_evidence_without_llm(self):
        from kb_service.knowledge import answer_knowledge
        out=answer_knowledge(self.engine,'Chống đẩy cần giữ hông và thân thế nào?',False)
        self.assertTrue(out['graph_claims']);self.assertEqual(out['generation_mode'],'none')
        self.assertEqual(out['status'],'evidence_only')

if __name__=='__main__':unittest.main()
