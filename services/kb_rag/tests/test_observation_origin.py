"""Synthetic observations must remain visibly distinguishable from real ones."""
import unittest
from kb_service.observation_chat import describe_observations,require_source_instruction_only
from kb_service.providers import ProviderError


class ObservationOriginTests(unittest.TestCase):
    def test_source_instruction_cannot_try_to_make_an_error_label_correct(self):
        with self.assertRaises(ProviderError):
            require_source_instruction_only('Để nhãn lưng không thẳng đúng, bạn phải siết cơ lõi.')
        with self.assertRaises(ProviderError):
            require_source_instruction_only('The model prediction is correct because the source says so.')
        require_source_instruction_only('Duy trì căng cơ lõi và cố gắng giữ lưng phẳng trong pha hạ.')
    def test_mixed_observation_notice_preserves_synthetic_origin(self):
        rows=[{'simulated':False,'observation_status':'sufficient','model_error_predictions':['Lưng không thẳng']},
              {'simulated':True,'observation_status':'sufficient','model_error_predictions':['Hông nâng cao']}]
        result=describe_observations(rows)
        self.assertIn('giả lập',result)
        self.assertIn('Lưng không thẳng',result)
        self.assertIn('Hông nâng cao',result)

    def test_real_observation_is_not_labelled_synthetic(self):
        result=describe_observations([{'simulated':False,'observation_status':'sufficient','model_error_predictions':[]}])
        self.assertNotIn('giả lập',result)
        self.assertIn('chưa xác nhận',result)
