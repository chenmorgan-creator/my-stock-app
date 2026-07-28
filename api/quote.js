// api/quote.js
// Vercel Serverless Function：伺服器端直接呼叫 Yahoo Finance 公開端點，
// 避免瀏覽器端透過不穩定的第三方 CORS 代理（corsproxy.io）取價，
// 常見的 403 是 corsproxy.io 自己的黑名單機制，跟這支 API 無關，
// 改成伺服器對伺服器呼叫後就不會再有 CORS / 403 的問題。

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }

  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=5d&interval=1d&includePrePost=false`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        // Yahoo 有時會擋掉沒有瀏覽器 UA 的請求，補上避免被擋
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Yahoo responded with ${upstream.status}` });
      return;
    }

    const data = await upstream.json();

    // 快取 60 秒，減少重複打 Yahoo 的次數（同一批分析常常短時間內重複呼叫）
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: String(err) });
  }
}
