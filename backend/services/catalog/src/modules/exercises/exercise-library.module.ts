import { Controller, Get, Param, Query, Res, Module, Inject, HttpException } from '@nestjs/common';
import type { Database } from '../../database.js';
import { createHash } from 'node:crypto';
import type { Exercise } from '../../import.js';
import { listPoseLinks } from './pose-exercise-links.js';
import { cachedExercise } from '../../public-cache.js';

function invalid(message: string): never {
  throw new HttpException(message, 400);
}

export function createExerciseLibraryModule(database: Database) {
  @Controller()
  class ExerciseLibraryController {
    constructor(@Inject('DATABASE') private readonly database: Database) {}

    @Get('api/v1/pose-exercise-links')
    poseLinks() { return listPoseLinks(this.database, true); }

    @Get('api/v1/muscle-groups')
    async groups() {
      const result = await this.database.query(
        "SELECT id,label_vi AS \"labelVi\",slug,svg_regions AS \"svgRegions\" FROM muscle_groups WHERE lifecycle='PUBLISHED' ORDER BY sort_order,id",
      );
      return { items: result.rows };
    }

    @Get('api/v1/equipment')
    async equipment() {
      const result = await this.database.query(
        "SELECT id,label_vi AS \"labelVi\",slug FROM equipment WHERE lifecycle='PUBLISHED' ORDER BY id",
      );
      return { items: result.rows };
    }

    @Get('api/v1/exercises/facets')
    async facets() {
      const totalRes = await this.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM exercises WHERE lifecycle='PUBLISHED'",
      );
      const typeRes = await this.database.query<{ key: string; count: string }>(
        `SELECT r.document->>'workoutType' AS key, count(*)::text AS count
         FROM exercises e JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
         WHERE e.lifecycle='PUBLISHED' AND r.document->>'workoutType' IS NOT NULL GROUP BY 1`,
      );
      const focusRes = await this.database.query<{ key: string; count: string }>(
        `SELECT r.document->>'focusArea' AS key, count(*)::text AS count
         FROM exercises e JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
         WHERE e.lifecycle='PUBLISHED' AND r.document->>'focusArea' IS NOT NULL GROUP BY 1`,
      );
      const diffRes = await this.database.query<{ key: string; count: string }>(
        `SELECT r.document->>'difficulty' AS key, count(*)::text AS count
         FROM exercises e JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
         WHERE e.lifecycle='PUBLISHED' AND r.document->>'difficulty' IS NOT NULL GROUP BY 1`,
      );
      const equipRes = await this.database.query<{ key: string; count: string }>(
        `SELECT g.equipment_id AS key, count(*)::text AS count
         FROM exercises e JOIN revision_equipment g ON g.exercise_id=e.id AND g.version=e.current_published_version
         WHERE e.lifecycle='PUBLISHED' GROUP BY 1`,
      );
      const muscleRes = await this.database.query<{ key: string; count: string }>(
        `SELECT g.group_id AS key, count(*)::text AS count
         FROM exercises e JOIN revision_muscle_groups g ON g.exercise_id=e.id AND g.version=e.current_published_version
         WHERE e.lifecycle='PUBLISHED' GROUP BY 1`,
      );
      const toMap = (rows: { key: string; count: string }[]) =>
        Object.fromEntries(rows.map(r => [r.key, Number(r.count)]));
      return {
        total: Number(totalRes.rows[0]?.count ?? 0),
        workoutTypes: toMap(typeRes.rows),
        focusAreas: toMap(focusRes.rows),
        difficulties: toMap(diffRes.rows),
        equipment: toMap(equipRes.rows),
        muscleGroups: toMap(muscleRes.rows),
      };
    }

    @Get('api/v1/exercises')
    async list(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: any) {
      response.setHeader('Cache-Control', 'no-store');
      for (const key of Object.keys(query)) {
        if (!['q', 'muscleGroupId', 'equipmentId', 'workoutType', 'focusArea', 'difficulty', 'limit', 'cursor', 'page', 'workoutTypes', 'equipmentIds', 'difficulties', 'sort'].includes(key) || typeof query[key] !== 'string') {
          invalid('Tham số truy vấn không hợp lệ');
        }
      }
      const q = query.q === undefined ? '' : String(query.q).trim();
      if ((query.q !== undefined && !q) || q.length > 100) invalid('Từ khóa không hợp lệ');
      const limitText = String(query.limit ?? '20');
      if (!/^[1-9][0-9]*$/.test(limitText) || Number(limitText) > 100) invalid('limit phải từ 1 đến 100');
      const limit = Number(limitText);
      const pageText = String(query.page ?? '1');
      if (!/^[1-9][0-9]{0,3}$/.test(pageText)) invalid('page không hợp lệ');
      const pageNumber = Number(pageText);
      for (const key of ['muscleGroupId', 'equipmentId']) {
        if (query[key] !== undefined && !/^[a-z][a-z0-9_]{0,79}$/.test(String(query[key]))) invalid('ID bộ lọc không hợp lệ');
      }
      if (query.workoutType !== undefined && !['STRENGTH', 'CARDIO', 'HIIT', 'CORE', 'STRETCHING'].includes(String(query.workoutType))) {
        invalid('Loại bài tập không hợp lệ');
      }
      if (query.focusArea !== undefined && !['FULL_BODY', 'UPPER_BODY', 'LOWER_BODY', 'ABS'].includes(String(query.focusArea))) {
        invalid('Trọng tâm cơ thể không hợp lệ');
      }
      if (query.difficulty !== undefined && !['1', '2', '3', '4', '5'].includes(String(query.difficulty))) {
        invalid('Độ khó không hợp lệ');
      }
      const selected = (name: string, pattern: RegExp) => {
        if (query[name] === undefined) return null;
        const values = String(query[name]).split(',');
        if (values.length > 20 || !values.every(value => pattern.test(value))) invalid('Bộ lọc không hợp lệ');
        return values;
      };
      const types = selected('workoutTypes', /^(STRENGTH|CARDIO|HIIT|CORE|STRETCHING)$/);
      const equipment = selected('equipmentIds', /^[a-z][a-z0-9_]{0,79}$/);
      const difficulties = selected('difficulties', /^[1-5]$/)?.map(Number) ?? null;
      const orders: Record<string, string> = {
        default: 'id COLLATE "C"',
        name: 'catalog_search_key(document->>\'nameVi\') COLLATE "C", id COLLATE "C"',
        'diff-asc': 'coalesce((document->>\'difficulty\')::int, 1) ASC, id COLLATE "C"',
        'diff-desc': 'coalesce((document->>\'difficulty\')::int, 1) DESC, id COLLATE "C"',
      };
      const sort = String(query.sort ?? 'default');
      if (!Object.hasOwn(orders, sort) || (sort !== 'default' && query.cursor !== undefined)) invalid('Sắp xếp không hợp lệ');
      const order = orders[sort];
      const filters = [
        q,
        query.muscleGroupId ?? '',
        query.equipmentId ?? '',
        query.workoutType ?? '',
        query.focusArea ?? '',
        query.difficulty ?? '',
        limit,
      ];
      const fingerprint = createHash('sha256').update(JSON.stringify(
        types || equipment || difficulties ? [...filters, types, equipment, difficulties] : filters,
      )).digest('hex');
      let after = '';
      let expectedRevision: string | undefined;
      if (query.cursor !== undefined) {
        try {
          const raw = String(query.cursor);
          if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) invalid('Cursor không hợp lệ');
          const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
          if (cursor.filter !== fingerprint || typeof cursor.revision !== 'string' ||
            typeof cursor.after !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(cursor.after)) invalid('Cursor không còn khớp bộ lọc hoặc revision');
          after = cursor.after;
          expectedRevision = cursor.revision;
        } catch { invalid('Cursor không hợp lệ, hãy tải lại trang đầu'); }
      }
      const offset = query.cursor !== undefined ? 0 : (pageNumber - 1) * limit;
      // Count and page share a single snapshot and the same filter predicates.
      const result = await this.database.query<{ revision: string; total: string; documents: Exercise[] }>(
        `WITH matching AS (
          SELECT e.id, r.document FROM exercises e
            JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
            WHERE e.lifecycle='PUBLISHED'
              AND ($1::text IS NULL OR EXISTS(SELECT 1 FROM revision_muscle_groups g WHERE g.exercise_id=e.id AND g.version=r.version AND g.group_id=$1))
              AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM revision_equipment g WHERE g.exercise_id=e.id AND g.version=r.version AND g.equipment_id=$2))
              AND strpos(r.search_key,catalog_search_key($3))>0
              AND ($6::text IS NULL OR r.document->>'workoutType' = $6)
              AND ($7::text IS NULL OR r.document->>'focusArea' = $7)
              AND ($8::int IS NULL OR (r.document->>'difficulty')::int = $8)
              AND ($10::text[] IS NULL OR r.document->>'workoutType' = ANY($10))
              AND ($11::text[] IS NULL OR EXISTS(SELECT 1 FROM revision_equipment g
                WHERE g.exercise_id=e.id AND g.version=r.version AND g.equipment_id = ANY($11)))
              AND ($12::int[] IS NULL OR (r.document->>'difficulty')::int = ANY($12))
          )
          SELECT coalesce((SELECT revision FROM publication_revisions ORDER BY aggregate_version DESC LIMIT 1), 'empty') AS revision,
          (SELECT count(*)::text FROM matching) AS total,
          coalesce((SELECT jsonb_agg(page.document ORDER BY ${order}) FROM (
            SELECT id, document FROM matching WHERE id COLLATE "C" > $4 COLLATE "C"
            ORDER BY ${order} OFFSET $9 LIMIT $5
          ) page), '[]'::jsonb) AS documents`,
        [
          query.muscleGroupId ?? null,
          query.equipmentId ?? null,
          q,
          after,
          limit + 1,
          query.workoutType ?? null,
          query.focusArea ?? null,
          query.difficulty ? Number(query.difficulty) : null,
          offset,
          types,
          equipment,
          difficulties,
        ],
      );
      const { revision, total: totalText, documents: rows } = result.rows[0];
      if (expectedRevision !== undefined && revision !== expectedRevision) invalid('Cursor không còn khớp revision');
      const page = rows.slice(0, limit);
      const totalCount = Number(totalText ?? 0);
      const totalPages = Math.max(1, Math.ceil(totalCount / limit));
      return {
        items: page.map(({ id, slug, nameVi, nameEn, summary, primaryMuscleIds, secondaryMuscleIds, equipmentIds, instructions, workoutType, focusArea, difficulty, levelSets, restSeconds, poseStyle, media }) => {
          const cover = media.find(item => item && typeof item === 'object' && 'kind' in item && item.kind === 'IMAGE') ?? media[0];
          return {
            id, slug, nameVi, nameEn, summary, primaryMuscleIds, secondaryMuscleIds, equipmentIds,
            instructions: (instructions ?? []).slice(0, 6), workoutType, focusArea, difficulty, levelSets, restSeconds, poseStyle,
            media: cover ? [cover] : [],
          };
        }),
        page: pageNumber,
        pageSize: limit,
        totalCount,
        totalPages,
        nextCursor: sort === 'default' && rows.length > limit
          ? Buffer.from(JSON.stringify({ after: page.at(-1)!.id, filter: fingerprint, revision })).toString('base64url')
          : null,
      };
    }

    @Get('api/v1/exercises/:slug')
    async detail(@Param('slug') slug: string, @Res({ passthrough: true }) response: any) {
      response.setHeader('Cache-Control', 'no-store');
      if (slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) invalid('Slug không hợp lệ');
      const result = await this.database.query<{ state: string; id: string; version: number }>(
        `SELECT h.state,e.id,e.current_published_version AS version FROM slug_history h JOIN exercises e ON e.id=h.exercise_id
          WHERE h.slug=$1 AND e.lifecycle='PUBLISHED'`, [slug],
      );
      const row = result.rows[0];
      if (!row) throw new HttpException('Không tìm thấy bài tập', 404);
      const document = await cachedExercise(row.id, row.version, async () =>
        (await this.database.query<{ document: Exercise }>(
          'SELECT document FROM exercise_revisions WHERE exercise_id=$1 AND version=$2', [row.id, row.version],
        )).rows[0]?.document);
      if (!document) throw new HttpException('Không tìm thấy bài tập', 404);
      if (row.state === 'ALIAS') {
        response.status(308).header('Location', '/api/v1/exercises/' + document.slug);
        return;
      }
      return document;
    }
  }

  @Module({ controllers: [ExerciseLibraryController], providers: [{ provide: 'DATABASE', useValue: database }] })
  class ExerciseLibraryModule {}

  return ExerciseLibraryModule;
}
