// Test script to verify Pollo AI integration without making actual API calls
import axios from 'axios';

// Mock the axios.post to simulate different scenarios
const originalPost = axios.post;
const originalGet = axios.get;

// Restore original functions after test
const restoreAxios = () => {
  axios.post = originalPost;
  axios.get = originalGet;
};

// Test 1: Simulate successful video generation
console.log('🧪 Test 1: Simulating successful video generation...');
axios.post = async (url, data, config) => {
  console.log('✅ Mock POST request to:', url);
  return { data: { id: 'test-task-id-123' } };
};

axios.get = async (url, config) => {
  console.log('✅ Mock GET request to:', url);
  return { data: { status: 'completed', video_url: 'https://example.com/test-video.mp4' } };
};

// Import and test the generateVideo function
try {
  const aiService = await import('../services/aiService.js');
  
  const result = await aiService.generateVideo({
    promptText: 'A heartfelt video tribute',
    recipientName: 'Test User',
    tone: 'heartfelt',
    memories: ['Great memory'],
    occasion: 'birthday'
  });
  
  console.log('✅ Test 1 PASSED: Video generation function works');
  console.log('🎬 Result:', result);
  
} catch (error) {
  console.log('❌ Test 1 FAILED:', error.message);
} finally {
  restoreAxios();
}

// Test 2: Simulate API endpoint failure
console.log('\\n🧪 Test 2: Simulating API endpoint failure...');
axios.post = async (url, data, config) => {
  throw new Error('getaddrinfo ENOTFOUND api.pollo.ai');
};

try {
  const aiService = await import('../services/aiService.js');
  
  await aiService.generateVideo({
    promptText: 'A heartfelt video tribute',
    recipientName: 'Test User',
    tone: 'heartfelt',
    memories: ['Great memory'],
    occasion: 'birthday'
  });
  
  console.log('❌ Test 2 FAILED: Should have thrown an error');
  
} catch (error) {
  if (error.message.includes('Pollo AI API endpoints not found')) {
    console.log('✅ Test 2 PASSED: Correct error message for endpoint failure');
    console.log('📝 Error:', error.message);
  } else {
    console.log('❌ Test 2 FAILED: Wrong error message');
    console.log('📝 Error:', error.message);
  }
} finally {
  restoreAxios();
}

console.log('\\n✅ All tests completed');