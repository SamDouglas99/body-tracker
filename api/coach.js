// api/coach.js — Coach de IA do Body Tracker. Recebe a pergunta do usuário + um resumo
// dos dados dele (peso, meta, treinos, dieta) e devolve uma resposta prática.
// Chave em ANTHROPIC_API_KEY (ambiente da Vercel), nunca no cliente.
// Recebe { question, context } → { answer }.
// Modelo: claude-sonnet-5-5 (bom equilíbrio). Haiku p/ mais barato, Opus p/ máx. qualidade.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada na Vercel' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const question = (body && body.question || '').toString().slice(0, 2000);
  const context = (body && body.context || '').toString().slice(0, 6000);
  if (!question) { res.status(400).json({ error: 'Faltou a pergunta' }); return; }

  const system =
    'Você é o coach de treino e nutrição do app Body Tracker. Responda em português do Brasil, ' +
    'de forma prática, direta e motivadora, usando os DADOS do usuário quando fizer sentido. ' +
    'Dê passos concretos (cargas, reps, calorias, ajustes). Seja conciso (no máximo ~200 palavras). ' +
    'Você NÃO é médico: para dor, lesão ou condição de saúde, recomende procurar um profissional. ' +
    'Nunca invente dados que não estão no contexto; se faltar informação, diga o que registrar.';

  const userMsg = (context ? ('DADOS DO USUÁRIO:\n' + context + '\n\n') : '') + 'PERGUNTA: ' + question;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    const data = await r.json();
    if (!r.ok) { res.status(502).json({ error: 'Falha na IA', detail: data }); return; }
    const answer = (data.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('').trim();
    res.status(200).json({ answer: answer || 'Não consegui responder agora. Tente de novo.' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
