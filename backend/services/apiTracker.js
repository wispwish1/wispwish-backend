import APIUsage from '../models/APIUsage.js';

const trackAPIUsage = async (provider, requestCount = 1, characterCount = 0, orderId = null, hasError = false) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Quota limits
    const quotaLimits = {
      openai: { limit: 10000, unit: 'requests' },
      elevenlabs: { limit: 10000, unit: 'characters' },
      runwayml: { limit: 1000, unit: 'requests' }
    };
    
    const quota = quotaLimits[provider];
    if (!quota) return;
    
    // Find or create today's usage record
    let usage = await APIUsage.findOne({
      provider,
      date: today
    });
    
    if (!usage) {
      usage = new APIUsage({
        provider,
        requests: 0,
        characters: 0,
        errors: 0,
        quotaLimit: quota.limit,
        unit: quota.unit,
        date: today
      });
    }
    
    // Update usage
    usage.requests += requestCount;
    usage.characters += characterCount;
    if (hasError) usage.errors += 1;
    if (orderId) usage.orderId = orderId;
    usage.updatedAt = new Date();
    
    await usage.save();
    console.log(`✅ API Usage tracked: ${provider} - ${requestCount} requests, ${characterCount} characters`);
    
  } catch (error) {
    console.error('❌ Error tracking API usage:', error);
  }
};

export default { trackAPIUsage };