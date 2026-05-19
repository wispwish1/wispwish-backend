import axios from 'axios';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const getCleanEnv = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return '';
};

const accessKey = getCleanEnv('KING_AI_ACCESS_KEY', 'KLING_AI_ACCESS_KEY', 'KLINGAI_ACCESS_KEY');
const secretKey = getCleanEnv('KING_AI_SECRET_KEY', 'KLING_AI_SECRET_KEY', 'KLINGAI_SECRET_KEY');
const configuredBaseUrl = getCleanEnv('KING_AI_BASE_URL', 'KLING_AI_BASE_URL', 'KLINGAI_BASE_URL');
const baseUrls = configuredBaseUrl
  ? [configuredBaseUrl]
  : ['https://api-singapore.klingai.com', 'https://api.klingai.com'];

if (!accessKey || !secretKey) {
  console.error('Missing Kling credentials. Set KING_AI_ACCESS_KEY and KING_AI_SECRET_KEY in backend/.env.');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const token = jwt.sign(
  {
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5
  },
  secretKey,
  {
    algorithm: 'HS256',
    noTimestamp: true,
    header: {
      alg: 'HS256',
      typ: 'JWT'
    }
  }
);

try {
  console.log('Kling key lengths:', { accessKey: accessKey.length, secretKey: secretKey.length });
  console.log('Kling token signature prefix:', token.split('.')[2]?.slice(0, 8));
  let lastError = null;

  for (const baseUrl of baseUrls) {
    try {
      console.log('Kling auth probe base URL:', baseUrl);
      await axios.get(`${baseUrl}/v1/videos/text2video/000000000000000000`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 15000
      });
      console.log('Kling auth accepted.');
      process.exit(0);
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;

      if (status === 400 && data?.code === 1201) {
        console.log('Kling auth accepted. Fake task returned expected not-found response.');
        process.exit(0);
      }

      lastError = { status, data, message: error.message };
      console.error('Kling auth probe failed on this host:', status || 'network-error', data || error.message);
    }
  }

  throw lastError;
} catch (error) {
  console.error('Kling auth probe failed on all hosts:', error);
  process.exit(1);
}
