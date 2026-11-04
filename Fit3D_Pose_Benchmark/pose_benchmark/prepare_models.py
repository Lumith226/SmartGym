"""Download unchanged public FP32 exports; record hashes and provenance."""
import argparse,concurrent.futures,hashlib,json,re,urllib.request,zipfile
from pathlib import Path
BASE=Path(__file__).resolve().parent
WEIGHTS=BASE/'weights'; WEIGHTS.mkdir(exist_ok=True)
SOURCES=BASE/'sources'
URLS={
 'rtmpose_m':('https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.zip','zip'),
 'rtmo_s':('https://download.openmmlab.com/mmpose/v1/projects/rtmo/onnx_sdk/rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.zip','zip'),
 'movenet_lightning':('https://huggingface.co/onnx-community/movenet-lightning-web/resolve/main/onnx/model.onnx','onnx'),
 'vitpose_base':('https://huggingface.co/onnx-community/vitpose-base-simple/resolve/main/onnx/model.onnx','onnx'),
}
for key,card in [('litehrnet','litehrnet_card.md'),('hrnet','hrnet_card.md')]:
 text=(SOURCES/card).read_text(encoding='utf-8')
 url=re.search(r'\[Download\]\(([^)]+onnx-float.zip)\)',text).group(1)
 URLS[key]=(url,'zip')
for ext in ['xml','bin']:
 URLS['litepose_'+ext]=(f'https://huggingface.co/cansik/visiongraph/resolve/main/litepose-auto-s-coco-fp32.{ext}',ext)

def download(item):
 name,(url,fmt)=item; dest=WEIGHTS/(name+'.'+fmt)
 try:
  if not dest.exists():
   temp=dest.with_suffix(dest.suffix+'.partial')
   offset=temp.stat().st_size if temp.exists() else 0
   request=urllib.request.Request(url,headers={'Range':f'bytes={offset}-'} if offset else {})
   with urllib.request.urlopen(request,timeout=60) as response:
    mode='ab' if response.status==206 and offset else 'wb'
    with temp.open(mode) as f:
     while chunk:=response.read(1024*1024):
      f.write(chunk)
      if f.tell()%(8*1024*1024)==0:print(name,'downloaded MB',f.tell()//(1024*1024),flush=True)
   temp.replace(dest)
  if fmt=='zip':
   with zipfile.ZipFile(dest) as z:
    for n in z.namelist():
     if n.endswith('.data'):
      (WEIGHTS/Path(n).name).write_bytes(z.read(n))
     if n.endswith('.onnx'):
      (WEIGHTS/(name+'.onnx')).write_bytes(z.read(n))
  sha=hashlib.sha256(dest.read_bytes()).hexdigest()
  result={'name':name,'url':url,'path':str(dest),'sha256':sha,'bytes':dest.stat().st_size,'status':'downloaded'}
 except Exception as e:result={'name':name,'url':url,'status':'failed','error':str(e)}
 print(json.dumps(result),flush=True); return result
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='*');args=parser.parse_args()
 items=[x for x in URLS.items() if not args.only or x[0] in args.only]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: records=list(pool.map(download,items))
 (BASE/'model_downloads.json').write_text(json.dumps(records,indent=2))
