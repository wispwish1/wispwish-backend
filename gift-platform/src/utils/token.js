import jwt from 'jsonwebtoken';

const getExpiry = () => {
  const ttl = Number(process.env.TOKEN_TTL_HOURS || 24);
  return `${ttl}h`;
};

export const generateToken = (payload, expiresIn) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is missing');
  }

  return jwt.sign(payload, secret, {
    expiresIn: expiresIn || getExpiry(),
  });
};

export const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is missing');
  }

  return jwt.verify(token, secret);
};
