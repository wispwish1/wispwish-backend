// config/db.js
import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    // Make sure the MongoDB URI is properly configured
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    
    const conn = await mongoose.connect(mongoUri, {
      
      serverSelectionTimeoutMS: 60000, // 60 seconds
      socketTimeoutMS: 120000, // 120 seconds
      maxPoolSize: 15, // Maintain up to 15 socket connections
      minPoolSize: 5, // Minimum number of sockets to keep open
      retryWrites: true, // Enable retryable writes
      connectTimeoutMS: 60000, // Connection timeout
      heartbeatFrequencyMS: 10000, // Heartbeat frequency
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error(`❌ MongoDB Connection Error: ${err.message}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('📡 MongoDB Disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB Reconnected');
    });
    
  } catch (error) {
    console.error(`❌ MongoDB Connection Failed: ${error.message}`);
    if (process.env.VERCEL) {
      throw error;
    }
    process.exit(1); // Exit local server if DB fails
  }
};

// MongoDB Connection
// mongoose.connect(process.env.MONGODB_URI, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//     .then(() => console.log('MongoDB connected'))
//     .catch(err => console.error('MongoDB connection error:', err));
  












// // config/db.js
// import mongoose from 'mongoose';

// export const connectDB = async () => {
//   try {
//     // Remove deprecated options and add proper timeout settings
//     const conn = await mongoose.connect(process.env.MONGODB_URI, {
//       serverSelectionTimeoutMS: 30000, // 30 seconds
//       socketTimeoutMS: 45000, // 45 seconds
//       bufferMaxEntries: 0,
//       maxPoolSize: 10,
//       minPoolSize: 5,
//     });
    
//     console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
//     // Handle connection events
//     mongoose.connection.on('error', (err) => {
//       console.error(`❌ MongoDB Error: ${err.message}`);
//     });
    
//     mongoose.connection.on('disconnected', () => {
//       console.log('📡 MongoDB Disconnected');
//     });
    
//   } catch (error) {
//     console.error(`❌ MongoDB Connection Failed: ${error.message}`);
//     process.exit(1); // Exit if DB fails
//   }
// };
