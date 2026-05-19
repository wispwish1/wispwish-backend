import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const getCleanEnv = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return {
        name,
        value: value.trim().replace(/^['"]|['"]$/g, '')
      };
    }
  }
  return { name: null, value: '' };
};

const accessKey = getCleanEnv('KING_AI_ACCESS_KEY', 'KLING_AI_ACCESS_KEY', 'KLINGAI_ACCESS_KEY');
const secretKey = getCleanEnv('KING_AI_SECRET_KEY', 'KLING_AI_SECRET_KEY', 'KLINGAI_SECRET_KEY');
const baseUrl = getCleanEnv('KING_AI_BASE_URL', 'KLING_AI_BASE_URL', 'KLINGAI_BASE_URL').value || 'https://api.klingai.com, https://api-singapore.klingai.com';
const modelName = getCleanEnv('KING_AI_MODEL_NAME', 'KLING_AI_MODEL_NAME', 'KLINGAI_MODEL_NAME').value || '(default model_name omitted)';

const mask = (value) => {
  if (!value) return '(missing)';
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

console.log('Kling config check');
console.log('Base URL:', baseUrl);
console.log('Access key env:', accessKey.name || '(missing)');
console.log('Access key:', mask(accessKey.value), `length=${accessKey.value.length}`);
console.log('Secret key env:', secretKey.name || '(missing)');
console.log('Secret key:', mask(secretKey.value), `length=${secretKey.value.length}`);
console.log('Model:', modelName);

if (!accessKey.value || !secretKey.value) {
  console.error('Missing Kling credentials. Set KING_AI_ACCESS_KEY and KING_AI_SECRET_KEY in backend/.env.');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const token = jwt.sign(
  {
    iss: accessKey.value,
    exp: now + 1800,
    nbf: now - 5
  },
  secretKey.value,
  {
    algorithm: 'HS256',
    noTimestamp: true,
    header: {
      alg: 'HS256',
      typ: 'JWT'
    }
  }
);

const decoded = jwt.decode(token, { complete: true });
console.log('JWT header:', decoded.header);
console.log('JWT payload:', {
  iss: mask(decoded.payload.iss),
  exp: decoded.payload.exp,
  nbf: decoded.payload.nbf
});
console.log('JWT generation: ok');
console.log('Auth probe: run this to verify without generating a video:');
console.log('  node scripts/check-kling-auth.js');
