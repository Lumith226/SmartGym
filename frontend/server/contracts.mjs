import {Ajv2020} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import contracts from '../data/auth-contracts.json' with {type:'json'};
const ajv=new Ajv2020({strict:true});addFormats(ajv);ajv.addFormat('password',true);
for(const[name,schema]of Object.entries(contracts.schemas))ajv.addSchema(schema,name);
export const operations=contracts.operations;
export const valid=(name,value)=>!!ajv.getSchema(name)?.(value);
