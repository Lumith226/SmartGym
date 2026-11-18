from .models import ChatRequest, ChatResponse
from .providers import Generator, ProviderError
from .retrieval import Retriever
from .v4 import explain_labels

def with_attribution(reply: str, evidence, citations: list[str]) -> str:
    notes=list(dict.fromkeys(e.attribution for e in evidence if e.chunk_id in citations and e.attribution))
    return reply + ('\n\n'+'\n'.join(notes) if notes else '')

class Engine:
    def __init__(self, settings):
        self.settings=settings
        self.retriever=Retriever(settings)

    def answer(self, request: ChatRequest) -> ChatResponse:
        version=self.retriever.snapshot['version']
        warnings=[]
        if request.observation:
            if request.observation.simulated: warnings.append('Đầu vào quan sát là dữ liệu giả lập, không phải kết quả suy luận DL trực tiếp.')
            if request.observation.observation_status=='insufficient':
                return ChatResponse(reply='Chưa đủ dữ liệu quan sát để đánh giá động tác. Hãy kiểm tra khung hình và các khớp cần theo dõi trước khi phân tích lại.',status='insufficient_observation',generation_used=False,citations=[],evidence=[],graph_claims=[],warnings=warnings,kb_version=version,model_version='none',retrieval={'reason':'insufficient_observation'},observation=request.observation)
            if request.observation.observation_status=='unknown': warnings.append('Chất lượng quan sát chưa được xác nhận; chỉ giải thích kiến thức chung.')
        evidence,claims,trace=self.retriever.search(request)
        if request.observation and request.observation.labels and not request.observation.schema_version:
            warnings.append('Mã nhãn dùng để truy xuất còn là ánh xạ tạm thời; cần đối chiếu danh sách nhãn thật của nhóm DL.')
        if request.observation and request.observation.schema_version:
            return self.answer_v4(request,evidence,claims,trace,warnings)
        if not evidence:
            return ChatResponse(reply='KB hiện chưa có đủ bằng chứng phù hợp để trả lời câu hỏi này.',status='insufficient_evidence',generation_used=False,citations=[],evidence=[],graph_claims=[],warnings=warnings,kb_version=version,model_version='none',retrieval=trace)
        if request.generate:
            try:
                out=Generator(self.settings).generate(request.message,request.observation.model_dump() if request.observation else None,[e.model_dump() for e in evidence],claims)
                reply=out['answer']
                if request.observation and request.observation.simulated:
                    reply='Ví dụ này dùng đầu vào quan sát giả lập.\n\n'+reply
                return ChatResponse(reply=with_attribution(reply,evidence,out['citations']),status='insufficient_evidence' if out['insufficient_evidence'] else 'generated',generation_used=True,citations=out['citations'],evidence=evidence,graph_claims=claims,warnings=warnings,kb_version=version,model_version=out['model'],retrieval=trace,generation_mode='free_text')
            except ProviderError as exc: warnings.append(str(exc))
        excerpts='\n\n'.join(f"[{e.chunk_id}] {e.title}: {e.text[:350]}" for e in evidence[:3])
        citations=[e.chunk_id for e in evidence[:3]]
        return ChatResponse(reply=with_attribution('Đây là bản xem bằng chứng truy xuất, chưa phải câu trả lời do LLM tổng hợp.\n\n'+excerpts,evidence,citations),status='evidence_only',generation_used=False,citations=citations,evidence=evidence,graph_claims=claims,warnings=warnings,kb_version=version,model_version='none',retrieval=trace)

    def answer_v4(self, request, evidence, claims, trace, warnings):
        observation=request.observation
        rows=explain_labels(observation,self.retriever.snapshot)
        by_id={c['id']:c for c in claims}
        used_llm=False;model='none';selected=list(by_id)
        if request.generate and claims:
            try:
                preferred,model=Generator(self.settings).select_claims(request.message,observation.model_dump(),claims)
                selected=preferred+[cid for cid in selected if cid not in preferred]
                used_llm=True
            except ProviderError as exc:warnings.append(str(exc))
        kinds={'error':'Nhãn lỗi dự đoán','attribute':'Thuộc tính dự đoán','context':'Trạng thái video',
               'visibility':'Khả năng quan sát','positive':'Nhận xét gốc'}
        lines=['Các nhãn dưới đây là dự đoán của model, cần đối chiếu với video; không chứng minh nguyên nhân hay bệnh lý.']
        if observation.simulated:lines.insert(0,'Ví dụ này dùng đầu vào quan sát giả lập.')
        for row in rows:
            lines.append('- '+kinds[row['kind']]+': '+row['name_vi']+'. '+row['note_vi'])
            row['retrieved_criterion_ids']=[cid for cid in row['criterion_ids'] if cid in by_id]
            if row['kind']=='error' and not row['retrieved_criterion_ids']:
                lines.append('  KB chưa có đủ bằng chứng được liên kết cho nhãn này; chưa tự đề xuất cách sửa.')
        if not rows:lines.append('Chưa có nhãn vượt ngưỡng được hỗ trợ. Điều này không chứng minh toàn bộ động tác đúng.')
        citations=[]
        if claims:lines.append('\nTiêu chí tham khảo từ KB; cần xét đúng biến thể và điều kiện của nguồn:')
        for cid in selected:
            criterion=by_id[cid]
            refs=criterion['chunk_ids'][:1]
            lines.append('- '+criterion['text_vi']+' '+' '.join('['+ref+']' for ref in refs))
            citations.extend(refs)
        errors=[r for r in rows if r['kind']=='error']
        if errors and any(r['kind']=='positive' for r in rows):
            warnings.append('Model đồng thời dự đoán nhãn nhận xét tích cực và nhãn lỗi; chưa thể kết luận toàn bộ video đúng kỹ thuật.')
        coverage={'detected_labels':len(rows),'detected_error_labels':len(errors),
            'errors_with_retrieved_criteria':sum(bool(r['retrieved_criterion_ids']) for r in errors),
            'error_coverage':{key:sum(r['coverage']==key for r in errors) for key in ['direct','partial','none']},
            'note':'Partial links are not full coverage; professional review pending.'}
        warnings.append('Điểm model chưa được hiệu chuẩn thành xác suất kết luận đúng. Các tiêu chí KB đang chờ duyệt chuyên môn.')
        if used_llm:lines.append('\nLLM lựa chọn thứ tự tiêu chí; nội dung hướng dẫn được lấy nguyên từ tiêu chí KB có nguồn.')
        else:lines.append('\nPhần hướng dẫn này được ghép từ tiêu chí KB; chưa dùng LLM sinh lời giải thích.')
        citations=list(dict.fromkeys(citations))
        return ChatResponse(reply=with_attribution('\n'.join(lines),evidence,citations),
            status=('generated' if used_llm else 'grounded_guidance') if claims else 'insufficient_evidence',
            generation_used=used_llm,generation_mode='claim_selection' if used_llm else 'none',
            citations=citations,evidence=evidence,graph_claims=claims,warnings=warnings,
            kb_version=self.retriever.snapshot['version'],model_version=model,retrieval=trace,
            observation=observation,label_explanations=rows,knowledge_coverage=coverage)
