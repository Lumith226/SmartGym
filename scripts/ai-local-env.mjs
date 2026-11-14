import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const aiDirectory = fileURLToPath(new URL('../.local/ai/', import.meta.url));
export const uvBinary = join(aiDirectory, 'uv-0.13.7', 'uv.exe');
export async function localAIEnv() {
  const dirs = { cache: 'uv-cache', python: 'python', bin: 'bin', temp: 'tmp', torch: 'torch-cache',
    mpl: 'matplotlib', xdg: 'cache', hf: 'huggingface' };
  for (const value of Object.values(dirs)) await mkdir(join(aiDirectory, value), { recursive: true });
  return { ...process.env, UV_CACHE_DIR: join(aiDirectory, dirs.cache), UV_PYTHON_INSTALL_DIR: join(aiDirectory, dirs.python),
    UV_PYTHON_BIN_DIR: join(aiDirectory, dirs.bin), UV_PYTHON_INSTALL_BIN: 'false', UV_PYTHON_INSTALL_REGISTRY: 'false',
    UV_PYTHON_NO_REGISTRY: 'true', UV_NO_MODIFY_PATH: 'true', UV_NO_CONFIG: 'true',
    UV_NO_PROGRESS: 'true', UV_PYTHON_PREFERENCE: 'only-managed', PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONPATH: '',
    TEMP: join(aiDirectory, dirs.temp), TMP: join(aiDirectory, dirs.temp),
    TORCH_HOME: join(aiDirectory, dirs.torch), MPLCONFIGDIR: join(aiDirectory, dirs.mpl),
    XDG_CACHE_HOME: join(aiDirectory, dirs.xdg), HF_HOME: join(aiDirectory, dirs.hf),
    KB_GRAPH_BACKEND: 'local', KB_LLM_PROVIDER: 'disabled', KB_INDEX_DIR: join(aiDirectory, 'rag-index') };
}
