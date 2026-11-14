import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { HttpException } from '@nestjs/common';

const ajv = new Ajv2020({ strict: false });
const addFormats = addFormatsModule as unknown as (validator: Ajv2020) => void;
addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../data/contracts.json', import.meta.url), 'utf8')));
const eventSchema = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const eventValid = ajv.compile(eventSchema);
export const validEvent = (value: unknown) => !!eventValid(value);
export const valid = (name: string, value: unknown) => !!ajv.getSchema('workout-contract#/components/schemas/' + name)?.(value);
export function reject(status: number, code: string): never { throw new HttpException({ code }, status); }
export const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
