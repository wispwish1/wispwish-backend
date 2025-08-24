
import axios from 'axios';
import dotenv from 'dotenv';
import apiTracker from './apiTracker.js';
import mongoose from 'mongoose';
import VoiceStyle from '../models/VoiceStyle.js';

dotenv.config();

// Validate environment variables
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not configured in environment');
}
if (!process.env.SUNO_AI_API_KEY) {
  throw new Error('SUNO_AI_API_KEY is not configured in environment');
}

// Poll task status with exponential backoff
const pollTaskStatus = async (taskId, maxAttempts = 20, initialDelay = 5000) => {
  let delay = initialDelay;
  await new Promise(resolve => setTimeout(resolve, delay));
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`https://api.sunoapi.org/api/v1/task/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.SUNO_AI_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      console.log(`Poll attempt ${attempt}/${maxAttempts} for taskId ${taskId}:`, JSON.stringify(response.data, null, 2));
      console.log(`Response headers:`, JSON.stringify(response.headers, null, 2));

      const taskData = response.data.data;
      if (taskData.callbackType === 'complete' && taskData.data?.[0]?.audio_url) {
        return taskData.data[0];
      }

      delay = Math.min(delay * 1.5, 30000); // Exponential backoff, max 30s
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`Poll attempt ${attempt}/${maxAttempts} for taskId ${taskId} error:`, JSON.stringify(error.response?.data || error.message, null, 2));
      console.error(`Error headers:`, JSON.stringify(error.response?.headers || {}, null, 2));
      if (error.response?.status === 404) {
        console.warn(`Task ${taskId} not found. Possible propagation delay or invalid task.`);
      }
      if (attempt === maxAttempts) {
        throw new Error(`Task polling timed out for taskId: ${taskId}`);
      }
      delay = Math.min(delay * 1.5, 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Task polling failed for taskId: ${taskId}`);
};

// Generate song using OpenAI for lyrics and Suno AI for audio
const generateSong = async (gift) => {
  const { recipientName, tone, memories = [], genre = 'pop', occasion = 'special occasion' } = gift;

  const memoriesString = memories.length > 0 ? memories.join(', ') : 'a special moment';
  const prompt = `Write lyrics for a ${tone} ${genre} song dedicated to ${recipientName} for a ${occasion}. Base it on these memories: ${memoriesString}. Make it suitable for a 30-60 second performance with a catchy chorus and one verse.`;
  const title = `${recipientName}'s ${occasion} Song`;

  let lyrics = 'No lyrics generated';

  try {
    // Step 1: Generate lyrics using OpenAI
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
      }
    );

    lyrics = lyricsResponse.data.choices?.[0]?.message?.content || 'No lyrics generated';
    console.log('Generated lyrics:', lyrics);
    
    // Track OpenAI usage for lyrics
    await apiTracker.trackAPIUsage('openai', 1, lyrics.length);

    // Validate lyrics length for Suno AI
    if (lyrics.length > 3000) {
      throw new Error('Lyrics exceed Suno AI limit of 3000 characters');
    }

    // Step 2: Start audio generation using Suno AI
    const musicResponse = await axios.post(
      'https://api.sunoapi.org/api/v1/generate',
      {
        prompt: lyrics,
        style: genre,
        title: title.slice(0, 80),
        customMode: true,
        instrumental: false,
        model: 'V3_5',
        callBackUrl: 'https://your-app-callback.example.com/callback', // Replace with ngrok or actual URL
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUNO_AI_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      }
    );

    console.log('Suno AI response:', JSON.stringify(musicResponse.data, null, 2));

    const taskId = musicResponse.data.data?.taskId;
    if (!taskId) {
      throw new Error('No task ID in Suno AI response');
    }
    console.log(`Task ID received: ${taskId}`);

    // Step 3: Poll for task completion
    const audioData = await pollTaskStatus(taskId);

    // Fetch audio file to convert to base64
    const audioResponse = await axios.get(audioData.audio_url, {
      responseType: 'arraybuffer',
    });

    return {
      text: lyrics,
      audio: Buffer.from(audioResponse.data).toString('base64'),
      taskId,
    };
  } catch (error) {
    console.error('Song generation error:', JSON.stringify(error.response?.data || error.message, null, 2));
    
    // Track error
    await apiTracker.trackAPIUsage('openai', 1, 0, null, true);
    
    if (error.response?.status === 400) {
      throw new Error(`Invalid request to Suno AI: ${error.response.data?.msg || error.message}`);
    }
    if (error.response?.status === 403) {
      throw new Error('Failed to authenticate with Suno AI. Please check your API key or contact support.');
    }
    if (error.response?.status === 429) {
      console.warn('Falling back to lyrics-only response due to rate limit (429)');
      return {
        text: lyrics,
        audio: null,
        warning: 'Audio generation failed due to rate limit. Lyrics provided instead.',
        taskId,
      };
    }
    if (error.response?.status === 455 || error.response?.status === 503) {
      console.warn('Falling back to lyrics-only response due to server issues (503/455)');
      const errorData = error.response?.data || '';
      if (typeof errorData === 'string' && errorData.includes('Service Suspended')) {
        throw new Error('Suno AI service is suspended for your account. Please check your account status or contact Suno AI support.');
      }
      return {
        text: lyrics,
        audio: null,
        warning: 'Audio generation failed due to server issues. Lyrics provided instead.',
        taskId,
      };
    }
    if (error.message.includes('Task polling timed out')) {
      console.warn('Falling back to lyrics-only response due to polling timeout');
      return {
        text: lyrics,
        audio: null,
        warning: `Audio generation failed due to polling timeout for taskId: ${taskId}. Contact Suno AI support with this task ID.`,
        taskId,
      };
    }
    throw new Error(`Failed to generate song: ${error.response?.status ? `HTTP ${error.response.status} - ${error.response.data?.msg || error.message}` : error.message}`);
  }
};

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
      prompt = `Create a unique and emotional "WishKnot" message for ${recipientName} in a ${tone} tone for a ${occasion} using: ${memories.join(', ')}.`;
      break;
    case 'voice':
      prompt = `Write a short, ${tone} voice message for ${recipientName} for a ${occasion} based on these memories: ${memories.join(', ')}. Keep it concise, suitable for a 30-60 second audio clip.`;
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


  export default { generateSong, generateContent, generateImages, pollTaskStatus };