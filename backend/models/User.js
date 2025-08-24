// // backend/models/User.js

// import mongoose from 'mongoose';
// import validator from 'validator';

// const userSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: [true, 'Name is required'],
//         trim: true,
//         minlength: [2, 'Name must be at least 2 characters'],
//         maxlength: [50, 'Name cannot exceed 50 characters']
//     },
//     email: {
//         type: String,
//         required: [true, 'Email is required'],
//         unique: true,
//         lowercase: true,
//         validate: [validator.isEmail, 'Please provide a valid email']
//     },
//     password: {
//         type: String,
//         required: [true, 'Password is required'],
//         minlength: [6, 'Password must be at least 6 characters'],
//         select: false // Don't include password in queries by default
//     },
//     role: {
//         type: String,
//         enum: ['customer', 'creator', 'business', 'admin'],
//         default: 'customer',
//         required: [true, 'Role is required']
//     },
//     isEmailVerified: {
//         type: Boolean,
//         default: false
//     },
//     emailVerificationToken: String,
//     passwordResetToken: String,
//     passwordResetExpires: Date,
//     lastLogin: Date,
//     loginAttempts: {
//         type: Number,
//         default: 0
//     },
//     lockUntil: Date,
//     socialProviders: [{
//         provider: {
//             type: String,
//             enum: ['google', 'facebook']
//         },
//         providerId: String
//     }],
//     profile: {
//         avatar: String,
//         bio: String,
//         preferences: {
//             emailNotifications: {
//                 type: Boolean,
//                 default: true
//             },
//             marketingEmails: {
//                 type: Boolean,
//                 default: false
//             }
//         }
//     },
//     subscription: {
//         plan: {
//             type: String,
//             enum: ['free', 'monthly', 'weekly'],
//             default: 'free'
//         },
//         status: {
//             type: String,
//             enum: ['active', 'cancelled', 'expired'],
//             default: 'active'
//         },
//         startDate: Date,
//         endDate: Date
//     }
// }, {
//     timestamps: true
// });


// const User = mongoose.model('User', userSchema);
// export default User;



import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    role: { type: String, required: true },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    lastLogin: Date,
    createdAt: { type: Date, default: Date.now },
    authToken: { type: String },
});

userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

userSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAuthToken = function () {
    const token = jwt.sign(
        { userId: this._id, role: this.role }, // Ensure 'role' is included here
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
    return token;
};

export default mongoose.model('User', userSchema);