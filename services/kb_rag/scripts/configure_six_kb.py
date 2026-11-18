"""Register reviewed source sections and source-anchored criteria, not QA pairs."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
def write(name,value):(ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
sources=read('sources.json');by={x['id']:x for x in sources}
for source in sources:
    if source.get('selector')=='ace_steps':source['include_exercise_metadata']=True
by['nasm_jumping_jacks']['extra_headings']=['Are jumping jacks appropriate for all fitness levels?',
    'Common Mistakes','Muscles Worked','How many jumping jacks should be performed for cardiovascular benefits?',
    'What are the cardiovascular benefits of jumping jacks?']
by['nasm_jumping_jacks']['selector']='nasm_sections'
additional=[
 {'id':'ohio_movement_library','title':'Movement Library — High Knees, Butt Kickers and Jumping Jacks',
  'publisher':'Ohio University WellWorks','url':'https://www.ohio.edu/wellworks/movement-library',
  'file':'ohio_movement_library.html','format':'html','selector':'named_paragraphs',
  'section_exercises':{'High Knees':['HIGH_KNEES'],'Butt Kickers':['BUTT_KICKERS'],'Jumping Jacks':['JUMPING_JACK']},
  'exercise_codes':['HIGH_KNEES','BUTT_KICKERS','JUMPING_JACK'],
  'license':'Copyright Ohio University; retain attribution; selected local academic reference.',
  'review_scope':'Exercise descriptions only; walking/running variations are not a universal progression or cadence prescription.'},
 {'id':'cdc_intensity','title':'How to Measure Physical Activity Intensity',
  'publisher':'US Centers for Disease Control and Prevention',
  'url':'https://www.cdc.gov/physical-activity-basics/measuring/index.html',
  'file':'cdc_intensity.html','format':'html','exercise_codes':[],'general_guidance':True,
  'publication_year':2025,'license':'US CDC public guidance; retain source; check third-party material separately.',
  'review_scope':'General aerobic effort, talk test, relative versus absolute intensity; not exercise-specific cadence.'},
 {'id':'nsca_movement_progressions','title':'Progressive Strategies for Teaching Fundamental Resistance Training Movement Patterns',
  'publisher':'National Strength and Conditioning Association',
  'url':'https://www.nsca.com/contentassets/3d09f06f0b4c4f6fbd8cc382ed1f3d4a/ptq-10.2.1-progressive-strategies-for-teaching-fundamental-resistance-training-movement-patterns.pdf',
  'file':'ptq-10.2.1-progressive-strategies-for-teaching-fundamental-resistance-training-movement-patterns.pdf',
  'format':'pdf','publication_year':2023,'verified_total_pdf_pages':12,'page_ranges':[[1,4],[6,6]],
  'page_sections':[{'start':1,'end':3,'title':'Teaching progressions, instruction, cueing and feedback'},
                   {'start':4,'end':4,'title':'Figure 1 — Squat exercise progression'},
                   {'start':6,'end':6,'title':'Figure 3 — Horizontal push exercise progression'}],
  'exercise_codes':[],'general_guidance':True,'manual_download':True,
  'license':'Copyright NSCA 2023; user-provided publisher PDF; selected local academic reference.',
  'review_scope':'Sample teaching progressions and cueing; not universally applicable personal prescriptions.',
  'printed_page_note':'File page 1 is printed page 6. File pages are always stored as locators.'},
 {'id':'hhs_physical_activity_2018','title':'Physical Activity Guidelines for Americans 2nd edition — Adults, Safety and Intensity',
  'publisher':'US Department of Health and Human Services',
  'url':'https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf',
  'file':'Physical_Activity_Guidelines_2nd_edition.pdf','format':'pdf','publication_year':2018,
  'verified_total_pdf_pages':118,'page_ranges':[[56,65],[88,93],[108,112]],
  'page_sections':[{'start':56,'end':65,'title':'Chapter 4 — Active Adults, ages 18–64'},
                   {'start':88,'end':93,'title':'Chapter 7 — Active and Safe'},
                   {'start':108,'end':112,'title':'Appendix 1 — Intensity, Bouts and Steps'}],
  'exercise_codes':[],'general_guidance':True,'manual_download':True,
  'license':'US HHS government publication; retain attribution; check third-party images separately.',
  'review_scope':'General adult activity and gradual progression, not a personalized six-exercise program.'},
 {'id':'smartgym_model_protocol','title':'SmartGym V4 — Ý nghĩa nhãn, phạm vi quan sát và quy ước đếm',
  'publisher':'SmartGym project — verified technical documentation',
  'url':'https://github.com/Lumith226/SmartGym/blob/4de4d6d0becc8db7dfc5c119782cbd316466c1b7/smart_gym_web_v4/README.md',
  'file':'smartgym_model_protocol.txt','format':'txt','exercise_codes':[],'general_guidance':True,
  'license':'User-provided project documentation; retain commit and file attribution.',
  'source_role':'technical_system_description_not_exercise_prescription',
  'review_scope':'Facts about software labels, score and count conventions; not scientific training thresholds.'},
]
upstream=ROOT.parents[2]/'SmartGym-Model-upstream-20261117'
readme=(upstream/'smart_gym_web_v4/README.md').read_text(encoding='utf-8')
selected=[line for line in readme.splitlines() if any(term in line for term in
    ['Với hai bài chạy','Lượt chân hiển thị','Điểm không cộng','Nhãn chưa xuất hiện','N/A:','Màu cam:','Màu xanh:'])]
protocol=['SmartGym V4 technical conventions — commit 4de4d6d0becc8db7dfc5c119782cbd316466c1b7.',
 'Nguồn: smart_gym_web_v4/README.md và các model contract; tài liệu phần mềm, không phải nguồn kê chương trình tập.',
 *selected,
 'Contract target_semantics: presence_of_Qualcomm_annotation; absence_is_not_verified_correctness.',
 'Contract speed_note: Source rps and angle levels retain source semantics; no rule-based correct label.',
 'Diễn giải kỹ thuật đã đối chiếu contract: nhãn speed và angle là mức chú thích được model dự đoán, không phải phép đo trực tiếp cadence hoặc góc khớp đã được xác minh của video.',
 'Quy ước RunningRepCounter trong running_rep_counter.py: mỗi lần một chân nâng/gập rồi hạ là một lượt ước lượng; một chu kỳ gồm cả hai chân không tự đồng nhất với một lượt chân hoặc rps nguồn.']
(ROOT/'data/raw/smartgym_model_protocol.txt').write_text('\n\n'.join(protocol)+'\n',encoding='utf-8')
for entry in additional:
    if entry['id'] in by:by[entry['id']].update(entry)
    else:sources.append(entry)
write('sources.json',sources)
claims=read('claims.json');ids={c['id'] for c in claims}
def claim(key,exercise,text,source,anchor,section=None):
    if key in ids:return
    row={'id':key,'exercise_code':exercise,'kind':'technique','text_vi':text,
         'source_id':source,'anchor':anchor,'labels':[]}
    if section:row['source_section']=section
    claims.append(row);ids.add(key)
claim('squat_target_regions','SQUAT','Thư viện ACE xếp bodyweight squat vào vùng bụng, mông/hông, cẳng chân và đùi; đây là nhóm vùng cơ thể, không phải phép đo mức hoạt hóa từng cơ.',
      'ace_squat','Abs, Butt/Hips, Legs - Calves and Shins, Legs - Thighs','Exercise metadata')
claim('pushup_target_regions','PUSHUP','Thư viện ACE xếp chống đẩy vào vùng cánh tay, ngực và vai; phân loại này không xác định mức hoạt hóa hay cơ yếu của người dùng.',
      'ace_pushup','Arms, Chest, Shoulders','Exercise metadata')
claim('squat_progression_example','SQUAT','Figure 1 của NSCA minh họa touch-and-go box squat, free squat và goblet squat như các ví dụ học động tác; không coi đây là chuỗi bắt buộc cho mọi người.',
      'nsca_movement_progressions','FIGURE 1. SQUAT EXERCISE PROGRESSION','Figure 1 — Squat exercise progression')
claim('jack_speed_control','JUMPING_JACK','Không đánh đổi kỹ thuật để tăng tốc độ hoặc số lượt khi jumping jack; nguồn không quy định một cadence chung.',
      'nasm_jumping_jacks','Moving too quickly and sacrificing form for speed or total repetitions','Common Mistakes')
claim('jack_interval_context','JUMPING_JACK','FAQ NASM mô tả lượt jumping jack 30–60 giây rồi nghỉ ngắn; đây là thời lượng lượt, không phải số lần mỗi phút hay đơn tập cá nhân.',
      'nasm_jumping_jacks','30-60 seconds of work followed by brief rest periods','How many jumping jacks should be performed for cardiovascular benefits?')
claim('highknees_forward','HIGH_KNEES','Ở hướng dẫn High Knees của Ohio, các bộ phận từ bàn chân tới đầu hướng về phía trước.',
      'ohio_movement_library','Stand with toes, knees, hips, shoulders and nose all facing forward.','High Knees')
claim('highknees_alternate','HIGH_KNEES','Luân phiên nâng từng chân về phía ngực rồi hạ trở lại theo hướng dẫn High Knees; giữ đúng biến thể đang tập.',
      'ohio_movement_library','alternate raising one leg up towards your chest and then back to the ground.','High Knees')
claim('highknees_arms','HIGH_KNEES','Tay có thể phối hợp theo chuyển động tự nhiên khi đi bộ hoặc chạy trong hướng dẫn High Knees của Ohio; nguồn không coi mọi trường hợp hạ tay là lỗi.',
      'ohio_movement_library','Your arms can mimic the natural movement of arms when walking or running.','High Knees')
claim('highknees_variants','HIGH_KNEES','Ohio mô tả High Knees có thể thực hiện ở nhịp đi bộ hoặc chạy; cần xác nhận biến thể trước khi diễn giải nhãn không bật nhảy.',
      'ohio_movement_library','This can be done at a walking or running pace.','High Knees')
claim('buttkickers_forward','BUTT_KICKERS','Ở hướng dẫn Butt Kickers của Ohio, giữ hướng cơ thể về phía trước và tay ở hai bên thân khi bắt đầu.',
      'ohio_movement_library','Stand with toes, knees, hips, shoulders and nose all facing forward and hands by your sides.','Butt Kickers')
claim('buttkickers_heel_back','BUTT_KICKERS','Luân phiên gập một gối, đưa gót về phía mông rồi hạ chân trở lại theo hướng dẫn Butt Kickers; không tự suy ra ngưỡng góc hay biên độ cá nhân.',
      'ohio_movement_library','alternate bending one knee and raising the heel up towards your butt and then back to the ground.','Butt Kickers')
claim('buttkickers_arms','BUTT_KICKERS','Với Butt Kickers theo Ohio, tay có thể để hai bên thân hoặc phối hợp như khi đi bộ/chạy; không tự coi tay hạ là lỗi.',
      'ohio_movement_library','Your arms can stay by your side or mimic the natural movement of arms when walking or running.','Butt Kickers')
claim('buttkickers_variants','BUTT_KICKERS','Ohio mô tả Butt Kickers có thể thực hiện ở nhịp đi bộ hoặc chạy; bước từng chân không tự động là sai kỹ thuật.',
      'ohio_movement_library','This can be done at a walking or running pace.','Butt Kickers')
claim('squat_teaching_progression','SQUAT','NSCA trình bày ví dụ tiến trình học squat; lựa chọn biến thể cần xét khả năng, mục tiêu và điều kiện của người tập, không áp cả chuỗi cho mọi người.',
      'nsca_movement_progressions','Sample progressions are not intended to be comprehensive, nor universally applicable to')
claim('pushup_elevated_variant','PUSHUP','Trong ví dụ elevated push-up của NSCA, đặt tay trên bề mặt cao và giữ thân như plank khi hạ/nâng; đây là một biến thể cần lựa chọn phù hợp.',
      'nsca_movement_progressions','Elevated push-up (A and B):')
write('claims.json',claims)
mapping=read('label_knowledge_map.json')
mapping['HIGH_KNEES']={
 'not_straight':{'criterion_ids':['highknees_forward','highknees_alternate'],'coverage':'partial','note_vi':'Nguồn mô tả hướng cơ thể và nâng chân; chưa xác minh mặt phẳng/góc 2D hoặc ngưỡng của nhãn gối không đi thẳng.'},
 'not_in_place':{'criterion_ids':['highknees_alternate'],'coverage':'partial','note_vi':'Chỉ có hướng dẫn chuyển động luân phiên; chưa có ngưỡng dịch chuyển tại chỗ để xác minh nhãn này.'},
 'arms_down':{'criterion_ids':['highknees_arms'],'coverage':'partial','note_vi':'Ohio dùng mô tả tay có thể phối hợp; cần biết biến thể/yêu cầu bài chạy trước khi coi tay hạ là lỗi.'},
 'not_jumping':{'criterion_ids':['highknees_variants'],'coverage':'partial','note_vi':'Có biến thể đi bộ và chạy; nhãn dữ liệu không chứng minh mọi trường hợp không bật đều sai.'}}
mapping['BUTT_KICKERS']={
 'bringing_knees_forward':{'criterion_ids':['buttkickers_heel_back'],'coverage':'partial','note_vi':'Nguồn mô tả gập gối đưa gót về sau; chưa định lượng mức gối tiến ra trước để xác minh nhãn model.'},
 'feet_stay_below_knees':{'criterion_ids':['buttkickers_heel_back'],'coverage':'partial','note_vi':'Nguồn mô tả đưa gót về phía mông, chưa quy định một góc/độ cao phù hợp mọi người.'},
 'not_in_place':{'criterion_ids':['buttkickers_heel_back'],'coverage':'partial','note_vi':'Nguồn mô tả động tác, chưa quy định ngưỡng dịch chuyển tại chỗ.'},
 'stepping':{'criterion_ids':['buttkickers_variants'],'coverage':'metadata_only','note_vi':'Thuộc tính biến thể bước chân; Ohio cho phép nhịp đi bộ hoặc chạy, không tự coi là lỗi.'},
 'looking_at_feet':{'criterion_ids':['buttkickers_forward'],'coverage':'metadata_only','note_vi':'Nhãn thuộc tính theo contract; có thể đối chiếu hướng cơ thể nhưng không đổi kind thành lỗi.'}}
write('label_knowledge_map.json',mapping)
cap=read('capabilities.json')
cap['unsupported']['personal_program']='KB có nguyên tắc tập chung và một số biến thể có nguồn, nhưng chưa có quy trình kiểm chứng để kê lịch, tải và số hiệp/lần riêng theo tình trạng từng người.'
cap['unsupported']['causal_assessment']='Kết quả model và KB không đủ để chẩn đoán cơ yếu, bệnh lý hoặc nguyên nhân đau của riêng bạn; chỉ có thể giải thích tiêu chí và giới hạn quan sát.'
write('capabilities.json',cap)
print(json.dumps({'registered_sources':len(sources),'declared_criteria':len(claims),'new_label_maps':{k:len(mapping[k]) for k in ['HIGH_KNEES','BUTT_KICKERS']}},ensure_ascii=False))
