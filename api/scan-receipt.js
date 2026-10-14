// api/scan-receipt.js — lê uma nota de mercado com a API da Claude (visão).
// A chave (ANTHROPIC_API_KEY) fica no ambiente da Vercel, NUNCA no navegador.
// Recebe { image: dataURL base64 } e devolve { store, items:[{name,qty,price,category}] }.
//
// Usa HTTP direto (sem dependências) para o deploy ser à prova de bala.
// Modelo: claude-haiku-5-5 (barato e com visão, ótimo p/ ler notas).
// Troque por 'claude-opus-5-5' se quiser mais precisão (custa mais).

const CAT_LIST = ['Mercado', 'Alimentação', 'Suplementos', 'Academia', 'Saúde', 'Transporte', 'Outros'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST', items: [] }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada na Vercel', items: [] }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const image = body && body.image;
  if (!image) { res.status(400).json({ error: 'Envie { image: dataURL base64 }', items: [] }); return; }

  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(image);
  if (!m) { res.status(400).json({ error: 'Imagem inválida (precisa ser dataURL base64)', items: [] }); return; }
  const mediaType = m[1], b64 = m[2];

  const instruction =
    'Você extrai itens de notas fiscais e cupons de mercado brasileiros a partir da imagem. ' +
    'Responda SOMENTE um JSON válido, sem nenhum texto fora dele, no formato: ' +
    '{"store":"nome do estabelecimento","items":[{"name":"produto","qty":número,"price":número,"category":"categoria"}]}. ' +
    '"price" é o preço UNITÁRIO em reais (ponto decimal). "qty" é a quantidade (1 se não houver). ' +
    '"category" deve ser uma destas: ' + CAT_LIST.join(', ') + '. ' +
    'Não invente itens que não estão na nota. Se um campo estiver ilegível, use um valor razoável.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 2000,
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
    if (!r.ok) { res.status(502).json({ error: 'Falha na IA', detail: data, items: [] }); return; }

    const text = (data.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('');
    const jsonStr = (text.match(/\{[\s\S]*\}/) || [null])[0];
    let parsed = { store: '', items: [] };
    if (jsonStr) { try { parsed = JSON.parse(jsonStr); } catch {} }

    const items = Array.isArray(parsed.items) ? parsed.items.map(i => ({
      name: String(i.name || '').slice(0, 120),
      qty: Number(i.qty) || 1,
      price: Number(i.price) || 0,
      category: CAT_LIST.includes(i.category) ? i.category : 'Mercado',
    })).filter(i => i.name) : [];

    res.status(200).json({ store: String(parsed.store || '').slice(0, 80), items });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e), items: [] });
  }
}
