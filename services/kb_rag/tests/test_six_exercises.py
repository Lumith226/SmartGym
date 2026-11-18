"""Six-exercise boundary/provenance regressions. No LLM answer fixtures."""
from copy import deepcopy
import json,tempfile,unittest
from pathlib import Path
from kb_service.config import ROOT
from kb_service.models import ModelChatRequest,QueryRequest
from kb_service.v4 import adapt_model_request,explain_labels
from kb_service.ingest import html_sections,build_index,write_json
from kb_service.text import detect_exercises
from kb_service.chatbot import ChatbotRequest

class SixExercisesTests(unittest.TestCase):
    def test_quote_ellipsis_recovery_preserves_intervening_conditions(self):
        from kb_service.grounding import recover_source_span
        source='Begin on the mat. Lift your feet off the floor before raising your knees above your hips.'
        value,trace=recover_source_span('Lift your feet...raising your knees above your hips.',source)
        self.assertEqual(value,'Lift your feet off the floor before raising your knees above your hips.')
        self.assertIn('off the floor before',value);self.assertIsNotNone(trace)
        self.assertEqual(recover_source_span('Invented starting text...raising your knees above your hips.',source),(None,None))
    def test_cross_document_support_is_retained_and_verified(self):
        from kb_service.grounding import expand_support
        from kb_service.knowledge import Point,SupportSpan
        from types import SimpleNamespace
        primary=SimpleNamespace(chunk_id='a',source_id='source_a',text='Keep the head aligned.')
        secondary=SimpleNamespace(chunk_id='b',source_id='source_b',text='Keep the knees aligned.')
        point=Point(chunk_id='a',quote=primary.text,text='Giữ đầu và gối thẳng hàng.',additional_support=[SupportSpan(chunk_id='b',quote=secondary.text)])
        result,repair=expand_support(point,primary,[primary,secondary])
        self.assertEqual(result.additional_support[0].chunk_id,'b');self.assertIsNone(repair)
    def test_duration_is_not_repetition_rate_and_unknown_angles_are_rejected(self):
        from kb_service.grounding import validate_quantities
        from kb_service.providers import ProviderError
        validate_quantities('Tập từng đợt 30–60 giây.','Intervals of 30-60 seconds.')
        with self.assertRaises(ProviderError):validate_quantities('Tập 30 lần mỗi phút.','Intervals of 30-60 seconds.')
        with self.assertRaises(ProviderError):validate_quantities('Gập gối 90 độ.','Keep the knees bent.')
        with self.assertRaises(ProviderError):validate_quantities('Bạn phải dừng thở.','Pause for a breath.')
    def test_body_evidence_does_not_misread_recommendation_or_overhead(self):
        from kb_service.grounding import missing_body_terms
        self.assertEqual(missing_body_terms('Gợi ý một tiến trình học phù hợp.', 'An exercise progression should suit individual clients.'),[])
        self.assertEqual(missing_body_terms('Đưa tay lên qua đầu.', 'Raise the arms overhead.'),[])
        self.assertIn('knee',missing_body_terms('Giữ đầu gối ổn định.', 'Keep the torso upright.'))
        self.assertIn('shoulder',missing_body_terms('Bài này tác động vai.', 'Press upwards through your arms.'))
        self.assertEqual(missing_body_terms('Khi tập nâng cao gối, bạn có thể nói vài từ.', 'You can talk while exercising.'),[])
        self.assertIn('shoulder',missing_body_terms('Giữ vai ổn định.', 'Keep your trunk stable.'))
    def test_source_window_selection_ranks_relevant_movement_above_unrelated_barbell_sentence(self):
        from kb_service.grounding import focused_source_windows
        text='Elevated push-up uses the hands on a raised surface. Standard push-up is supported by hands and feet. Bench press lowers a bar to the chest. Squat begins standing. Running alternates legs. Cycling uses pedals. Swimming uses water.'
        spans=focused_source_windows(text,'elevated push-up hand placement raised surface',limit=3)
        self.assertTrue(all('Elevated push-up' in span for span in spans))
        self.assertNotIn('Bench press lowers a bar to the chest.',spans)
    def test_exercise_header_metadata_is_preserved_without_navigation(self):
        html=b'<header><nav>irrelevant</nav><div class="exercise-info__term"><dt>Target Body Part:</dt><dd>Arms, Chest, Shoulders</dd></div></header><h2>Step 1</h2><p>Place your hands on the floor.</p>'
        sections=html_sections(html,{'selector':'ace_steps','include_exercise_metadata':True})
        self.assertEqual(sections[0],('Exercise metadata','Target Body Part: Arms, Chest, Shoulders'))
        self.assertNotIn('irrelevant',' '.join(text for _,text in sections))
    def setUp(self):
        self.catalog=json.loads((ROOT/'label_catalog_v4.json').read_text(encoding='utf-8'))
        self.snap={'label_catalog':self.catalog}
    def model_request(self,code,active,scope='window'):
        spec=self.catalog['exercises'][code]
        return ModelChatRequest(model_result={'exercise':spec['model_exercise'],'schema_version':spec['schema_version'],
            'model_provenance':{'model_sha256':spec['model_sha256']},'scope':scope,'quality':{'usable':True},
            'label_results':[{**x,'probability':1. if x['key'] in active else 0.} for x in spec['labels']]})
    def test_aliases_and_ambiguous_running_are_not_guessed(self):
        self.assertEqual(detect_exercises('Chạy nâng cao gối với high knees'),['HIGH_KNEES'])
        self.assertEqual(detect_exercises('Bài gót chạm mông'),['BUTT_KICKERS'])
        self.assertEqual(detect_exercises('chạy tại chỗ'),[])
        self.assertEqual(detect_exercises('high knees so với butt kickers'),['HIGH_KNEES','BUTT_KICKERS'])
    def test_new_window_labels_are_supported_but_video_context_is_not(self):
        for code,key in [('HIGH_KNEES','not_straight'),('BUTT_KICKERS','bringing_knees_forward')]:
            observation=adapt_model_request(self.model_request(code,[key,'early_stopping']),self.snap).observation
            self.assertEqual(observation.labels,[key])
            self.assertEqual(explain_labels(observation,self.snap)[0]['key'],key)
            rep=adapt_model_request(self.model_request(code,[key],scope='rep'),self.snap)
            self.assertEqual(rep.observation.labels,[])
    def test_stepping_and_occlusion_remain_attributes(self):
        obs=adapt_model_request(self.model_request('BUTT_KICKERS',['stepping','feet_disappear_behind_knees']),self.snap).observation
        rows=explain_labels(obs,self.snap)
        self.assertTrue(rows)
        self.assertTrue(all(x['kind']=='attribute' for x in rows))
    def test_complete_schema_and_hash_are_required(self):
        req=self.model_request('HIGH_KNEES',['arms_down'])
        req.model_result['label_results'].pop()
        with self.assertRaises(ValueError):adapt_model_request(req,self.snap)
        req=self.model_request('HIGH_KNEES',['arms_down'])
        req.model_result['model_provenance']['model_sha256']='0'*64
        with self.assertRaises(ValueError):adapt_model_request(req,self.snap)
    def test_score_contract_accepts_new_exercises_without_changing_label_kinds(self):
        req=ChatbotRequest(message='Giải thích điểm',task='score',scoring_policy='synthetic test only',
                           rules=[{'exercise_code':'HIGH_KNEES','label_key':'arms_down','points':2}])
        self.assertEqual(req.rules[0].exercise_code,'HIGH_KNEES')
    def test_nasm_sibling_wrappers_do_not_hide_mistakes(self):
        data=b'<main><div><h3>Common Mistakes</h3><div class="section-metadata">style blog-width</div></div><div><ul><li>Do not sacrifice form for speed.</li></ul></div><h3>Ads</h3><p>Buy now</p></main>'
        out=html_sections(data,{'selector':'nasm_sections','extra_headings':['Common Mistakes']})
        self.assertEqual(out,[('Common Mistakes','Do not sacrifice form for speed.')])
    def test_cross_source_duplicates_keep_both_provenances_and_metadata_changes_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'data/raw').mkdir(parents=True)
            text='A shared source passage long enough for indexing, explaining an exercise technique with its conditions.'
            for name in ['a','b']:(root/f'data/raw/{name}.txt').write_text(text,encoding='utf-8')
            entries=[{'id':name,'file':name+'.txt','format':'txt','title':name,'publisher':'fixture',
                      'url':'https://example.org/'+name,'exercise_codes':['HIGH_KNEES']} for name in ['a','b']]
            write_json(root/'sources.json',entries)
            first=build_index(root,index_dir=root/'data/index')
            snap=json.loads((root/'data/index/snapshot.json').read_text(encoding='utf-8'))
            self.assertEqual({c['source_id'] for c in snap['chunks']},{'a','b'})
            self.assertEqual(first['cross_source_duplicate_contents'],1)
            second=build_index(root,index_dir=root/'data/index')
            self.assertEqual(first['version'],second['version'])
            entries[0]['license']='changed license metadata';write_json(root/'sources.json',entries)
            changed=build_index(root,index_dir=root/'data/index')
            self.assertNotEqual(first['version'],changed['version'])

if __name__=='__main__':unittest.main()
