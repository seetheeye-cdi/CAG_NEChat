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
    res.status(200).json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: '카테고리 목록을 가져올 수 없습니다.' });
  }
}


