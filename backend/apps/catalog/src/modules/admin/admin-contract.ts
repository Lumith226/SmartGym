import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { HttpException } from '@nestjs/common';

const ajv = new Ajv2020({ strict: true });
const addFormats = addFormatsModule as unknown as (validator: Ajv2020) => void;
addFormats(ajv);
const schemas = JSON.parse(readFileSync(new URL('../../../data/admin.schemas.json', import.meta.url), 'utf8'));
for (const [name, schema] of Object.entries(schemas)) ajv.addSchema(schema as object, name);
for (const name of Object.keys(schemas)) ajv.getSchema(name);
export function valid(name: string, value: unknown): boolean {
  return !!ajv.getSchema(name)?.(value);
}
export function reject(status: number, code: string): never {
  throw new HttpException({ code }, status);
}
export const identifier = /^[a-z][a-z0-9_]{0,79}$/;
export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
