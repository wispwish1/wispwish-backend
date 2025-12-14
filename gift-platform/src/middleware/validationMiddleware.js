export const validate = (schema) => {
  return (req, res, next) => {
    const payload = ['POST', 'PUT', 'PATCH'].includes(req.method)
      ? req.body
      : req.query;

    const { error, value } = schema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        message: 'Validation failed',
        details: error.details.map((detail) => detail.message),
      });
    }

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      req.body = value;
    } else {
      req.query = value;
    }

    next();
  };
};
