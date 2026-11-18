"""Run and save real local HTTP RAG examples; no mocked provider calls."""
from datetime import datetime, timezone
import time
import httpx
from kb_service.config import ROOT, Settings
from kb_service.ingest import read_json, write_json


def main():
    settings = Settings.from_env()
    headers = {'Authorization': 'Bearer '+settings.internal_token} if settings.internal_token else {}
    records = []
    with httpx.Client(base_url='http://127.0.0.1:8010', timeout=180, headers=headers) as client:
        response = client.get('/health')
        response.raise_for_status()
        health = response.json()
        for name, filename in [('book', 'book_in_out.json'), ('exercise', 'example_in_out.json')]:
            request = read_json(ROOT/'artifacts'/filename)['input']
            request['generate'] = True
            start = time.perf_counter()
            response = client.post('/v1/chat', json=request)
            response.raise_for_status()
            output = response.json()
            allowed = {item['chunk_id'] for item in output['evidence']}
            citation_ids_valid = bool(output['citations']) and all(
                cid in allowed and f'[{cid}]' in output['reply'] for cid in output['citations'])
            passed = (output['generation_used'] and output['status']=='generated'
                      and citation_ids_valid and output['retrieval']['dense_status']=='ready')
            if name=='book':
                book_ids = {item['chunk_id'] for item in output['evidence']
                            if item['source_id']=='openstax_anatomy' and item['pdf_page']}
                passed = passed and bool(book_ids.intersection(output['citations']))
            record = {'checked_at_utc': datetime.now(timezone.utc).isoformat(),
                      'transport': 'HTTP POST /v1/chat', 'mocked_provider': False,
                      'elapsed_seconds': round(time.perf_counter()-start, 2),
                      'input': request, 'output': output,
                      'verification': {'status': 'passed' if passed else 'failed',
                                       'citation_ids_valid': citation_ids_valid,
                                       'semantic_answer_correctness': 'requires human review'}}
            write_json(ROOT/'artifacts'/f'{name}_rag_live.json', record)
            summary = {'example': name, 'verification': record['verification'],
                       'elapsed_seconds': record['elapsed_seconds'],
                       'status': output['status'], 'generation_used': output['generation_used'],
                       'model': output['model_version'], 'channels': output['retrieval']['channels_used'],
                       'warnings': output['warnings'], 'reply': output['reply']}
            records.append(summary)
            print(summary, flush=True)
    write_json(ROOT/'artifacts/live_verification.json', {'health': health, 'examples': records,
        'scope': 'Two real local API examples; citation identity checked, not an answer-quality benchmark.'})
    return 0 if all(item['verification']['status']=='passed' for item in records) else 1


if __name__=='__main__':
    raise SystemExit(main())
