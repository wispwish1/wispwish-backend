// import rateLimit from 'express-rate-limit';

// AUTHENTICATION DISABLED TEMPORARILY
// Bypass authentication for development purposes
// export const authenticateToken = async (req, res, next) => {
//     // Set a dummy user for all requests
//     req.user = {
//         _id: '123456789',
//         name: 'Test User',
//         email: 'test@example.com',
//         role: 'admin', // Admin role to bypass all role checks
//         isEmailVerified: true
//     };
//     next();
// };

// // Bypass role authorization
// export const authorizeRoles = (...roles) => {
//     return (req, res, next) => {
//         // Always allow access regardless of role
//         next();
//     };
// };

  


// export const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 10, // limit each IP to 10 requests per windowMs
//   message: {
//     success: false,
//     message: 'Too many attempts, please try again after 15 minutes',
//   },
// });

// // middlewares/authMiddleware.js

// function requireLogin(req, res, next) {
//     const token = req.cookies?.token; // assuming you use cookies
  
//     if (!token) {
//       return res.redirect('/signup');
//     }
  
//     // optionally verify token
//     jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
//       if (err) return res.redirect('/signup');
//       req.user = user;
//       next();
//     });
  
//     next();
//   }
  
// export default requireLogin;
  


// import jwt from 'jsonwebtoken';
// // import { authLimiter } from './rateLimiter.js';

// // const authenticateToken = async (req, res, next) => {
// //     try {
// //         const authHeader = req.headers['authorization'];
// //         const token = authHeader && authHeader.split(' ')[1];

// //         if (!token) {
// //             return res.status(401).json({ 
// //                 success: false, 
// //                 message: 'Access token is required' 
// //             });
// //         }

// //         const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
// //         const user = await User.findById(decoded.userId).select('-password');

// //         if (!user) {
// //             return res.status(401).json({ 
// //                 success: false, 
// //                 message: 'Invalid token' 
// //             });
// //         }

// //         req.user = user;
// //         next();
// //     } catch (error) {
// //         return res.status(403).json({ 
// //             success: false, 
// //             message: 'Invalid or expired token' 
// //         });
// //     }
// // };


// const authenticateToken = (req, res, next) => {
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1];

//     if (token == null) return res.status(401).json({ message: 'Authentication token required' });

//     jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
//         if (err) {
//             console.error('JWT verification error:', err);
//             return res.status(403).json({ message: 'Invalid or expired token' });
//         }
//         req.user = user; // user object contains { _id, role }
//         next();
//     });
// };

// // const authorizeRoles = (...roles) => {
// //     return (req, res, next) => {
// //         if (!req.user || !roles.includes(req.user.role)) {
// //             return res.status(403).json({ error: 'Access denied. You do not have the required permissions.' });
// //         }
// //         next();
// //     };
// // };

// const authLimiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 10, // limit each IP to 10 requests per windowMs
//     message: {
//       success: false,
//       message: 'Too many attempts, please try again after 15 minutes',
//     },
//   });

// const requireLogin = (req, res, next) => {
//     const token = req.headers['authorization']?.split(' ')[1];

//     if (!token) {
//         return res.status(401).json({
//             success: false,
//             message: 'Authentication required'
//         });
//     }

//     jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
//         if (err) {
//             return res.status(403).json({
//                 success: false,
//                 message: 'Invalid or expired token'
//             });
//         }
//         req.user = user;
//         next();
//     });
// };



// export { authenticateToken, authLimiter, requireLogin };





















import jwt from 'jsonwebtoken';
// import rateLimit from 'express-rate-limit';
import User from '../models/User.js'; // Assuming User model is imported for authenticateToken

// Authentication middleware for protected routes (e.g., login-related routes)




// const authenticateToken = async (req, res, next) => {
//   try {
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1];

//     if (!token) {
//       return res.status(401).json({
//         success: false,
//         message: 'Authentication token required',
//       });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
//     const user = await User.findById(decoded.userId).select('-password');

//     if (!user) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid token',
//       });
//     }

//     req.user = user;
//     next();
//   } catch (error) {
//     console.error('JWT verification error:', error);
//     return res.status(403).json({
//       success: false,
//       message: 'Invalid or expired token',
//     });
//   }
// };



const authenticateToken = async (req, res, next) => {
    // Set a dummy user for all requests
    req.user = {
        _id: '123456789',
        name: 'Test User',
        email: 'test@example.com',
        role: 'admin', // Admin role to bypass all role checks
        isEmailVerified: true
    };
    next();
};

// Bypass role authorization
export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        // Always allow access regardless of role
        next();
    };
};



// Rate limiter for authentication routes
// const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 10, // limit each IP to 10 requests per windowMs
//   message: {
//     success: false,
//     message: 'Too many attempts, please try again after 15 minutes',
//   },
// });

// Middleware for login routes
const requireLogin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }
    req.user = user;
    next();
  });
};

export { authenticateToken,  requireLogin };