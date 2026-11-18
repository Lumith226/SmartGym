"""Download an explicit set of publisher pages; never manufacture source text."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
import httpx
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/six_exercises_20261117';OUT.mkdir(parents=True,exist_ok=True)
raw=ROOT/'data/raw'
targets=[
 ('ohio_movement_library','https://www.ohio.edu/wellworks/movement-library'),
 ('cdc_intensity','https://www.cdc.gov/physical-activity-basics/measuring/index.html'),
 ('mhcc_fitness_book','https://mhcc.pressbooks.pub/hpe295ed2/'),
 ('acsm_resistance_2026','https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/'),
 ('acsm_resistance_summary_2026','https://acsm.org/resistance-training-guidelines-update-2026/'),
]
report=[]
with httpx.Client(timeout=60,follow_redirects=True,headers={'User-Agent':'SmartGym-Academic-KB/0.2'}) as client:
    while targets:
        source_id,url=targets.pop(0);path=raw/(source_id+'.html')
        entry={'source_id':source_id,'url':url,'file':path.name,'checked_at':datetime.now(timezone.utc).isoformat()}
        try:
            if path.exists():data=path.read_bytes();entry['status']='cached'
            else:
                response=client.get(url);response.raise_for_status();data=response.content
                soup=BeautifulSoup(data,'html.parser');text=soup.get_text(' ',strip=True)
                if len(text)<300 or ('Checking your browser' in text[:250]) or ('reCAPTCHA' in text[:250]):raise ValueError('Publisher challenge, not article content')
                path.write_bytes(data);entry['status']='downloaded'
            entry.update(sha256=hashlib.sha256(data).hexdigest(),bytes=len(data))
            if source_id=='mhcc_fitness_book':
                soup=BeautifulSoup(data,'html.parser')
                wanted={'Rest, Recovery, and Periodization':'mhcc_recovery','Developing a Resistance Training Program':'mhcc_resistance_program',
                        'Measuring Cardiorespiratory Intensity':'mhcc_cardio_intensity','Developing a Cardiorespiratory Training Plan':'mhcc_cardio_plan',
                        'Principle of Progressive Overload':'mhcc_progression','Training Safely':'mhcc_training_safely'}
                for a in soup.find_all('a',href=True):
                    title=a.get_text(' ',strip=True)
                    if title in wanted and a['href'].startswith('https://mhcc.pressbooks.pub/hpe295ed2/'):
                        targets.append((wanted.pop(title),a['href']))
                entry['missing_requested_chapters']=list(wanted)
        except Exception as exc:entry.update(status='failed',error=type(exc).__name__+': '+str(exc))
        report.append(entry);print(source_id+': '+entry['status'],flush=True)
        (OUT/'new_source_downloads.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
