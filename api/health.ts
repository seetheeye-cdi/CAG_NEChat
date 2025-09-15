let initialized = false;
async function ensureInit() {
  if (!initialized) {
    const mod = await import('./lib/chunkSearch');
    await mod.loadChunks();
    initialized = true;
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
    try {
      await ensureInit();
      const mod = await import('./lib/chunkSearch');
      const categories = mod.getAllCategories();
      res.status(200).json({ status: 'ok', mode: 'chunk-based', categories: categories.length, chunks: 'loaded' });
    } catch (e: any) {
      res.status(200).json({ status: 'ok', mode: 'chunk-based', chunks: 'not loaded', details: e?.message || String(e) });
    }
  } catch (err: any) {
    res.status(200).json({ status: 'ok', mode: 'chunk-based', chunks: 'not loaded' });
  }
}


