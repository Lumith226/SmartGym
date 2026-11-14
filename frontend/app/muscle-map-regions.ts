// Original schematic geometry for SmartGym. Region keys are fixed; Catalog supplies IDs and labels.
export type BodySide = 'front' | 'back';
type Region = { key: string; groupId: string; path: string; paired: boolean };

// Full-body anatomical silhouette (head, hair, ears, neck, torso, arms, hands, legs)
export const headOutline = `
  M140 12
  C123 12 114 21 114 35
  C114 40 115 44 115 47
  C111 47 109 51 110 56
  C111 61 114 63 117 62
  C119 71 125 79 131 83
  L129 94
  L151 94
  L149 83
  C155 79 161 71 163 62
  C166 63 169 61 170 56
  C171 51 169 47 165 47
  C165 44 166 40 166 35
  C166 21 157 12 140 12 Z
`;

export const hairOutline = `
  M115 36
  C114 22 124 11 140 11
  C156 11 166 22 165 36
  C162 27 154 22 140 22
  C126 22 118 27 115 36 Z
`;

export const outline = `
  M126 82
  L124 92
  C112 97 98 101 84 106
  C66 112 56 126 51 147
  L39 191
  L20 242
  L12 262
  C9 270 12 277 17 279
  C21 279 25 274 28 267
  L33 277
  C37 278 41 273 40 264
  L45 251
  L68 205
  L85 164
  C86 191 92 216 96 238
  C87 271 84 311 92 355
  C96 376 99 393 97 411
  C90 434 91 459 99 485
  L123 485
  C128 458 130 433 125 410
  C124 393 126 376 131 356
  L137 296
  L140 292
  L143 296
  L149 356
  C154 376 156 393 155 410
  C150 433 152 458 157 485
  L181 485
  C189 459 190 434 183 411
  C181 393 184 376 188 355
  C196 311 193 271 184 238
  C188 216 194 191 195 164
  L212 205
  L235 251
  L240 264
  C239 273 243 278 247 277
  L252 267
  C255 274 259 279 263 279
  C268 277 271 270 268 262
  L260 242
  L241 191
  L229 147
  C224 126 214 112 196 106
  C182 101 168 97 156 92
  L154 82 Z
`;

function region(side: BodySide, groupId: string, path: string, paired = true): Region {
  return { key: `${side}_${groupId}`, groupId, path, paired };
}

// Shared anatomical muscle plates (left side defined, right side mirrored around x=140 when paired=true)
const frontShoulders =
  'M92 104 C73 108 58 121 53 142 C63 146 76 144 86 136 C91 124 94 113 92 104 Z';
const backShoulders =
  'M94 104 C74 108 58 121 53 142 C64 146 78 143 89 134 C94 123 96 112 94 104 Z';

const forearms =
  'M45 186 C56 183 67 187 72 196 L52 241 L39 249 L25 241 L40 197 Z';

const frontCalves =
  'M96 398 C105 405 117 405 125 398 C131 422 129 452 122 482 L99 482 C91 453 90 422 96 398 Z';
const backCalves =
  'M95 392 C105 385 118 385 126 392 C131 418 129 450 122 482 L99 482 C91 450 90 418 95 392 Z';

export const bodyRegions: Record<BodySide, Region[]> = {
  front: [
    region('front', 'shoulders', frontShoulders),
    region(
      'front',
      'chest',
      'M94 105 C109 101 126 104 139 112 L139 154 C122 158 102 154 89 141 C93 129 95 116 94 105 Z',
    ),
    region(
      'front',
      'biceps',
      'M53 144 C64 147 76 145 86 138 L75 191 C65 185 55 183 45 185 Z',
    ),
    region('front', 'forearms', forearms),
    region(
      'front',
      'core',
      'M118 156 C128 152 135 152 140 155 C145 152 152 152 162 156 L158 228 C151 244 145 256 140 262 C135 256 129 244 122 228 Z',
      false,
    ),
    region(
      'front',
      'obliques',
      'M89 143 C101 154 110 156 116 157 L120 227 C109 221 100 209 96 192 C92 175 89 158 89 143 Z',
    ),
    region(
      'front',
      'hip_flexors',
      'M96 222 C105 226 114 231 121 238 L115 262 C105 254 97 244 94 233 Z',
    ),
    region(
      'front',
      'quadriceps',
      'M94 236 C106 247 116 261 121 278 C123 311 119 345 112 374 C102 376 95 369 92 354 C85 312 87 271 94 236 Z',
    ),
    region(
      'front',
      'adductors',
      'M122 242 C130 253 136 264 138 278 L131 355 C126 368 120 374 114 373 C121 344 124 310 122 277 Z',
    ),
    region('front', 'calves', frontCalves),
  ],
  back: [
    region('back', 'shoulders', backShoulders),
    region(
      'back',
      'upper_back',
      'M96 102 C112 96 126 93 140 93 C154 93 168 96 184 102 C175 123 158 156 140 186 C122 156 105 123 96 102 Z',
      false,
    ),
    region(
      'back',
      'triceps',
      'M53 144 C64 147 77 145 87 137 L75 191 C65 185 55 183 45 185 Z',
    ),
    region('back', 'forearms', forearms),
    region(
      'back',
      'lats',
      'M91 135 C104 147 120 168 135 190 L124 226 C108 214 98 197 94 176 C91 161 90 147 91 135 Z',
    ),
    region(
      'back',
      'lower_back',
      'M138 190 L142 190 L156 226 C149 233 144 236 140 236 C136 236 131 233 124 226 Z',
      false,
    ),
    region(
      'back',
      'glutes',
      'M96 226 C110 227 126 233 139 242 L139 283 C124 293 104 289 92 274 C89 258 91 241 96 226 Z',
    ),
    region(
      'back',
      'hamstrings',
      'M92 277 C106 291 124 294 138 286 L131 364 C124 377 104 378 94 364 C87 334 87 303 92 277 Z',
    ),
    region('back', 'calves', backCalves),
  ],
};
