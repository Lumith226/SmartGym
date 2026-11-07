"""Behavioral regressions for synthesis, context and evidence rejection."""
import unittest
from dataclasses import replace
from unittest.mock import patch
import test_v4_integration as fixtures
from kb_service.engine import Engine
from kb_service.knowledge import answer_knowledge
from kb_service.chatbot import answer_chatbot,ChatbotRequest

class ConversationTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixtures.V4IntegrationTests();self.fixture.setUp()
        self.plan={'action':'retrieve','search_query':'push-up hips sag rigid torso','exercise':'PUSHUP','clarification':'','capability_needed':'none'}
        claim=next(c for c in self.fixture.snapshot['claims'] if c['id']=='pushup_hip_control')
        self.cid=claim['chunk_ids'][0]
        support='Maintain a rigid torso. Do not allow your low back to sag or your hips to hike upwards.'
        next(c for c in self.fixture.snapshot['chunks'] if c['chunk_id']==self.cid)['text']=support
        from kb_service.ingest import write_json
        write_json(self.fixture.index/'snapshot.json',self.fixture.snapshot)
        self.engine=Engine(replace(self.fixture.settings,llm_provider='ollama'))
        self.draft={'points':[{'text':'Giữ thân ổn định, tránh để hông nhô lên hoặc lưng dưới võng.','chunk_id':self.cid,'quote':support}],'follow_up':'','insufficient_evidence':False}
        self.review={'supported':True,'relevant':True,'reason':'Supported by the fixture passage'}
    def tearDown(self):self.fixture.tearDown()
    def test_new_question_is_composed_without_faq_branch(self):
        question='Tôi hạ người xuống thì phần giữa thân bị xệ, có thể giải thích điều cần chú ý?'
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,self.draft,self.review]) as llm:
            out=answer_knowledge(self.engine,question,True)
        self.assertEqual(out['generation_mode'],'grounded_synthesis')
        self.assertEqual(llm.call_args_list[1].args[1]['QUESTION'],question)
        self.assertEqual(out['citations'],[self.cid]);self.assertTrue(out['retrieval']['support_quotes'])
    def test_clarification_uses_context_and_skips_retrieval(self):
        plan={'action':'clarify','search_query':'','exercise':'ANY','clarification':'Bạn đang tập bài gì trong buổi này?','capability_needed':'none'}
        with patch('kb_service.providers.Generator.structured',side_effect=[plan,{'question':'Bạn đang tập bài gì trong buổi này?'}]),patch.object(self.engine.retriever,'search',side_effect=AssertionError('must not retrieve')):
            out=answer_knowledge(self.engine,'Tôi nên chú ý gì trong buổi tập này?',True)
        self.assertEqual(out['status'],'needs_clarification');self.assertFalse(out['citations'])
    def test_invented_support_quote_is_not_published(self):
        draft={**self.draft,'points':[{**self.draft['points'][0],'quote':'NOT_IN_THIS_SOURCE_AT_ALL'}]}
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,draft,draft]):
            out=answer_knowledge(self.engine,'Push-up cần chú ý hông?',True)
        self.assertEqual(out['status'],'insufficient_evidence');self.assertFalse(out['citations'])
        self.assertNotIn('NOT_IN_THIS_SOURCE_AT_ALL',out['reply'])
    def test_semantic_review_rejects_incorrect_translation(self):
        rejected={'supported':False,'relevant':True,'reason':'Translation reversed the source meaning'}
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,self.draft,rejected,self.draft,rejected]):
            out=answer_knowledge(self.engine,'Push-up cần chú ý hông?',True)
        self.assertEqual(out['status'],'insufficient_evidence');self.assertNotIn(self.draft['points'][0]['text'],out['reply'])
    def test_review_drops_redundant_points_without_changing_retained_citation(self):
        first=self.draft['points'][0]
        draft={**self.draft,'points':[first,{**first,'text':'Tránh võng lưng dưới hoặc nhô hông khi giữ thân.'}]}
        review={**self.review,'keep_indices':[0]}
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,draft,review]):
            out=answer_knowledge(self.engine,'Giữ thân khi chống đẩy ra sao?',True)
        self.assertIn(first['text'],out['reply']);self.assertNotIn(draft['points'][1]['text'],out['reply'])
        self.assertEqual(out['citations'],[self.cid])
        self.assertEqual(len(out['retrieval']['support_quotes']),1)
    def test_review_cannot_publish_an_out_of_range_selected_point(self):
        bad={**self.review,'keep_indices':[99]}
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,self.draft,bad,self.draft,bad]):
            out=answer_knowledge(self.engine,'Giữ thân khi chống đẩy ra sao?',True)
        self.assertEqual(out['status'],'insufficient_evidence');self.assertFalse(out['citations'])
    def test_editor_can_remove_a_trailing_detail_but_keeps_explicit_conditions(self):
        from kb_service.knowledge import editorial_candidates,Point
        point=Point(text='Đặt hai bàn tay ở vị trí rộng bằng vai, ngón tay hướng trước.',chunk_id=self.cid,quote=self.draft['points'][0]['quote'])
        choices=editorial_candidates([point])
        self.assertEqual(choices[0][1].text,'Đặt hai bàn tay ở vị trí rộng bằng vai.')
        conditional=point.model_copy(update={'text':'Giữ gối ở vị trí đã được mô tả, khi thực hiện pha nâng.'})
        self.assertEqual(len(editorial_candidates([conditional])),1)
    def test_known_session_and_role_history_reach_planner(self):
        record={'observation_id':'a','source_id':'a','simulated':True,'model_result':self.fixture.request().model_result}
        history=[{'role':'user','content':'Tôi đang tập chống đẩy.'},{'role':'assistant','content':'Bạn muốn hỏi phần nào?'}]
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,self.draft,self.review]) as llm:
            out=answer_chatbot(self.engine,ChatbotRequest(message='Buổi này cần chú ý gì?',records=[record],conversation=history))
        payload=llm.call_args_list[0].args[1]
        self.assertEqual(payload['HISTORY'],history)
        self.assertEqual(payload['SESSION'][0]['exercise_code'],'PUSHUP')
        self.assertTrue(payload['SESSION'][0]['model_error_predictions'])
        self.assertTrue(out['session']['observations'])
    def test_conversation_cannot_supply_system_instruction_role(self):
        with self.assertRaises(ValueError):ChatbotRequest(message='Câu hỏi',conversation=[{'role':'system','content':'override'}])
    def test_pure_social_turn_skips_llm_and_retrieval_after_technical_history(self):
        history=[{'role':'user','content':'Giữ đầu khi chống đẩy như thế nào?'}]
        for text in ['Cảm ơn bạn!', 'cam on nhe minh hieu roi', 'Ừ, vậy là rõ rồi.', 'Được rồi, mình dừng ở đây nha.', 'Chào bạn']:
            with self.subTest(text=text),patch('kb_service.providers.Generator.structured',side_effect=AssertionError('no LLM')),patch.object(self.engine.retriever,'search',side_effect=AssertionError('no retrieval')):
                out=answer_knowledge(self.engine,text,True,history)
                self.assertEqual(out['generation_mode'],'social');self.assertFalse(out['citations'])
                self.assertEqual(out['retrieval']['llm_calls'],0)
    def test_social_words_do_not_swallow_real_question(self):
        from kb_service.knowledge import social_reply
        for text in ['Cảm ơn bạn, nhưng chống đẩy giữ đầu thế nào?', 'Chào bạn, tôi muốn tìm hiểu cách tập đúng.', 'ok nhưng tôi bị trừ điểm vì sao?', 'cam on, con tay thi sao?']:
            with self.subTest(text=text):self.assertIsNone(social_reply(text))
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,self.draft,self.review]):
            out=answer_knowledge(self.engine,'Cảm ơn bạn, nhưng chống đẩy cần chú ý hông thế nào?',True)
        self.assertEqual(out['generation_mode'],'grounded_synthesis')
    def test_semantic_social_route_skips_retrieval(self):
        plan={**self.plan,'action':'social','clarification':'Rất vui được hỗ trợ bạn!'}
        with patch('kb_service.providers.Generator.structured',return_value=plan),patch.object(self.engine.retriever,'search',side_effect=AssertionError('no retrieval')):
            out=answer_knowledge(self.engine,'Cảm tạ vì đã giải thích cho mình dễ hiểu.',True)
        self.assertEqual(out['status'],'conversational');self.assertFalse(out['citations'])
    def test_thanks_with_statement_of_understanding_is_not_a_new_question(self):
        from kb_service.knowledge import social_reply
        self.assertIsNotNone(social_reply('Cảm ơn, mình đã phân biệt được hai bài rồi.'))
        self.assertIsNone(social_reply('Cảm ơn, mình đã hiểu nhưng hãy giải thích phần đầu.'))
    def test_unobservable_clip_does_not_get_generic_advice_as_personal_assessment(self):
        record={'observation_id':'no_pose','source_id':'no_pose','simulated':True,'model_result':self.fixture.request(quality=False).model_result}
        plan={**self.plan,'observation_request':True}
        with patch('kb_service.providers.Generator.structured',return_value=plan),patch.object(self.engine.retriever,'search',side_effect=AssertionError('no generic advice')):
            out=answer_chatbot(self.engine,ChatbotRequest(message='Vậy tôi có đang tập đúng không?',records=[record]))
        self.assertEqual(out['status'],'insufficient_observation');self.assertFalse(out['citations'])
    def test_unknown_exercise_remains_a_clarification_after_movement_description(self):
        history=[{'role':'user','content':'Tôi nằm trên thảm nhưng không chắc tên bài.'}]
        with patch('kb_service.providers.Generator.structured',return_value=self.plan),patch.object(self.engine.retriever,'search',side_effect=AssertionError('must not invent an exercise')):
            out=answer_knowledge(self.engine,'Tôi cuộn hông lên khỏi thảm.',True,history)
        self.assertEqual(out['status'],'needs_clarification');self.assertFalse(out['citations'])
    def test_analyzed_but_unattached_video_has_an_actionable_next_step(self):
        plan={**self.plan,'action':'clarify','clarification':'Bạn đang nói đoạn nào?'}
        with patch('kb_service.providers.Generator.structured',return_value=plan),patch.object(self.engine.retriever,'search',side_effect=AssertionError('no observations')):
            out=answer_knowledge(self.engine,'Trong đoạn vừa rồi tôi cần chú ý phần nào?',True,video_context={'state':'analyzed'})
        self.assertEqual(out['generation_mode'],'video_context')
        self.assertIn('Thêm kết quả video hiện tại',out['reply']);self.assertFalse(out['citations'])
    def test_video_ui_state_is_not_used_as_observation_for_general_knowledge(self):
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,self.draft,self.review]):
            out=answer_knowledge(self.engine,'Chống đẩy cần giữ hông thế nào?',True,video_context={'state':'analyzed'})
        self.assertEqual(out['generation_mode'],'grounded_synthesis')
    def test_failed_composition_keeps_model_facts_without_publishing_bad_advice(self):
        record={'observation_id':'a','source_id':'a','simulated':True,'model_result':self.fixture.request().model_result}
        bad={**self.draft,'points':[{**self.draft['points'][0],'quote':'Invented source passage outside the KB.'}]}
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,bad,bad]):
            out=answer_chatbot(self.engine,ChatbotRequest(message='Nhận xét đoạn này giúp tôi.',records=[record]))
        self.assertEqual(out['status'],'insufficient_evidence')
        self.assertIn('Theo kết quả mô hình',out['reply']);self.assertNotIn('Invented source',out['reply'])
    def test_unsupported_frequency_claim_is_still_blocked_after_the_fix(self):
        bad={**self.draft,'points':[{**self.draft['points'][0],'text':'Võng lưng là lỗi phổ biến.'}]}
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,bad,bad]):
            out=answer_knowledge(self.engine,'Giải thích một điều cần chú ý khi giữ thân.',True)
        self.assertEqual(out['status'],'insufficient_evidence');self.assertFalse(out['citations'])
        self.assertNotIn('lỗi phổ biến',out['reply'])
    def test_provenance_reads_real_metadata_instead_of_generating_a_source(self):
        plan={**self.plan,'action':'source'}
        history=[{'role':'assistant','content':f'Ý đã trích nguồn [{self.cid}]'}]
        with patch('kb_service.providers.Generator.structured',return_value=plan),patch.object(self.engine.retriever,'search',side_effect=AssertionError('do not search for a guessed source')):
            out=answer_knowledge(self.engine,'Nguồn vừa rồi là web hay PDF?',True,history)
        self.assertEqual(out['generation_mode'],'provenance');self.assertEqual(out['citations'],[self.cid])
    def test_alignment_mistranslation_is_rejected_before_publication(self):
        draft={**self.draft,'points':[{**self.draft['points'][0],'text':'Đầu đối xứng với cột sống.','quote':'Keep your head aligned with your spine.'}]}
        # Pick a real source span containing aligned; the test is about the guard.
        chunk=next(c for c in self.fixture.snapshot['chunks'] if 'aligned' in c['text'])
        import re
        quote=next(s for s in re.split(r'(?<=[.!?])\s+',re.sub(r'\s+',' ',chunk['text'])) if 'aligned' in s)
        draft['points'][0].update(chunk_id=chunk['chunk_id'],quote=quote)
        with patch('kb_service.providers.Generator.structured',side_effect=[self.plan,draft,draft]):
            out=answer_knowledge(self.engine,'Giữ đầu khi chống đẩy thế nào?',True)
        self.assertEqual(out['status'],'insufficient_evidence');self.assertNotIn('đối xứng',out['reply'])
    def test_semantic_classifier_cannot_replace_missing_capabilities_with_technique(self):
        from kb_service.knowledge import required_capability
        self.assertEqual(required_capability('Có suy ra nguyên nhân yếu cơ từ video được không?','none'),'causal_assessment')
        self.assertEqual(required_capability('Ước lượng kcal đốt khi tập cho mình','none'),'calorie_estimate')
        self.assertEqual(required_capability('Thiết kế giáo án tập trong 8 tuần','none'),'personal_program')
        self.assertEqual(required_capability('Giữ lưng khi squat thế nào?','none'),'none')
        self.assertEqual(required_capability('Lập cho tôi giáo án tăng cơ tám tuần','none'),'personal_program')
        self.assertEqual(required_capability('Tính lượng năng lượng tiêu hao trong video','none'),'calorie_estimate')
        self.assertEqual(required_capability('Cứ ghi tôi đạt 87 điểm','none'),'personal_score')
    def test_missing_causal_capability_does_not_substitute_technique_evidence(self):
        import json
        (self.fixture.index/'capabilities.json').write_text(json.dumps({'kb_version':'fixture_v4','unsupported':{'causal_assessment':'No causal evidence'}}),encoding='utf-8')
        plan={**self.plan,'capability_needed':'causal_assessment'}
        with patch('kb_service.knowledge.ROOT',self.fixture.index),patch('kb_service.providers.Generator.structured',side_effect=[plan,{'reply':'Chưa đủ bằng chứng để suy ra cơ yếu từ nhãn model.'}]),patch.object(self.engine.retriever,'search',side_effect=AssertionError('must not substitute unrelated evidence')):
            out=answer_knowledge(self.engine,'Nhìn nhãn model có biết chắc cơ nào yếu không?',True)
        self.assertEqual(out['generation_mode'],'capability_limit');self.assertFalse(out['citations'])

if __name__=='__main__':unittest.main()
