// const express = require('express');
// const axios = require('axios');
// const router = express.Router();

// require('dotenv').config();

// router.post('/', async (req, res) => {
//   const { text } = req.body;

//   try {
//     const response = await axios({
//       method: 'POST',
//       url: 'https://elevenlabs.io/app/voice-library/collections/NT2a3XKvGJgrtwWzIgjz',
//       headers: {
//         'xi-api-key': process.env.ELEVENLABS_API_KEY,
//         'Content-Type': 'application/json',
//       },
//       data: {
//         text: text,
//         model_id: 'eleven_monolingual_v1',
//         voice_settings: {
//           stability: 0.75,
//           similarity_boost: 0.75
//         }
//       },
//       responseType: 'arraybuffer'
//     });

//     res.set({
//       'Content-Type': 'audio/mpeg',
//       'Content-Length': response.data.length,
//     });

//     res.send(response.data);
//   } catch (error) {
//     console.error('Error generating voice:', error.response?.data || error.message);
//     res.status(500).json({ error: 'Failed to generate voice' });
//   }
// });

// module.exports = router;