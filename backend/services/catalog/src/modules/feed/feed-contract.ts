import {readFileSync} from 'node:fs';
import {Ajv2020} from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
const contract=JSON.parse(readFileSync(new URL('../../../data/feed-contracts.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:false});(formats as unknown as (a:Ajv2020)=>void)(ajv);ajv.addSchema({$id:'catalog-feed',$defs:contract.schemas});
const event=ajv.compile(contract.event);
export const validFeed=(name:string,value:unknown)=>Boolean(ajv.getSchema('catalog-feed#/$defs/'+name)?.(value));
export const validCatalogEvent=(value:unknown)=>Boolean(event(value));
