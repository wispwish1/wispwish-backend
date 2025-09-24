import mongoose from 'mongoose';

const wishKnotSchema = new mongoose.Schema({
  // Basic gift information
  giftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gift',
    required: true
  },
  
  // Knot identification
  knotId: {
    type: String,
    required: true,
    unique: true,
    default: () => `knot_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  },
  
  // Sender information
  senderName: {
    type: String,
    required: true
  },
  
  // Recipient information
  recipientName: {
    type: String,
    required: true
  },
  recipientEmail: {
    type: String,
    required: false
  },
  
  // WishKnot content
  personalizedMessage: {
    type: String,
    required: true
  },
  
  // Animation URLs
  tiedAnimationUrl: {
    type: String,
    required: true
  },
  untieAnimationUrl: {
    type: String,
    required: true
  },
  
  // Knot properties
  knotType: {
    type: String,
    enum: ['Heart Knot', 'Love Knot', 'Joy Knot', 'Wisdom Knot', 'Support Knot', 'Laughter Knot', 'Inspiration Knot'],
    default: 'Heart Knot'
  },
  
  tone: {
    type: String,
    enum: ['heartfelt', 'romantic', 'playful', 'thoughtful', 'supportive', 'funny', 'inspirational'],
    default: 'heartfelt'
  },
  
  relationship: {
    type: String,
    // required: false,
    default: 'friend',
    enum: ['friend', 'family','mother', 'brother', 'sister', 'father', 'colleague', 'customer', 'partner', 'teammate', 'mentor', 'teacher', 'coach', 'co-worker', 'colleague' ],
  },
  
  occasion: {
    type: String,
    required: false,
    default: 'special occasion'
  },
  
  // Knot state and interaction
  state: {
    type: String,
    enum: ['tied', 'untying', 'untied'],
    default: 'tied'
  },
  
  // Timing
  tiedAt: {
    type: Date,
    default: Date.now
  },
  
  untiedAt: {
    type: Date,
    default: null
  },
  
  // Interaction tracking
  viewCount: {
    type: Number,
    default: 0
  },
  
  interactionLog: [{
    action: {
      type: String,
      enum: ['viewed', 'clicked', 'untying_started', 'untied', 'retied', 'message_viewed', 'email_sent']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  
  // Visual metadata
  visualMetadata: {
    colors: {
      primary: String,
      secondary: String,
      accent: String
    },
    symbolism: String,
    animationSpeed: Number
  },
  
  // Access control
  accessToken: {
    type: String,
    required: true,
    unique: true,
    default: () => `access_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  },
  
  // Scheduling
  scheduledRevealDate: {
    type: Date,
    default: null
  },
  
  isRevealed: {
    type: Boolean,
    default: false
  },
  
  // Additional sender message
  senderMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for fast lookups
wishKnotSchema.index({ knotId: 1 });
wishKnotSchema.index({ accessToken: 1 });
wishKnotSchema.index({ giftId: 1 });
wishKnotSchema.index({ state: 1 });

// Instance methods
wishKnotSchema.methods.untie = function() {
  if (this.state === 'tied') {
    this.state = 'untying';
    this.interactionLog.push({
      action: 'untying_started',
      timestamp: new Date()
    });
    
    // After a delay, mark as untied
    setTimeout(() => {
      this.state = 'untied';
      this.untiedAt = new Date();
      this.isRevealed = true;
      this.interactionLog.push({
        action: 'untied',
        timestamp: new Date()
      });
      this.save();
    }, 3000); // 3 second untying animation
    
    return this.save();
  }
  return Promise.resolve(this);
};

wishKnotSchema.methods.incrementView = function() {
  this.viewCount += 1;
  this.interactionLog.push({
    action: 'viewed',
    timestamp: new Date()
  });
  return this.save();
};

wishKnotSchema.methods.logInteraction = function(action, metadata = {}) {
  this.interactionLog.push({
    action,
    timestamp: new Date(),
    metadata
  });
  return this.save();
};

// Static methods
wishKnotSchema.statics.findByAccessToken = function(accessToken) {
  return this.findOne({ accessToken });
};

wishKnotSchema.statics.findByKnotId = function(knotId) {
  return this.findOne({ knotId });
};

wishKnotSchema.statics.getKnotStats = function(knotId) {
  return this.aggregate([
    { $match: { knotId } },
    {
      $project: {
        viewCount: 1,
        state: 1,
        tiedAt: 1,
        untiedAt: 1,
        totalInteractions: { $size: '$interactionLog' },
        knotType: 1,
        tone: 1
      }
    }
  ]);
};

const WishKnot = mongoose.model('WishKnot', wishKnotSchema);

export default WishKnot;