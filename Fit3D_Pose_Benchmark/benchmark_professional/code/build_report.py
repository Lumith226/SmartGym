"""Build the final 14-page A4 benchmark document from measured revision files."""
import csv
import json
from pathlib import Path

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
R = ROOT / 'results'
F = ROOT / 'work' / 'figures'
OLD = ROOT.parent / 'pose_benchmark' / 'results_full'
NAME = 'SmartGym_Pretrained_Benchmark_Professional'
NAVY, BLUE, TEAL, INK, MUTED, PALE = '1A3151', '2F70D6', '14A69A', '182538', '4F5E70', 'F2F5F8'
WIDTH = 16.8


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


S = read(R / 'summary.json')
B = read(R / 'paired_bootstrap.json')
T = read(R / 'paired_speed_control.json')['summary']
O = read(R / 'occlusion' / 'results.json')
M = read(OLD / 'MODEL_PROVENANCE.json')
C = list(csv.DictReader((R / 'comparison_camera_summary.csv').open(encoding='utf-8-sig')))
MODELS = [x['model'] for x in S['squat']]
LABEL = dict(zip(MODELS, ['YOLOv8n-Pose','YOLO11n-Pose','YOLO26n-Pose','RTMPose-m','RTMO-s',
                         'ViTPose-B','HRNet-W32','Lite-HRNet-18','MoveNet-Lightning','LitePose-Auto-S †']))
SHORT = dict(zip(MODELS, ['YOLOv8n','YOLO11n','YOLO26n','RTMPose-m','RTMO-s',
                          'ViTPose-B','HRNet-W32','Lite-HRNet-18','MoveNet Web','LitePose †']))
BY = {e:{r['model']:r for r in rows} for e,rows in S.items()}
CAMS = ['50591643','58860488','60457274','65906101']
TOPDOWN = {'RTMPose-m','ViTPose-B','HRNet','Lite-HRNet','MoveNet-Lightning'}


def num(v, n=2):
    return f'{float(v):.{n}f}'.replace('.', ',')


def signed(v, n=2):
    return f'{float(v):+.{n}f}'.replace('.', ',').replace('-', '−')


def mean(nums):
    x = list(nums)
    return sum(x) / len(x)


def top(e,k):
    return sorted([r for r in S[e] if r['ranked']], key=lambda r: r[k], reverse=k!='mae')


def metric_rank(e, key, i):
    ranked = top(e, key)
    n = 1 if key == 'fps' else 2
    if key == 'mae' and e == 'squat':
        if i == 0:
            return f'{sum(r[key]==ranked[0][key] for r in ranked)} cấu hình đồng hạng\n{num(ranked[0][key],n)}'
        return 'Đồng hạng 1'
    row = ranked[i]
    return f'{SHORT[row["model"]]}\n{num(row[key],n)}'


doc = Document()
doc.core_properties.title = 'So sánh 10 mô hình Human Pose Estimation cho SmartGym'
doc.core_properties.subject = 'Benchmark Fit3D trên AMD Radeon RX 5600 XT'
doc.core_properties.keywords = 'SmartGym, Fit3D, pose estimation, PCK, MAE, DirectML'


def rgb(h):
    return RGBColor.from_string(h)


def style(name, size, color=INK, bold=False, after=5, before=0):
    try:
        s=doc.styles[name]
    except KeyError:
        s=doc.styles.add_style(name,WD_STYLE_TYPE.PARAGRAPH)
    s.font.name='Arial'
    fonts=s._element.rPr.rFonts
    for attr in ('asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme'):
        fonts.attrib.pop(qn('w:'+attr),None)
    s.font.size=Pt(size)
    s.font.color.rgb=rgb(color)
    s.font.bold=bold
    p=s.paragraph_format
    p.space_after=Pt(after);p.space_before=Pt(before)
    p.line_spacing=1.12
    return s


style('Normal',10.5,after=6)
title_style=style('Title',22,'000000',True,after=9)
title_properties=title_style._element.pPr
title_properties.remove(title_properties.find(qn('w:pBdr')))
style('Heading 1',20,'000000',True,after=7)
style('Heading 2',12,'000000',True,after=5,before=9)
style('Caption',9,MUTED,after=8,before=3)
style('Kicker',9,TEAL,True,after=5)
style('Deck',11,MUTED,after=10)
style('SourceLine',9,MUTED,after=3)
style('Figure',10,after=0,before=0)
style('TableCell',9,after=0,before=0).paragraph_format.line_spacing=1.13


def configure(s, part):
    s.page_width=Cm(21);s.page_height=Cm(29.7)
    s.top_margin=Cm(2.08);s.bottom_margin=Cm(2.12)
    s.left_margin=Cm(2.1);s.right_margin=Cm(2.1)
    s.header_distance=Cm(.95);s.footer_distance=Cm(.95)
    s.header.is_linked_to_previous=False
    p=s.header.paragraphs[0]
    p.style='Normal'
    p.paragraph_format.tab_stops.add_tab_stop(Cm(WIDTH),WD_TAB_ALIGNMENT.RIGHT)
    p.paragraph_format.space_after=Pt(0)
    a=p.add_run('SMARTGYM  /  BENCHMARK FIT3D');a.bold=True;a.font.name='Arial';a.font.size=Pt(8.5);a.font.color.rgb=rgb(NAVY)
    a=p.add_run('\t'+part);a.font.name='Arial';a.font.size=Pt(8.5);a.font.color.rgb=rgb(MUTED)
    if s.footer.is_linked_to_previous and part.startswith('PHẦN B'):
        return
    p=s.footer.paragraphs[0]
    p.style='Normal'
    p.paragraph_format.tab_stops.add_tab_stop(Cm(WIDTH),WD_TAB_ALIGNMENT.RIGHT)
    p.paragraph_format.space_after=Pt(0)
    a=p.add_run('SmartGym · Human Pose Estimation\t');a.font.name='Arial';a.font.size=Pt(8.5);a.font.color.rgb=rgb(MUTED)
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE')
    a=OxmlElement('w:r');t=OxmlElement('w:t');t.text='1';a.append(t);field.append(a);p._p.append(field)


configure(doc.sections[0],'PHẦN A  /  KẾT QUẢ CHÍNH')


def page(n, title, deck='', first=False, new_section=False):
    if new_section:
        configure(doc.add_section(WD_SECTION_START.NEW_PAGE),'PHẦN B  /  PHỤ LỤC KỸ THUẬT')
    p=doc.add_paragraph(f'{n:02d}  /  '+('KẾT QUẢ CHÍNH' if n<=7 else 'PHỤ LỤC KỸ THUẬT'),'Kicker')
    p.paragraph_format.keep_with_next=True
    if n!=1 and not new_section:p.paragraph_format.page_break_before=True
    doc.add_paragraph(title,'Title' if first else 'Heading 1')
    if deck:doc.add_paragraph(deck,'Deck')


def p(text, lead=None, mode='Normal'):
    q=doc.add_paragraph(style=mode)
    if lead:q.add_run(lead+' ').bold=True
    q.add_run(text)
    return q


def h(text):
    return doc.add_paragraph(text,'Heading 2')


def xml(parent, tag, **attrs):
    node=OxmlElement('w:'+tag)
    for k,v in attrs.items():node.set(qn('w:'+k),str(v))
    parent.append(node)
    return node


def table(headers, rows, widths, numeric=(), font=9.2, pad=75, tagged_rows=(), title=None):
    if title:h(title)
    t=doc.add_table(rows=1,cols=len(headers))
    t.autofit=False;t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for c,w in zip(t.columns,widths):c.width=Cm(w)
    props=t._tbl.tblPr
    borders=xml(props,'tblBorders')
    for side in ('top','left','bottom','right','insideH','insideV'):
        xml(borders,side,val='single',sz='4',color='D9E1E8')
    margins=xml(props,'tblCellMar')
    for edge,value in [('top',pad),('bottom',pad),('left',88),('right',88)]:
        xml(margins,edge,w=value,type='dxa')
    for i,values in enumerate([headers]+list(rows)):
        row=t.rows[0] if i==0 else t.add_row()
        prop=row._tr.get_or_add_trPr()
        xml(prop,'cantSplit')
        if i==0:xml(prop,'tblHeader')
        for j,(c,value,w) in enumerate(zip(row.cells,values,widths)):
            c.width=Cm(w);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            xml(c._tc.get_or_add_tcPr(),'shd',fill=NAVY if i==0 else ('EBEFF3' if i-1 in tagged_rows else ('FFFFFF' if i%2 else PALE)))
            q=c.paragraphs[0];q.style='TableCell'
            if j in numeric:q.alignment=WD_ALIGN_PARAGRAPH.RIGHT
            a=q.add_run(str(value));a.font.size=Pt(font)
            if i==0:a.font.bold=True;a.font.color.rgb=rgb('FFFFFF')
            elif j==0:a.font.bold=True
    return t


def image(filename, alt, width=WIDTH, host=None):
    q=(host.paragraphs[0] if host is not None else doc.add_paragraph())
    q.style='Figure';q.alignment=WD_ALIGN_PARAGRAPH.CENTER
    q.paragraph_format.keep_with_next=host is None
    shp=q.add_run().add_picture(str(F/filename),width=Cm(width))
    shp._inline.docPr.set('descr',alt)
    return q


def pic(filename, caption, width=WIDTH):
    image(filename,caption,width)
    p(caption,mode='Caption')


def add_link(q, label, url):
    rel=q.part.relate_to(url,RELATIONSHIP_TYPE.HYPERLINK,is_external=True)
    l=xml(q._p,'hyperlink')
    l.set(qn('r:id'),rel)
    r=xml(l,'r');rp=xml(r,'rPr');xml(rp,'color',val=BLUE);xml(rp,'u',val='single')
    xml(r,'t').text=label


def pair_text(i):
    return f'{signed(B[i]["delta"],3)} [{signed(B[i]["ci"][0],3)}, {signed(B[i]["ci"][1],3)}]'


def recommendation():
    rt=BY['pushup']['RTMO-s'];rp=BY['pushup']['RTMPose-m'];v=BY['pushup']['ViTPose-B'];y=BY['pushup']['YOLOv8n-Pose']
    return [
      ('Chất lượng khớp','Squat: RTMO-s, HRNet-W32, ViTPose-B\nChống đẩy: RTMPose-m, ViTPose-B',
       f'Chống đẩy đạt {num(rp["pck"])}% và {num(v["pck"])}%. Khoảng ghép cặp chứa 0.'),
      ('Đếm lượt','RTMO-s',f'Squat MAE {num(BY["squat"]["RTMO-s"]["mae"])}. Chống đẩy {num(rt["mae"])} lượt/clip.'),
      ('Tốc độ','YOLOv8n-Pose',f'{num(BY["squat"]["YOLOv8n-Pose"]["fps"],1)} FPS squat và {num(y["fps"],1)} FPS chống đẩy.'),
      ('Cân bằng','RTMO-s để thử camera đích','Một mạng. Căn cứ vào sai số đếm lượt và throughput pose trong phép đo.')]


# 01  Executive summary
page(1,'So sánh 10 mô hình Human Pose Estimation cho SmartGym',
     'Benchmark pretrained trên Fit3D nhằm chọn cấu hình theo chất lượng khớp, đếm lượt và tốc độ xử lý.',first=True)
k=table(['MÔ HÌNH','BÀI TẬP','VIDEO','NGƯỜI THAM GIA'],[('10','2','64','8')],[4.2]*4,font=10,pad=125)
for j,c in enumerate(k.rows[1].cells):
    q=c.paragraphs[0];q.alignment=WD_ALIGN_PARAGRAPH.CENTER
    q.runs[0].font.size=Pt(24);q.runs[0].font.bold=True;q.runs[0].font.color.rgb=rgb(NAVY)
    k.rows[0].cells[j].paragraphs[0].alignment=WD_ALIGN_PARAGRAPH.CENTER

for e,name in [('squat','Squat'),('pushup','Chống đẩy')]:
    table(['Hạng','PCK (%) ↑','MAE (lượt/clip) ↓','Pose FPS ↑'],
          [(i+1,metric_rank(e,'pck',i),metric_rank(e,'mae',i),metric_rank(e,'fps',i)) for i in range(3)],
          [1.3,5.1,5.2,5.2],font=9.6,pad=65,title=name+' · Top 3 trên mẫu Fit3D')

p('Chênh lệch PCK của các cấu hình dẫn đầu ở mỗi bài nằm trong khoảng bất định theo người. † LitePose được giữ để tra cứu kết quả thăm dò và nằm ngoài xếp hạng chính.',mode='Caption')
h('Ứng viên theo mục tiêu')
p('RTMO-s cho đếm lượt và thử cấu hình một mạng. YOLOv8n-Pose cho tốc độ. RTMPose-m và ViTPose-B cho tọa độ khớp chống đẩy.')
p('Nhận diện lỗi kỹ thuật chưa có nhãn để chấm. Mỗi mô hình được thử với một checkpoint pretrained trên AMD RX 5600 XT.',mode='Caption')

# 02  Methodology
page(2,'Phương pháp benchmark','Cùng lưới frame và ground truth cho 10 cấu hình. Mỗi mô hình giữ tiền xử lý và cách giải mã phù hợp với artifact sử dụng.')
pic('pipeline.png','Hình 1. Luồng xử lý chung. Thời gian pose kết thúc trước tracker.')
table(['Thiết lập','Quy trình'],[
 ('Dữ liệu','Fit3D train dùng để đánh giá. 8 người × 2 bài × 4 camera, đủ 64 clip.'),
 ('Lấy mẫu','Video 900 × 900, nguồn 50 Hz, stride 2. Đoạn marker rep kèm 1 giây ngữ cảnh mỗi đầu.'),
 ('GPU và phần mềm','AMD Radeon RX 5600 XT · ORT DirectML 1.24.4, CPU fallback · batch 1, graph FP32.'),
 ('Điều kiện suy luận','Pretrained, một lượt, không TTA. 5 top-down dùng cùng YOLOv8n detector. Bbox tự phát hiện.'),
 ('Đếm lượt','Cùng tracker và ST-GCN++ V2 của SmartGym. Classifier chạy CPU. Bài tập đã biết.')],
 [4.05,12.75],font=9.8,pad=115,title='Thiết lập thực nghiệm')
table(['Chỉ số','Cách đọc'],[
 ('PCK (%) ↑','Tỷ lệ 12 khớp chi nằm trong ngưỡng theo chiều dài thân chiếu. Mất khớp tính sai.'),
 ('MAE (lượt/clip) ↓','Sai số tuyệt đối tổng lượt trong cửa sổ marker, lấy trung bình qua clip.'),
 ('Pose FPS ↑','Throughput trên 30 frame chung mỗi clip, 5 warm-up. Gồm detector nếu dùng.')],
 [4.05,12.75],font=9.8,pad=100,title='Ba tiêu chí chính')
p('YOLO26n dùng nhánh one-to-one NMS-free. RTMPose-m dùng confidence SimCC theo MMDeploy. LitePose † dùng decoder heatmap thăm dò.',mode='Caption')

# 03–04  Exercises
for i,e in enumerate(('squat','pushup'),3):
    name='Squat' if e=='squat' else 'Chống đẩy'
    page(i,'Benchmark '+name.lower(),'32 clip từ 8 người qua 4 camera. Mỗi hàng là trung bình của cùng 32 clip.')
    pic(e+'.png',f'Hình {2 if e=="squat" else 4}. Mười cấu hình trên cùng thang đo. † LitePose thăm dò.')
    pic(e+'_pair.jpg',f'Hình {3 if e=="squat" else 5}. {("s10, C4, frame 752" if e=="squat" else "s07, C2, frame 422")}. Tím là dự đoán, lục là GT. Nhãn trên ảnh tính theo clip.',width=16.2)
    table(['PCK · Top 3','MAE · Top 3','FPS · Top 3'],
          [(metric_rank(e,'pck',j),metric_rank(e,'mae',j),metric_rank(e,'fps',j)) for j in range(3)],
          [5.6]*3,font=9.3,pad=56,title='Nhóm dẫn theo tiêu chí')
    if e=='squat':
        p(f'{num(top(e,"pck")[0]["pck"])}% là PCK cao nhất trên mẫu. Hiệu RTMO-s trừ HRNet-W32 là {pair_text(0)} điểm phần trăm.',lead='PCK.').paragraph_format.space_before=Pt(5)
        p(f'{sum(r["mae"]==0 for r in S[e])} cấu hình đếm đúng tổng lượt ở cả 32 clip.',lead='Đếm lượt.')
    else:
        p(f'RTMPose-m và ViTPose-B đạt {num(BY[e]["RTMPose-m"]["pck"])}% và {num(BY[e]["ViTPose-B"]["pck"])}%. Hiệu ghép cặp {pair_text(2)} điểm phần trăm.',lead='PCK.').paragraph_format.space_before=Pt(5)
        p(f'RTMO-s có MAE thấp nhất trên mẫu, {num(BY[e]["RTMO-s"]["mae"])} lượt/clip. Hiệu RTMO-s trừ RTMPose-m là {pair_text(3)} lượt/clip.',lead='Đếm lượt.')

# 05  Trade-off
page(5,'Tốc độ và chất lượng theo cấu hình','Mỗi điểm là một cấu hình. Đọc PCK theo trục đứng và tốc độ theo trục ngang.')
pic('tradeoff.png','Hình 6. PCK và pose FPS, cùng thang cho hai bài. Điểm × 10 là LitePose thăm dò.')
det=Path(M['shared_detector']['path']).stat().st_size/2**20
sizes={x['name']:x['bytes']/2**20 for x in M['models']}
resource=[]
for i,m in enumerate(MODELS,1):
    z=sizes[m];add=det if m in TOPDOWN else 0
    resource.append((f'{i:02d}  {LABEL[m]}',num(z,1),num(z+add,1),
                     num(BY['squat'][m]['fps'],1),num(BY['pushup'][m]['fps'],1)))
table(['Mã / cấu hình','Pose\nMiB','Gói ONNX\nMiB','Squat\nFPS','Chống đẩy\nFPS'],
      resource,[6.2,2.35,2.65,2.8,2.8],numeric=(1,2,3,4),font=9.6,pad=62,tagged_rows=(9,),title='Dung lượng triển khai và throughput')
p('Gói ONNX cộng 12,23 MiB detector khi pipeline cần. Dung lượng tệp và RAM/VRAM là các đại lượng riêng. RAM và VRAM đỉnh chưa được đo.',mode='Caption')
p('YOLOv8n-Pose dẫn tốc độ trên hai bài. ViTPose-B có PCK ở nhóm đầu nhưng dùng gói ONNX lớn nhất.',lead='Đánh đổi.')
p(f'Ở chống đẩy, RTMPose-m đạt {num(BY["pushup"]["RTMPose-m"]["fps"],1)} FPS trên toàn frame và {num(BY["pushup"]["RTMPose-m"]["fps_pose"],1)} FPS khi có pose. Tỷ lệ bỏ bước pose là {BY["pushup"]["RTMPose-m"]["skipped_frames"]}/960 frame.',lead='Frame có pose.')

p(f'Trên 8 clip đo xen kẽ, decoder cũ/mới đạt {num(T["squat"]["mean"],1)}/{num(T["squat"]["min"],1)} FPS squat và {num(T["pushup"]["mean"],1)}/{num(T["pushup"]["min"],1)} FPS chống đẩy. FPS RTMPose-m trong bảng được đo ở lượt riêng.',lead='Đối chứng tốc độ.')

# 06  Cameras
page(6,'So sánh bốn góc quay','Hai ma trận dùng chung thang PCK 0–100%. Mỗi ô tổng hợp 8 người ở một camera.')
pic('cameras.png','Hình 7. PCK (%) theo camera, SQ là squat và CĐ là chống đẩy. † LitePose thăm dò.')
two=doc.add_table(rows=1,cols=2);two.autofit=False
for j,e in enumerate(('squat','pushup')):
    two.columns[j].width=Cm(8.4);two.cell(0,j).width=Cm(8.4)
    image(e+'_cameras.jpg',f'Bốn camera đồng bộ minh họa bài {e}',width=8.05,host=two.cell(0,j))
p('Hình 8. Trái: squat s10, frame 752, RTMO-s. Phải: chống đẩy s07, frame 422, RTMPose-m. Tím là dự đoán, lục là GT.',mode='Caption')
angles=[]
for e,label in [('squat','Squat'),('pushup','Chống đẩy')]:
    vals=[float(next(r['angle'] for r in C if r['exercise']==e and r['camera']==c)) for c in CAMS]
    angles.append((label,*[num(v,1)+'°' for v in vals]))
table(['Phương vị TB','C1 · 50591643','C2 · 58860488','C3 · 60457274','C4 · 65906101'],angles,
      [3.2,3.4,3.4,3.4,3.4],numeric=(1,2,3,4),font=9.3,pad=85)
p('Squat dùng trục trước–sau, chống đẩy dùng trục đầu–chân. Mẫu chủ yếu ở hai đầu trục. Góc ngang 90°, góc gần 45° và thay đổi độ cao camera chưa đủ dữ liệu.',lead='Phạm vi.')

# 07  Robustness
page(7,'Độ ổn định và đề xuất triển khai','Jitter tính trên các cặp frame hợp lệ. Tỷ lệ mất khớp cho biết phần đầu ra bị bỏ khỏi phép đo jitter.')
pic('stability.png','Hình 9. Jitter tính theo thang thân mỗi bước 40 ms. Tỷ lệ mất khớp squat là 0% ở cả 10 cấu hình.')
pic('mask.png','Hình 10. 32 clip mỗi bài, cùng 30 frame sạch/che mỗi clip. Kết quả thuộc hai mô hình trên cùng mẫu.',width=16.2)
drops={e:mean(r['delta_pck'] for r in O if r['clip']['exercise']==e) for e in S}
p(f'PCK thay đổi {signed(drops["squat"])} điểm phần trăm ở RTMO-s squat và {signed(drops["pushup"])} ở RTMPose-m chống đẩy. Vật cản tổng hợp che vùng dưới của bao cơ thể chiếu.',mode='Caption')
table(['Ưu tiên','Ứng viên thử','Căn cứ'],recommendation(),[3.2,5.0,8.6],font=9.3,pad=70,title='Đề xuất theo mục tiêu')
p('Độ chính xác nhận diện bài tự động và lỗi kỹ thuật chưa được đo. Cần thử trên camera đích với người mới trước khi chọn cấu hình triển khai.',mode='Caption')

# 08  Architecture
page(8,'So sánh kiến trúc mô hình','10 artifact pretrained thực tế. Số tham số ghi theo đúng phạm vi có nguồn.',new_section=True)
arch=[
 ('C2f CNN + pose head','1 mạng','3,295 K','Tốc độ','PCK push-up thấp','Thấp'),
 ('C3k2, C2PSA + pose head','1 mạng','2,874 K','Gói gọn','MAE push-up cao','Thấp'),
 ('Pose26, one-to-one NMS-free','1 mạng','3,679 K','PCK nhóm YOLO','Hai head trong checkpoint','Thấp'),
 ('CSPNeXt + RTMCC SimCC','Detector + pose','13,59 TL','Khớp chống đẩy','Phụ thuộc bbox','Vừa'),
 ('CSPDarknet + RTMO head','1 mạng','N/A','Đếm lượt','Ngưỡng chọn người','Vừa'),
 ('ViT-B/16 + heatmap Simple','Detector + pose','N/A','PCK nhóm đầu','Gói ONNX lớn','Vừa'),
 ('HRNet W32 đa độ phân giải','Detector + pose','28,536 K','PCK squat cao','FPS thấp hơn RTMO','Vừa'),
 ('Lite-HRNet + channel weighting','Detector + pose','1,11 TL','Pose nhỏ','PCK push-up thấp','Vừa'),
 ('CNN Lightning, ONNX Web','Detector + pose','N/A','Gọn, một người','Native TFHub chưa đối chiếu','Vừa'),
 ('LitePose Auto-S, heatmap/tag','Bottom-up','N/A','Gói pose nhỏ','Thiếu grouping gốc','Cao')]
table(['Mô hình','Kiến trúc','Pipeline','Số\nkhớp','Triệu\ntham số','Nổi bật','Hạn chế','Độ khó'],
      [(LABEL[m],a,b,17,c,d,e,f) for m,(a,b,c,d,e,f) in zip(MODELS,arch)],
      [2.64,3.14,2.08,1.34,1.66,2.0,2.61,1.33],numeric=(3,4),font=9.05,pad=97,tagged_rows=(9,))
p('K là đếm tham số checkpoint PyTorch tại máy. TL là số theo tài liệu cho cấu hình tương ứng. Tham số detector ngoài được tính riêng.',mode='Caption')
p('Checkpoint YOLO26n chứa hai head. Graph đã đo giữ nhánh one-to-one. Số tham số giữa hai phạm vi khác nhau.',mode='Caption')
table(['Độ khó','Quy ước đọc'],[
      ('Thấp','Một mạng và đường suy luận YOLO có sẵn.'),
      ('Vừa','Detector ngoài hoặc decoder riêng cho mô hình.'),
      ('Cao','Cần hoàn thiện grouping của artifact LitePose để kiểm định pipeline gốc.')],
      [3.1,13.7],font=9.5,pad=90,title='Quy ước độ phức tạp')
p('Độ phức tạp là nhận xét định tính dựa trên pipeline. † LitePose chỉ hiện diện trong phần kết quả thăm dò.',mode='Caption')

# 09  Checkpoint configuration
page(9,'Cấu hình pretrained gốc','Số layer được định danh theo Conv trong ONNX, mô-đun PyTorch hoặc block backbone.')
train=[
 ('CNN C2f','73 Conv\n250 mô-đun','0,01','1.000¹','SGD','S1 · metadata .pt'),
 ('CNN C3k2','97 Conv\n344 mô-đun','0,01','1.000²','Auto³','S1 · metadata .pt'),
 ('CNN C3k2','111 Conv\n596 mô-đun','0,005','400²','MuSGD','S1 · metadata .pt'),
 ('CSPNeXt-m','62 Conv','N/A','420⁴','N/A','S2 · Body7 e48f03d0'),
 ('CSPDarknet','80 Conv','0,004','600¹','AdamW','S3 · Body7 dac2bf74'),
 ('ViT-B/16','2 Conv\n12 block','0,0005','210¹','AdamW','S4 · cấu hình Base Simple'),
 ('HRNet-W32','293 Conv','0,001⁵','210⁵','Adam⁵','S5 · Qualcomm FP32 và cấu hình W32'),
 ('Lite-HRNet-18','301 Conv','0,0005','210¹','Adam','S6 · cấu hình MMPose và Qualcomm'),
 ('CNN Lightning','74 Conv','N/A','N/A','N/A','S7 · ONNX Web'),
 ('LitePose Auto-S','113 Conv','N/A','N/A','N/A','S8 · OpenVINO cộng đồng')]
table(['Mô hình','Backbone','Layer / block','LR gốc','Epoch','Optimizer','Nguồn'],
      [(LABEL[m],*r) for m,r in zip(MODELS,train)],
      [2.7,2.6,2.67,1.57,1.55,1.95,3.76],numeric=(3,4),font=9.1,pad=110,tagged_rows=(9,))
p('¹ Cấu hình công bố. ² Số epoch có nhật ký trong checkpoint. ³ Auto là giá trị metadata, LR 0,01 là lr0 cấu hình. ⁴ 420e theo định danh checkpoint Body7. ⁵ Tham chiếu HRNet-W32, lịch huấn luyện của state dict Qualcomm chưa xác minh.',mode='Caption')
p('N/A biểu thị thông số chưa xác minh cho artifact đang dùng. RTMPose-m Body7 dùng export SDK chính thức. LR và optimizer của Body7 để N/A.',mode='Caption')
p('Số Conv, số mô-đun bao và độ sâu backbone biểu thị các đại lượng khác nhau.',mode='Caption')

# 10–13  Per-camera tables
for e,name,start in [('squat','squat',10),('pushup','chống đẩy',12)]:
    for part in range(2):
        page(start+part,f'Kết quả chi tiết {name}',
             f'Phần {part+1}/2 · 20 dòng · Mỗi dòng là trung bình 8 người ở một camera.')
        subset=MODELS[part*5:part*5+5]
        data=[]
        for model in subset:
            for i,cam in enumerate(CAMS,1):
                x=next(r for r in C if r['exercise']==e and r['model']==model and r['camera']==cam)
                data.append((LABEL[model],f'C{i} · {cam}',num(x['angle'],1)+'°',num(x['pck']),num(x['mae']),num(x['fps'],2),'N/A'))
        table(['Mô hình','Camera','Góc TB','PCK % ↑','MAE ↓','Pose FPS ↑','Lỗi kỹ thuật'],
              data,[4.1,3.55,1.73,1.83,1.67,1.92,2.0],numeric=(2,3,4,5),font=9.4,pad=108,
              tagged_rows=tuple(j for j,r in enumerate(data) if '†' in r[0]))
        p('MAE tính bằng lượt/clip. Các giá trị gốc chưa làm tròn được lưu trong comparison_camera_summary.csv. N/A do thiếu nhãn lỗi đã kiểm chứng.',mode='Caption')
        if part==1:p('† LitePose-Auto-S hiển thị kết quả của adapter heatmap thăm dò.',mode='Caption')

# 14  Reproducibility
page(14,'Quy trình đo và giới hạn thực nghiệm','Định nghĩa các phép đo, phạm vi kết luận và đường dẫn dữ liệu để đối chiếu.')
table(['Phép đo','Định nghĩa thực nghiệm'],[
 ('PCK@0,2','12 khớp COCO đối chiếu MoCap chiếu 2D. Đúng nếu sai số ≤ 0,2 × max(20 px, khoảng cách tâm vai–tâm hông). GT ngoài ảnh loại khỏi mẫu số. Mất khớp tính sai.'),
 ('MAE','Trung bình clip của |lượt dự đoán − (số marker − 1)|. Chấm event trong (marker đầu, marker cuối]. 40 rep vật lý/bài.'),
 ('Pose FPS','Trung bình qua clip của 1.000 / mean(ms). 30 frame/clip và 5 warm-up. Gồm detector khi cần, tiền/hậu xử lý. Ngoài thời gian là giải mã video, hiển thị và tracker/classifier.'),
 ('Jitter','Độ lớn biến thiên của vector sai số theo cặp frame hợp lệ, chuẩn hóa theo chiều dài thân từng frame. Đọc cùng tỷ lệ mất khớp.'),
 ('Tổng hợp','Trung bình đều theo clip. Bootstrap ghép cặp 50.000 lượt lấy lại 8 người, giữ 4 camera cùng người. Seed 20261104.')],
 [3.28,13.52],font=9.35,pad=82)
h('Giới hạn chính')
p('Tám người, hai bài và các góc hiện có. Thang pixel PCK chặt hơn ở chống đẩy do thân chiếu ngắn. Thử che hai cấu hình và dùng vật cản tổng hợp. FPS RTMPose đo lại cùng giao thức ở lượt riêng. Chưa có độ lặp giữa lượt, latency toàn ứng dụng hoặc nhãn lỗi.',mode='SourceLine')
p('Đối chiếu trong benchmark_professional/results/ bằng summary.json, comparison_camera_summary.csv, comparison_by_clip.json, paired_bootstrap.json, speed_results.json, paired_speed_control.json và provenance_revision.json.',mode='SourceLine')
h('Nguồn checkpoint và cấu hình')
sources=[
 [('S1  Ultralytics .pt','https://github.com/ultralytics/assets/releases/tag/v8.4.0'),
  ('YOLO26 one-to-one','https://docs.ultralytics.com/guides/end2end-detection'),
  ('S2  RTMPose-m Body7','https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.zip'),
  ('MMDeploy SimCC','https://github.com/open-mmlab/mmdeploy/blob/main/csrc/mmdeploy/codebase/mmpose/simcc_label.cpp')],
 [('S3  RTMO-s Body7','https://github.com/open-mmlab/mmpose/blob/main/configs/body_2d_keypoint/rtmo/body7/rtmo-s_8xb32-600e_body7-640x640.py'),
  ('S4  ViTPose','https://github.com/ViTAE-Transformer/ViTPose'),
  ('ONNX Base Simple','https://huggingface.co/onnx-community/vitpose-base-simple'),
  ('S5  HRNet-W32','https://github.com/HRNet/HRNet-Human-Pose-Estimation')],
 [('HRNet Qualcomm FP32','https://github.com/quic/aimet-model-zoo/releases/download/phase_2_march_artifacts/hrnet_posenet_FP32_state_dict.pth'),
  ('S6  Lite-HRNet Qualcomm','https://huggingface.co/qualcomm/LiteHRNet'),
  ('Lite-HRNet config','https://github.com/open-mmlab/mmpose/blob/main/configs/body_2d_keypoint/topdown_heatmap/coco/td-hm_litehrnet-18_8xb64-210e_coco-256x192.py')],
 [('S7  MoveNet Web','https://huggingface.co/onnx-community/movenet-lightning-web'),
  ('S8  LitePose OpenVINO','https://huggingface.co/cansik/visiongraph'),
  ('LitePose gốc','https://github.com/mit-han-lab/litepose'),
  ('S9  Fit3D','https://fit3d.imar.ro/'),
  ('Calibration Fit3D','https://github.com/sminchisescu-research/imar_vision_datasets_tools')]]
for row in sources:
    q=doc.add_paragraph(style='SourceLine')
    for i,(label,url) in enumerate(row):
        if i:q.add_run('  ·  ')
        add_link(q,label,url)

doc.save(ROOT/'report'/(NAME+'.docx'))
