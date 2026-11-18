"""Real LLM checks on isolated positive/negative textual-support fixtures."""
from pathlib import Path
from dataclasses import replace
from datetime import datetime,timezone
import argparse,json,sys,time,hashlib
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.config import Settings
from kb_service.providers import Generator
from kb_service.knowledge import SourceReview
from kb_service.grounding import source_windows
from kb_service.conversation_prompts import SOURCE_REVIEW_PROMPT

def main():
 p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--thinking',action='store_true');p.add_argument('--ids');p.add_argument('--tag',default='');a=p.parse_args()
 snap=json.loads((ROOT/'data/releases/six_exercises_20261118_r3/snapshot.json').read_text(encoding='utf-8'))
 def proof(source,section,needle):
  chunk=next(c for c in snap['chunks'] if c['source_id']==source and c['section']==section)
  matches=[s for s in source_windows(chunk['text']) if needle in s]
  if not matches:raise ValueError(needle)
  return chunk,min(matches,key=len)
 hip=proof('ace_squat','Step 6','hips and torso need to rise together')
 head=proof('ace_pushup','Step 3','head aligned with your spine')
 arms=proof('ohio_movement_library','High Knees','Your arms can mimic')
 pelvis=proof('ace_reverse_crunch','Step 2','raise your hips off the mat')
 knee=proof('ace_reverse_crunch','Step 1','90 degree bend')
 interval=proof('nasm_jumping_jacks','How many jumping jacks should be performed for cardiovascular benefits?','30-60 seconds')
 data=[('hips_together',hip,'Khi đứng lên từ squat, hông và thân nâng cùng nhau.',True),
  ('hips_first',hip,'Khi đứng lên từ squat, hông bắt buộc nâng trước thân.',False),
  ('head_alignment',head,'Trong pha hạ chống đẩy, giữ đầu thẳng hàng với cột sống.',True),
  ('head_look_at_feet',head,'Trong pha hạ chống đẩy, đầu phải quay nhìn hai bàn chân.',False),
  ('arms_optional',arms,'Tay có thể phối hợp tự nhiên như khi đi bộ hoặc chạy trong High Knees.',True),
  ('arms_mandatory_overhead',arms,'Tay bắt buộc giơ cao qua đầu trong High Knees.',False),
  ('pelvis_lift',pelvis,'Trong pha nâng của reverse crunch, hông rời thảm.',True),
  ('hypothetical_comparison',pelvis,'Nếu hông không rời thảm thì chưa giống pha nâng được hướng dẫn trong reverse crunch.',True),
  ('unsupported_muscle_cause',head,'Võng lưng khi chống đẩy chứng minh cơ bụng của bạn yếu.',False),
  ('unknown_angle',knee,'Tư thế chuẩn bị reverse crunch yêu cầu gối gập 45 độ.',False),
  ('interval_duration',interval,'NASM mô tả đợt jumping jack kéo dài 30–60 giây rồi nghỉ ngắn.',True),
  ('duration_as_rate',interval,'NASM yêu cầu jumping jack ở tốc độ 30–60 lần mỗi phút.',False)]
 if a.ids:data=[r for r in data if r[0] in set(a.ids.split(','))]
 if not data:raise ValueError('No matching support fixtures')
 settings=replace(Settings.from_env(),chat_model=a.model);generator=Generator(settings);schema=SourceReview.model_json_schema();schema['additionalProperties']=False
 schema['properties']['reason'].update(minLength=15,maxLength=300)
 rows=[]
 for key,(chunk,quote),claim,expected in data:
  started=time.perf_counter();row={'id':key,'claim':claim,'source_id':chunk['source_id'],'source_quote':quote,'expected_supported':expected,'origin':'developer_authored_synthetic_textual_entailment_fixture'}
  try:
   output=generator.structured(SOURCE_REVIEW_PROMPT,{'CHECK_EACH_POINT':[{'index':0,'original_index':0,'point':claim,
     'source_quote':quote,'source_title':chunk['title'],'publisher':chunk['publisher'],'source_url':chunk['url'],'source_id':chunk['source_id'],
     'source_section':chunk['section'],'source_exercises':chunk['exercise_codes'],'additional_quotes':[]}],'FOLLOW_UP':''},schema,4096 if a.thinking else 500,reasoning=a.thinking)
   result=SourceReview.model_validate(output);row['output']=result.model_dump();row['pass']=result.supported==expected
  except Exception as exc:row.update(error=type(exc).__name__+': '+str(exc),**{'pass':False})
  row['seconds']=round(time.perf_counter()-started,3);rows.append(row)
  print(json.dumps({'model':a.model,'id':key,'pass':row['pass'],'seconds':row['seconds']},ensure_ascii=False),flush=True)
 out=ROOT/'artifacts/six_exercises_20261117/model_comparison';out.mkdir(parents=True,exist_ok=True)
 result={'model':a.model,'kb_version':snap['version'],'n':len(rows),'passed':sum(r['pass'] for r in rows),'thinking':a.thinking,'details':rows,
  'executed_at_utc':datetime.now(timezone.utc).isoformat(),
  'source_review_prompt_sha256':hashlib.sha256(SOURCE_REVIEW_PROMPT.encode('utf-8')).hexdigest(),
  'scope':'Component development fixtures, not expert review or a general answer-accuracy benchmark.'}
 tag=('_thinking' if a.thinking else '')+('_subset' if a.ids else '')
 if a.tag:
  if not all(c.isalnum() or c in '-_' for c in a.tag):raise ValueError('Use an alphanumeric output tag')
  tag+='_'+a.tag
 (out/(a.model.replace(':','_')+tag+'_support_gate.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({k:v for k,v in result.items() if k!='details'}),flush=True)

if __name__=='__main__':main()
