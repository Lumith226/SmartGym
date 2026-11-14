import { readFile } from 'node:fs/promises';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const api = await SwaggerParser.validate('docs/api/openapi.yaml', { resolve: { external: false } });
const events = JSON.parse(await readFile('docs/api/events.yaml', 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.compile(events);
const operationIds = new Set();
for (const item of Object.values(api.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'].includes(method)) continue;
    if (!operation.operationId || operationIds.has(operation.operationId)) {
      throw new Error('Missing or duplicate operationId: ' + operation.operationId);
    }
    operationIds.add(operation.operationId);
  }
}
console.log('OpenAPI 3.1 schema/references and ' + operationIds.size + ' operation IDs passed');
console.log('JSON Schema 2020-12 event schema compiled');
