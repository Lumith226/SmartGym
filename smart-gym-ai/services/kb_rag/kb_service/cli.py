import argparse
from collections import Counter
import json
from pathlib import Path
import sys
import httpx
from .config import ROOT, Settings
from .ingest import fetch_sources, build_index, read_json, write_json
from .models import ChatRequest, QueryRequest
from .providers import OllamaEmbedder
from .retrieval import Retriever
from .engine import Engine

def pull_models(settings):
    installed=[]
    with httpx.Client(timeout=httpx.Timeout(1800,connect=10)) as client:
        response=client.get(settings.ollama_url+'/api/tags')
        response.raise_for_status()
        names={m['name'] for m in response.json().get('models',[])}
        for model in [settings.chat_model,settings.embed_model]:
            if model in names:
                print(f'{model}: already installed',flush=True)
                installed.append(model)
                continue
            print(f'Pulling {model}',flush=True)
            previous=None
            success=False
            with client.stream('POST',settings.ollama_url+'/api/pull',json={'model':model,'stream':True}) as stream:
                stream.raise_for_status()
                for line in stream.iter_lines():
                    if not line:continue
                    item=json.loads(line)
                    if item.get('error'):raise RuntimeError(item['error'])
                    status=item.get('status','')
                    percent=int(100*item.get('completed',0)/item['total']) if item.get('total') else None
                    step=(status,percent//10 if percent is not None else None)
                    if step!=previous:
                        print(model+': '+status+(f' {percent}%' if percent is not None else ''),flush=True)
                        previous=step
                    if status=='success':success=True
            if not success:raise RuntimeError('Model download ended without success')
            installed.append(model)
    return {'installed_models':installed}

def embed(settings):
    snapshot=read_json(settings.index_dir/'snapshot.json')
    vectors={};embedder=OllamaEmbedder(settings)
    for start in range(0,len(snapshot['chunks']),8):
        batch=snapshot['chunks'][start:start+8]
        out=embedder.embed([c['text'] for c in batch])
        vectors.update({c['chunk_id']:v for c,v in zip(batch,out)})
        print(f"Embedded {len(vectors)}/{len(snapshot['chunks'])}",flush=True)
    write_json(settings.index_dir/'embeddings.json',{'kb_version':snapshot['version'],'model':settings.embed_model,
        'dimension':len(next(iter(vectors.values()))),'vectors':vectors})
    return {'embedded_chunks':len(vectors),'model':settings.embed_model,'kb_version':snapshot['version']}

def evaluate(settings):
    cases=read_json(ROOT/'evaluation/questions.json')
    retriever=Retriever(settings);results=[]
    for mode in ['lexical','graph','hybrid']:
        details=[]
        for case in cases:
            req=QueryRequest(message=case['question'],exercise_code=case.get('exercise_code'),top_k=5)
            evidence,claims,trace=retriever.search(req,mode=mode)
            expected=set(case['expected_sources'])
            ranked=[e.source_id for e in evidence]
            found=expected.intersection(ranked)
            reciprocal=next((1/i for i,s in enumerate(ranked,1) if s in expected),0)
            details.append({'id':case['id'],'expected_sources':sorted(expected),'retrieved_sources':ranked,
                'recall_at_5':len(found)/len(expected) if expected else None,
                'reciprocal_rank':reciprocal if expected else None,
                'correct_abstention':not evidence if not expected else None,'trace':trace})
        positive=[r for r in details if r['recall_at_5'] is not None]
        negative=[r for r in details if r['correct_abstention'] is not None]
        results.append({'mode':mode,'source_recall_at_5':sum(r['recall_at_5'] for r in positive)/max(1,len(positive)),
            'source_mrr_at_5':sum(r['reciprocal_rank'] for r in positive)/max(1,len(positive)),
            'out_of_scope_abstention':sum(r['correct_abstention'] for r in negative)/max(1,len(negative)),
            'details':details})
    report={'kb_version':retriever.snapshot['version'],'case_count':len(cases),'results':results,
        'scope':'Small hand-authored source-level smoke evaluation; not an independent benchmark or a measure of answer correctness.',
        'llm_evaluated':False,'dense_index':retriever.dense_status}
    write_json(ROOT/'artifacts/retrieval_evaluation.json',report)
    return {k:v for k,v in report.items() if k!='results'} | {'results':[{k:v for k,v in r.items() if k!='details'} for r in results]}

def export_evidence(settings):
    engine=Engine(settings);snap=engine.retriever.snapshot
    request=ChatRequest(message='Khi chống đẩy hông nâng cao, tôi cần chú ý tiêu chí kỹ thuật nào?',exercise_code='PUSHUP',
        observation={'exercise_code':'PUSHUP','labels':['HIP_TOO_HIGH'],'unit':'window','observation_status':'sufficient','simulated':True},generate=False)
    response=engine.answer(request)
    write_json(ROOT/'artifacts/example_in_out.json',{'input':request.model_dump(),'output':response.model_dump()})
    book_request=ChatRequest(message='Cơ chủ vận, cơ đối kháng và cơ hiệp đồng có vai trò gì trong vận động?',generate=False)
    book_response=engine.answer(book_request)
    write_json(ROOT/'artifacts/book_in_out.json',{'input':book_request.model_dump(),'output':book_response.model_dump()})
    write_json(ROOT/'artifacts/kb_graph.json',snap['graph'])
    chosen=snap['claims'][:6]
    lines=['# Mẫu đầu ra KB SmartGym', '',f"Phiên bản: `{snap['version']}`. Đây là dữ liệu xuất từ snapshot đang chạy.",
        f"Nguồn có dữ liệu: {len(snap['sources'])}; đoạn: {len(snap['chunks'])}; tiêu chí có bằng chứng: {len(snap['claims'])}.",
        '', '| Tiêu chí | Bài tập | Nội dung diễn giải | Bằng chứng |','|---|---|---|---|']
    for c in chosen:lines.append(f"| {c['id']} | {c['exercise_code']} | {c['text_vi']} | {', '.join(c['chunk_ids'])} |")
    lines+=['','Quan hệ: `Exercise → HAS_CRITERION → TechniqueCriterion → SUPPORTED_BY → Chunk ← HAS_CHUNK ← Source`.',
        'Mỗi Chunk có URL nguồn và mục hoặc vị trí trang PDF. Các tiêu chí đã đối chiếu với đoạn nguồn bởi người phát triển; vẫn cần nhóm/giảng viên hoặc người có chuyên môn duyệt nội dung.',
        '', 'Không có quan hệ tự suy diễn từ nhãn tư thế sang bệnh lý hoặc nguyên nhân yếu cơ.', '', '## Nguồn đã xử lý']
    for s in snap['sources']:
        lines.append(f"- [{s['title']}]({s['url']}) — {s['publisher']}; file `{s['file']}`; SHA-256 `{s['sha256']}`.")
        if s.get('attribution'):lines.append(f"  {s['attribution']} Giấy phép: {s['license']}.")
    (ROOT/'artifacts/kb_sample.md').write_text('\n'.join(lines),encoding='utf-8')
    return {'exported':['artifacts/example_in_out.json','artifacts/book_in_out.json','artifacts/kb_graph.json','artifacts/kb_sample.md']}

def doctor(settings):
    out={'snapshot_present':(settings.index_dir/'snapshot.json').exists(),'provider':settings.llm_provider,'ollama_reachable':False,'chat_model_installed':False,'embed_model_installed':False}
    try:
        with httpx.Client(timeout=5) as client:
            r=client.get(settings.ollama_url+'/api/tags');r.raise_for_status()
        names={m['name'] for m in r.json().get('models',[])}
        out.update(ollama_reachable=True,chat_model_installed=settings.chat_model in names,embed_model_installed=settings.embed_model in names)
    except (httpx.HTTPError,ValueError,KeyError):out['ollama_note']='Install/start Ollama and pull the two configured models.'
    if out['snapshot_present']:
        ret=Retriever(settings)
        out.update(kb_version=ret.snapshot['version'],sources=len(ret.snapshot['sources']),chunks=len(ret.chunks),dense_index=ret.dense_status)
    return out

def main():
    parser=argparse.ArgumentParser(description='SmartGym reproducible KB + RAG pipeline')
    sub=parser.add_subparsers(dest='command',required=True)
    for name in ['fetch','ingest','embed','evaluate','export-evidence','doctor','sync-neo4j','pull-models']:sub.add_parser(name)
    query=sub.add_parser('query');query.add_argument('message');query.add_argument('--exercise',choices=['SQUAT','PUSHUP','JUMPING_JACK','REVERSE_CRUNCH']);query.add_argument('--no-generate',action='store_true')
    args=parser.parse_args();settings=Settings.from_env()
    if args.command=='fetch':
        out=fetch_sources()
        print(json.dumps(out,ensure_ascii=False,indent=2))
        return 1 if any(s['status']=='failed' and not s['optional'] for s in out) else 0
    if args.command=='pull-models':out=pull_models(settings)
    elif args.command=='ingest':out=build_index(index_dir=settings.index_dir)
    elif args.command=='embed':out=embed(settings)
    elif args.command=='evaluate':out=evaluate(settings)
    elif args.command=='export-evidence':out=export_evidence(settings)
    elif args.command=='doctor':out=doctor(settings)
    elif args.command=='sync-neo4j':
        from .graph import sync
        out=sync(read_json(settings.index_dir/'snapshot.json'))
    else:out=Engine(settings).answer(ChatRequest(message=args.message,exercise_code=args.exercise,generate=not args.no_generate)).model_dump()
    print(json.dumps(out,ensure_ascii=False,indent=2))
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:
        print(f'{type(exc).__name__}: {exc}',file=sys.stderr)
        sys.exit(1)
