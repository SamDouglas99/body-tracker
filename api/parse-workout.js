// api/parse-workout.js — lê uma FICHA DE TREINO (foto ou print) com a IA de visão
// e devolve a estrutura do programa pra importar no app.
// Chave fica em ANTHROPIC_API_KEY (ambiente da Vercel), nunca no cliente.
// Recebe { image: dataURL base64 } → { name, days:[{label, exercises:[{name,sets,reps,note}]}] }.
// Modelo: claude-haiku-5-5 (barato). Troque por claude-sonnet-5-5 p/ fichas complexas.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST', days: [] }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada na Vercel', days: [] }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const image = body && body.image;
  if (!image) { res.status(400).json({ error: 'Envie { image: dataURL base64 }', days: [] }); return; }

  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(image);
  if (!m) { res.status(400).json({ error: 'Imagem inválida (dataURL base64)', days: [] }); return; }
  const mediaType = m[1], b64 = m[2];

  const instruction =
    'Você extrai FICHAS DE TREINO de academia a partir da imagem (foto ou print). ' +
    'Responda SOMENTE um JSON válido, sem texto fora dele, no formato: ' +
    '{"name":"nome do treino","days":[{"label":"A — Peito e Tríceps","exercises":[{"name":"Supino reto","sets":3,"reps":"8-12","note":""}]}]}. ' +
    'Agrupe por dia/divisão (A/B/C, Push/Pull/Legs, Superior/Inferior etc.). ' +
    '"sets" é número (séries de trabalho); "reps" é texto (ex.: "8-12", "5", "até a falha"); "note" é observação curta (ou ""). ' +
    'Não invente exercícios que não estão na ficha. Se algo estiver ilegível, use um valor razoável.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: instruction },
          ],
        }],
      }),
    });

    const data = await r.json();
    if (!r.ok) { res.status(502).json({ error: 'Falha na IA', detail: data, days: [] }); return; }

    const text = (data.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('');
    const jsonStr = (text.match(/\{[\s\S]*\}/) || [null])[0];
    let parsed = { name: '', days: [] };
    if (jsonStr) { try { parsed = JSON.parse(jsonStr); } catch {} }

    const days = Array.isArray(parsed.days) ? parsed.days.map(d => ({
      label: String((d && d.label) || 'Dia').slice(0, 60),
      exercises: Array.isArray(d && d.exercises) ? d.exercises.map(e => ({
        name: String((e && e.name) || '').slice(0, 120),
        sets: Number(e && e.sets) || 3,
        reps: String((e && e.reps) || '8-12').slice(0, 20),
        note: String((e && e.note) || '').slice(0, 160),
      })).filter(e => e.name) : [],
    })).filter(d => d.exercises.length) : [];

    res.status(200).json({ name: String(parsed.name || 'Treino importado').slice(0, 60), days });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e), days: [] });
  }
};
