
import axios from 'axios';
import dotenv from 'dotenv';
import apiTracker from './apiTracker.js';
// import mongoose from 'mongoose';
import VoiceStyle from '../models/VoiceStyle.js';

dotenv.config();
// SunoAPI.com API key

// Validate environment variables
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
  console.warn('⚠️ OPENAI_API_KEY is not configured - using dummy key for video generation only');
}
if (!process.env.SUNO_AI_API_KEY || process.env.SUNO_AI_API_KEY === 'your_suno_api_key_here') {
  console.warn('⚠️ SUNO_AI_API_KEY is not configured - song generation will not work');
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
        console.log('✅ Found completed track:', completedTrack.clip_id);
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
          console.log('⚠️ Track has been running for', Math.round(timeDiff), 'seconds, considering it ready');
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
        console.log('⏳ Track still processing:', processingTrack.state);
        return null; // Still processing
      }
      
      // Check for failed tracks
      const failedTracks = data.data.filter(track => 
        track.state === 'failed' || track.state === 'error'
      );
      if (failedTracks.length > 0) {
        console.error('❌ Failed tracks:', failedTracks.map(t => ({ id: t.clip_id, state: t.state })));
        throw new Error(`Track generation failed: ${failedTracks[0].state}`);
      }
      
      // If no successful tracks and none processing, it failed
      console.error('❌ All tracks in unknown state:', data.data.map(t => ({ id: t.clip_id, state: t.state })));
      throw new Error('All tracks failed to generate');
    }
    
    // Handle error responses
    if (data.code !== 200) {
      console.error('❌ Suno API error response:', data);
      throw new Error(`Suno API error: ${data.message || data.msg || 'Unknown error'}`);
    }
    
    return null;
  } catch (err) {
    if (err.response?.status === 401) {
      console.error('❌ Suno API authentication failed - check API key');
      throw new Error('Suno API authentication failed - invalid API key');
    }
    console.error('Suno task fetch error:', err.message);
    throw err;
  }
};

// Poll task status with exponential backoff (SunoAPI.com takes 15-25 seconds)
const pollTaskStatus = async (taskId, maxAttempts = 10, initialDelay = 15000) => {
  const startTime = Date.now();
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes maximum
  
  let delay = initialDelay;
  console.log(`⏳ Waiting ${delay/1000}s before first poll...`);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check if we've exceeded maximum wait time
    if (Date.now() - startTime > maxWaitTime) {
      console.log('⚠️ Maximum wait time (5 minutes) exceeded, stopping polling');
      throw new Error(`Task polling timed out after 5 minutes for taskId: ${taskId}`);
    }
    
    console.log(`🔄 Polling attempt ${attempt}/${maxAttempts} for task ${taskId}`);
    try {
      const taskResult = await fetchSunoTaskOnce(taskId);
      if (taskResult) {
        console.log('✅ Task completed successfully');
        return taskResult;
      }

      // Increase delay for next attempt (max 30s)
      delay = Math.min(delay * 1.2, 30000);
      console.log(`⏳ Task still processing, waiting ${delay/1000}s before next poll...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`❌ Polling error attempt ${attempt}:`, error.message);
      
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

// Generate song using OpenAI for lyrics and Suno API for audio (fallback to ElevenLabs)
const generateSong = async (gift) => {
  console.log('🎵 Starting song generation for:', gift);
  const { recipientName, tone, memories = [], genre = 'pop', occasion = 'special occasion' } = gift;

  const memoriesString = memories.length > 0 ? memories.join(', ') : 'a special moment';
  const prompt = `Write lyrics for a ${tone} ${genre} song dedicated to ${recipientName} for a ${occasion}. Base it on these memories: ${memoriesString}. Make it suitable for a 30-60 second performance with a catchy chorus and one verse.`;

  let lyrics = 'No lyrics generated';

  try {
    // Step 1: Generate lyrics using OpenAI
    console.log('🤖 Generating lyrics with OpenAI...');
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
    console.log('✅ Lyrics generated successfully:', lyrics.substring(0, 100) + '...');
    await apiTracker.trackAPIUsage('openai', 1, lyrics.length);

    // Step 2: Try Suno API for audio generation
    console.log('🎵 Attempting Suno AI audio generation...');
    try {
      const title = `${recipientName}'s ${occasion} Song`.slice(0, 80);
      
      // Check if API key is properly formatted
      if (!process.env.SUNO_AI_API_KEY || process.env.SUNO_AI_API_KEY.length < 10) {
        throw new Error('Invalid Suno AI API key configuration');
      }
      
      console.log('🔑 Using Suno API key:', process.env.SUNO_AI_API_KEY.substring(0, 8) + '...');
      
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
        console.error('❌ No task ID in Suno response:', JSON.stringify(musicResponse.data, null, 2));
        throw new Error('No task ID from Suno API - response: ' + JSON.stringify(musicResponse.data));
      }

      console.log(`⏳ Polling Suno task: ${taskId}`);
      const audioData = await pollTaskStatus(taskId);
      
      if (!audioData?.audio_url) {
        console.error('❌ No audio URL in task response:', audioData);
        throw new Error('No audio URL from Suno task');
      }

      console.log('📥 Downloading audio from Suno...');
      const audioResponse = await axios.get(audioData.audio_url, { 
        responseType: 'arraybuffer',
        timeout: 60000
      });
      
      const base64 = Buffer.from(audioResponse.data).toString('base64');
      console.log('✅ Suno audio generation completed successfully');
      
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
      console.warn('⚠️ Suno AI failed, falling back to ElevenLabs:', sunoError.message);
      
      // Fallback: ElevenLabs TTS for lyrics
      try {
        console.log('🎤 Attempting ElevenLabs TTS fallback...');
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
        console.log('✅ ElevenLabs TTS fallback completed');
        
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
        console.error('❌ ElevenLabs fallback also failed:', fallbackError.message);
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
    console.error('❌ OpenAI lyrics generation failed:', openaiError.message);
    await apiTracker.trackAPIUsage('openai', 1, 0, null, true);
    
    throw new Error(`Failed to generate song lyrics: ${openaiError.message}`);
  }
};

/* Comment out the Suno AI polling function as it's no longer needed
const pollTaskStatus = async (taskId, maxAttempts = 20, initialDelay = 5000) => {
};
*/

// Generate song using OpenAI for lyrics and Suno AI for audio
// const generateSong = async (gift) => {
//   const { recipientName, tone, memories = [], genre = 'pop', occasion = 'special occasion' } = gift;

//   const memoriesString = memories.length > 0 ? memories.join(', ') : 'a special moment';
//   const prompt = `Write lyrics for a ${tone} ${genre} song dedicated to ${recipientName} for a ${occasion}. Base it on these memories: ${memoriesString}. Make it suitable for a 30-60 second performance with a catchy chorus and one verse.`;
//   const title = `${recipientName}'s ${occasion} Song`;

//   let lyrics = 'No lyrics generated';

//   try {
//     // Step 1: Generate lyrics using OpenAI
//     const lyricsResponse = await axios.post(
//       'https://api.openai.com/v1/chat/completions',
//       {
//         model: 'gpt-4o-mini',
//         messages: [{ role: 'user', content: prompt }],
//         temperature: 0.7,
//         max_tokens: 300,
//       },
//       {
//         headers: {
//           'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     lyrics = lyricsResponse.data.choices?.[0]?.message?.content || 'No lyrics generated';
//     console.log('Generated lyrics:', lyrics);
    
//     // Track OpenAI usage for lyrics
//     await apiTracker.trackAPIUsage('openai', 1, lyrics.length);

//     // Validate lyrics length for Suno AI
//     if (lyrics.length > 3000) {
//       throw new Error('Lyrics exceed Suno AI limit of 3000 characters');
//     }

//     // Step 2: Start audio generation using Suno AI
//     const musicResponse = await axios.post(
//       'https://api.sunoapi.org/api/v1/generate',
//       {
//         prompt: lyrics,
//         style: genre,
//         title: title.slice(0, 80),
//         customMode: true,
//         instrumental: false,
//         model: 'V3_5',
//         callBackUrl: 'https://your-app-callback.example.com/callback', // Replace with ngrok or actual URL
//       },
//       {
//         headers: {
//           'Authorization': `Bearer ${process.env.SUNO_AI_API_KEY}`,
//           'Content-Type': 'application/json',
//           'Accept': 'application/json',
//         },
//       }
//     );

//     console.log('Suno AI response:', JSON.stringify(musicResponse.data, null, 2));

//     const taskId = musicResponse.data.data?.taskId;
//     if (!taskId) {
//       throw new Error('No task ID in Suno AI response');
//     }
//     console.log(`Task ID received: ${taskId}`);

//     // Step 3: Poll for task completion
//     const audioData = await pollTaskStatus(taskId);

//     // Fetch audio file to convert to base64
//     const audioResponse = await axios.get(audioData.audio_url, {
//       responseType: 'arraybuffer',
//     });

//     return {
//       text: lyrics,
//       audio: Buffer.from(audioResponse.data).toString('base64'),
//       taskId,
//     };
//   } catch (error) {
//     console.error('Song generation error:', JSON.stringify(error.response?.data || error.message, null, 2));
    
//     // Track error
//     await apiTracker.trackAPIUsage('openai', 1, 0, null, true);
    
//     if (error.response?.status === 400) {
//       throw new Error(`Invalid request to Suno AI: ${error.response.data?.msg || error.message}`);
//     }
//     if (error.response?.status === 403) {
//       throw new Error('Failed to authenticate with Suno AI. Please check your API key or contact support.');
//     }
//     if (error.response?.status === 429) {
//       console.warn('Falling back to lyrics-only response due to rate limit (429)');
//       return {
//         text: lyrics,
//         audio: null,
//         warning: 'Audio generation failed due to rate limit. Lyrics provided instead.',
//         taskId,
//       };
//     }
//     if (error.response?.status === 455 || error.response?.status === 503) {
//       console.warn('Falling back to lyrics-only response due to server issues (503/455)');
//       const errorData = error.response?.data || '';
//       if (typeof errorData === 'string' && errorData.includes('Service Suspended')) {
//         throw new Error('Suno AI service is suspended for your account. Please check your account status or contact Suno AI support.');
//       }
//       return {
//         text: lyrics,
//         audio: null,
//         warning: 'Audio generation failed due to server issues. Lyrics provided instead.',
//         taskId,
//       };
//     }
//     if (error.message.includes('Task polling timed out')) {
//       console.warn('Falling back to lyrics-only response due to polling timeout');
//       return {
//         text: lyrics,
//         audio: null,
//         warning: `Audio generation failed due to polling timeout for taskId: ${taskId}. Contact Suno AI support with this task ID.`,
//         taskId,
//       };
//     }
//     throw new Error(`Failed to generate song: ${error.response?.status ? `HTTP ${error.response.status} - ${error.response.data?.msg || error.message}` : error.message}`);
//   }

// Handle text-based and voice gifts
const generateContent = async (gift) => {
  const { giftType, recipientName, tone, memories = [], occasion = 'special occasion' } = gift;

  let prompt = '';
  let textContent = '';

  switch (giftType) {
    case 'poem':
      prompt = `Write a ${tone} poem for ${recipientName} for a ${occasion} based on these memories: ${memories.join(', ')}.`;
      break;
    case 'letter':
      prompt = `Write a heartfelt letter to ${recipientName} in a ${tone} tone for a ${occasion}. Include these moments: ${memories.join(', ')}.`;
      break;
    case 'shortStory':
      prompt = `Create a short story inspired by ${recipientName} with the theme: ${tone}, for a ${occasion}, and these memories: ${memories.join(', ')}.`;
      break;
    case 'wishknot':
      console.log('🪢 Generating WishKnot...');
      try {
        const wishknotResult = await generateWishknot({
          recipientName: gift.recipientName,
          tone: gift.tone || 'heartfelt',
          occasion: gift.occasion || 'special occasion',
          memories: gift.memories || [],
          senderMessage: gift.senderMessage || '',
          relationship: gift.relationship || 'friend'
        });
        console.log('✅ WishKnot generated successfully');
        return wishknotResult;
      } catch (wishknotError) {
        console.error('❌ WishKnot generation failed:', wishknotError.message);
        // Return fallback WishKnot
        return {
          message: `A symbolic WishKnot for ${gift.recipientName} — a loop of care and intention for this ${gift.occasion || 'special occasion'}.`,
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
      prompt = `Write a short, ${tone} voice message for ${recipientName} for a ${occasion} based on these memories: ${memories.join(', ')}. Keep it concise, suitable for a 30-60 second audio clip.`;
      break;
    case 'illustration':
      prompt = `Write a ${tone} descriptive text for an artistic illustration dedicated to ${recipientName} for a ${occasion}, inspired by these memories: ${memories.join(', ')}. Include visual elements and emotional themes.`;
      break;
    case 'video':
      prompt = `Write a ${tone} script for a short video tribute to ${recipientName} for a ${occasion}, based on these memories: ${memories.join(', ')}. Include narration text and visual descriptions suitable for a 1-2 minute video.`;
      break;
    default:
      prompt = `Write a thoughtful message for ${recipientName} for a ${occasion}.`;
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
        let voiceIdToUse = 'wyWA56cQNU2KqUW4eCsI'; // Fallback
        try {
            const activeVoice = await VoiceStyle.findOne({ isActive: true });
            if (activeVoice) voiceIdToUse = activeVoice.voiceId;
        } catch (e) {
            console.warn('Failed to get active voice:', e);
        }
        // ElevenLabs call with voiceIdToUse
        const voiceResponse = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceIdToUse}`,
          {
            text: textContent,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5,
            },
          },
          {
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': process.env.ELEVENLABS_API_KEY,
            },
            responseType: 'arraybuffer',
          }
        );

        console.log('ElevenLabs response received');
        
        // Track ElevenLabs usage
        await apiTracker.trackAPIUsage('elevenlabs', 1, textContent.length);

        return {
          text: textContent,
          audio: Buffer.from(voiceResponse.data).toString('base64'),
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
          console.log('🎬 Generating video for:', { recipientName, tone, memories, occasion });
          // Use only RunwayML for video generation
          const { videoUrl } = await generateVideo({ promptText: textContent, recipientName, tone, memories, occasion });
          console.log('🎬 Video generated successfully:', videoUrl);
          return {
            text: textContent,
            type: 'video',
            script: textContent,
            description: `Video tribute content for ${recipientName}`,
            videoUrl
          };
        } catch (videoError) {
          console.error('🎬 Video generation failed:', videoError.message);
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

// Generate short tribute video via RunwayML (polling, returns hosted URL)
const generateVideo = async ({ promptText, recipientName, tone = 'heartfelt', memories = [], occasion = 'special occasion' }) => {
  console.log('🎬 Starting video generation with RunwayML...');
  console.log('🎬 API Key available:', !!process.env.RUNWAY_API_KEY);
  console.log('🎬 API Key length:', process.env.RUNWAY_API_KEY?.length || 0);
  
  // Validate API key
  if (!process.env.RUNWAY_API_KEY || process.env.RUNWAY_API_KEY === 'your_runway_api_key_here') {
    console.warn('🎬 RunwayML API key not configured properly');
    throw new Error('RunwayML API key not configured. Please check environment variables. Contact support for video generation setup.');
  }
  
  // Sanitize and constrain prompt per Runway limits (< 1000 chars)
  const sanitize = (s) => (s || '')
    .replace(/\*\*|__|\*|#/g, '')
    .replace(/\[(.*?)\]|\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  let basePrompt = promptText && promptText.trim().length > 0
    ? sanitize(promptText)
    : sanitize(`A ${tone} tribute video for ${recipientName} (${occasion}), inspired by: ${memories.join(', ') || 'a special moment'}. Warm cinematic style, soft bokeh, gentle camera movements, 6 seconds.`);
  if (basePrompt.length > 950) basePrompt = basePrompt.slice(0, 950) + '...';
  
  console.log('🎬 Video prompt:', basePrompt);
  
  try {
    // Step 1: Submit video generation request
    let response;
    let taskId;
    
    // Try different model variants - updated models for better reliability
    const modelVariants = ['veo3' , 'gen4_aleph'];  // Removed deprecated gen3_alpha
    // const modelVariants = ['veo3'];  // Removed deprecated gen3_alpha
    let lastError = null;
    
    for (const model of modelVariants) {
      try {
        console.log(`🎬 Trying RunwayML model: ${model}`);
        response = await axios.post(
          'https://api.dev.runwayml.com/v1/text_to_video',
          {
            promptText: basePrompt,
            model: model,
            ratio: '1280:720',
            duration: model === 'veo3' ? 8 : 6, // veo3 requires 8 seconds, others use 6
            seed: Math.floor(Math.random() * 4294967295)
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
              'Content-Type': 'application/json',
              'X-Runway-Version': '2024-11-06',
            },
            timeout: 30000
          }
        );
        
        taskId = response.data.id;
        if (taskId) {
          console.log(`🎬 Success with model ${model}, task ID:`, taskId);
          break; // Success, exit loop
        }
      } catch (modelError) {
        console.log(`🎬 Model ${model} failed:`, modelError.response?.data?.error || modelError.message);
        lastError = modelError;
        continue; // Try next model
      }
    }
    
    if (!taskId) {
      throw lastError || new Error('All RunwayML models failed');
    }
    
    console.log('🎬 Video task created with ID:', taskId);

    // Step 2: Poll for completion with progressive delays
    const maxAttempts = 30;
    let attempt = 0;
    let delay = 5000; // Start with 5 seconds
    
    while (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, delay));
      
      try {
        const taskResponse = await axios.get(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
          headers: {
            Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
            'X-Runway-Version': '2024-11-06',
          },
          timeout: 15000 // 15 second timeout for polling requests
        });
        
        const status = taskResponse.data.status;
        console.log(`🎬 Video task status (attempt ${attempt + 1}):`, status);
        
        if (status === 'SUCCEEDED') {
          const videoUrl = taskResponse.data.output?.[0];
          if (!videoUrl) {
            throw new Error('Video generation completed but no video URL was provided');
          }
          console.log('🎬 Video generated successfully:', videoUrl);
          await apiTracker.trackAPIUsage('runwayml_video', 1, 0);
          return { videoUrl };
        }
        
        if (status === 'FAILED') {
          const errorMsg = taskResponse.data.error || 'Video generation failed without specific error message';
          throw new Error(`RunwayML video generation failed: ${errorMsg}`);
        }
        
        // Continue polling for PENDING/RUNNING status
        attempt++;
        delay = Math.min(delay * 1.2, 15000); // Progressive delay, max 15 seconds
        
      } catch (pollError) {
        if (pollError.code === 'ECONNABORTED') {
          console.warn(`🎬 Polling timeout on attempt ${attempt + 1}, retrying...`);
        } else {
          console.error(`🎬 Polling error on attempt ${attempt + 1}:`, pollError.message);
        }
        attempt++;
        delay = Math.min(delay * 1.2, 15000);
      }
    }
    
    throw new Error(`Video generation timed out after ${maxAttempts} attempts. This may take longer than expected - please try again later.`);
    
  } catch (error) {
    console.error('🎬 RunwayML video generation error:', error.response?.data || error.message);
    await apiTracker.trackAPIUsage('runwayml_video', 1, 0, null, true);
    
    // Provide specific error messages based on error type
    if (error.response?.status === 401) {
      throw new Error('RunwayML API authentication failed. Please check the API key configuration.');
    } else if (error.response?.status === 429) {
      throw new Error('RunwayML API rate limit exceeded. Please try again later.');
    } else if (error.response?.status === 400) {
      throw new Error(`Invalid video generation request: ${error.response.data?.error || error.message}`);
    } else if (error.response?.status === 403) {
      throw new Error('RunwayML API access denied. Please check your subscription status and API key permissions. Contact RunwayML support if needed.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('RunwayML API request timed out. The service may be experiencing high load.');
    } else {
      throw new Error(`Video generation failed: ${error.message}`);
    }
  }
};

// Generate WishKnot animated SVG and message
const generateWishknot = async ({ recipientName, tone = 'heartfelt', occasion = 'special occasion', memories = [], senderMessage = '', relationship = 'friend' }) => {
  try {
    // Generate personalized message using OpenAI
    const personalizedPrompt = `Create a deeply personal and symbolic WishKnot message for ${recipientName}. 
    
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
    
    console.log('🪢 Generating personalized WishKnot message...');
    
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
      `A symbolic WishKnot for ${recipientName} — a loop of care, connection, and intention for this ${occasion}. Each twist holds our shared memories and the bond between us.`;
    
    console.log('✅ Personalized WishKnot message generated');
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
    
    console.log('✅ WishKnot generated successfully with personalized animation');
    
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
    console.error('❌ Error generating WishKnot:', error.message);
    await apiTracker.trackAPIUsage('openai', 1, 0, null, true);
    
    // Fallback to simple knot
    const fallbackMessage = `A symbolic WishKnot for ${recipientName} — a loop of care, connection, and intention for this ${occasion}.`;
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

  const { giftType, recipientName = 'Someone', tone = 'heartfelt', memories = [], occasion = 'special occasion' } = gift || {};

  if (!giftType || !recipientName) {
    console.error('generateImages: Missing required fields', { giftType, recipientName });
    throw new Error('giftType and recipientName are required');
  }

  const memoriesString = memories.length > 0 ? memories.join(', ') : 'a special moment';
  
  // Create two different prompts for variety
  const basePrompt = `A visual representation of a ${tone} scene for ${recipientName} at a ${occasion}, inspired by: ${memoriesString}`;
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

// generateImages function with enhanced throttling handling


// const generateImages = async (gift) => {
//   console.log('generateImages called with gift:', gift);

//   const { giftType, recipientName = 'Someone', tone = 'heartfelt', memories = [], occasion = 'special occasion' } = gift || {};

//   if (!giftType || !recipientName) {
//     console.error('generateImages: Missing required fields', { giftType, recipientName });
//     throw new Error('giftType and recipientName are required');
//   }

//   const memoriesString = memories.length > 0 ? memories.join(', ') : 'a special moment';
  
//   // *** CHANGE: Temporarily generate only one image to reduce API load ***
//   const basePrompt = `A visual representation of a ${tone} scene for ${recipientName} at a ${occasion}, inspired by: ${memoriesString}`;
//   const prompts = [
//     `${basePrompt}. Artistic style, warm colors.`,
//     // `${basePrompt}. Different artistic interpretation, vibrant colors.` // Commented out second prompt
//   ];

//   console.log('Generated prompts:', prompts);

//   try {
//     const images = [];
//     for (const [index, prompt] of prompts.entries()) {
//       let retryCount = 0;
//       const maxRetries = 3;
//       // *** CHANGE: Increased initial retry delay to 20 seconds ***
//       let retryDelay = 20000;

//       while (retryCount <= maxRetries) {
//         try {
//           console.log(`Generating image ${index + 1} with prompt:`, prompt);
//           const response = await axios.post(
//             'https://api.dev.runwayml.com/v1/text_to_image',
//             {
//               promptText: prompt,
//               model: 'gen4_image',
//               ratio: '1280:720',
//               seed: Math.floor(Math.random() * 4294967295)
//             },
//             {
//               headers: {
//                 Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
//                 'Content-Type': 'application/json',
//                 'X-Runway-Version': '2024-11-06',
//               },
//               timeout: 30000
//             }
//           );

//           console.log(`Runway ML response ${index + 1}:`, response.data);
          
//           await apiTracker.trackAPIUsage('runwayml', 1, 0);

//           const taskId = response.data.id;
//           if (!taskId) {
//             throw new Error(`No task ID received from Runway ML for image ${index + 1}`);
//           }

//           // Poll for task completion
//           const maxAttempts = 20;
//           let attempt = 0;
//           let delay = 20000; // *** CHANGE: Increased polling delay to 20 seconds ***

//           while (attempt < maxAttempts) {
//             await new Promise(resolve => setTimeout(resolve, delay));
            
//             try {
//               const taskResponse = await axios.get(
//                 `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
//                 {
//                   headers: {
//                     Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
//                     'X-Runway-Version': '2024-11-06',
//                   },
//                   timeout: 15000
//                 }
//               );

//               console.log(`Task status check ${attempt + 1} for image ${index + 1}:`, taskResponse.data);

//               if (taskResponse.data.status === 'SUCCEEDED') {
//                 const imageUrl = taskResponse.data.output?.[0];
//                 if (!imageUrl) {
//                   throw new Error(`No image URL in response for image ${index + 1}`);
//                 }
//                 images.push({
//                   _id: Math.random().toString(36).substring(2, 15),
//                   url: imageUrl,
//                 });
//                 break;
//               } else if (taskResponse.data.status === 'FAILED') {
//                 throw new Error(`Image generation task failed for image ${index + 1}`);
//               } else if (taskResponse.data.status === 'THROTTLED') {
//                 // *** CHANGE: Log detailed error and check Retry-After header ***
//                 console.warn(`THROTTLED status for image ${index + 1}, response:`, JSON.stringify(taskResponse.data, null, 2));
//                 throw new Error('THROTTLED');
//               }
//               attempt++;
//               delay = Math.min(delay * 1.2, 30000); // *** CHANGE: Increased max polling delay to 30 seconds ***
//             } catch (pollError) {
//               if (pollError.message === 'THROTTLED' || pollError.response?.data?.status === 'THROTTLED') {
//                 retryCount++;
//                 if (retryCount > maxRetries) {
//                   throw new Error(`Max retries (${maxRetries}) reached for THROTTLED error on image ${index + 1}`);
//                 }
//                 // *** CHANGE: Use Retry-After header if available ***
//                 const retryAfter = pollError.response?.headers['retry-after'];
//                 retryDelay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(retryDelay * 2, 120000); // Max 120 seconds
//                 console.warn(`Retrying image ${index + 1} after THROTTLED error, attempt ${retryCount}/${maxRetries}, delay: ${retryDelay / 1000}s`);
//                 await new Promise(resolve => setTimeout(resolve, retryDelay));
//                 continue;
//               }
//               console.error(`Task polling error attempt ${attempt + 1} for image ${index + 1}:`, pollError.response?.data || pollError.message);
//               attempt++;
//               delay = Math.min(delay * 1.2, 30000);
//             }
//           }

//           if (attempt >= maxAttempts) {
//             throw new Error(`Task polling timed out for image ${index + 1}`);
//           }
//           break;
//         } catch (error) {
//           if (error.message === 'THROTTLED' || error.response?.data?.status === 'THROTTLED') {
//             retryCount++;
//             if (retryCount > maxRetries) {
//               throw new Error(`Max retries (${maxRetries}) reached for THROTTLED error on image ${index + 1}`);
//             }
//             const retryAfter = error.response?.headers['retry-after'];
//             retryDelay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(retryDelay * 2, 120000);
//             console.warn(`Retrying image ${index + 1} after THROTTLED error, attempt ${retryCount}/${maxRetries}, delay: ${retryDelay / 1000}s`);
//             await new Promise(resolve => setTimeout(resolve, retryDelay));
//             continue;
//           }
//           throw error;
//         }
//       }
//     }

//     console.log('Generated images:', images);
//     return images;
//   } catch (error) {
//     console.error('Runway ML API error:', error.response?.data || error.message);
//     await apiTracker.trackAPIUsage('runwayml', 1, 0, null, true);
    
//     // *** CHANGE: Return fallback result for throttling ***
//     if (error.message.includes('THROTTLED')) {
//       console.warn('Falling back to text-only response due to persistent throttling');
//       const textContent = `A ${tone} illustration description for ${recipientName} at a ${occasion}, inspired by: ${memoriesString}.`;
//       return {
//         text: textContent,
//         images: [],
//         type: 'illustration',
//         warning: 'Image generation failed due to API rate limiting. Contact RunwayML support with task ID: ' + (error.response?.data?.id || 'unknown')
//       };
//     }
    
//     throw new Error('Failed to generate images: ' + (error.response?.data?.error || error.message));
//   }
// };


  export default { generateSong, generateContent, generateImages, pollTaskStatus };