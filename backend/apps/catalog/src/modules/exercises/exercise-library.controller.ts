import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ExerciseLibraryService } from './exercise-library.service.js';

type LibraryResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { header(name: string, value: string): void };
};

@Controller()
export class ExerciseLibraryController {
  constructor(@Inject(ExerciseLibraryService) private readonly library: ExerciseLibraryService) {}

  @Get('api/v1/pose-exercise-links')
  poseLinks() { return this.library.poseLinks(); }

  @Get('api/v1/muscle-groups')
  groups() { return this.library.groups(); }

  @Get('api/v1/equipment')
  equipment() { return this.library.equipment(); }

  @Get('api/v1/exercises/facets')
  facets() { return this.library.facets(); }

  @Get('api/v1/exercises')
  list(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: LibraryResponse) {
    response.setHeader('Cache-Control', 'no-store');
    return this.library.list(query);
  }

  @Get('api/v1/exercises/:slug')
  async detail(@Param('slug') slug: string, @Res({ passthrough: true }) response: LibraryResponse) {
    response.setHeader('Cache-Control', 'no-store');
    const { document, redirected } = await this.library.detail(slug);
    if (redirected) {
      response.status(308).header('Location', '/api/v1/exercises/' + document.slug);
      return;
    }
    return document;
  }
}
