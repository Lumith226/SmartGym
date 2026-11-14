import { readFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { HttpException } from '@nestjs/common';

const ajv = new Ajv2020({ strict: true, allErrors: false });
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;
addFormats(ajv);
ajv.addFormat('password', true);
const schemas = JSON.parse(await readFile(new URL('../../../data/http.schemas.json', import.meta.url), 'utf8'));
for (const [name, schema] of Object.entries(schemas)) ajv.addSchema(schema as object, name);
export function validate(name: string, body: unknown): Record<string, string> {
  const check = ajv.getSchema(name);
  if (!check || !check(body)) throw new HttpException({ code: 'VALIDATION_ERROR' }, 422);
  const value = body as Record<string, string>;
  if (value.displayName !== undefined && !value.displayName.trim()) throw new HttpException({ code: 'VALIDATION_ERROR' }, 422);
  if (value.timeZone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }); }
    catch { throw new HttpException({ code: 'VALIDATION_ERROR' }, 422); }
    // Intl also accepts numeric offsets; the API requires an IANA identifier.
    if (/^[+-]/.test(value.timeZone)) throw new HttpException({ code: 'VALIDATION_ERROR' }, 422);
  }
  return value;
}
