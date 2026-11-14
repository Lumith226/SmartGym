import type {Metadata} from 'next';
import {Chat} from './chat';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Hỏi SmartGym',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function ChatPage({searchParams}:{searchParams:Promise<{resultId?:string|string[]}>}){
  const query=await searchParams;const ids=Array.isArray(query.resultId)?query.resultId:query.resultId?[query.resultId]:[];
  const valid=ids.length<=50&&ids.every(id=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id));
  const selected=valid?[...new Set(ids)]:[];
  return <Chat key={selected.join(':')+(valid?'':':invalid')} resultIds={selected} invalidSelection={!valid}/>;
}
