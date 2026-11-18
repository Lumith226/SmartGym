"""User-facing references and notices; preserve the original answer and trace."""

INTERNAL_WARNINGS = {
    'Kiểm tra ngữ nghĩa bằng LLM là bộ lọc hỗ trợ, chưa thay thế đánh giá chuyên môn.',
    'Bản nháp chưa vượt qua kiểm tra bằng chứng; chưa công bố lời khuyên.',
}


def present_chatbot_response(output):
    evidence = {e['chunk_id']: e for e in output.get('evidence', [])}
    ids = list(dict.fromkeys(output.get('citations', [])))
    references = [{'number': i + 1, 'chunk_id': cid}
                  for i, cid in enumerate(cid for cid in ids if cid in evidence)]
    warnings = output.get('warnings', [])
    # Provider errors remain in the trace. The reply already explains downtime.
    notices = [] if output.get('status') == 'unavailable' else [
        w for w in warnings if w not in INTERNAL_WARNINGS]
    return {**output, 'references': references, 'user_notices': notices,
            'technical_details': {
                'status': output.get('status'), 'generation_mode': output.get('generation_mode'),
                'kb_version': output.get('kb_version'), 'model_version': output.get('model_version'),
                'references': references, 'warnings': warnings, 'retrieval': output.get('retrieval', {}),
            }}
