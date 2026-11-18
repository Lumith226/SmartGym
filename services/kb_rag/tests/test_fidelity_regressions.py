"""Semantic boundaries found in real answers; fixtures are never KB content."""
import unittest
from kb_service.grounding import validate_semantic_fidelity,recover_source_span,missing_body_terms,complete_source_sentence
from kb_service.providers import ProviderError

class FidelityRegressionTests(unittest.TestCase):
    def test_target_is_not_a_purpose_clause_after_removing_accents(self):
        validate_semantic_fidelity('Bài tập nhắm vào vùng cánh tay và vai.','Target Body Part: Arms, Shoulders')
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Siết thân nhằm tăng hiệu quả đốt mỡ.','Maintain a rigid torso.')

    def test_rate_standard_cannot_be_inferred_from_qualitative_variants(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Đi bộ hoặc chạy nghĩa là không yêu cầu RPS nào để coi là chuẩn.','This can be done at a walking or running pace.')
        validate_semantic_fidelity('30–60 giây là thời lượng, không phải số lần mỗi phút.','Perform in intervals: 30-60 seconds of work.')

    def test_joint_direction_must_match_its_phase(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Pha lên gập hông và gối.','Extend the hips and knees.')
        validate_semantic_fidelity('Pha lên duỗi hông và gối.','Extend the hips and knees.')
        validate_semantic_fidelity('Gập bụng ngược giữ nguyên góc gập của gối.','Avoid any change in the angle of your knees during the roll-up.')

    def test_contact_is_stronger_than_direction(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Đưa gót chân chạm vào mông.','Raise the heel towards your butt.')
        validate_semantic_fidelity('Đưa gót về phía mông.','Raise the heel towards your butt.')
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Butt Kickers đưa gót chạm hoặc hướng về mông.','Raise the heel towards your butt.')
        validate_semantic_fidelity('Bài gót chạm mông đưa gót hướng về mông.','Raise the heel towards your butt.')

    def test_pdf_hyphen_wrap_restores_original_span_without_fuzzy_word_matching(self):
        source='A warm-up for muscle-\nstrengthening activity commonly involves doing exercises with lighter weight.'
        restored,repair=recover_source_span('A warm-up for muscle-strengthening activity commonly involves doing exercises with lighter weight.',source)
        self.assertEqual(restored,'A warm-up for muscle- strengthening activity commonly involves doing exercises with lighter weight.')
        self.assertIn('original contiguous',repair['method'])
        self.assertEqual(recover_source_span('A warm-up for muscle-strengthening activity always involves heavier weight.',source),(None,None))

    def test_phase_and_purpose_cannot_be_extended(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Giữ góc 90 độ trong suốt quá trình tập.','Starting position: raise your knees while maintaining a 90 degree bend.')
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Đẩy gót xuống sàn để thở ra.','Exhale and extend the hips and knees by pushing your feet through your heels.')
        validate_semantic_fidelity('Dịch hông ra sau để tạo chuyển động bản lề.','Shift your hips backwards to create a hinge-like movement.')

    def test_specific_body_part_requires_its_own_evidence(self):
        self.assertIn('thigh',missing_body_terms('Nâng đùi về phía ngực.','Raise one leg towards your chest.'))
        self.assertIn('joint',missing_body_terms('Giảm tác động lên khớp.','A lower impact variation.'))
        self.assertIn('cardiac',missing_body_terms('Tăng nhịp tim từ từ.','Move at a lower intensity.'))

    def test_quote_cannot_omit_a_negation_from_its_sentence(self):
        original='For beginners, do not raise the load abruptly. Keep the movement controlled.'
        span,change=complete_source_sentence('raise the load abruptly.',original)
        self.assertEqual(span,'For beginners, do not raise the load abruptly.')
        self.assertIsNotNone(change)

    def test_opening_landing_is_not_the_return_phase(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Trở về vị trí ban đầu với tay ở trên cao.','Land with arms overhead.')
        validate_semantic_fidelity('Trở về vị trí ban đầu.','Return to the starting position.')

    def test_reformulation_without_history_needs_context_before_any_llm_call(self):
        from kb_service.knowledge import answer_knowledge
        from unittest.mock import patch
        from types import SimpleNamespace
        engine=SimpleNamespace(settings=SimpleNamespace(),retriever=SimpleNamespace(snapshot={'version':'fixture'}))
        with patch('kb_service.knowledge.Generator') as generator:
            out=answer_knowledge(engine,'Bạn nói lại ngắn hơn nhé.',True)
        self.assertEqual(out['status'],'needs_clarification')
        generator.return_value.structured.assert_not_called()

    def test_vietnamese_source_can_support_its_own_body_terms(self):
        self.assertEqual(missing_body_terms('Góc khớp chưa được đo.','Nhãn góc khớp không phải phép đo đã xác minh.'),[])
        self.assertEqual(missing_body_terms('Giữ đầu ổn định.','Giữ đầu ổn định, không đảo sang bên.'),[])
        self.assertIn('knee',missing_body_terms('Giữ gối ổn định.','Giữ vai ổn định.'))
        self.assertIn('head',missing_body_terms('Giữ đầu ổn định.','Giữ đầu gối ổn định.'))

    def test_untranslated_english_is_not_a_vietnamese_chat_reply(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Raise your arms while keeping your feet together and your head aligned.','Raise your arms while keeping your feet together and your head aligned.',question='Tôi phải phối hợp tay ra sao?')
        validate_semantic_fidelity('Giữ đầu thẳng với cột sống.','Keep your head aligned with your spine.',question='Tôi giữ đầu thế nào?')

    def test_optional_pace_is_not_exclusive_permission(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Nguồn chỉ cho phép nhịp đi bộ hoặc chạy.','This can be done at a walking or running pace.')
        validate_semantic_fidelity('Có thể tập ở nhịp đi bộ hoặc chạy.','This can be done at a walking or running pace.')
    def test_safety_is_not_implied_by_an_exercise_example(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Tăng tạ theo ví dụ này là an toàn.','The client performs a weighted squat.')

    def test_instruction_does_not_certify_an_observed_label(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Nhãn hông cao là đúng vì nguồn yêu cầu giữ hông.','Do not allow your hips to hike upwards.',observation_only=True)
        validate_semantic_fidelity('Nguồn yêu cầu không để hông nhô lên.','Do not allow your hips to hike upwards.',observation_only=True)

    def test_motion_press_is_not_emphasis_and_internal_fields_stay_in_debug(self):
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Nhấn mạnh qua cánh tay.','Press upwards through your arms.')
        with self.assertRaises(ProviderError):
            validate_semantic_fidelity('Nhãn này là kind=error hoặc thuộc tính.','Nhãn lỗi dự đoán.',question='Nhãn này có đo góc không?')

if __name__=='__main__':unittest.main()
