// config/db.js
import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1); // Exit if DB fails
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