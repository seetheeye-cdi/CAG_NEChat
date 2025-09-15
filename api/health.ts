import { loadChunks, getAllCategories } from '../src/chunkSearch';

let initialized = false;
async function ensureInit() {
  if (!initialized) {
    await loadChunks();
    initialized = true;
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
    await ensureInit();
    const categories = getAllCategories();
    res.status(200).json({ status: 'ok', mode: 'chunk-based', categories: categories.length, chunks: 'loaded' });
  } catch (err: any) {
    res.status(200).json({ status: 'ok', mode: 'chunk-based', chunks: 'not loaded' });
  }
}


