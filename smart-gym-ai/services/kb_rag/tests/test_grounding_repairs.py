"""Regression invariants for the five diagnosed cases, not answer templates."""
import unittest
from types import SimpleNamespace
from kb_service.grounding import source_windows,expand_support,missing_body_terms
from kb_service.knowledge import Point
from kb_service.observation_chat import observation_scope
from kb_service.providers import ProviderError

class SupportTests(unittest.TestCase):
    def test_adjacent_sentences_can_support_a_necessary_compound_claim(self):
        text='Keep your head aligned with your spine. Do not allow your low back to sag or your hips to hike upwards.'
        p=Point(text='Đầu thẳng với cột sống, không võng lưng hoặc nhô hông.',chunk_id='source',quote=text.split('. ')[1])
        expanded,change=expand_support(p,SimpleNamespace(text=text))
        self.assertEqual(expanded.quote,text);self.assertIsNotNone(change)
        self.assertIn(expanded.quote,source_windows(text))
        self.assertEqual(expanded.text,p.text);self.assertEqual(expanded.chunk_id,p.chunk_id)
    def test_cannot_expand_to_a_different_source_or_invent_missing_anatomy(self):
        p=Point(text='Giữ gót chân trên sàn và gối thẳng.',chunk_id='source',quote='Keep your knees aligned.')
        with self.assertRaises(ProviderError):expand_support(p,SimpleNamespace(text='Keep your knees aligned.'))
    def test_starting_position_and_knee_are_not_false_head_mentions(self):
        self.assertEqual(missing_body_terms('Ở tư thế ban đầu, giữ đầu gối gập.','Keep the knees bent.'),[])
        self.assertEqual(missing_body_terms('Dựa vào dấu hiệu phối hợp tay chân.','Move your arms and legs together.'),[])
    def test_two_retrieved_chunks_from_same_document_can_supply_joint_support(self):
        p=Point(text='Đầu thẳng với cột sống, không gập gối và không võng lưng.',chunk_id='a',quote='Do not let your back sag.')
        primary=SimpleNamespace(chunk_id='a',source_id='doc',text=p.quote)
        extra=SimpleNamespace(chunk_id='b',source_id='doc',text='Keep your head aligned with your spine and your knees extended.')
        out,change=expand_support(p,primary,[primary,extra])
        self.assertEqual(out.additional_support[0].chunk_id,'b');self.assertTrue(change['same_document_only'])
        self.assertEqual(out.text,p.text)
    def test_support_repair_does_not_cross_to_another_exercise_variant_document(self):
        p=Point(text='Giữ đầu thẳng với cột sống và không võng lưng.',chunk_id='a',quote='Do not let your back sag.')
        primary=SimpleNamespace(chunk_id='a',source_id='regular_variant',text=p.quote)
        extra=SimpleNamespace(chunk_id='b',source_id='another_variant',text='Keep your head aligned with your spine.')
        with self.assertRaises(ProviderError):expand_support(p,primary,[primary,extra])
    def test_partial_depth_label_never_becomes_an_unrelated_back_explanation(self):
        scope=observation_scope([{'observation_status':'sufficient','label_meanings':[{
            'kind':'error','key':'some_depth_label','name_vi':'Nhãn biên độ thử nghiệm','coverage':'partial',
            'criterion_ids':['test_depth'],'note_vi':'Chưa có ngưỡng góc được xác minh.'}]}])
        self.assertEqual(scope['mode'],'limited');self.assertIn('Chưa có ngưỡng',scope['reply'])
        self.assertNotIn('lưng',scope['reply'])
    def test_attributes_without_error_do_not_generate_an_absolute_measured_angle(self):
        scope=observation_scope([{'observation_status':'sufficient','label_meanings':[{
            'kind':'attribute','key':'rom','name_vi':'Mức biên độ thử nghiệm','coverage':'metadata_only'}]}])
        self.assertEqual(scope['mode'],'attributes');self.assertIn('chưa phải số đo',scope['reply'])

