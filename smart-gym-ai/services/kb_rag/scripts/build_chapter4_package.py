"""Author Chapter 4 review materials and deterministic diagrams from verified data.

No model weights, KB facts, retrieval code or historical test scores are changed.
Figures are explicitly redrawn from the Neo4j export; Browser captures are separate.
"""
from collections import Counter
from pathlib import Path
import ast
import html
import json
import re
import textwrap
from kb_service.config import ROOT

W = ROOT.parents[2]
OUT = W/'CHUONG_4_BAO_CAO'
FIG = OUT/'figures'
COLORS = {'Exercise':'#dceafc','ModelLabel':'#fde5c6','TechniqueCriterion':'#dbefdf','Chunk':'#e9dff5','Source':'#d2eef0','ChatInput':'#dceafc','ChatOutput':'#dbefdf'}


def load(p):
    return json.loads(p.read_text(encoding='utf-8'))


def esc(s):
    return html.escape(str(s))


def svg_start(title, subtitle='', width=1700, height=950):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#455868"/></marker></defs><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="#153340"><text x="45" y="48" font-size="30" font-weight="bold">{esc(title)}</text><text x="45" y="81" font-size="18">{esc(subtitle)}</text>']


def box(parts, cx, cy, title, lines, kind='Exercise', width=270, height=150):
    parts.append(f'<rect x="{cx-width/2}" y="{cy-height/2}" width="{width}" height="{height}" rx="16" fill="{COLORS.get(kind,"#edf2f3")}" stroke="#536975" stroke-width="2"/>')
    ys = cy-height/2+30
    parts.append(f'<text x="{cx}" y="{ys}" text-anchor="middle" font-size="20" font-weight="bold">{esc(title)}</text>')
    ys += 27
    for line in lines:
        for sub in textwrap.wrap(str(line), width=max(20,int(width/9)),break_long_words=True,break_on_hyphens=False):
            parts.append(f'<text x="{cx}" y="{ys}" text-anchor="middle" font-size="17">{esc(sub)}</text>')
            ys += 22


def arrow(parts,x1,y1,x2,y2,label,dy=-10):
    parts.append(f'<path d="M{x1},{y1} L{x2},{y2}" fill="none" stroke="#455868" stroke-width="2.2" marker-end="url(#arrow)"/>')
    x,y=(x1+x2)/2,(y1+y2)/2+dy
    width = max(35,len(label)*9+10)
    parts.append(f'<rect x="{x-width/2}" y="{y-17}" width="{width}" height="24" rx="4" fill="white"/><text x="{x}" y="{y}" text-anchor="middle" font-size="16">{esc(label)}</text>')


def save_svg(name,parts):
    (FIG/(name+'.svg')).write_text(''.join(parts)+ '</g></svg>',encoding='utf-8')


def diagrams(snap, verification, cases):
    FIG.mkdir(exist_ok=True)
    p=svg_start('Ranh giới microservice của SmartGym','Cài đặt hiện tại: suy luận video và KB/RAG giao tiếp qua HTTP; Ollama là dịch vụ mô hình riêng.',height=850)
    box(p,220,260,'Web 8080',['Tải video, chat','SmartGym-Model','smart_gym_web_v4/web'],width=300,height=170)
    box(p,740,260,'API video 8001',['server/app.py','RTMPose + ST-GCN++ V4','server/coach.py'],width=360,height=170)
    box(p,1290,260,'KB RAG 8010',['/v1/chatbot','knowledge.py + chatbot.py','smart-gym-ai/services/kb_rag'],width=400,height=170)
    arrow(p,370,260,560,260,'HTTP /api/chatbot')
    arrow(p,920,260,1090,260,'JSON quan sát')
    box(p,1050,620,'Neo4j',['Bolt 7687; Browser 7474','KB có version','Đồ thị và trace tách nhãn'],kind='Source',width=370,height=170)
    box(p,1480,620,'Ollama 11434',['qwen3:8b','qwen3-embedding:0.6b','Sinh, embedding, review'],kind='Chunk',width=360,height=170)
    arrow(p,1240,345,1070,535,'Cypher')
    arrow(p,1350,345,1460,535,'HTTP')
    box(p,340,620,'Chỉ mục cục bộ',['snapshot.json + embeddings.json','Văn bản, tiêu chí, vector','Fallback graph cùng KB version'],kind='TechniqueCriterion',width=550,height=170)
    arrow(p,1100,345,600,535,'Đọc index')
    save_svg('01_microservice',p)
    p=svg_start('Từ nguồn tri thức đến câu trả lời có căn cứ','Hàng trên: xây dựng chỉ mục. Hàng dưới: xử lý một lượt chat. Không huấn luyện lại mô hình ngôn ngữ.',height=810)
    for x,title,lines,kind in [(210,'Nguồn',['5 HTML, 1 ghi chú, 1 PDF','URL, hash, quyền sử dụng'],'Source'),(650,'Tiền xử lý',['Chọn trang / bước tập','Chunk 1500, overlap 200'],'Chunk'),(1110,'KB và chỉ mục',['194 đoạn, 23 tiêu chí','Vector + 311 nút KG'],'TechniqueCriterion'),(1510,'Neo4j',['380 cạnh có hướng','Query cùng KB version'],'Source')]:
        box(p,x,245,title,lines,kind,width=320 if x!=1510 else 280,height=150)
    arrow(p,370,245,490,245,'Trích xuất');arrow(p,810,245,950,245,'Lập chỉ mục');arrow(p,1270,245,1370,245,'Đồng bộ')
    for x,title,lines,kind in [(210,'Đầu vào',['Câu hỏi + lịch sử','Quan sát video nếu có'],'ChatInput'),(650,'Truy xuất',['Planner → lexical / dense / KG','RRF k=60, tối đa 6 đoạn'],'Chunk'),(1110,'Tổng hợp và kiểm tra',['LLM viết từ bằng chứng','Span thật; đúng pha/biến thể'],'TechniqueCriterion'),(1510,'Đầu ra',['Reply + [1], [2]','Nguồn + trace + giới hạn'],'ChatOutput')]:
        box(p,x,600,title,lines,kind,width=320 if x!=1510 else 280,height=160)
    arrow(p,370,600,490,600,'Nhận ý định');arrow(p,810,600,950,600,'Evidence');arrow(p,1270,600,1370,600,'Công bố')
    arrow(p,1110,320,650,520,'Lấy đoạn và tiêu chí')
    save_svg('02_kb_rag_pipeline',p)
    p=svg_start('Lược đồ Knowledge Graph và số lượng thực tế','Năm kiểu nút, sáu kiểu cạnh; mũi tên thể hiện đúng hướng lưu trong Neo4j. Chỉ tính bản KB hiện tại.',height=890)
    loc={'Exercise':(250,230),'ModelLabel':(770,230),'TechniqueCriterion':(1300,230),'Chunk':(1300,650),'Source':(250,650)}
    arrow(p,390,230,630,230,'HAS_LABEL 83')
    arrow(p,910,230,1160,230,'RETRIEVES_CRITERION 33')
    arrow(p,250,155,1300,155,'HAS_CRITERION 23',-10)
    arrow(p,1300,310,1300,570,'SUPPORTED_BY 24',-10)
    arrow(p,390,650,1160,650,'HAS_CHUNK 194')
    arrow(p,1160,600,330,310,'MENTIONS 23')
    for kind,(x,y) in loc.items():
        fields={'Exercise':['Bài tập; node_id'],'ModelLabel':['key, kind, coverage','Ngưỡng theo catalog V4'],'TechniqueCriterion':['text_vi, review_status','Tiêu chí có đoạn hỗ trợ'],'Chunk':['text, source_id, section','pdf_page khi có PDF'],'Source':['URL, file, SHA256','publisher, license']}[kind]
        box(p,x,y,f'{kind}  {verification["node_types"][kind]}',fields,kind,width=300,height=155)
    p.append('<text x="45" y="835" font-size="19">RETRIEVES_CRITERION là liên kết truy xuất; không chứng minh nguyên nhân lỗi hay kết luận y khoa.</text>')
    save_svg('03_kg_schema',p)
    byid={n['id']:n for n in snap['graph']['nodes']}
    chunks={c['chunk_id']:c for c in snap['chunks']}
    claims={c['id']:c for c in snap['claims']}
    source={s['id']:s for s in snap['sources']}
    for number,code,label in [(4,'SQUAT','back_not_straight'),(5,'PUSHUP','butt_sinking'),(6,'JUMPING_JACK','only_legs'),(7,'REVERSE_CRUNCH','not_raising_hips')]:
        labelnode=byid[code+'.'+label]
        cids=[e['to'] for e in snap['graph']['edges'] if e['from']==code+'.'+label and e['type']=='RETRIEVES_CRITERION']
        selected=cids[:2]
        p=svg_start(code+' từ nhãn dự đoán tới nguồn','Hình vẽ lại từ dữ liệu Neo4j đã đối chiếu toàn bộ 311 nút và 380 cạnh. Ví dụ một nhãn, không phải toàn bộ bài.',height=1040)
        box(p,200,440,'Exercise',[code],'Exercise',width=300,height=150)
        box(p,590,440,'ModelLabel',[labelnode['label_key'],labelnode['name_vi'],'kind='+labelnode['kind'],'coverage='+labelnode['coverage']],'ModelLabel',width=300,height=190)
        arrow(p,350,440,440,440,'HAS_LABEL')
        for i,cid in enumerate(selected):
            y=280+i*350 if len(selected)>1 else 440
            c=claims[cid]; chunk=chunks[c['chunk_ids'][0]]; src=source[chunk['source_id']]
            box(p,1000,y,'TechniqueCriterion',[cid,c['text_vi']],'TechniqueCriterion',width=360,height=225)
            box(p,1450,y,'Chunk',[chunk['chunk_id'],chunk.get('section') or str(chunk.get('pdf_page'))],'Chunk',width=370,height=170)
            arrow(p,740,440,820,y,'RETRIEVES_CRITERION',-135 if len(selected)==1 else -10)
            arrow(p,1180,y,1265,y,'SUPPORTED_BY',-130)
            sy=y+200
            box(p,1450,sy,'Source',[src['id'],src['title']],'Source',width=370,height=120)
            arrow(p,1450,sy-60,1450,y+86,'HAS_CHUNK',-2)
        p.append('<text x="45" y="975" font-size="18">Exercise → ModelLabel → TechniqueCriterion → Chunk ← Source. Tiêu chí chờ thẩm định chuyên môn.</text><text x="45" y="1000" font-size="17">Source lặp vị trí trong các nhánh có cùng ID vẫn là một nút; hình chỉ chọn các đường đại diện.</text>')
        save_svg(f'{number:02d}_{code.lower()}',p)
    p=svg_start('Trace input output của ca VD03','Kết quả HTTP đã lưu ngày 07/11/2026, nhập lại vào suite riêng để trình bày. Không gọi lại model trong hình này.',height=910)
    box(p,250,280,'ChatInput',['case = VD03','Nhận xét đoạn này giúp tôi','ưu tiên điều đáng sửa nhất'],'ChatInput',width=390,height=175)
    box(p,920,280,'ChatOutput',['Nhãn dự đoán: xuống nông,','lưng không thẳng','Cue giữ lưng và siết cơ lõi'],'ChatOutput',width=430,height=175)
    box(p,510,650,'Chunk',['ace_squat_d8fdaffb3bf82853','Giữ lưng phẳng; pha hạ'],'Chunk',width=410,height=160)
    box(p,1050,650,'Chunk',['ace_squat_e6a53915e54bd223','Bracing để ổn định cột sống'],'Chunk',width=410,height=160)
    box(p,1490,470,'Source',['Bodyweight Squat','ACE; URL và SHA256'],'Source',width=330,height=160)
    arrow(p,445,280,705,280,'PRODUCED')
    arrow(p,250,368,510,570,'RETRIEVED')
    arrow(p,920,368,580,570,'CITES')
    arrow(p,1020,368,1050,570,'CITES')
    p.append('<path d="M1400,550 L1400,800 L510,800 L510,730" fill="none" stroke="#455868" stroke-width="2.2" marker-end="url(#arrow)"/><text x="865" y="788" font-size="16">HAS_CHUNK</text>')
    p.append('<path d="M1530,550 L1530,765 L1050,765 L1050,730" fill="none" stroke="#455868" stroke-width="2.2" marker-end="url(#arrow)"/><text x="1300" y="750" font-size="16">HAS_CHUNK</text>')
    p.append('<text x="45" y="855" font-size="19">Graph cho thấy đường đi. Table mới là nơi đọc đầy đủ câu hỏi, trả lời, nguồn và JSON.</text>')
    save_svg('08_trace_input_output',p)
    p=svg_start('Phân bố đoạn tri thức theo nguồn','194 đoạn; sách giải phẫu chiếm 171 đoạn, tương đương 88,1%. Số đoạn nhiều không đồng nghĩa phủ đủ lỗi.',height=750)
    for i,s in enumerate(snap['sources']):
        y=150+i*76
        p.append(f'<text x="45" y="{y+23}" font-size="20">{esc(s["id"])}</text><rect x="340" y="{y}" width="{max(6,s["chunks"]*6)}" height="36" fill="{COLORS["Source"]}"/><text x="{360+max(6,s["chunks"]*6)}" y="{y+25}" font-size="21">{s["chunks"]}</text>')
    save_svg('09_phan_bo_nguon',p)


def table(headers,rows):
    def clean(x): return str(x).replace('|','\\|').replace('\n','<br>')
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join('---' for _ in headers)+' |']+['| '+' | '.join(clean(x) for x in row)+' |' for row in rows])


def figure(name,caption):
    return f'![{caption}](figures/{name}.svg)\n\n{caption}\n'


def make_markdown(snap,v,cases):
    sources=snap['sources']; bycase={c['case_id']:c for c in cases}; chunks={c['chunk_id']:c for c in snap['chunks']}
    lines=['# CHƯƠNG 4 XÂY DỰNG CƠ SỞ TRI THỨC VÀ CHATBOT KG RAG CHO SMARTGYM',
    '## 4.1 Mục tiêu và phạm vi',
    'SmartGym kết hợp kết quả phân tích động tác với tài liệu có nguồn để hỗ trợ người tập hiểu và xem lại kỹ thuật. Chương này trình bày cách nhóm xây dựng cơ sở tri thức (KB), biểu diễn các liên kết bằng Knowledge Graph (KG), sử dụng truy xuất tăng cường sinh câu trả lời (RAG), và tích hợp thành chatbot tiếng Việt. Bốn bài được hỗ trợ là squat, chống đẩy, jumping jack và reverse crunch.',
    'Bốn chức năng được triển khai gồm hỏi đáp kỹ thuật, giải thích khoản trừ khi có chính sách, tóm tắt dữ liệu buổi tập và gợi ý luyện lại kỹ thuật khi lỗi lặp qua các quan sát độc lập. Hệ thống vẫn cần giới hạn kết luận theo tài liệu, chất lượng quan sát và ý nghĩa nhãn. Chính sách điểm hiện được minh họa bằng quy tắc thử nghiệm; gợi ý luyện lại chưa phải chương trình bổ trợ cá nhân hóa đã được thẩm định.',
    '### 4.1.1 Liên kết với thực nghiệm ở Chương 3',
    'Chương 3 so sánh 10 cấu hình tìm khớp trên 5 bài Fit3D, sau đó trình bày phân tích chuyển động với ST-GCN++ trên RepCount và Qualcomm. Phần Fit3D đo chất lượng vị trí khớp, không cung cấp nhãn chứng minh đúng kỹ thuật. Chương 4 tiếp nhận đầu ra phương án Qualcomm nhiều nhãn đang dùng trong ứng dụng; không dùng điểm PCK, F1 hay exact match làm điểm tập luyện của cá nhân.',
    table(['Bài trong ứng dụng','Mã API video','Mã KB','Số nhãn','Khung / ngữ cảnh'],[
        ['Squat','squat','SQUAT',14,'64 / 16'],['Chống đẩy','push_up','PUSHUP',21,'128 / 32'],['Jumping jack','jump_jack','JUMPING_JACK',29,'128 / 32'],['Reverse crunch','situp','REVERSE_CRUNCH',19,'128 / 32']]),
    'Mã `situp` được giữ để tương thích pipeline; bài được diễn giải là reverse crunch (gập bụng ngược). Tổng 83 nhãn gồm 23 lỗi, 47 thuộc tính, 8 trạng thái/ngữ cảnh, 4 nhãn khả năng quan sát và 1 nhãn tích cực. Một thuộc tính như `range_over_90` không tự trở thành số đo góc khớp đã xác minh. Điểm sigmoid vượt ngưỡng chỉ là quyết định kích hoạt nhãn, chưa phải xác suất đã hiệu chuẩn hoặc điểm kỹ thuật.',
    '### 4.1.2 Kiến trúc microservice',
    'Web demo nằm trong `SmartGym-Model/smart_gym_web_v4`, gửi video và yêu cầu chat tới API điều phối. `server/coach.py` chuyển yêu cầu qua HTTP tới dịch vụ KB/RAG độc lập trong `smart-gym-ai/services/kb_rag`. Dịch vụ này đọc chỉ mục, truy vấn Neo4j và gọi Ollama. Chat kiến thức không cần nạp trọng số vision; video phải có kết quả phân tích hợp lệ mới được dùng làm quan sát.',
    figure('01_microservice','Hình 4.1 Ranh giới dịch vụ và giao tiếp của SmartGym'),
    'Neo4j giữ đồ thị và trả quan hệ qua Cypher; Ollama phục vụ mô hình ngôn ngữ và embedding. Đây là hai vai trò khác nhau. Khi Neo4j không sẵn sàng, truy xuất có thể dùng snapshot đồ thị cùng version và ghi rõ fallback trong trace. Nếu embedding lỗi, trace công bố việc dùng lexical/graph. Khi LLM không trả được nội dung hợp lệ, hệ thống không công bố bản nháp như lời khuyên đã được kiểm tra.',
    '## 4.2 Thu thập và mô tả nguồn tri thức',
    '### 4.2.1 Danh mục nguồn đã xử lý',
    f'Bản KB `{v["kb_version"]}` có 7 tài liệu của 4 đơn vị xuất bản hoặc nguồn gốc xuất bản, gồm 5 HTML, 1 tệp ghi chú có dẫn nguồn và 1 sách PDF. Có một mục NSCA trong danh mục dự kiến nhưng chưa có tệp, nên không được tính là nguồn đã xử lý. Nhóm kiểm tra lại SHA256 của cả 7 tệp; giá trị khớp metadata đã lập chỉ mục.',
    table(['Tài liệu','Đơn vị','Dạng / đoạn','Tệp lưu trong data/raw'],[[s['title'],s['publisher'],s['format']+' / '+str(s['chunks']),s['file']] for s in sources]),
    'Các nguồn được chọn để có hướng dẫn từng bước cho bốn bài và kiến thức nền về cơ, khớp, vận động. Các trang hướng dẫn không có cùng phạm vi; biến thể chống đẩy gối phải được phân biệt với chống đẩy chuẩn. Tệp Queensland là ghi chú do người phát triển biên soạn từ trang đã xem, gồm trích ngắn và diễn giải tiếng Việt; không phải bản HTML gốc hoặc tài liệu đã được chuyên gia duyệt.',
    '### 4.2.2 Sách PDF và định vị trang',
    'Tệp `anatomy-and-physiology-2e_-_WEB.pdf` là Anatomy and Physiology 2e của OpenStax, Rice University; bản cung cấp có 1.347 trang. Nhóm chọn 84 trang ở các khoảng 353–369, 385–408, 425–429 và 433–470, tạo 171 đoạn. Nội dung bao gồm loại chuyển động, khớp hoạt dịch, mô cơ, co cơ, điều khiển lực cơ và các nhóm cơ thân, chi.',
    'Sách cung cấp kiến thức nền để trả lời khái niệm; không dùng riêng sách giải phẫu để quy định ngưỡng kỹ thuật cá nhân hoặc suy ra nguyên nhân chấn thương từ nhãn model. Trường `pdf_page` là vị trí trang trong tệp, tính từ 1. Ví dụ ca TC02 dẫn trang 426 trong file; đây không phải mặc nhiên số trang in trên sách.',
    'Giấy phép được ghi trong metadata là CC BY-NC-SA 4.0, kèm ghi công “Access for free at openstax.org.” Các nguồn ACE/NASM giữ bản quyền của nhà xuất bản. Báo cáo lưu URL và trích đoạn cần thiết; danh mục giấy phép và hash đầy đủ nằm trong `evidence/source_manifest.json`.',
    '### 4.2.3 Phân bố và giới hạn dữ liệu',
    figure('09_phan_bo_nguon','Hình 4.2 Phân bố số đoạn theo bảy tài liệu'),
    'Sách giải phẫu chiếm 171/194 đoạn (88,1%); hướng dẫn bài tập chỉ có 23 đoạn. Như vậy số lượng đoạn lớn chủ yếu phản ánh kiến thức nền, không chứng minh các lỗi tập đã được bao phủ đầy đủ. Nhãn bài tập gắn cho các đoạn hướng dẫn gồm squat 6, chống đẩy 8, jumping jack 6 và reverse crunch 3. Tag được tạo bằng cấu hình/từ điển, không phải phân loại ngữ nghĩa đã được đánh giá độc lập.',
    f'Độ dài đoạn thực tế từ {snap["report"]["chunk_characters"]["min"]} đến {snap["report"]["chunk_characters"]["max"]} ký tự, trung bình {snap["report"]["chunk_characters"]["mean"]} ký tự. Tài liệu giải phẫu hiện ít quan hệ khái niệm trong KG; truy vấn kiến thức nền chủ yếu dựa vào văn bản/vector. Điều này giải thích vì sao một đồ thị nhiều nút vẫn có thể thiếu quan hệ cho một câu hỏi cụ thể.',
    '## 4.3 Tiền xử lý và biểu diễn KB',
    '### 4.3.1 Quy trình chuẩn bị dữ liệu',
    'Nhóm đăng ký tài liệu trong `sources.json`, kiểm tra file, định dạng và đường dẫn; ghi URL, nhà xuất bản, quyền sử dụng và SHA256. Với HTML, `html_sections` bỏ script, style, menu, header/footer và biểu mẫu, sau đó lấy các mục Step tương ứng. Với sách, `extract_source` kiểm tra số trang của đúng bản PDF rồi chỉ đọc các khoảng đã chọn. Trang có dưới 60 ký tự được gắn `needs_ocr` và bỏ khỏi chỉ mục chờ xử lý; các trang đã chọn hiện không có mục cần OCR. Chưa triển khai OCR tự động.',
    'Hàm `split_text` chuẩn hóa khoảng trắng, bỏ ký tự NUL và chia trong phạm vi từng trang/mục, tối đa 1.500 ký tự, gối 200 ký tự. Hàm ưu tiên ranh giới câu hoặc dòng; đoạn dưới 60 ký tự không được giữ. Các đoạn trùng nội dung được loại theo hash. ID đoạn dựa trên nguồn, vị trí và nội dung để truy nguyên. Các tham số này là lựa chọn triển khai, chưa có thực nghiệm tối ưu độc lập.',
    'Tiêu chí kỹ thuật được khai báo trong `claims.json`; chỉ tiêu chí tìm được anchor trong đoạn của đúng nguồn mới được xuất bản. Kiểm tra anchor xác nhận có đoạn văn gốc, chưa xác nhận đầy đủ mọi diễn giải. 23 tiêu chí hiện mang trạng thái người phát triển đã kiểm tra anchor, chờ đánh giá chuyên môn. Khi xây dựng lại index, corpus, tiêu chí, catalog nhãn và đồ thị được ghi thành snapshot có version thống nhất.',
    '### 4.3.2 Mẫu đầu ra KB và ý nghĩa trường',
    'Mỗi Chunk chứa `chunk_id`, `source_id`, `text`, `title`, `publisher`, `url`, `section`, `pdf_page` và tag bài tập. TechniqueCriterion chứa ID, tên bài, nội dung tiếng Việt, anchor, các chunk hỗ trợ và trạng thái duyệt. ModelLabel chứa key nhãn, loại nhãn, ngưỡng trong catalog, liên kết tiêu chí và mức phủ.',
    '[Mẫu KB một trang kèm giải thích các trường](KB_MAU_MOT_TRANG.html) thể hiện bốn tiêu chí đại diện. Đây là đầu ra rút gọn để đọc; dữ liệu JSON lưu đầy đủ nguồn, hash và đoạn văn. Khi cần kiểm tra câu trả lời phải mở đúng đoạn, không chỉ xem tiêu đề tài liệu.',
    figure('02_kb_rag_pipeline','Hình 4.3 Luồng lập chỉ mục và xử lý câu hỏi'),
    '## 4.4 Thiết kế và cài đặt Knowledge Graph trên Neo4j',
    '### 4.4.1 Kiểu nút và thuộc tính',
    f'Kiểm tra Neo4j ngày 07/11/2026 cho thấy {v["nodes"]} nút KB và {v["edges"]} cạnh trong version hiện tại. Toàn bộ tập ID và bộ ba nguồn–quan hệ–đích khớp snapshot, không chỉ khớp số lượng. Số liệu này không cộng các nút lịch sử hội thoại.',
    figure('03_kg_schema','Hình 4.4 Lược đồ KG với số nút và cạnh được kiểm tra trực tiếp'),
    table(['Nút','Số lượng','Vai trò'],[['Source',7,'Nguồn gốc, tệp, URL, hash, quyền sử dụng'],['Chunk',194,'Đoạn văn và vị trí trang/mục'],['Exercise',4,'Mã chuẩn bài tập'],['TechniqueCriterion',23,'Tiêu chí có đoạn hỗ trợ'],['ModelLabel',83,'Nhãn đầu ra V4, kind và mức phủ']]),
    'Mỗi nút có nhãn chung `SmartGymKB`, `kb_version` và `node_id`; khóa lưu kết hợp version với ID. Cách này tách các phiên bản KB, tránh lấy tiêu chí của một bản nhưng trích đoạn của bản khác.',
    '### 4.4.2 Ý nghĩa và hướng của cạnh',
    table(['Quan hệ','Hướng','Số cạnh','Ý nghĩa'],[
        ['HAS_CHUNK','Source → Chunk',194,'Nguồn chứa đoạn'],['MENTIONS','Chunk → Exercise',23,'Đoạn được gắn tag bài'],['HAS_CRITERION','Exercise → TechniqueCriterion',23,'Tiêu chí thuộc bài'],['SUPPORTED_BY','TechniqueCriterion → Chunk',24,'Đoạn hỗ trợ tiêu chí'],['HAS_LABEL','Exercise → ModelLabel',83,'Nhãn thuộc đầu ra bài'],['RETRIEVES_CRITERION','ModelLabel → TechniqueCriterion',33,'Nhãn giúp tìm tiêu chí liên quan']]),
    '`RETRIEVES_CRITERION` là liên kết để truy xuất. Nó không nói rằng nhãn chứng minh người tập vi phạm tiêu chí, cũng không mô tả nguyên nhân sinh học. Mức `direct` có nghĩa tài liệu hỗ trợ trực tiếp diễn giải kỹ thuật liên quan trong phạm vi đã đối chiếu; `partial` chỉ hỗ trợ một phần hoặc thiếu ngưỡng/điều kiện; `none` chưa có liên kết đủ căn cứ. Việc đánh dấu do nhóm phát triển rà, chưa phải kiểm định chuyên môn.',
    '### 4.4.3 Đường liên kết chi tiết cho bốn bài',
    'Các hình sau chọn một nhãn đã có liên kết trực tiếp ở mỗi bài để thấy đường đi và thuộc tính. Chúng được vẽ lại từ dữ liệu thật đã xuất Neo4j, không phải ảnh giao diện Browser. Danh sách đầy đủ vẫn gồm 311 nút và 380 cạnh trong `evidence/neo4j_kb_export.json`; có thể tra theo từng nút trong trang đồ thị tương tác đi kèm.',
    ]
    for name,caption in [('04_squat','Hình 4.5 Squat từ nhãn lưng không thẳng tới tiêu chí và nguồn'),('05_pushup','Hình 4.6 Chống đẩy từ nhãn hông võng tới nguồn'),('06_jumping_jack','Hình 4.7 Jumping jack từ nhãn chỉ chuyển động chân tới nguồn'),('07_reverse_crunch','Hình 4.8 Reverse crunch từ nhãn chưa nâng hông tới nguồn')]:
        lines.append(figure(name,caption))
    lines += [
    '### 4.4.4 Phân biệt đồ thị tri thức và trace hội thoại',
    'Nút `SmartGymTrace:ChatInput`, `ChatOutput` và `Observation` lưu bằng chứng vận hành. Các cạnh `PRODUCED`, `RETRIEVED`, `CITES`, `USED_CRITERION`, `HAS_OBSERVATION` và `PREDICTS` nối đầu vào, đầu ra, đoạn đã lấy và nhãn quan sát. Một đoạn được lấy chưa chắc được trích; `RETRIEVED` lấy từ danh sách evidence, còn `CITES` lấy từ citations. Hội thoại do LLM tạo không được tự trở thành sự thật trong KB.',
    f'Đợt chuẩn bị báo cáo nhập {v["trace_cases"]} trường hợp vào suite `{v["trace_suite"]}` bằng MERGE, không xóa đồ thị. Có 10 kết quả HTTP đã lưu từ vòng kiểm thử cuối và 2 yêu cầu KB mới, được phân biệt bằng `evidence_origin` và timestamp. Nhập lại trace là tái hiện lịch sử trên đồ thị, không đồng nghĩa sinh lại các câu trả lời.',
    figure('08_trace_input_output','Hình 4.9 Đường input output và nguồn của ca VD03'),
    'Ảnh giao diện Neo4j thật được lưu riêng: [Graph KB](figures/neo4j_kb_graph.png), [Graph trace](figures/neo4j_trace_graph.png), [Table input output](figures/neo4j_input_output.png). Graph giúp giải thích đường liên kết; Table cho phép đọc câu hỏi và câu trả lời đầy đủ. Bộ truy vấn trình diễn nằm trong `NEO4J_TRINH_DIEN.cypher`.',
    '## 4.5 RAG kết nối KB và KG',
    '### 4.5.1 Hiểu câu hỏi và quản lý bối cảnh',
    '`answer_knowledge` nhận câu hỏi hiện tại, lịch sử, các quan sát đã xác minh và trạng thái video. Planner xác định nhu cầu truy xuất, hỏi làm rõ, đọc nguồn, giới hạn năng lực hoặc ngoài phạm vi. Xã giao thuần túy đi đường nhẹ; câu vừa cảm ơn vừa hỏi kỹ thuật vẫn được xử lý phần yêu cầu. Câu hỏi kỹ thuật chung có thể trả lời khi không có video.',
    'Nếu người dùng hỏi video nhưng mới chọn file hoặc phân tích chưa gắn vào chat, trạng thái `video_context` giúp hướng dẫn đúng bước. Quan sát chỉ được dùng sau kiểm tra schema, bảng nhãn, model hash khai báo, ngưỡng, chất lượng và đơn vị video/window/rep. Hash khai báo không phải chữ ký xác thực nguồn dữ liệu. Upload trùng video không được đếm thành hai lần quan sát độc lập.',
    '### 4.5.2 Ba kênh truy xuất và hợp nhất',
    'Retriever kết hợp lexical theo công thức BM25, dense bằng embedding `qwen3-embedding:0.6b` và đồ thị bài–tiêu chí–đoạn. Vector được chuẩn hóa; tích vô hướng giữa các vector chuẩn hóa dùng để xếp hạng tương đồng. Neo4j thực tế trả quan hệ hỗ trợ tiêu chí; nội dung văn bản và vector vẫn đọc từ chỉ mục cục bộ. Hệ thống hiện chưa dùng Neo4j làm vector database và không truy vấn một đồ thị y khoa suy luận nguyên nhân.',
    'Khi có nhãn V4, hệ thống giới hạn tiêu chí theo catalog của đúng bài và đúng nhãn. Truy vấn quan hệ được lọc `kb_version`. Các danh sách hạng được hợp nhất bằng Reciprocal Rank Fusion: điểm của đoạn c bằng tổng 1/(60 + rank) trên các kênh có c. Mỗi kênh xét tối đa 30 ứng viên; request hội thoại chọn tối đa 6 đoạn. `graph_claims` chỉ giữ tiêu chí có ít nhất một đoạn thực sự nằm trong evidence được đưa cho bước sinh.',
    'Với câu hỏi giải phẫu không gắn bài, kênh graph tiêu chí không được gọi. Vì vậy trace của LIVE_PDF ghi `local_snapshot` và chỉ có hai kênh lexical/dense; trường này không phải bằng chứng Neo4j đang lỗi. Ngược lại, ca VD03 và LIVE_KNOWLEDGE có bài xác định nên trace ghi backend Neo4j và ba kênh truy xuất.',
    '### 4.5.3 Sinh lời trả lời và kiểm tra bằng chứng',
    'Ollama chạy Qwen3 8B để lập kế hoạch, tổng hợp tiếng Việt và kiểm tra bản nháp. Lời khuyên kiến thức được tạo từ bằng chứng của lượt hiện tại, không tra bảng câu hỏi–đáp án có sẵn. Bản nháp chứa từng ý, ID đoạn và trích dẫn nguyên văn. Hệ thống kiểm tra quote tồn tại, đúng nguồn, pha và biến thể; có thể bổ sung span trong cùng tài liệu đã truy xuất để hỗ trợ câu nhiều vế rồi kiểm tra lại.',
    'Reviewer lựa chọn các ý liên quan, giảm lặp và bỏ phần thừa. Thuật ngữ cơ thể và guard tần suất hỗ trợ phát hiện một số suy diễn không có nguồn; chúng không thay thế suy luận ngữ nghĩa hoặc chuyên gia. Hệ thống giới hạn hai lần thử; nếu vẫn thiếu bằng chứng thì công bố giới hạn thay vì trả bản nháp. Các nhận định như “phổ biến”, số đo góc cá nhân hay nguyên nhân yếu cơ không được tự thêm.',
    'Giao diện chuyển ID nội bộ thành [1], [2], mở được tên nguồn, URL, mục/trang và đoạn hỗ trợ. JSON giữ nguyên ID và trace để kiểm tra. Cảnh báo về cơ chế review nằm trong phần kỹ thuật; các giới hạn thực tế như thiếu dữ liệu video hoặc chưa có chính sách điểm được diễn đạt ở nội dung cần thiết.',
    '### 4.5.4 Vai trò của LLM trong bốn chức năng',
    table(['Chức năng','Đầu vào và xử lý','Phạm vi kết quả'],[
        ['Hỏi đáp','Câu hỏi + lịch sử → truy xuất → LLM tổng hợp/review','Có nguồn; hỏi thêm/từ chối phần thiếu'],['Giải thích điểm','Quan sát + policy có tên/version → ledger xác định → tiêu chí','Tính bằng code; LLM chọn tiêu chí, không tự đặt khoản trừ'],['Tóm tắt','Quan sát độc lập + chất lượng + các lỗi thực tế','Không bịa rep, thời lượng hoặc tiến bộ'],['Luyện sửa lỗi','Kiểm tra lặp qua ≥2 quan sát độc lập → cue có nguồn','Luyện lại bài hiện tại; chưa kê bài bổ trợ cá nhân']]),
    '## 4.6 Đối chiếu thiết kế với mã nguồn',
    'Bảng sau dùng tên file và hàm thực tế để tái hiện cài đặt. Phần kiến trúc tổng thể và cài đặt ứng dụng ở các chương sau có thể mở rộng, nhưng các bước của KB/KG/RAG dưới đây đã tồn tại trong service.',
    table(['Bước','File và điểm vào'],[
        ['Thu thập / provenance','kb_service/ingest.py: fetch_sources, file_sha256'],['Trích xuất HTML / PDF','kb_service/ingest.py: html_sections, extract_source'],['Chia đoạn','kb_service/text.py: split_text'],['Index, anchor và version','kb_service/ingest.py: build_index'],['Đồng bộ và truy vấn Neo4j','kb_service/graph.py: sync, claim_support'],['Hợp nhất truy xuất','kb_service/retrieval.py: Retriever.search'],['Embedding / gọi Ollama','kb_service/providers.py: OllamaEmbedder.embed, Generator.structured'],['Hội thoại / sinh / review','kb_service/knowledge.py: plan_question, answer_knowledge'],['Kiểm tra span hỗ trợ','kb_service/grounding.py: source_windows, expand_support'],['4 chức năng / ledger / quan sát','kb_service/chatbot.py: answer_chatbot'],['Hợp đồng model','kb_service/v4.py: adapt_model_request, explain_labels; model_contracts/'],['Trình bày nguồn','kb_service/presentation.py; web/chat-view.js'],['Bridge HTTP','SmartGym-Model/smart_gym_web_v4/server/coach.py']]),
    'Mã trích nguyên văn của các bước quan trọng, kèm số dòng và SHA256 file, được đóng gói trong `CODE_MINH_CHUNG.md`. Các đường dẫn `kb_service/...` tính từ service KB/RAG. Việc đặt service trong `smart-gym-ai` không làm nó phụ thuộc frontend/backend nháp của thư mục này.',
    'Đoạn truy vấn trong `graph.claim_support` dưới đây lấy liên kết tiêu chí–chunk của đúng bài và đúng phiên bản; Retriever dùng các ID này để lấy đoạn trong snapshot:',
    '```cypher\nMATCH (e:SmartGymKB:Exercise)-[:HAS_CRITERION]->(t:SmartGymKB:TechniqueCriterion)-[:SUPPORTED_BY]->(c:SmartGymKB:Chunk)\nWHERE e.kb_version=$version AND t.kb_version=$version AND c.kb_version=$version\nAND ($exercise IS NULL OR e.node_id=$exercise)\nRETURN t.node_id AS claim_id, collect(c.node_id) AS chunk_ids\n```',
    '## 4.7 Minh họa input output và giải thích nguồn',
    '### 4.7.1 Quy cách trình bày',
    'Mỗi trường hợp kèm câu hỏi, task, nguồn gốc dữ liệu, quan sát nếu có, kết quả, đoạn trích, version và giới hạn. Request/response đầy đủ được lưu trong `evidence/input_output.json`; bản đọc gọn nằm ở `INPUT_OUTPUT.html`. Kết quả đã lưu được nhập Neo4j để đọc Table và xem đường CITES. Việc xem lại ảnh hoặc đồ thị không làm phát sinh một lần chạy LLM mới.',
    'Ví dụ request JSON thực tế gửi tới `POST /v1/chatbot` trong ca LIVE_PDF:',
    '```json\n'+json.dumps(bycase['LIVE_PDF']['input'],ensure_ascii=False,indent=2)+'\n```',
    'Các trường response sau được lấy nguyên giá trị từ lần gọi này; đây là phần rút gọn của response đầy đủ:',
    '```json\n'+json.dumps({k:bycase['LIVE_PDF']['output'][k] for k in ['status','generation_mode','kb_version','model_version','citations']},ensure_ascii=False,indent=2)+'\n```',
    ]
    for idx,case_id,title in [(2,'LIVE_PDF','Hỏi kiến thức nền bằng sách PDF'),(3,'VD03','Nhận xét kết quả một video squat'),(4,'DI02','Giải thích khoản trừ có policy minh họa'),(5,'BT02','Tóm tắt hai quan sát'),(6,'BT04','Luyện lại lỗi lặp qua hai video')]:
        c=bycase[case_id]; out=c['output']
        friendly=out['reply']
        for i,cid in enumerate(out.get('citations',[]),1):friendly=friendly.replace('['+cid+']','['+str(i)+']')
        lines += [f'### 4.7.{idx} {title}',f'**Case:** `{case_id}`. **Task:** `{c["input"]["task"]}`. **Input:** {c["input"]["message"]}',
                  f'**Nguồn gốc:** {"Gọi HTTP mới tới dịch vụ KB, không có video." if case_id.startswith("LIVE") else "Kết quả HTTP đã lưu của vòng kiểm thử cuối; quan sát video phân tích thật được tái sử dụng trong request."}',
                  '**Output nguyên nội dung, chỉ đổi ID thành số nguồn:**\n\n'+ '\n'.join('> '+x for x in friendly.splitlines()),
                  f'**Dấu vết:** KB `{out["kb_version"]}`; model `{out.get("model_version","không dùng")}`; mode `{out["generation_mode"]}`; graph backend `{out.get("retrieval",{}).get("graph_backend","không dùng ở nhánh này")}`.']
        for i,cid in enumerate(out.get('citations',[]),1):
            ch=chunks[cid]
            quotes=[q['quote'] for q in out.get('retrieval',{}).get('support_quotes',[]) if q['chunk_id']==cid]
            # Source excerpts in the chapter are intentionally short; full exact spans remain in JSON.
            extra = f'; trang file {ch["pdf_page"]}' if ch.get('pdf_page') else '; '+str(ch.get('section') or '')
            lines.append(f'Nguồn [{i}]: {ch["title"]}{extra}; ID `{cid}`; [tài liệu gốc]({ch["url"]}).'+ (' Trích hỗ trợ: “'+quotes[0]+'”' if quotes and len(quotes[0].split())<=45 else ' Xem đoạn hỗ trợ đầy đủ trong JSON/Neo4j.'))
        if case_id=='LIVE_PDF':
            lines.append('Đối chiếu thủ công của ví dụ sách: quote tự động tập trung vào định nghĩa antagonist; định nghĩa trực tiếp của agonist còn nằm ở đoạn đã truy xuất `openstax_anatomy_2e2d111a51695430`, cùng trang file 426: “Although a number of muscles may be involved in an action, the principal muscle involved is called the prime mover, or agonist.” Đoạn bổ sung này chưa được response đánh dấu CITES. Đây là điểm cần kiểm tra độ đầy đủ của citation, không được dùng trạng thái reviewer làm xác nhận mọi vế đã được quote chứng minh. Output gốc được giữ nguyên trong JSON/Neo4j.')
    lines += [
    'Ca DI02 dùng policy “DEMO kiểm thử thủ công — chưa kiểm định”: nhãn lưng không thẳng bị trừ 7 điểm theo quy tắc ứng dụng cung cấp. Số 7 không lấy từ điểm sigmoid, không lấy từ ACE, và không phải thang điểm chuyên môn chính thức. Ca BT02 đếm hai đơn vị quan sát, không chuyển thành hai rep. Ca BT04 chỉ nhận diện lỗi lặp trong các video độc lập; chưa kết luận người tập có thói quen lâu dài hoặc nguyên nhân cần phác đồ riêng.',
    '## 4.8 Kiểm thử và đánh giá phạm vi hỗ trợ',
    '### 4.8.1 Ba lớp độ phủ',
    'Phủ nội dung xét có tài liệu/tiêu chí đúng nhãn và điều kiện. Phủ truy xuất xét có lấy đúng nguồn/đoạn cho câu hỏi diễn đạt khác. Chất lượng câu trả lời xét từng ý có được đoạn hỗ trợ, đúng bối cảnh và dễ hiểu. Ba lớp được báo riêng; tìm đúng tên sách chưa chứng minh tìm đúng đoạn hoặc trả lời đúng.',
    table(['Bài','Nhãn lỗi','Direct','Partial','None'],[[code,d['errors'],d['error_coverage'].get('direct',0),d['error_coverage'].get('partial',0),d['error_coverage'].get('none',0)] for code,d in v['label_coverage'].items()]),
    'Tổng cộng 8/23 lỗi có liên kết trực tiếp (34,8%), 13/23 một phần (56,5%) và 2/23 chưa có (8,7%). Đây là kiểm kê liên kết do nhóm phát triển lập, không phải recall của model hoặc tỷ lệ câu trả lời đúng. Hai lỗi chưa có liên kết là `PUSHUP.child_pose_cheat` và `JUMPING_JACK.puppet_dance`. Không cộng nhóm partial vào direct để công bố “phủ đủ”.',
    '### 4.8.2 Kết quả kiểm thử đã lưu',
    'Vòng kiểm thử cuối có 40 kịch bản gốc, mở rộng thành 44 lượt chính trong một run_id, runtime revision `b09ac8f306a30c02` không đổi trước/sau. Rà soát của trợ lý phát triển ghi nhận 44/44 lượt đạt tiêu chí hành vi, bao gồm trường hợp hỏi làm rõ hoặc nêu giới hạn đúng. 89 unit test KB và 27 test web/API đã qua ở vòng đó. Các con số này lấy từ hồ sơ kiểm thử trước đợt soạn chương; không phải toàn bộ test được chạy lại trong lúc viết báo cáo.',
    'Ví dụ các lỗi đã sửa gồm trích đoạn chưa hỗ trợ đủ câu ghép, trạng thái video phân tích nhưng chưa gắn vào chat, rewrite thêm tần suất “phổ biến” không có căn cứ và giải thích thuộc tính ROM như góc đo thật. Hồ sơ lỗi trước sửa vẫn được giữ trong báo cáo nguyên nhân và kết quả thử lịch sử. Đánh giá hiện chưa độc lập với quá trình phát triển và chưa có hội đồng chuyên môn chấm từng câu.',
    '### 4.8.3 Quan sát độ trễ và các lượt bổ sung',
    'Trong bộ 44 lượt đã lưu, 5 lượt xã giao có trung vị 0,14 giây; 13 lượt tổng hợp có nguồn có trung vị 8,283 giây, khoảng 7,227–10,886 giây. Đây là mẫu kiểm thử chức năng, chưa phải benchmark P50/P95 nóng/nguội được kiểm soát. Cần đo riêng tải model, embedding, retrieval, generation, review và retry khi đánh giá hiệu năng.',
    table(['Lượt mới trong đợt chuẩn bị','Thời gian giây','Trạng thái','Mode'],[[c['case_id'],round(c['seconds'],3),c['output']['status'],c['output']['generation_mode']] for c in cases if c['case_id'].startswith('LIVE')]),
    'Hai lượt mới được giữ riêng ngoài 44 lượt gốc. Thời gian của lượt đầu cho thấy phản hồi thực tế có thể lâu hơn các mẫu trước; chưa có đo tách bước để xác định nguyên nhân hoặc gắn nhãn chắc chắn là cold start. Không dùng hai mẫu này để tuyên bố đạt một mức P95.',
    '### 4.8.4 Giới hạn còn lại',
    'Model nhận diện vẫn có thể báo thừa, thiếu nhãn hoặc sai khi khớp bị che. RAG không sửa được bản thân dự đoán vision. KB chưa có ngưỡng độ sâu cá nhân đã được kiểm chứng cho nhãn chống đẩy `too_deep`; ngưỡng kích hoạt model 0,35 là một đại lượng khác. Các mức ROM và mức nâng của reverse crunch chưa phải phép đo góc giải phẫu được xác minh. Chưa có chính sách điểm chính thức, bài bổ trợ theo nguyên nhân, đơn thuốc, liều bổ sung, ước tính calo chính xác hoặc đánh giá tiến bộ dài hạn.',
    'Các tiêu chí nguồn đang chờ thẩm định chuyên môn; tập câu hỏi đánh giá cần được mở rộng và tách khỏi tập phát triển. Việc có 311 nút hoặc 194 đoạn không chứng minh chatbot trả lời mọi câu hỏi thể hình. Hệ thống cần tăng nguồn phù hợp cho các khoảng trống thực tế, thay vì thêm PDF chỉ để tăng số lượng.',
    '## 4.9 Kết luận chương',
    'Nhóm đã xây dựng KB nhiều nguồn có sách PDF, biểu diễn tiêu chí–nhãn–đoạn–nguồn bằng Neo4j và tích hợp truy xuất lexical, dense, graph với chatbot. Luồng giao tiếp tách dịch vụ vision và KB/RAG; câu trả lời có thể lần theo request, nhãn quan sát, tiêu chí, trích đoạn và nguồn. Bốn chức năng đã có đầu vào/đầu ra minh họa với giới hạn được công bố.',
    'Kết quả kiểm thử hiện cho thấy các hành vi được xét trong bộ phát triển đã được khắc phục, đồng thời vẫn còn thiếu độ phủ một số nhãn, chính sách điểm được thẩm định, thử nghiệm độc lập và đo độ trễ có kiểm soát. Hướng hoàn thiện là xác minh nhãn còn mơ hồ với thành viên phụ trách DL, bổ sung nguồn theo khoảng trống và mời người đánh giá chuyên môn kiểm tra từng diễn giải.',
    '## Tài liệu nguồn và tệp đã thu thập',
    ]
    for i,s in enumerate(sources,1):
        lines.append(f'{i}. {s["publisher"]}. [{s["title"]}]({s["url"]}). Tệp [{s["file"]}](../smart-gym-ai/services/kb_rag/data/raw/{s["file"]}). SHA256 `{s["sha256"]}`. Quyền sử dụng: {s["license"]}.')
    lines += ['## Hồ sơ cài đặt và thực nghiệm đi kèm',
              '[Kết quả kiểm thử cuối](../KET_QUA_TEST_CHATBOT_CUOI_2026-11-07.html); [phân tích năm ca trước sửa](../PHAN_TICH_NGUYEN_NHAN_5_CA_CHATBOT.md); [kiểm tra DB và version](evidence/verification.json); [nguồn và hash](evidence/source_manifest.json); [IN OUT đầy đủ](evidence/input_output.json); [đồ thị dữ liệu thật](KG_CHI_TIET.html); [code minh chứng](CODE_MINH_CHUNG.md).']
    return '\n\n'.join(lines)+'\n'


def markdown_html(text):
    result=[]; rows=text.splitlines(); i=0
    inline=lambda x: re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',re.sub(r'`([^`]+)`',r'<code>\1</code>',re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',esc(x))))
    while i<len(rows):
        line=rows[i]
        if line.startswith('```'):
            code=[];i+=1
            while i<len(rows) and not rows[i].startswith('```'):
                code.append(rows[i]);i+=1
            result.append('<pre>'+esc('\n'.join(code))+'</pre>');i+=1
        elif line.startswith('!['):
            m=re.match(r'!\[([^\]]*)\]\(([^)]+)\)',line)
            result.append(f'<figure><img src="{esc(m[2])}" alt="{esc(m[1])}"></figure>');i+=1
        elif line.startswith('| '):
            block=[]
            while i<len(rows) and rows[i].startswith('| '):block.append(rows[i]);i+=1
            cells=lambda r:r.strip('| ').split(' | ')
            result.append('<table><thead><tr>'+''.join('<th>'+inline(x)+'</th>' for x in cells(block[0]))+'</tr></thead><tbody>')
            for row in block[2:]:result.append('<tr>'+''.join('<td>'+inline(x).replace('&lt;br&gt;','<br>')+'</td>' for x in cells(row))+'</tr>')
            result.append('</tbody></table>')
        elif line.startswith('#'):
            n=len(line)-len(line.lstrip('#'));title=line[n:].strip();anchor='section-'+str(len(result))
            result.append(f'<h{n} id="{anchor}">{inline(title)}</h{n}>');i+=1
        elif line.startswith('> '):
            result.append('<blockquote>'+inline(line[2:])+'</blockquote>');i+=1
        elif line.strip():result.append('<p>'+inline(line)+'</p>');i+=1
        else:i+=1
    return '\n'.join(result)


CSS='''body{font:17px/1.65 Arial,sans-serif;color:#18313a;margin:0;background:#f3f6f7}main{max-width:1060px;margin:30px auto;padding:50px;background:white}h1{font-size:28px;color:#102d36}h2{font-size:24px;margin-top:44px}h3{font-size:20px;margin-top:30px}p{text-align:justify}table{width:100%;border-collapse:collapse;font-size:14px;margin:22px 0;overflow-wrap:anywhere}th,td{padding:11px 10px;text-align:left;vertical-align:top;border-bottom:1px solid #cdd8dc}th{background:#eaf1f4}a{color:#146278}figure{margin:24px 0}img{max-width:100%;height:auto}code{font:0.87em Consolas,monospace;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 Consolas,monospace;background:#f2f5f6;padding:15px}blockquote{margin:10px 0;padding-left:18px;border-left:3px solid #cbded6}nav{margin-bottom:25px}button,input,select{font:inherit;padding:9px}details{margin:18px 0}summary{cursor:pointer;font-weight:bold}@media print{@page{size:A4;margin:20mm}body{background:white;font:12pt/1.5 'Times New Roman',serif}main{margin:0;padding:0;max-width:none}nav,button{display:none}h1{font-size:18pt}h2{font-size:15pt;break-after:avoid}h3{font-size:13pt;break-after:avoid}table{font-size:10pt}thead{display:table-header-group}tr,figure{break-inside:avoid}a{color:inherit}img{max-height:220mm}pre{font-size:9pt}}'''


def shell(title,body):
    return '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>'+CSS+'</style><main><nav><a href="index.html">Bộ hồ sơ Chương 4</a> · <button onclick="window.print()">In</button></nav>'+body+'</main></html>'


def extra_artifacts(snap,v,cases):
    claims={c['id']:c for c in snap['claims']}; chunks={c['chunk_id']:c for c in snap['chunks']}
    sample=[]
    for cid in ['squat_bracing','pushup_hip_control','jack_sync','crunch_pelvis']:
        c=claims[cid];code=c['exercise_code']
        ch=chunks[c['chunk_ids'][0]]
        sample.append({'exercise_code':code,'criterion_id':c['id'],'text_vi':c['text_vi'],'chunk_id':ch['chunk_id'],'section':ch['section'],'source_title':ch['title'],'url':ch['url'],'review_status':c['review_status']})
    (OUT/'evidence/kb_one_page_sample.json').write_text(json.dumps(sample,ensure_ascii=False,indent=2),encoding='utf-8')
    body='<style>.kb-sample h3{margin:18px 0 6px}.kb-sample p{margin:8px 0}</style><div class="kb-sample"><h1>Mẫu đầu ra KB SmartGym</h1><p>KB '+esc(v['kb_version'])+' · Bốn tiêu chí và một đoạn sách · 07/11/2026</p>'
    for c in sample:
        body+='<h3>'+esc(c['exercise_code']+' · '+c['criterion_id'])+'</h3><p>'+esc(c['text_vi'])+'</p><p style="font-size:12px">Chunk <code>'+esc(c['chunk_id'])+'</code> · '+esc(c['section'])+' · <a href="'+esc(c['url'])+'">'+esc(c['source_title'])+'</a></p>'
    book=chunks['openstax_anatomy_7cd3eea6a50d70b8']
    excerpt='A muscle with the opposite action of the prime mover is called an antagonist.'
    assert ' '.join(excerpt.split()) in ' '.join(book['text'].split())
    body+='<h3>Đoạn sách OpenStax</h3><p style="font-size:13px">'+esc(excerpt)+'</p><p style="font-size:12px"><code>'+esc(book['chunk_id'])+'</code> · pdf_page = 426 · <a href="'+esc(book['url'])+'">Anatomy and Physiology 2e</a> · Access for free at openstax.org.</p>'
    body+='<p><strong>Giải thích:</strong> exercise_code định danh bài; criterion_id định danh tiêu chí; text_vi diễn giải tiếng Việt; chunk_id nối tới đoạn; section định vị mục; pdf_page là vị trí trang file; URL nối nguồn. Anchor đã được người phát triển kiểm tra; thẩm định chuyên môn còn chờ. Đoạn sách là một câu trích nguyên văn; JSON giữ toàn đoạn và metadata.</p></div>'
    (OUT/'KB_MAU_MOT_TRANG.html').write_text(shell('Mẫu KB một trang',body),encoding='utf-8')
    body='<h1>Input output đã lưu trong Neo4j</h1><p>Đọc rõ nguồn gốc từng ca. Nội dung lời trả lời và JSON được giữ nguyên; ID thô ở đây phục vụ kiểm tra kỹ thuật.</p>'
    for c in cases:
        body+='<h2>'+esc(c['case_id'])+'</h2><p>'+esc(c['evidence_origin'])+' · '+esc(c['timestamp_utc'])+'</p><h3>Input</h3><p>'+esc(c['input']['message'])+'</p><h3>Output</h3><pre>'+esc(c['output']['reply'])+'</pre><details><summary>Request JSON đầy đủ</summary><pre>'+esc(json.dumps(c['input'],ensure_ascii=False,indent=2))+'</pre></details><details><summary>Response JSON đầy đủ</summary><pre>'+esc(json.dumps(c['output'],ensure_ascii=False,indent=2))+'</pre></details>'
    (OUT/'INPUT_OUTPUT.html').write_text(shell('Input output Chương 4',body),encoding='utf-8')
    selected=[('ingest.py','extract_source'),('text.py','split_text'),('ingest.py','build_index'),('graph.py','claim_support'),('retrieval.py','search'),('providers.py','structured'),('grounding.py','expand_support'),('knowledge.py','answer_knowledge'),('chatbot.py','answer_chatbot')]
    code=['# Mã nguồn minh chứng Chương 4','Trích nguyên văn từ phiên bản đang có trong workspace. Số dòng hỗ trợ đối chiếu; code thay đổi sẽ cần xuất lại. Đây là phụ lục kỹ thuật, không phải toàn bộ code đưa vào thân chương.']
    import hashlib
    for filename,func in selected:
        path=ROOT/'kb_service'/filename; text=path.read_text(encoding='utf-8'); tree=ast.parse(text)
        node=next(n for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==func)
        code+=['## '+filename+' '+func,f'File `smart-gym-ai/services/kb_rag/kb_service/{filename}`; dòng {node.lineno}–{node.end_lineno}; SHA256 `{hashlib.sha256(path.read_bytes()).hexdigest()}`.', '```python\n'+'\n'.join(text.splitlines()[node.lineno-1:node.end_lineno])+'\n```']
    (OUT/'CODE_MINH_CHUNG.md').write_text('\n\n'.join(code)+'\n',encoding='utf-8')


def explorer(snap):
    exported=load(OUT/'evidence/neo4j_kb_export.json')
    kinds={x['id']:x['type'] for x in snap['graph']['nodes']}
    complete={'nodes':[dict(x['properties'],id=x['properties']['node_id'],type=kinds[x['properties']['node_id']]) for x in exported['nodes']], 'edges':snap['graph']['edges']}
    data=json.dumps(complete,ensure_ascii=False).replace('</','<\\/')
    # Search and inspect a real one-hop neighborhood, retaining every node/edge in embedded data.
    body='''<h1>Tra cứu chi tiết KG từ dữ liệu Neo4j</h1><p>Toàn bộ 311 nút và 380 cạnh được đối chiếu với database. Chọn nút để đọc thuộc tính và xem các cạnh có hướng. Hình tương tác là bản vẽ lại, không phải giao diện Neo4j Browser.</p><input id="search" placeholder="Tìm ID hoặc nội dung, ví dụ back_not_straight" style="width:95%"><p><select id="node" style="width:100%"></select></p><div id="graph"></div><h2>Thuộc tính nút</h2><pre id="props"></pre><h2>Cạnh liên quan</h2><div id="edges"></div>'''
    script='''<script>const G=DATA;const nodes=new Map(G.nodes.map(n=>[n.id,n]));const sel=document.querySelector('#node');const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function options(){const term=document.querySelector('#search').value.toLowerCase();sel.replaceChildren();for(const n of G.nodes.filter(n=>JSON.stringify(n).toLowerCase().includes(term))){const o=document.createElement('option');o.value=n.id;o.textContent=n.type+' · '+n.id;sel.append(o)}render()}function render(){const id=sel.value;if(!id){document.querySelector('#graph').replaceChildren();return}const n=nodes.get(id);document.querySelector('#props').textContent=JSON.stringify(n,null,2);const e=G.edges.filter(e=>e.from===id||e.to===id);const neighbors=[...new Set(e.flatMap(e=>[e.from,e.to]).filter(x=>x!==id))];const h=Math.max(400,neighbors.length*95+50);let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 '+h+'"><defs><marker id="arr" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto" viewBox="0 0 10 10"><path d="M0 0 L10 5 L0 10" fill="#456"/></marker></defs>';svg+='<rect x="20" y="'+(h/2-65)+'" width="330" height="130" rx="10" fill="#dceafc"/>';svg+='<foreignObject x="35" y="'+(h/2-50)+'" width="300" height="110"><div xmlns="http://www.w3.org/1999/xhtml" style="font:16px Arial;overflow-wrap:anywhere">'+safe(n.type)+'<br>'+safe(id)+'</div></foreignObject>';neighbors.forEach((nid,i)=>{let y=60+i*95;const rel=e.find(e=>e.from===nid||e.to===nid);const outward=rel.from===id;svg+='<path d="M'+(outward?'350,'+h/2+' L640,'+y:'640,'+y+' L350,'+h/2)+'" stroke="#456" fill="none" marker-end="url(#arr)"/><rect x="640" y="'+(y-35)+'" width="350" height="78" rx="8" fill="#dbefdf"/><foreignObject x="650" y="'+(y-27)+'" width="330" height="65"><div xmlns="http://www.w3.org/1999/xhtml" style="font:14px Arial;overflow-wrap:anywhere">'+safe(nodes.get(nid).type)+'<br>'+safe(nid)+'</div></foreignObject><text x="380" y="'+(y-10)+'" font-family="Arial" font-size="13">'+safe(rel.type)+'</text>'});svg+='</svg>';document.querySelector('#graph').innerHTML=svg;document.querySelector('#edges').innerHTML='<table><tr><th>Nguồn</th><th>Quan hệ</th><th>Đích</th></tr>'+e.map(x=>'<tr><td>'+safe(x.from)+'</td><td>'+safe(x.type)+'</td><td>'+safe(x.to)+'</td></tr>').join('')+'</table>'}sel.onchange=render;document.querySelector('#search').oninput=options;options();sel.value='SQUAT.back_not_straight';render();</script>'''.replace('DATA',data)
    (OUT/'KG_CHI_TIET.html').write_text(shell('KG chi tiết',body).replace('</html>',script+'</html>'),encoding='utf-8')


def main():
    snap=load(ROOT/'data/index/snapshot.json');v=load(OUT/'evidence/verification.json');cases=load(OUT/'evidence/input_output.json')['cases']
    diagrams(snap,v,cases)
    text=make_markdown(snap,v,cases)
    (OUT/'CHUONG_4_NOI_DUNG.md').write_text(text,encoding='utf-8')
    (OUT/'CHUONG_4_NOI_DUNG.html').write_text(shell('Chương 4 KB KG RAG SmartGym',markdown_html(text)),encoding='utf-8')
    extra_artifacts(snap,v,cases)
    explorer(snap)
    index='''<h1>Hồ sơ chuẩn bị báo cáo Chương 4 SmartGym</h1><p>Nội dung chương, hình vẽ, dữ liệu thật và hướng dẫn trình diễn đã tách để thuận tiện kiểm tra trước khi ghép Chương 3 và 4 thành Word.</p><ul><li><a href="CHUONG_4_NOI_DUNG.html">Đọc nội dung Chương 4</a></li><li><a href="KB_MAU_MOT_TRANG.html">Mẫu KB một trang</a></li><li><a href="KG_CHI_TIET.html">Tra cứu 311 nút và 380 cạnh</a></li><li><a href="INPUT_OUTPUT.html">12 bộ input output</a></li><li><a href="HUONG_DAN_NEO4J.md">Hướng dẫn Neo4j và chụp hình</a></li><li><a href="DOI_CHIEU_YEU_CAU.md">Đối chiếu yêu cầu giảng viên và Chương 3</a></li><li><a href="NEO4J_TRINH_DIEN.cypher">Bộ truy vấn trình diễn</a></li><li><a href="CODE_MINH_CHUNG.md">Mã nguồn minh chứng</a></li></ul><h2>Sơ đồ và ảnh Neo4j</h2>'''
    full_graph=FIG/'neo4j_toan_bo_311_nut_380_canh_graph.png'
    if full_graph.exists():
        index+='<h2>Ảnh Neo4j toàn bộ 311 nút và 380 cạnh</h2><p>Đồ thị dưới đây do Neo4j Browser dựng từ truy vấn toàn bộ KB cùng phiên bản và xuất bằng Download as PNG. Hình input output dạng hộp trước đó là sơ đồ giải thích được vẽ lại; hai loại hình có nguồn gốc khác nhau.</p><p><a href="figures/neo4j_toan_bo_311_nut_380_canh_graph.png">Mở ảnh đồ thị gốc kích thước lớn</a> · <a href="figures/neo4j_toan_bo_311_nut_380_canh.png">Ảnh giao diện Neo4j có thống kê 311 nút và 380 cạnh</a> · <a href="NEO4J_TOAN_BO_311_380.cypher">Truy vấn toàn bộ KB</a></p><a href="figures/neo4j_toan_bo_311_nut_380_canh_graph.png"><img src="figures/neo4j_toan_bo_311_nut_380_canh_graph.png" alt="Toàn bộ 311 nút và 380 cạnh do Neo4j Browser dựng và xuất"></a><p>Đồ thị có năm thành phần liên thông: một nguồn sách và 171 đoạn; bốn cụm còn lại tương ứng bốn bài tập. Ảnh toàn cảnh thể hiện quy mô; dùng hình nhánh và trang tra cứu để đọc từng thuộc tính, cạnh.</p>'
    for path in sorted(FIG.glob('*.svg')):
        index+='<h3>'+esc(path.stem)+'</h3><a href="figures/'+path.name+'"><img src="figures/'+path.name+'" alt="'+esc(path.stem)+'"></a>'
    for path in sorted(FIG.glob('neo4j*.png')):
        if path.name.startswith('neo4j_toan_bo_'):
            continue
        index+='<h3>Ảnh Neo4j thật '+esc(path.stem)+'</h3><img src="figures/'+path.name+'" alt="Neo4j Browser">'
    (OUT/'index.html').write_text(shell('Hồ sơ Chương 4 SmartGym',index),encoding='utf-8')
    print('Built content, one-page KB, explorer, IN/OUT, code excerpts and 9 SVG figures.')


if __name__=='__main__':
    main()
