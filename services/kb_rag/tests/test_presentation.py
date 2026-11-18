"""Presentation must preserve evidence/debug data and actionable notices."""
import unittest
from kb_service.presentation import present_chatbot_response, INTERNAL_WARNINGS


class PresentationTests(unittest.TestCase):
    def test_internal_warnings_move_to_debug_but_video_warning_stays_visible(self):
        output={'reply':'Ý có nguồn [source_1234567890abcdef]', 'citations':['source_1234567890abcdef']*2,
                'evidence':[{'chunk_id':'source_1234567890abcdef'}],
                'warnings':list(INTERNAL_WARNINGS)+['Video chưa đủ khớp để nhận xét.'],
                'retrieval':{'evidence_review':[{'supported':False}]}}
        out=present_chatbot_response(output)
        self.assertEqual(out['user_notices'],['Video chưa đủ khớp để nhận xét.'])
        self.assertEqual(out['references'],[{'number':1,'chunk_id':'source_1234567890abcdef'}])
        self.assertEqual(out['reply'],output['reply'])
        self.assertEqual(out['technical_details']['warnings'],output['warnings'])
        self.assertEqual(out['technical_details']['retrieval'],output['retrieval'])

    def test_missing_evidence_is_not_numbered_as_verified(self):
        out=present_chatbot_response({'citations':['unknown'],'evidence':[]})
        self.assertEqual(out['references'],[])

    def test_provider_error_not_in_user_notices_but_preserved(self):
        out=present_chatbot_response({'status':'unavailable','warnings':['Internal provider exception']})
        self.assertEqual(out['user_notices'],[])
        self.assertEqual(out['technical_details']['warnings'],['Internal provider exception'])
