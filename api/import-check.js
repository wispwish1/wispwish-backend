const checks = [
  ['subscriptionRoutes', '../routes/subscriptionRoutes.js'],
  ['giftTypes', '../routes/giftTypes.js'],
  ['aiService', '../services/aiService.js'],
  ['giftRoutes', '../routes/gift.js'],
  ['paymentRoutes', '../routes/payment.js'],
  ['songRoutes', '../routes/song.js'],
  ['server', '../server.js']
];

export default async function handler(req, res) {
  const results = [];

  for (const [name, modulePath] of checks) {
    try {
      await import(modulePath);
      results.push({ name, ok: true });
    } catch (error) {
      results.push({
        name,
        ok: false,
        message: error.message,
        stack: String(error.stack || '').split('\n').slice(0, 5)
      });
    }
  }

  res.status(200).json({
    ok: results.every(result => result.ok),
    node: process.version,
    env: {
      vercel: Boolean(process.env.VERCEL),
      hasMongoUri: Boolean(process.env.MONGODB_URI),
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      hasKlingAccessKey: Boolean(process.env.KING_AI_ACCESS_KEY),
      hasKlingSecretKey: Boolean(process.env.KING_AI_SECRET_KEY)
    },
    results
  });
}
