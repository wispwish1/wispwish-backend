import axios from 'axios';
import dotenv from 'dotenv';
import apiTracker from './apiTracker.js';
// import mongoose from 'mongoose';
import VoiceStyle from '../models/VoiceStyle.js';
import PDFDocument from 'pdfkit';

dotenv.config();
// SunoAPI.com API key

// Validate environment variables
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
  console.warn('âš ï¸ OPENAI_API_KEY is not configured - using dummy key for video generation only');
}
if (!process.env.SUNO_AI_API_KEY || process.env.SUNO_AI_API_KEY === 'your_suno_api_key_here') {
  console.warn('âš ï¸ SUNO_AI_API_KEY is not configured - song generation will not work');
}

// Helper: Extract Suno taskId from SunoAPI.com response
const extractSunoTaskId = (resp) => {
  try {
    if (!resp) return null;
    // SunoAPI.com response format: { "message": "success", "task_id": "468d0e42-f7a6-40ce-9a4c-37db56b13b99" }
    if (resp.task_id) return resp.task_id;
    if (resp.data?.task_id) return resp.data.task_id;
    // Legacy formats for backward compatibility
    if (resp.data?.taskId) return resp.data.taskId;
    if (resp.data?.[0]?.taskId) return resp.data[0].taskId;
    if (resp.taskId) return resp.taskId;
    if (resp.id) return resp.id;
  } catch (_) {}
  return null;
};

// Fetch Suno task status from SunoAPI.com
const fetchSunoTaskOnce = async (taskId) => {
  const headers = {
    'Authorization': `Bearer ${process.env.SUNO_AI_API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  try {
    const resp = await axios.get(`https://api.sunoapi.com/api/v1/suno/task/${taskId}`, { headers });
    const data = resp.data;
    
    console.log('Suno task response for', taskId, ':', JSON.stringify(data, null, 2));
    
    // SunoAPI.com response format: { "code": 200, "data": [...], "message": "success" }
    if (data.code === 200 && data.data && Array.isArray(data.data)) {
      // Find the first completed track
      const completedTrack = data.data.find(track => 
        (track.state === 'succeeded' || track.state === 'completed') && track.audio_url
      );
      if (completedTrack) {
        console.log('âœ… Found completed track:', completedTrack.clip_id);
        return {
          audio_url: completedTrack.audio_url,
          duration: completedTrack.duration,
          video_url: completedTrack.video_url,
          image_url: completedTrack.image_url,
          lyrics: completedTrack.lyrics
        };
      } 
      
      // IMPORTANT: Check if we have been polling for too long with the same "running" state
      // If tracks have audio_url but are still "running", they might be ready to use
      const runningTrackWithAudio = data.data.find(track => 
        track.state === 'running' && track.audio_url && track.created_at
      );
      
      if (runningTrackWithAudio) {
        const createdTime = new Date(runningTrackWithAudio.created_at);
        const now = new Date();
        const timeDiff = (now - createdTime) / 1000; // seconds
        
        // If the track has been "running" for more than 3 minutes, consider it ready
        if (timeDiff > 180) {
          console.log('âš ï¸ Track has been running for', Math.round(timeDiff), 'seconds, considering it ready');
          return {
            audio_url: runningTrackWithAudio.audio_url,
            duration: runningTrackWithAudio.duration,
            video_url: runningTrackWithAudio.video_url,
            image_url: runningTrackWithAudio.image_url,
            lyrics: runningTrackWithAudio.lyrics
          };
        }
      }
      
      // Check if any tracks are still processing
      const processingTrack = data.data.find(track => 
        track.state === 'processing' || track.state === 'queued' || track.state === 'running'
      );
      if (processingTrack) {
        console.log('â³ Track still processing:', processingTrack.state);
        return null; // Still processing
      }
      
      // Check for failed tracks
      const failedTracks = data.data.filter(track => 
        track.state === 'failed' || track.state === 'error'
      );
      if (failedTracks.length > 0) {
        console.error('âŒ Failed tracks:', failedTracks.map(t => ({ id: t.clip_id, state: t.state })));
        throw new Error(`Track generation failed: ${failedTracks[0].state}`);
      }
      
      // If no successful tracks and none processing, it failed
      console.error('âŒ All tracks in unknown state:', data.data.map(t => ({ id: t.clip_id, state: t.state })));
      throw new Error('All tracks failed to generate');
    }
    
    // Handle error responses
    if (data.code !== 200) {
      console.error('âŒ Suno API error response:', data);
      throw new Error(`Suno API error: ${data.message || data.msg || 'Unknown error'}`);
    }
    
    return null;
  } catch (err) {
    if (err.response?.status === 401) {
      console.error('âŒ Suno API authentication failed - check API key');
      throw new Error('Suno API authentication failed - invalid API key');
    }
    console.error('Suno task fetch error:', err.message);
    throw err;
  }
};

// Poll task status with exponential backoff (SunoAPI.com takes 15-25 seconds)
const pollTaskStatus = async (taskId, maxAttempts = 10, initialDelay = 25000) => {
  const startTime = Date.now();
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes maximum
  
  let delay = initialDelay;
  console.log(`â³ Waiting ${delay/1000}s before first poll...`);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check if we've exceeded maximum wait time
    if (Date.now() - startTime > maxWaitTime) {
      console.log('âš ï¸ Maximum wait time (5 minutes) exceeded, stopping polling');
      throw new Error(`Task polling timed out after 5 minutes for taskId: ${taskId}`);
    }
    
    console.log(`ðŸ”„ Polling attempt ${attempt}/${maxAttempts} for task ${taskId}`);
    try {
      const taskResult = await fetchSunoTaskOnce(taskId);
      if (taskResult) {
        console.log('âœ… Task completed successfully');
        return taskResult;
      }

      // Increase delay for next attempt (max 30s)
      delay = Math.min(delay * 1.2, 30000);
      console.log(`â³ Task still processing, waiting ${delay/1000}s before next poll...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`âŒ Polling error attempt ${attempt}:`, error.message);
      
      // If it's an auth error, don't retry
      if (error.message.includes('authentication')) {
        throw error;
      }
      
      if (attempt === maxAttempts) {
        throw new Error(`Task polling timed out for taskId: ${taskId} after ${maxAttempts} attempts`);
      }
      
      delay = Math.min(delay * 1.2, 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Task polling failed for taskId: ${taskId}`);
};

const normalizeTextList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
};

const slugifyFilename = (value, fallback = 'gift') => {
  const slug = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  return slug || fallback;
};

const POEM_LENGTH_OPTIONS = {
  short: {
    label: 'short',
    instruction: 'Keep it short: around 8 to 12 poem lines or 2 to 3 compact story paragraphs.',
    maxTokens: 350
  },
  medium: {
    label: 'medium',
    instruction: 'Use a medium length: around 16 to 24 poem lines or 4 to 6 story paragraphs.',
    maxTokens: 650
  },
  long: {
    label: 'long',
    instruction: 'Make it longer and more immersive: around 28 to 40 poem lines or 7 to 10 story paragraphs.',
    maxTokens: 950
  }
};

const TONE_STYLE_RULES = {
  romantic: 'Romantic -> soft, intimate, heartfelt.',
  funny: 'Funny/Playful -> light, warm, slightly witty, never cringe.',
  playful: 'Funny/Playful -> light, warm, slightly witty, never cringe.',
  joyful: 'Funny/Playful -> bright, affectionate, dynamic, and sincere.',
  heartfelt: 'Emotional -> deep, reflective, touching.',
  deep: 'Emotional -> deep, reflective, touching.',
  comforting: 'Comforting -> gentle, supportive, calm.',
  calm: 'Comforting -> gentle, supportive, calm.',
  inspirational: 'Inspirational -> grounded, warm, hopeful, and not overly polished.'
};

const VOICE_STYLE_OPTIONS = {
  'warm-gentle': {
    label: 'Warm & gentle',
    searchTerms: ['warm', 'gentle', 'soft'],
    settings: { stability: 0.48, similarity_boost: 0.82, style: 0.42, use_speaker_boost: true }
  },
  'romantic-soft': {
    label: 'Romantic & soft',
    searchTerms: ['romantic', 'soft', 'warm'],
    settings: { stability: 0.45, similarity_boost: 0.86, style: 0.55, use_speaker_boost: true }
  },
  'calm-deep': {
    label: 'Calm & deep',
    searchTerms: ['calm', 'deep', 'steady'],
    settings: { stability: 0.72, similarity_boost: 0.72, style: 0.22, use_speaker_boost: true }
  },
  'joyful-playful': {
    label: 'Joyful / playful',
    searchTerms: ['joyful', 'playful', 'bright'],
    settings: { stability: 0.34, similarity_boost: 0.78, style: 0.72, use_speaker_boost: true }
  }
};

const VOICE_TONE_SETTINGS = {
  funny: { stability: 0.28, similarity_boost: 0.76, style: 0.82, use_speaker_boost: true },
  playful: { stability: 0.30, similarity_boost: 0.76, style: 0.84, use_speaker_boost: true },
  joyful: { stability: 0.32, similarity_boost: 0.78, style: 0.78, use_speaker_boost: true },
  romantic: { stability: 0.42, similarity_boost: 0.86, style: 0.62, use_speaker_boost: true },
  heartfelt: { stability: 0.50, similarity_boost: 0.82, style: 0.48, use_speaker_boost: true },
  deep: { stability: 0.72, similarity_boost: 0.74, style: 0.28, use_speaker_boost: true },
  comforting: { stability: 0.70, similarity_boost: 0.78, style: 0.24, use_speaker_boost: true },
  calm: { stability: 0.72, similarity_boost: 0.76, style: 0.22, use_speaker_boost: true },
  inspirational: { stability: 0.58, similarity_boost: 0.80, style: 0.44, use_speaker_boost: true }
};

const VOICE_TONE_PROMPT_PROFILES = {
  romantic: {
    delivery: 'Soft, intimate, unhurried, and affectionate, like a private voice note.',
    wording: 'Use tender details, gentle emotional warmth, and close personal language without becoming dramatic.',
    must: 'The message should feel romantic from the first sentence through the ending.',
    temperature: 0.72
  },
  funny: {
    delivery: 'Light, amused, naturally witty, and conversational, like talking to a best friend.',
    wording: 'Use one affectionate tease or humorous contrast from the provided details. Keep it warm, never insulting.',
    must: 'The message must actually sound amused and lightly teasing, not plain or formal.',
    temperature: 0.84
  },
  playful: {
    delivery: 'Bright, energetic, spontaneous, and fun, like an excited voice note.',
    wording: 'Use bouncy sentence rhythm, lively wording, and small playful turns of phrase.',
    must: 'The message should feel upbeat and playful without becoming childish.',
    temperature: 0.84
  },
  joyful: {
    delivery: 'Bright, expressive, smiling, and warm, with natural excitement.',
    wording: 'Use lively phrasing, gratitude, and happy momentum without sounding fake.',
    must: 'The message should feel cheerful and celebratory throughout.',
    temperature: 0.80
  },
  heartfelt: {
    delivery: 'Sincere, personal, gently emotional, and grounded.',
    wording: 'Use direct emotional honesty and specific details without generic greeting-card lines.',
    must: 'The message should feel heartfelt and personal, not overly polished.',
    temperature: 0.74
  },
  deep: {
    delivery: 'Reflective, slower, meaningful, and genuine.',
    wording: 'Use thoughtful phrasing, emotional depth, and careful pacing.',
    must: 'The message should feel reflective and touching, not casual or jokey.',
    temperature: 0.68
  },
  comforting: {
    delivery: 'Gentle, calm, supportive, and steady, like a warm hug in words.',
    wording: 'Use reassuring language, softness, and emotional safety without making grand promises.',
    must: 'The message should feel calming and supportive from start to finish.',
    temperature: 0.66
  },
  calm: {
    delivery: 'Gentle, calm, supportive, and steady, like a warm hug in words.',
    wording: 'Use simple, grounded language with soft pacing and no sudden emotional jumps.',
    must: 'The message should feel calm and steady throughout.',
    temperature: 0.66
  },
  inspirational: {
    delivery: 'Grounded, hopeful, warm, and quietly uplifting.',
    wording: 'Use encouragement and hope without sounding like a motivational poster.',
    must: 'The message should feel encouraging but still personal and human.',
    temperature: 0.72
  }
};

const ELEVENLABS_DEFAULT_VOICES = {
  female: {
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    label: 'Rachel',
    gender: 'female'
  },
  male: {
    voiceId: 'pNInz6obpgDQGcFmaJgB',
    label: 'Adam',
    gender: 'male'
  }
};

const HANDWRITING_TEMPLATES = {
  'elegant-script': {
    label: 'Elegant Script',
    background: '#fff7fb',
    border: '#f0b8cc',
    accent: '#b24b70',
    text: '#3f2630',
    font: 'Times-Italic',
    fontSize: 18,
    lineGap: 7,
    decoration: '*'
  },
  'soft-minimal': {
    label: 'Soft Minimal',
    background: '#fffaf4',
    border: '#ead9c8',
    accent: '#8a6f5a',
    text: '#3b332d',
    font: 'Helvetica',
    fontSize: 15,
    lineGap: 8,
    decoration: '-'
  },
  'playful-handwritten': {
    label: 'Playful Handwritten',
    background: '#f7fbff',
    border: '#b9d7f2',
    accent: '#356c9d',
    text: '#263747',
    font: 'Courier-Oblique',
    fontSize: 15,
    lineGap: 7,
    decoration: '*'
  }
};

const getLengthOption = (length = 'medium') => (
  POEM_LENGTH_OPTIONS[length] || POEM_LENGTH_OPTIONS.medium
);

const getVoiceStyleOption = (voiceStyle = 'warm-gentle') => (
  VOICE_STYLE_OPTIONS[voiceStyle] || VOICE_STYLE_OPTIONS['warm-gentle']
);

const getVoiceToneSettings = (tone = 'heartfelt') => (
  VOICE_TONE_SETTINGS[tone] || VOICE_TONE_SETTINGS.heartfelt
);

const getVoiceTonePromptProfile = (tone = 'heartfelt') => (
  VOICE_TONE_PROMPT_PROFILES[tone] || VOICE_TONE_PROMPT_PROFILES.heartfelt
);

const getVoiceDeliverySettings = (voiceStyle, tone) => ({
  ...getVoiceStyleOption(voiceStyle).settings,
  ...getVoiceToneSettings(tone)
});

const getHandwritingTemplate = (handwritingStyle = 'soft-minimal') => (
  HANDWRITING_TEMPLATES[handwritingStyle] || HANDWRITING_TEMPLATES['soft-minimal']
);

const parseApiErrorPayload = (data) => {
  if (!data) return {};

  try {
    if (Buffer.isBuffer(data)) {
      return JSON.parse(data.toString('utf8'));
    }

    if (data instanceof ArrayBuffer) {
      return JSON.parse(Buffer.from(data).toString('utf8'));
    }

    if (typeof data === 'string') {
      return JSON.parse(data);
    }
  } catch (_) {
    return {};
  }

  return typeof data === 'object' ? data : {};
};

const createExternalApiError = (provider, error) => {
  const status = error.response?.status || 502;
  const payload = parseApiErrorPayload(error.response?.data);
  const apiError = payload.error || payload.detail || payload || {};
  const errorCode = apiError.code || apiError.status || apiError.type || error.code || 'external_api_error';
  const providerName = provider === 'openai' ? 'OpenAI' : provider === 'elevenlabs' ? 'ElevenLabs' : provider;

  let message = `${providerName} request failed. Please try again.`;
  if (provider === 'elevenlabs' && errorCode === 'detected_unusual_activity') {
    message = 'ElevenLabs blocked this request because it detected unusual activity on the account/API key. Check the ElevenLabs dashboard, billing, and API key, then try again.';
  } else if (status === 429) {
    message = `${providerName} rate limit or account quota was reached. Check the API key billing/quota, then try again.`;
  } else if (status === 401 || status === 403) {
    message = `${providerName} API key is invalid or does not have access. Check the environment key.`;
  } else if (apiError.message) {
    message = apiError.message;
  }

  const wrappedError = new Error(message);
  wrappedError.statusCode = status;
  wrappedError.provider = provider;
  wrappedError.externalCode = errorCode;
  wrappedError.isExternalApiError = true;
  wrappedError.safeDetails = {
    provider,
    status,
    code: errorCode,
    message,
    requestId: error.response?.headers?.['x-request-id'] || null
  };
  return wrappedError;
};

const callOpenAIChat = async ({ messages, maxTokens = 600, temperature = 0.72 }) => {
  try {
    const textResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages,
        max_tokens: maxTokens,
        temperature,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = textResponse.data.choices?.[0]?.message?.content?.trim() || '';
    await apiTracker.trackAPIUsage('openai', 1, content.length);
    return content;
  } catch (error) {
    const safeError = createExternalApiError('openai', error);
    console.error('OpenAI API error:', safeError.safeDetails);
    await apiTracker.trackAPIUsage('openai', 1, 0, null, true);
    throw safeError;
  }
};

const buildPremiumPoemInput = (gift, languageName) => {
  const memories = normalizeTextList(gift.memories);
  const personalityTraits = normalizeTextList(gift.personalityTraits);
  const lengthOption = getLengthOption(gift.length || gift.poemLength);
  const tone = gift.tone || 'heartfelt';

  return {
    systemPrompt: `You are an expert emotional gift writer who creates deeply personal, memorable poems and stories.

Your writing must feel human, warm, and specific - never generic or greeting-card-like.

Core rules:
- Use the recipient's name naturally at least 2-3 times throughout the writing
- Every personality trait provided MUST appear or be reflected in the writing
- Every memory or detail provided MUST be woven into the writing - do not skip any
- Match the tone precisely and keep it consistent from first line to last
- Use concrete, specific imagery - no vague phrases like "you mean the world to me"
- If writing a poem, maintain a consistent rhyme scheme (ABAB or AABB)
- Do NOT use cliches: "words cannot express", "heart of gold", "shining light", "cup overflows"
- Do NOT add a title, explanation, or intro - output only the poem or story
- Do NOT mention AI`,
    userPrompt: `Write a ${tone} ${gift.giftType || 'poem'} in ${languageName} using ALL of the details below.

RECIPIENT: ${gift.recipientName || 'Recipient'}
RELATIONSHIP: ${gift.relationship || 'friend'}
OCCASION: ${gift.occasion || 'special occasion'}
TONE: ${tone} - ${TONE_STYLE_RULES[tone] || TONE_STYLE_RULES.heartfelt}
LENGTH: ${lengthOption.label} - ${lengthOption.instruction}

PERSONALITY TRAITS (use ALL of these in the writing):
${personalityTraits.length ? personalityTraits.map(t => `- ${t}`).join('\n') : '- kind, thoughtful, memorable'}

MEMORIES & PERSONAL DETAILS (reference ALL of these specifically):
${memories.length ? memories.map(m => `- ${m}`).join('\n') : '- A meaningful shared moment'}

SENDER'S MESSAGE TO INCLUDE:
${gift.senderMessage || 'No custom message provided'}

MANDATORY RULES:
1. Use ${gift.recipientName || 'the recipient'}'s name at least 2-3 times - not just at the start or end
2. Every trait listed above must appear or be clearly felt in the writing
3. Every memory listed above must be specifically mentioned - do not drop any detail
4. Keep the tone (${tone}) consistent throughout - no sudden mood shifts
5. Zero cliches - every line must feel written specifically for THIS person
6. Output ONLY the final poem or story - no title, no intro, no explanation`,
    lengthOption
  };
};

const generatePremiumPoemText = async (gift, languageName) => {
  const { systemPrompt, userPrompt, lengthOption } = buildPremiumPoemInput(gift, languageName);

  const draft = await callOpenAIChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    maxTokens: lengthOption.maxTokens,
    temperature: 0.78
  });

  if (!draft) {
    throw new Error('OpenAI returned empty poem content');
  }

  try {
    const rewritten = await callOpenAIChat({
      messages: [
        {
          role: 'system',
          content: `You refine emotional writing to sound more natural and human.
You MUST preserve: recipient name, all memories, all personality traits, tone, language, and occasion.
Output only the final refined text - no title, no explanation.`
        },
        {
          role: 'user',
          content: `Refine this writing to sound more natural and personal.
Keep every specific detail, name, memory, and personality trait exactly as-is.
Only improve the flow and emotional impact - do not add generic lines or remove any specific references.

${draft}`
        }
      ],
      maxTokens: lengthOption.maxTokens,
      temperature: 0.60
    });

    return rewritten || draft;
  } catch (rewriteError) {
    console.warn('Premium poem rewrite failed, using first draft:', rewriteError.message);
    return draft;
  }
};

const resolveElevenLabsVoice = async ({ voiceStyleId, voiceStyle, voiceGender }) => {
  const styleOption = getVoiceStyleOption(voiceStyle);
  const requestedGender = String(voiceGender || '').toLowerCase();
  const normalizedGender = ['male', 'female'].includes(requestedGender) ? requestedGender : '';

  try {
    if (voiceStyleId) {
      const selectedVoice = await VoiceStyle.findById(voiceStyleId);
      if (selectedVoice?.voiceId) {
        const selectedGender = String(selectedVoice.gender || '').toLowerCase();
        const genderMatches =
          !normalizedGender ||
          !selectedGender ||
          selectedGender === 'unknown' ||
          selectedGender === normalizedGender;

        if (genderMatches) {
          return {
            voiceId: selectedVoice.voiceId,
            label: selectedVoice.name || styleOption.label,
            gender: selectedGender && selectedGender !== 'unknown' ? selectedGender : normalizedGender
          };
        }

        console.warn(`Selected voiceStyleId gender (${selectedGender}) does not match requested gender (${normalizedGender}); using gender-safe fallback.`);
      }
    }
  } catch (error) {
    console.warn('Could not resolve voiceStyleId, falling back to style search:', error.message);
  }

  try {
    let activeVoices = await VoiceStyle.find({
      isActive: true,
      ...(normalizedGender ? { gender: normalizedGender } : {})
    }).sort({ isDefault: -1, createdAt: -1 });

    if (!activeVoices.length && normalizedGender) {
      const genderDefault = ELEVENLABS_DEFAULT_VOICES[normalizedGender];
      if (genderDefault) {
        console.warn(`No active ${normalizedGender} voices found, using ElevenLabs ${genderDefault.label} fallback.`);
        return genderDefault;
      }
    }

    const matchedVoice = activeVoices.find(voice => {
      const haystack = `${voice.name || ''} ${voice.accent || ''}`.toLowerCase();
      return styleOption.searchTerms.some(term => haystack.includes(term));
    });
    const fallbackVoice = matchedVoice || activeVoices.find(voice => voice.isDefault) || activeVoices[0];

    if (fallbackVoice?.voiceId) {
      const fallbackGender = String(fallbackVoice.gender || '').toLowerCase();
      return {
        voiceId: fallbackVoice.voiceId,
        label: fallbackVoice.name || styleOption.label,
        gender: fallbackGender && fallbackGender !== 'unknown' ? fallbackGender : normalizedGender
      };
    }
  } catch (error) {
    console.warn('Failed to query voice styles, using hard-coded fallback voice:', error.message);
  }

  const finalDefault = ELEVENLABS_DEFAULT_VOICES[normalizedGender] || ELEVENLABS_DEFAULT_VOICES.female;
  return finalDefault;
};

const generateElevenLabsNarration = async ({ text, voiceStyle, voiceStyleId, voiceGender, tone }) => {
  const styleOption = getVoiceStyleOption(voiceStyle);
  const { voiceId, label, gender } = await resolveElevenLabsVoice({ voiceStyleId, voiceStyle, voiceGender });
  const deliverySettings = getVoiceDeliverySettings(voiceStyle, tone);

  try {
    const voiceResponse = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: deliverySettings,
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        responseType: 'arraybuffer',
        timeout: 45000,
      }
    );

    await apiTracker.trackAPIUsage('elevenlabs', 1, text.length);

    const base64 = Buffer.from(voiceResponse.data).toString('base64');
    return {
      script: text,
      audio: base64,
      audioUrl: `data:audio/mpeg;base64,${base64}`,
      voiceStyle: voiceStyle || 'warm-gentle',
      voiceStyleLabel: label,
      voiceGender: gender || voiceGender || '',
      tone: tone || 'heartfelt',
      settings: deliverySettings,
      duration: null
    };
  } catch (error) {
    const safeError = createExternalApiError('elevenlabs', error);
    console.error('ElevenLabs API error:', safeError.safeDetails);
    await apiTracker.trackAPIUsage('elevenlabs', 1, 0, null, true);
    throw safeError;
  }
};

const generateHandwrittenPdf = async ({
  text,
  recipientName,
  senderName,
  occasion,
  handwritingStyle
}) => new Promise((resolve, reject) => {
  const templates = {
    'elegant-script': {
      label: 'Elegant Script',
      pageBg: '#FDF2F8',
      pageBgMid: '#FAF5FF',
      pageBgEnd: '#EEF2FF',
      headerBg: '#FCE7F3',
      headerBgEnd: '#EDE9FE',
      borderOuter: '#EC4899',
      borderInner: '#C4B5FD',
      dotColor: '#A855F7',
      badgeBg: '#EC4899',
      badgeBgEnd: '#8B5CF6',
      badgeText: '#FFFFFF',
      salutation: '#831843',
      poemText: '#3B0764',
      divider: '#A855F7',
      signature: '#BE185D',
      footer: '#7C3AED'
    },
    'soft-minimal': {
      label: 'Soft Minimal',
      pageBg: '#FDF2F8',
      pageBgMid: '#F5F3FF',
      pageBgEnd: '#EEF2FF',
      headerBg: '#FCE7F3',
      headerBgEnd: '#EDE9FE',
      borderOuter: '#EC4899',
      borderInner: '#D8B4FE',
      dotColor: '#8B5CF6',
      badgeBg: '#EC4899',
      badgeBgEnd: '#8B5CF6',
      badgeText: '#FFFFFF',
      salutation: '#7E22CE',
      poemText: '#312E81',
      divider: '#8B5CF6',
      signature: '#DB2777',
      footer: '#7C3AED'
    },
    'playful-handwritten': {
      label: 'Playful Handwritten',
      pageBg: '#FDF2F8',
      pageBgMid: '#EEF2FF',
      pageBgEnd: '#DBEAFE',
      headerBg: '#EDE9FE',
      headerBgEnd: '#FCE7F3',
      borderOuter: '#6366F1',
      borderInner: '#F9A8D4',
      dotColor: '#EC4899',
      badgeBg: '#8B5CF6',
      badgeBgEnd: '#6366F1',
      badgeText: '#FFFFFF',
      salutation: '#4338CA',
      poemText: '#1E1B4B',
      divider: '#EC4899',
      signature: '#DB2777',
      footer: '#6366F1'
    }
  };

  const template = templates[handwritingStyle] || templates['soft-minimal'];
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: `WispWish Keepsake for ${recipientName || 'Recipient'}`,
      Author: 'WispWish'
    }
  });
  const chunks = [];
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const safeRecipient = recipientName || 'Friend';
  const safeSender = senderName || 'Someone special';
  const safeOccasion = occasion || 'Special Occasion';
  const occasionLabel = safeOccasion
    .replace(/-/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());

  const dotCount = 15;
  const dotSpacing = (pageWidth - 120) / (dotCount - 1);
  const middleDot = String.fromCharCode(183);

  const createGradient = (x1, y1, x2, y2, startColor, endColor, midColor) => {
    const gradient = doc.linearGradient(x1, y1, x2, y2);
    gradient.stop(0, startColor);
    if (midColor) {
      gradient.stop(0.55, midColor);
    }
    gradient.stop(1, endColor || startColor);
    return gradient;
  };

  const drawFrame = () => {
    const pageGradient = createGradient(
      0,
      0,
      pageWidth,
      pageHeight,
      template.pageBg,
      template.pageBgEnd,
      template.pageBgMid
    );
    doc.rect(0, 0, pageWidth, pageHeight).fill(pageGradient);

    doc.roundedRect(20, 20, pageWidth - 40, pageHeight - 40, 12)
      .lineWidth(2)
      .strokeColor(template.borderOuter)
      .stroke();

    doc.roundedRect(30, 30, pageWidth - 60, pageHeight - 60, 8)
      .lineWidth(0.8)
      .strokeColor(template.borderInner)
      .stroke();

    const headerGradient = createGradient(
      30,
      pageHeight - 115,
      pageWidth - 30,
      pageHeight - 30,
      template.headerBg,
      template.headerBgEnd
    );
    doc.rect(30, pageHeight - 115, pageWidth - 60, 85).fill(headerGradient);

    for (let i = 0; i < dotCount; i += 1) {
      const x = 60 + i * dotSpacing;
      const size = i % 3 === 1 ? 3 : 1.8;
      doc.circle(x, 58, size).fill(template.dotColor);
      doc.circle(x, pageHeight - 60, size).fill(template.dotColor);
    }

    doc.font('Helvetica')
      .fontSize(7.5)
      .fillColor(template.footer)
      .text(`Created with love on WispWish  ${middleDot}  wispwish.com`, 0, 40, {
        width: pageWidth,
        align: 'center'
      });

    doc.font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(template.signature)
      .text('W  I  S  P  W  I  S  H', 0, pageHeight - 50, {
        width: pageWidth,
        align: 'center'
      });

    const badgeWidth = 140;
    const badgeX = (pageWidth - badgeWidth) / 2;
    const badgeY = pageHeight - 90;
    const badgeGradient = createGradient(
      badgeX,
      badgeY,
      badgeX + badgeWidth,
      badgeY + 22,
      template.badgeBg,
      template.badgeBgEnd
    );
    doc.roundedRect(badgeX, badgeY, badgeWidth, 22, 8).fill(badgeGradient);
    doc.font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(template.badgeText)
      .text(occasionLabel, badgeX, badgeY + 7, {
        width: badgeWidth,
        align: 'center'
      });
  };

  const drawDivider = (y) => {
    doc.moveTo(55, y)
      .lineTo(pageWidth - 55, y)
      .lineWidth(1)
      .strokeColor(template.divider)
      .stroke();

    doc.save();
    doc.translate(pageWidth / 2, y).rotate(45);
    doc.rect(-4, -4, 8, 8).fill(template.dotColor);
    doc.restore();
  };

  doc.on('data', chunk => chunks.push(chunk));
  doc.on('error', reject);
  doc.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const fileName = `wispwish-${slugifyFilename(recipientName)}-${slugifyFilename(occasion, 'occasion')}.pdf`;
    resolve({
      fileName,
      contentType: 'application/pdf',
      base64: buffer.toString('base64'),
      dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`,
      template: handwritingStyle || 'soft-minimal',
      templateName: template.label
    });
  });

  drawFrame();
  drawDivider(105);

  doc.font('Helvetica-BoldOblique')
    .fontSize(15)
    .fillColor(template.salutation)
    .text(`Dear ${safeRecipient},`, 0, 124, {
      width: pageWidth,
      align: 'center'
    });

  const contentX = 65;
  const contentWidth = pageWidth - 130;
  const lines = String(text || '').split(/\r?\n/);
  const poemFontSize = lines.length > 24 ? 9.4 : 10.5;
  const lineGap = lines.length > 24 ? 4 : 6;
  const stanzaGap = lines.length > 24 ? 6 : 9;
  let y = 162;
  const bottomLimit = pageHeight - 175;

  doc.font('Helvetica-Oblique')
    .fontSize(poemFontSize)
    .fillColor(template.poemText);

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) {
      y += stanzaGap;
      continue;
    }

    const lineHeight = doc.heightOfString(cleanLine, {
      width: contentWidth,
      align: 'center',
      lineGap
    });

    if (y + lineHeight > bottomLimit) {
      break;
    }

    doc.text(cleanLine, contentX, y, {
      width: contentWidth,
      align: 'center',
      lineGap
    });
    y += lineHeight + 3;
  }

  const dividerY = Math.min(y + 18, pageHeight - 145);
  drawDivider(dividerY);

  doc.font('Helvetica-BoldOblique')
    .fontSize(11)
    .fillColor(template.signature)
    .text(`With love, ${safeSender}  ${String.fromCharCode(9829)}`, 0, dividerY + 16, {
      width: pageWidth,
      align: 'center'
    });

  doc.end();
});

const generatePremiumPoemBundle = async (gift, languageName) => {
  const finalText = await generatePremiumPoemText(gift, languageName);
  const result = {
    type: 'poem',
    text: finalText,
    poem: { text: finalText },
    isPremiumPoem: true,
    length: gift.length || gift.poemLength || 'medium',
    handwritingStyle: gift.handwritingStyle || 'soft-minimal'
  };

  try {
    result.handwrittenPdf = await generateHandwrittenPdf({
      text: finalText,
      recipientName: gift.recipientName,
      senderName: gift.senderName,
      occasion: gift.occasion,
      handwritingStyle: gift.handwritingStyle || 'soft-minimal'
    });
    result.pdfUrl = result.handwrittenPdf.dataUrl;
  } catch (pdfError) {
    console.error('Premium poem PDF generation failed:', pdfError.message);
    result.pdfError = 'Handwritten PDF generation failed. Text is still available.';
  }

  return result;
};

// Generate song using OpenAI for lyrics and Suno API for audio (fallback to ElevenLabs)
const generateSong = async (gift) => {
  console.log('ðŸŽµ Starting song generation for:', gift);
  const { recipientName, tone, memories = [], genre = 'pop', occasion = 'special occasion', language = 'en' } = gift;

  // Map language codes to full names for OpenAI
  const languageMap = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'hi': 'Hindi',
    'ar': 'Arabic',
    'ru': 'Russian'
  };
  
  const languageName = languageMap[language] || 'English';

  const memoriesString = memories.length > 0 ? memories.join(', ') : 'a special moment';
  const prompt = `Write lyrics in ${languageName} for a ${tone} ${genre} song dedicated to ${recipientName} for a ${occasion}. Base it on these memories: ${memoriesString}. Make it suitable for a 30-60 second performance with a catchy chorus and one verse.`;

  let lyrics = 'No lyrics generated';

  try {
    // Step 1: Generate lyrics using OpenAI
    console.log('ðŸ¤– Generating lyrics with OpenAI...');
    const lyricsResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    lyrics = lyricsResponse.data.choices?.[0]?.message?.content || 'No lyrics generated';
    console.log('âœ… Lyrics generated successfully:', lyrics.substring(0, 100) + '...');
    await apiTracker.trackAPIUsage('openai', 1, lyrics.length);

    // Step 2: Try Suno API for audio generation
    console.log('ðŸŽµ Attempting Suno AI audio generation...');
    try {
      const title = `${recipientName}'s ${occasion} Song`.slice(0, 80);
      
      // Check if API key is properly formatted
      if (!process.env.SUNO_AI_API_KEY || process.env.SUNO_AI_API_KEY.length < 10) {
        throw new Error('Invalid Suno AI API key configuration');
      }
      
      console.log('ðŸ”‘ Using Suno API key:', process.env.SUNO_AI_API_KEY.substring(0, 8) + '...');
      
      const musicResponse = await axios.post(
        'https://api.sunoapi.com/api/v1/suno/create',  // Correct SunoAPI.com endpoint
        {
          custom_mode: true,
          prompt: lyrics,
          title,
          tags: genre,
          make_instrumental: false,
          mv: 'chirp-v3-5'  // Use latest model
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.SUNO_AI_API_KEY}`,  // Correct Bearer format
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
        }
      );

      // Extract task ID from SunoAPI.com response
      const taskId = extractSunoTaskId(musicResponse.data);
      if (!taskId) {
        console.error('âŒ No task ID in Suno response:', JSON.stringify(musicResponse.data, null, 2));
        throw new Error('No task ID from Suno API - response: ' + JSON.stringify(musicResponse.data));
      }

      console.log(`â³ Polling Suno task: ${taskId}`);
      const audioData = await pollTaskStatus(taskId);
      
      if (!audioData?.audio_url) {
        console.error('âŒ No audio URL in task response:', audioData);
        throw new Error('No audio URL from Suno task');
      }

      console.log('ðŸ“¥ Downloading audio from Suno...');
      const audioResponse = await axios.get(audioData.audio_url, { 
        responseType: 'arraybuffer',
        timeout: 60000
      });
      
      const base64 = Buffer.from(audioResponse.data).toString('base64');
      console.log('âœ… Suno audio generation completed successfully');
      
      await apiTracker.trackAPIUsage('suno', 1, lyrics.length);
      
      return {
        text: lyrics,
        lyrics: lyrics,  // Add lyrics field for frontend compatibility
        audio: base64,
        audioUrl: `data:audio/mpeg;base64,${base64}`,
        taskId,
        duration: audioData.duration || null,
        success: true
      };
      
    } catch (sunoError) {
      console.warn('âš ï¸ Suno AI failed, falling back to ElevenLabs:', sunoError.message);
      
      // Fallback: ElevenLabs TTS for lyrics
      try {
        console.log('ðŸŽ¤ Attempting ElevenLabs TTS fallback...');
        let voiceIdToUse = 'wyWA56cQNU2KqUW4eCsI';
        const activeVoice = await VoiceStyle.findOne({ isActive: true });
        if (activeVoice) voiceIdToUse = activeVoice.voiceId;

        const voiceResponse = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceIdToUse}`,
          {
            text: lyrics,
            voice_settings: { stability: 0.5, similarity_boost: 0.5 },
          },
          {
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': process.env.ELEVENLABS_API_KEY,
            },
            responseType: 'arraybuffer',
            timeout: 30000,
          }
        );
        
        const base64 = Buffer.from(voiceResponse.data).toString('base64');
        console.log('âœ… ElevenLabs TTS fallback completed');
        
        await apiTracker.trackAPIUsage('elevenlabs', 1, lyrics.length);
        
        return { 
          text: lyrics,
          lyrics: lyrics,
          audio: base64, 
          audioUrl: `data:audio/mpeg;base64,${base64}`,
          warning: 'Generated using text-to-speech instead of music. Lyrics provided.',
          isFallback: true,
          success: true
        };
        
      } catch (fallbackError) {
        console.error('âŒ ElevenLabs fallback also failed:', fallbackError.message);
        await apiTracker.trackAPIUsage('elevenlabs', 1, 0, null, true);
        
        return { 
          text: lyrics,
          lyrics: lyrics,
          audio: null, 
          audioUrl: null,
          warning: 'Audio generation failed. Lyrics only provided.',
          error: 'Both Suno AI and ElevenLabs failed to generate audio',
          success: false
        };
      }
    }
    
  } catch (openaiError) {
    console.error('âŒ OpenAI lyrics generation failed:', openaiError.message);
    await apiTracker.trackAPIUsage('openai', 1, 0, null, true);
    
    throw new Error(`Failed to generate song lyrics: ${openaiError.message}`);
  }
};

/* Comment out the Suno AI polling function as it's no longer needed
const pollTaskStatus = async (taskId, maxAttempts = 20, initialDelay = 5000) => {
};
*/

// Handle text-based and voice gifts
const generateContent = async (gift) => {
  const {
    giftType,
    recipientName,
    tone,
    memories = [],
    occasion = 'special occasion',
    language = 'en',
    relationship = '',
    senderMessage = '',
    personalityTraits = [],
    handwritingStyle = 'soft-minimal',
    voiceStyle = 'warm-gentle',
    length = 'medium',
    poemLength = '',
    senderName = 'Someone special',
    includePremiumBundle = true,
    regenerateOptions = [],
    isRegenerate = false,
    voiceStyleId,
    voiceGender = ''
  } = gift;

  // Map language codes to full names for OpenAI
  const languageMap = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'hi': 'Hindi',
    'ar': 'Arabic',
    'ru': 'Russian'
  };
  
  const languageName = languageMap[language] || 'English';

  let prompt = '';
  let textContent = '';

  switch (giftType) {
    case 'poem':
      if (!includePremiumBundle) {
        prompt = `Write a ${tone} poem in ${languageName} for ${recipientName} for a ${occasion} based on these memories: ${memories.join(', ')}.`;
        break;
      }
      return generatePremiumPoemBundle({
        ...gift,
        recipientName,
        tone,
        memories,
        occasion,
        relationship,
        senderMessage,
        personalityTraits,
        handwritingStyle,
        voiceStyle,
        length: length || poemLength || 'medium',
        poemLength: poemLength || length || 'medium',
        senderName,
        voiceStyleId
      }, languageName);
    case 'letter':
      prompt = `Write a heartfelt letter in ${languageName} to ${recipientName} in a ${tone} tone for a ${occasion}. Include these moments: ${memories.join(', ')}.`;
      break;
    case 'shortStory':
      prompt = `Create a short story in ${languageName} inspired by ${recipientName} with the theme: ${tone}, for a ${occasion}, and these memories: ${memories.join(', ')}.`;
      break;
    case 'wishknot':
      console.log('ðŸª¢ Generating WishKnot...');
      try {
        const wishknotResult = await generateWishknot({
          recipientName: gift.recipientName,
          tone: gift.tone || 'heartfelt',
          occasion: gift.occasion || 'special occasion',
          memories: gift.memories || [],
          senderMessage: gift.senderMessage || '',
          relationship: gift.relationship || 'friend',
          language: language // Pass language code to WishKnot
        });
        console.log('âœ… WishKnot generated successfully');
        return wishknotResult;
      } catch (wishknotError) {
        console.error('âŒ WishKnot generation failed:', wishknotError.message);
        // Return fallback WishKnot
        return {
          message: `A symbolic WishKnot for ${gift.recipientName} â€” a loop of care and intention for this ${gift.occasion || 'special occasion'}.`,
          animationUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
            <svg width="400" height="300" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
              <rect width="100%" height="100%" rx="20" fill="#fff0f6"/>
              <g transform="translate(200,150)">
                <path d="M-80 0 C -40 -40, 40 -40, 80 0 C 40 40, -40 40, -80 0 Z" 
                      fill="none" stroke="#ec4899" stroke-width="10" stroke-linecap="round"/>
              </g>
              <text x="50%" y="270" text-anchor="middle" fill="#6b7280" 
                    font-family="Inter, Arial" font-size="14">A knot to hold a wish</text>
            </svg>
          `),
          state: 'tied',
          error: 'Generated using fallback due to processing error'
        };
      }
      break;
    case 'voice':
      {
        const voiceLengthMap = {
          short: { instruction: 'Keep it under 40 words. Very brief and warm.', maxTokens: 100 },
          medium: { instruction: 'Keep it between 60 to 90 words. Natural and personal.', maxTokens: 180 },
          long: { instruction: 'Keep it between 100 to 130 words. Rich and heartfelt.', maxTokens: 250 }
        };
        const voiceLength = voiceLengthMap[length] || voiceLengthMap.medium;
        const voiceToneProfile = getVoiceTonePromptProfile(tone);
        const voiceTraits = normalizeTextList(personalityTraits);
        const voiceMemories = normalizeTextList(memories);

        const systemPromptVoice = `You are writing a personal voice message that will be read aloud.

Your job is to write something that sounds completely natural when spoken - not read.

Rules:
- Write as if the sender is speaking directly to the recipient
- Use the recipient's name naturally 1-2 times - not robotically
- Every personality trait provided MUST subtly appear in how you describe the person
- Every memory provided MUST be specifically mentioned - do not drop any detail
- Make the selected tone obvious in the wording, sentence rhythm, and emotional energy
- Match the selected tone precisely and keep it consistent throughout
- Do not flatten the message into a generic heartfelt style when another tone is selected
- NO stage directions, NO brackets, NO labels, NO placeholders like [pause] or [Name]
- NO generic lines like "you mean the world to me" or "words cannot express"
- Output ONLY the spoken message - nothing else`;

        const userPromptVoice = `Write a ${tone} voice message in ${languageName}.

SENDER: ${senderName || 'Someone special'}
RECIPIENT: ${recipientName || 'Friend'}
RELATIONSHIP: ${relationship || 'friend'}
OCCASION: ${occasion || 'special occasion'}
SELECTED TONE: ${tone}
TONE DELIVERY: ${voiceToneProfile.delivery}
TONE WORDING: ${voiceToneProfile.wording}
LENGTH: ${voiceLength.instruction}

PERSONALITY TRAITS (weave ALL of these naturally into the message):
${voiceTraits.length ? voiceTraits.map(trait => `- ${trait}`).join('\n') : '- kind, thoughtful, memorable'}

MEMORIES & PERSONAL DETAILS (mention ALL of these specifically):
${voiceMemories.length ? voiceMemories.map(memory => `- ${memory}`).join('\n') : '- A meaningful shared moment'}

SENDER'S PERSONAL MESSAGE:
${senderMessage || 'No custom message provided'}

MANDATORY RULES:
1. Start naturally, like beginning a real voice note, NOT with "Hey" or "Dear"
2. Use ${recipientName || 'the recipient'}'s name once or twice, naturally mid-sentence
3. All traits must be reflected, not listed, but felt in the writing
4. All memories must appear specifically, no vague references
5. Make the ${tone} tone clear through wording, rhythm, and emotional energy
6. ${voiceToneProfile.must}
7. End warmly but not with a cliche
8. ${voiceLength.instruction}`;

        textContent = await callOpenAIChat({
          messages: [
            { role: 'system', content: systemPromptVoice },
            { role: 'user', content: userPromptVoice }
          ],
          maxTokens: voiceLength.maxTokens,
          temperature: voiceToneProfile.temperature
        });
        prompt = null;
      }
      break;
    case 'illustration':
      prompt = `Write a ${tone} descriptive text in ${languageName} for an artistic illustration dedicated to ${recipientName} for a ${occasion}, inspired by these memories: ${memories.join(', ')}. Include visual elements and emotional themes.`;
      break;
    case 'video':
      prompt = `Write a ${tone} script in ${languageName} for a short video tribute to ${recipientName} for a ${occasion}, based on these memories: ${memories.join(', ')}. Include narration text and visual descriptions suitable for a 1-2 minute video.`;
      break;
    default:
      prompt = `Write a thoughtful message in ${languageName} for ${recipientName} for a ${occasion}.`;
      break;
  }

  try {
    if (prompt) {
      // Single OpenAI call
      const textResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: prompt,
          }],
          max_tokens: giftType === 'voice' ? 150 : 500,
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      textContent = textResponse.data.choices?.[0]?.message?.content || 'No response';
      console.log('ChatGPT generated text:', textContent);
      
      // Track OpenAI usage
      await apiTracker.trackAPIUsage('openai', 1, textContent.length);
    }

    if (giftType === 'voice') {
        if (!String(textContent || '').trim()) {
          throw new Error('OpenAI returned empty voice message content');
        }

        const narration = await generateElevenLabsNarration({
          text: textContent,
          voiceStyle,
          voiceStyleId,
          voiceGender,
          tone
        });

        console.log('ElevenLabs response received');

        return {
          text: textContent,
          audio: narration.audio,
          audioUrl: narration.audioUrl,
          voiceStyle: narration.voiceStyle,
          voiceStyleLabel: narration.voiceStyleLabel,
          voiceGender: narration.voiceGender,
          tone: narration.tone,
          settings: narration.settings
        };
      }

      // For illustration type, also generate images
      if (giftType === 'illustration') {
        try {
          
          const images = await generateImages(gift);
          return {
            text: textContent,
            images: images,
            type: 'illustration'
          };
        } catch (imageError) {
          console.warn('Image generation failed for illustration, returning text only:', imageError.message);
          return {
            text: textContent,
            images: [],
            type: 'illustration',
            warning: 'Image generation failed, text content provided.'
          };
        }
      }

      // For video type, provide structured content
      if (giftType === 'video') {
        try {
          console.log('ðŸŽ¬ Generating video for:', { recipientName, tone, memories, occasion });
          // Use only RunwayML for video generation
          const { videoUrl } = await generateVideo({ promptText: textContent, recipientName, tone, memories, occasion });
          console.log('ðŸŽ¬ Video generated successfully:', videoUrl);
          return {
            text: textContent,
            type: 'video',
            script: textContent,
            description: `Video tribute content for ${recipientName}`,
            videoUrl
          };
        } catch (videoError) {
          console.error('ðŸŽ¬ Video generation failed:', videoError.message);
          return {
            text: textContent,
            type: 'video',
            script: textContent,
            description: `Video tribute content for ${recipientName}`,
            error: `Video generation failed: ${videoError.message}. Please check your RunwayML API configuration.`
          };
        }
      }

      return textContent;
    } catch (error) {
      if (error.isExternalApiError) {
        throw error;
      }

      console.error(`${giftType === 'voice' ? 'ElevenLabs/ChatGPT' : 'ChatGPT'} API error:`, error.response?.data || error.message);
      
      // Track error properly
      if (giftType === 'voice' && error.message.includes('elevenlabs')) {
        await apiTracker.trackAPIUsage('elevenlabs', 1, 0, null, true);
      } else {
        await apiTracker.trackAPIUsage('openai', 1, 0, null, true);
      }
      
      throw new Error('Failed to generate content. Please try again.');
    }
};

// const generateVideo = async ({
//   promptText,
//   recipientName,
//   tone = "heartfelt",
//   memories = [],
//   occasion = "special occasion"
// }) => {
//   console.log("ðŸŽ¬ Starting video generation with AIMLAPI (Kling 2.5 Turbo)...");

//   if (!process.env.AIML_API_KEY) {
//     throw new Error("AIMLAPI key not configured. Please set AIML_API_KEY in environment variables.");
//   }

//   const sanitize = (s) =>
//     (s || "")
//       .replace(/\*\*|__|\*|#/g, "")
//       .replace(/\[(.*?)\]|\((.*?)\)/g, "$1")
//       .replace(/\s+/g, " ")
//       .trim();

//   const videoPrompt =
//     promptText && promptText.trim().length > 0
//       ? sanitize(promptText)
//       : sanitize(
//           `A ${tone} cinematic tribute video for ${recipientName}'s ${occasion}, warm lighting, emotional tone, and realistic motion.`
//         );

//   const body = {
//     model: "kling-2.5-turbo",
//     prompt: videoPrompt,
//     aspect_ratio: "16:9",
//     duration: 8
//   };

//   console.log("ðŸŽ¬ Request body:", body);

//   try {
//     // âœ… Correct AIMLAPI endpoint for video generation
//     const response = await axios.post(
//       "https://api.aimlapi.com/v1/videos/generations",
//       body,
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.AIML_API_KEY}`,
//           "Content-Type": "application/json"
//         },
//         timeout: 120000
//       }
//     );

//     console.log("ðŸŽ¬ Response:", response.data);

//     const videoUrl = response.data?.data?.[0]?.url || response.data?.output?.video_url;

//     if (!videoUrl) {
//       throw new Error("Video URL not found in response.");
//     }

//     console.log("ðŸŽ¬ âœ… Video generated successfully:", videoUrl);
//     return { videoUrl };

//   } catch (error) {
//     console.error("ðŸŽ¬ Video generation error:", error.response?.data || error.message);
//     throw new Error(`Video generation failed: ${error.message}`);
//   }
// };

// Generate WishKnot animated SVG and message


const generateVideo = async ({
  promptText,
  recipientName,
  tone = "heartfelt",
  memories = [],
  occasion = "special occasion"
}) => {
  console.log("ðŸŽ¬ Starting video generation with RunwayML (veo3)...");
  console.log("ðŸŽ¬ API Key available:", !!process.env.RUNWAY_API_KEY);

  // Validate API key
  if (
    !process.env.RUNWAY_API_KEY ||
    process.env.RUNWAY_API_KEY === "your_runway_api_key_here"
  ) {
    throw new Error(
      "RunwayML API key not configured. Please check your environment variables."
    );
  }

  // Sanitize prompt
  const sanitize = (s) =>
    (s || "")
      .replace(/\*\*|__|\*|#/g, "")
      .replace(/\[(.*?)\]|\((.*?)\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

  const videoPrompt =
    promptText && promptText.trim().length > 0
      ? sanitize(promptText)
      : sanitize(
          `A ${tone} cinematic tribute video for ${recipientName}'s ${occasion}, with warm lighting, emotional atmosphere, soft bokeh, natural motion.`
        );

  console.log("ðŸŽ¬ Video prompt:", videoPrompt);

  // function shortenPrompt(prompt) {
  //   if (prompt.length <= 1000) return prompt;
  //   const summary = prompt
  //     .split(".")
  //     .slice(0, 6)
  //     .join(".") + "...";
  //   return summary.slice(0, 995);
  // }

  const body = {
    // promptText: shortenPrompt(videoPrompt), // correct field name
    promptText: videoPrompt, // correct field name
    model: "veo3",
    ratio: "1280:720",    // landscape mode, must be either "1280:720" or "720:1280"
    duration: 8,           // veo3 requires exactly 8 seconds
    seed: Math.floor(Math.random() * 4294967295),
    watermark: false,
    motion: 1
  };

  console.log("ðŸŽ¬ Request body:", body);

  try {
    // Create task
    const response = await axios.post(
      "https://api.dev.runwayml.com/v1/text_to_video",
      body,
      {
        headers: {
          Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
          "Content-Type": "application/json",
          "X-Runway-Version": "2024-11-06"
        },
        timeout: 30000
      }
    );

    const taskId = response.data?.id;
    if (!taskId) throw new Error("Failed to create RunwayML task.");

    console.log("ðŸŽ¬ Task created:", taskId);

    // Polling
    let videoUrl = null;
    const maxAttempts = 30;
    let attempt = 0;
    let delay = 5000;

    while (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;

      const poll = await axios.get(
        `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
            "X-Runway-Version": "2024-11-06"
          },
          timeout: 15000
        }
      );

      const status = poll.data?.status;
      console.log(`ðŸŽ¬ [${attempt}] Status:`, status);

      if (status === "SUCCEEDED") {
        videoUrl = poll.data?.output?.[0];
        console.log("ðŸŽ¬ âœ… Video ready:", videoUrl);
        break;
      }
      if (status === "FAILED") {
        const errMsg = poll.data?.error || "RunwayML failed unexpectedly.";
        throw new Error(errMsg);
      }

      delay = Math.min(delay * 1.2, 15000);
    }

    if (!videoUrl) {
      throw new Error("Video generation timed out. Please try later.");
    }

    return { videoUrl };
  } catch (error) {
    console.error("ðŸŽ¬ Video generation error:", error.response?.data || error.message);

    if (error.response?.status === 400) {
      throw new Error(`Invalid request: ${JSON.stringify(error.response.data)}`);
    }
    if (error.response?.status === 401) {
      throw new Error("Invalid API key or unauthorized request.");
    }
    if (error.response?.status === 403) {
      throw new Error("Access denied. Check your plan or permissions.");
    }
    if (error.response?.status === 429) {
      throw new Error("Rate limit exceeded. Try again later.");
    }
    if (error.response?.status === 500) {
      throw new Error("RunwayML internal error â€” retry.");
    }

    throw new Error(`Video generation failed: ${error.message}`);
  }
};


const generateWishknot = async ({ recipientName, tone = '', occasion = 'special occasion', memories = [], senderMessage = '', relationship = '', language = 'en' }) => {
  try {
    // Map language codes to full names for OpenAI
    const languageMap = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'hi': 'Hindi',
      'ar': 'Arabic',
      'ru': 'Russian'
    };
    
    const languageName = languageMap[language] || 'English';
    
    // Generate personalized message using OpenAI
    const personalizedPrompt = `Create a deeply personal and symbolic WishKnot message for ${recipientName} in ${languageName}.
    
    Context:
    - Occasion: ${occasion}
    - Tone: ${tone}
    - Relationship: ${relationship}
    - Specific Memories/Inspiration: ${memories.length > 0 ? memories.join(', ') : 'your special bond'}
    - Additional personal message: ${senderMessage}
    
    Create a warm, personal message that:
    1. References the specific memories mentioned: ${memories.length > 0 ? memories.join(', ') : 'your special connection'}
    2. Captures the ${tone} emotion for this ${occasion}
    3. Reflects the ${relationship} relationship you share
    4. Incorporates elements from: "${senderMessage}"
    5. Uses the metaphor of tying a knot with care and intention
    6. Keep it 2-3 heartfelt sentences
    
    Write ONLY the personal message, no quotes or extra formatting.
    Make it feel like it truly comes from someone who knows ${recipientName} well.`;
    
    console.log('ðŸª¢ Generating personalized WishKnot message...');
    
    const messageResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: personalizedPrompt }],
        temperature: 0.8,
        max_tokens: 200,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const personalizedMessage = messageResponse.data.choices?.[0]?.message?.content?.trim() || 
      `A symbolic WishKnot for ${recipientName} â€” a loop of care, connection, and intention for this ${occasion}. Each twist holds our shared memories and the bond between us.`;
    
    console.log('âœ… Personalized WishKnot message generated');
    await apiTracker.trackAPIUsage('openai', 1, personalizedMessage.length);
    
    // Create sophisticated animated SVG based on tone and relationship
    const knotAnimations = getKnotAnimationStyle(tone, relationship);
    
    const svg = encodeURIComponent(`
      <svg width="400" height="300" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Gradient based on tone -->
          <linearGradient id="knotGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${knotAnimations.primaryColor}">
              <animate attributeName="stop-color" values="${knotAnimations.primaryColor};${knotAnimations.secondaryColor};${knotAnimations.primaryColor}" dur="6s" repeatCount="indefinite"/>
            </stop>
            <stop offset="100%" stop-color="${knotAnimations.secondaryColor}">
              <animate attributeName="stop-color" values="${knotAnimations.secondaryColor};${knotAnimations.accentColor};${knotAnimations.secondaryColor}" dur="8s" repeatCount="indefinite"/>
            </stop>
          </linearGradient>
          
          <!-- Glow effect -->
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          <!-- Sparkle effect -->
          <circle id="sparkle" r="2" fill="${knotAnimations.accentColor}" opacity="0">
            <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/>
            <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite"/>
          </circle>
        </defs>
        
        <!-- Background with subtle pattern -->
        <rect width="100%" height="100%" rx="20" fill="${knotAnimations.backgroundColor}"/>
        
        <!-- Main knot group -->
        <g transform="translate(200,150)">
          <!-- Complex knot path that represents "tied" state -->
          <path id="mainKnot" d="${knotAnimations.knotPath}" 
                fill="none" 
                stroke="url(#knotGradient)" 
                stroke-width="12" 
                stroke-linecap="round" 
                stroke-linejoin="round"
                filter="url(#glow)">
            <animate attributeName="stroke-width" values="12;15;12" dur="4s" repeatCount="indefinite"/>
          </path>
          
          <!-- Animated particle traveling along knot -->
          <circle r="4" fill="${knotAnimations.accentColor}" opacity="0.8">
            <animateMotion dur="${knotAnimations.animationSpeed}s" repeatCount="indefinite" path="${knotAnimations.knotPath}"/>
            <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite"/>
          </circle>
          
          <!-- Additional sparkles around knot -->
          <use href="#sparkle" transform="translate(-60,-30)">
            <animateTransform attributeName="transform" type="translate" values="-60,-30;-50,-20;-60,-30" dur="3s" repeatCount="indefinite"/>
          </use>
          <use href="#sparkle" transform="translate(60,30)">
            <animateTransform attributeName="transform" type="translate" values="60,30;50,20;60,30" dur="4s" repeatCount="indefinite"/>
          </use>
          <use href="#sparkle" transform="translate(-30,50)">
            <animateTransform attributeName="transform" type="translate" values="-30,50;-20,40;-30,50" dur="5s" repeatCount="indefinite"/>
          </use>
        </g>
        
        <!-- Title text -->
        <text x="50%" y="40" text-anchor="middle" fill="${knotAnimations.textColor}" 
              font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="600">
          WishKnot for ${recipientName}
        </text>
        
        <!-- Subtitle -->
        <text x="50%" y="65" text-anchor="middle" fill="${knotAnimations.subtextColor}" 
              font-family="Inter, system-ui, sans-serif" font-size="14">
          ${knotAnimations.subtitle}
        </text>
        
        <!-- Bottom instruction -->
        <text x="50%" y="270" text-anchor="middle" fill="${knotAnimations.subtextColor}" 
              font-family="Inter, system-ui, sans-serif" font-size="12" opacity="0.7">
          This knot holds a special message tied with ${tone} intention
        </text>
      </svg>
    `);
    
    const animationUrl = `data:image/svg+xml;utf8,${svg}`;
    
    // Create untying animation (for when recipient opens it)
    const untieAnimation = createUntieAnimation(knotAnimations);
    
    console.log('âœ… WishKnot generated successfully with personalized animation');
    
    return {
      message: personalizedMessage,
      animationUrl,
      untieAnimationUrl: untieAnimation,
      knotType: knotAnimations.type,
      symbolism: knotAnimations.symbolism,
      state: 'tied', // Initial state
      metadata: {
        tone,
        relationship,
        occasion,
        colors: {
          primary: knotAnimations.primaryColor,
          secondary: knotAnimations.secondaryColor,
          accent: knotAnimations.accentColor
        }
      }
    };
    
  } catch (error) {
    console.error('âŒ Error generating WishKnot:', error.message);
    await apiTracker.trackAPIUsage('openai', 1, 0, null, true);
    
    // Fallback to simple knot
    const fallbackMessage = `A symbolic WishKnot for ${recipientName} â€” a loop of care, connection, and intention for this ${occasion}.`;
    const fallbackSvg = encodeURIComponent(`
      <svg width="400" height="300" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="20" fill="#fff0f6"/>
        <g transform="translate(200,150)">
          <path d="M-80 0 C -40 -40, 40 -40, 80 0 C 40 40, -40 40, -80 0 Z" 
                fill="none" stroke="#ec4899" stroke-width="10" stroke-linecap="round"/>
        </g>
        <text x="50%" y="270" text-anchor="middle" fill="#6b7280" 
              font-family="Inter, Arial" font-size="14">A knot to hold a wish</text>
      </svg>
    `);
    
    return {
      message: fallbackMessage,
      animationUrl: `data:image/svg+xml;utf8,${fallbackSvg}`,
      state: 'tied',
      warning: 'Generated using fallback animation due to processing error'
    };
  }
};

// Helper function to determine knot style based on tone and relationship
const getKnotAnimationStyle = (tone, relationship) => {
  const styles = {
    heartfelt: {
      type: 'Heart Knot',
      primaryColor: '#ec4899',
      secondaryColor: '#f472b6',
      accentColor: '#fbbf24',
      backgroundColor: '#fff0f6',
      textColor: '#be185d',
      subtextColor: '#9333ea',
      knotPath: 'M-70 0 C -35 -35, 35 -35, 70 0 C 35 35, -35 35, -70 0 M -50 -20 C -25 -45, 25 -45, 50 -20 C 25 5, -25 5, -50 -20',
      animationSpeed: 6,
      subtitle: 'A heart-shaped bond of love',
      symbolism: 'Represents the heart connection and deep emotional bond'
    },
    romantic: {
      type: 'Love Knot',
      primaryColor: '#e11d48',
      secondaryColor: '#f43f5e',
      accentColor: '#fb7185',
      backgroundColor: '#fdf2f8',
      textColor: '#be123c',
      subtextColor: '#e11d48',
      knotPath: 'M-60 0 C -30 -50, 30 -50, 60 0 C 30 50, -30 50, -60 0 M -40 -15 C -20 -35, 20 -35, 40 -15 C 20 5, -20 5, -40 -15 M 0 -25 L 0 25',
      animationSpeed: 8,
      subtitle: 'Intertwined hearts as one',
      symbolism: 'Represents eternal love and unbreakable romantic connection'
    },
    playful: {
      type: 'Joy Knot',
      primaryColor: '#f59e0b',
      secondaryColor: '#fbbf24',
      accentColor: '#10b981',
      backgroundColor: '#fffbeb',
      textColor: '#d97706',
      subtextColor: '#f59e0b',
      knotPath: 'M-50 0 C -25 -25, 25 -25, 50 0 C 25 25, -25 25, -50 0 M -30 -15 L 30 15 M -30 15 L 30 -15',
      animationSpeed: 4,
      subtitle: 'A joyful spiral of fun',
      symbolism: 'Represents happiness, laughter, and playful connection'
    },
    thoughtful: {
      type: 'Wisdom Knot',
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      accentColor: '#a78bfa',
      backgroundColor: '#f8fafc',
      textColor: '#4338ca',
      subtextColor: '#6366f1',
      knotPath: 'M-60 0 C -40 -40, 0 -30, 0 0 C 0 30, 40 40, 60 0 C 40 -40, 0 -30, 0 0 C 0 30, -40 40, -60 0',
      animationSpeed: 10,
      subtitle: 'A meditative circle of care',
      symbolism: 'Represents deep thinking, wisdom, and contemplative connection'
    },
    supportive: {
      type: 'Support Knot',
      primaryColor: '#059669',
      secondaryColor: '#10b981',
      accentColor: '#34d399',
      backgroundColor: '#f0fdf4',
      textColor: '#047857',
      subtextColor: '#059669',
      knotPath: 'M-70 0 L -35 -35 L 0 0 L 35 -35 L 70 0 L 35 35 L 0 0 L -35 35 Z',
      animationSpeed: 7,
      subtitle: 'A strong foundation of support',
      symbolism: 'Represents unwavering support and strength in friendship'
    },
    funny: {
      type: 'Laughter Knot',
      primaryColor: '#f59e0b',
      secondaryColor: '#fbbf24',
      accentColor: '#ef4444',
      backgroundColor: '#fffbeb',
      textColor: '#d97706',
      subtextColor: '#f59e0b',
      knotPath: 'M-60 0 C -30 -30, 30 -30, 60 0 C 30 30, -30 30, -60 0 M -40 -20 C -20 -40, 20 -40, 40 -20 C 20 0, -20 0, -40 -20 M -20 -10 L 20 10 M -20 10 L 20 -10',
      animationSpeed: 3,
      subtitle: 'A joyful burst of laughter',
      symbolism: 'Represents humor, shared laughs, and lighthearted moments'
    },
    inspirational: {
      type: 'Wisdom Knot',
      primaryColor: '#7c3aed',
      secondaryColor: '#a855f7',
      accentColor: '#fbbf24',
      backgroundColor: '#faf5ff',
      textColor: '#6b21a8',
      subtextColor: '#7c3aed',
      knotPath: 'M-60 0 C -40 -40, 0 -30, 0 0 C 0 30, 40 40, 60 0 C 40 -40, 0 -30, 0 0 C 0 30, -40 40, -60 0 M -30 -15 C -15 -25, 15 -25, 30 -15 C 15 -5, -15 -5, -30 -15',
      animationSpeed: 8,
      subtitle: 'A guiding light of inspiration',
      symbolism: 'Represents motivation, growth, and the power to inspire others'
    },
    inspirational: {
      type: 'Inspiration Knot',
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      accentColor: '#fbbf24',
      backgroundColor: '#f8fafc',
      textColor: '#4338ca',
      subtextColor: '#6366f1',
      knotPath: 'M-80 0 C -40 -60, 40 -60, 80 0 C 40 60, -40 60, -80 0 M -60 -30 C -30 -50, 30 -50, 60 -30 C 30 -10, -30 -10, -60 -30 M -30 15 C 0 -5, 0 -5, 30 15 C 0 35, 0 35, -30 15',
      animationSpeed: 8,
      subtitle: 'A beacon of hope and motivation',
      symbolism: 'Represents inspiration, growth, and the power to uplift others'
    }
  };
  
  // Default to heartfelt if tone not found
  return styles[tone] || styles.heartfelt;
};

// Helper function to create untying animation
const createUntieAnimation = (knotStyle) => {
  const untieSvg = encodeURIComponent(`
    <svg width="400" height="300" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="untieGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${knotStyle.primaryColor}" opacity="1">
            <animate attributeName="opacity" values="1;0.3;0" dur="3s" fill="freeze"/>
          </stop>
          <stop offset="100%" stop-color="${knotStyle.secondaryColor}" opacity="1">
            <animate attributeName="opacity" values="1;0.3;0" dur="3s" fill="freeze"/>
          </stop>
        </linearGradient>
      </defs>
      
      <rect width="100%" height="100%" rx="20" fill="${knotStyle.backgroundColor}"/>
      
      <g transform="translate(200,150)">
        <!-- Knot untying animation -->
        <path d="${knotStyle.knotPath}" 
              fill="none" 
              stroke="url(#untieGradient)" 
              stroke-width="12" 
              stroke-linecap="round">
          <animate attributeName="stroke-width" values="12;8;4;0" dur="3s" fill="freeze"/>
          <animateTransform attributeName="transform" type="scale" values="1;1.2;0" dur="3s" fill="freeze"/>
        </path>
      </g>
      
      <!-- Particle explosion effect -->
      <g opacity="0">
        <animate attributeName="opacity" values="0;1;0" dur="2s" begin="1s"/>
        <circle cx="200" cy="150" r="2" fill="${knotStyle.accentColor}">
          <animateTransform attributeName="transform" type="translate" values="0,0;-100,-50;-150,-80" dur="2s" begin="1s"/>
        </circle>
        <circle cx="200" cy="150" r="2" fill="${knotStyle.accentColor}">
          <animateTransform attributeName="transform" type="translate" values="0,0;100,-50;150,-80" dur="2s" begin="1s"/>
        </circle>
        <circle cx="200" cy="150" r="2" fill="${knotStyle.accentColor}">
          <animateTransform attributeName="transform" type="translate" values="0,0;-50,100;-80,150" dur="2s" begin="1s"/>
        </circle>
        <circle cx="200" cy="150" r="2" fill="${knotStyle.accentColor}">
          <animateTransform attributeName="transform" type="translate" values="0,0;50,100;80,150" dur="2s" begin="1s"/>
        </circle>
      </g>
      
      <!-- Message appears after untying -->
      <text x="50%" y="270" text-anchor="middle" fill="${knotStyle.textColor}" 
            font-family="Inter, system-ui, sans-serif" font-size="16" opacity="0">
        Your message has been revealed...
        <animate attributeName="opacity" values="0;1" dur="1s" begin="3s" fill="freeze"/>
      </text>
    </svg>
  `);
  
  return `data:image/svg+xml;utf8,${untieSvg}`;
};

const generateImages = async (gift) => {
  console.log('generateImages called with gift:', gift);

  const { giftType, recipientName = 'Someone', tone = 'heartfelt', memories = [], occasion = 'special occasion', language = 'en' } = gift || {};

  // Map language codes to full names
  const languageMap = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'hi': 'Hindi',
    'ar': 'Arabic',
    'ru': 'Russian'
  };
  
  const languageName = languageMap[language] || 'English';

  if (!giftType || !recipientName) {
    console.error('generateImages: Missing required fields', { giftType, recipientName });
    throw new Error('giftType and recipientName are required');
  }

  const memoriesString = memories.length > 0 ? memories.join(', ') : 'a special moment';
  
  // Create two different prompts for variety with language specification
  const basePrompt = `A visual representation in ${languageName} of a ${tone} scene for ${recipientName} at a ${occasion}, inspired by: ${memoriesString}`;
  const prompts = [
    `${basePrompt}. Artistic style, warm colors.`,
    `${basePrompt}. Different artistic interpretation, vibrant colors.`
  ];

  console.log('Generated prompts:', prompts);

  try {
    // Generate two images with different prompts
    const imagePromises = prompts.map(async (prompt, index) => {
      const response = await axios.post(
        'https://api.dev.runwayml.com/v1/text_to_image',
        {
          promptText: prompt,
          model: 'gen4_image',
          ratio: '1280:720',
          seed: Math.floor(Math.random() * 4294967295)
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Runway-Version': '2024-11-06',
          },
        }
      );

      console.log(`Runway ML response ${index + 1}:`, response.data);
      
      // Track RunwayML usage
      await apiTracker.trackAPIUsage('runwayml', 1, 0);

      const taskId = response.data.id;
      if (!taskId) {
        throw new Error(`No task ID received from Runway ML for image ${index + 1}`);
      }

      // Poll for task completion
      const maxAttempts = 20;
      let attempt = 0;
      let delay = 5000;

      while (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
          const taskResponse = await axios.get(
            `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
                'X-Runway-Version': '2024-11-06',
              },
            }
          );

          console.log(`Task status check ${attempt + 1} for image ${index + 1}:`, taskResponse.data);

          if (taskResponse.data.status === 'SUCCEEDED') {
            const imageUrl = taskResponse.data.output?.[0];
            if (!imageUrl) {
              throw new Error(`No image URL in response for image ${index + 1}`);
            }
            return {
              _id: Math.random().toString(36).substring(2, 15),
              url: imageUrl,
            };
          } else if (taskResponse.data.status === 'FAILED') {
            throw new Error(`Image generation task failed for image ${index + 1}`);
          }
          attempt++;
          delay = Math.min(delay * 1.2, 15000);
        } catch (pollError) {
          console.error(`Task polling error attempt ${attempt + 1} for image ${index + 1}:`, pollError.response?.data || pollError.message);
          attempt++;
          delay = Math.min(delay * 1.2, 15000);
        }
      }

      throw new Error(`Task polling timed out for image ${index + 1}`);
    });

    // Wait for both images to complete
    const images = await Promise.all(imagePromises);
    console.log('Generated images:', images);
    
    return images;
  } catch (error) {
    console.error('Runway ML API error:', error.response?.data || error.message);
    
    // Track error
    await apiTracker.trackAPIUsage('runwayml', 1, 0, null, true);
    
    throw new Error('Failed to generate images: ' + (error.response?.data?.error || error.message));
  }
};

export default { generateSong, generateContent, generateImages, pollTaskStatus };



