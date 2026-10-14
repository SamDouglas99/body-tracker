// api/health.js — checagem simples do backend serverless na Vercel.
// Acesse /api/health depois do deploy para confirmar que as funções estão rodando
// e se a chave da IA já foi configurada (hasKey).
module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'body-tracker',
    hasKey: !!process.env.ANTHROPIC_API_KEY,
    time: new Date().toISOString(),
  });
};
