#!/usr/bin/env node

/**
 * Pollo AI video generation management script
 * Usage: node manage-pollo.js [enable|disable|status|test]
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';

const envPath = path.join(process.cwd(), '.env');

const main = async () => {
  const action = process.argv[2] || 'status';
  
  console.log('🎬 Pollo AI Kling 1.6 Management Tool');
  console.log('====================================');
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found');
    process.exit(1);
  }
  
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  switch (action.toLowerCase()) {
    case 'disable':
      console.log('🛑 DISABLING Pollo AI video generation...');
      
      // Remove existing POLLO_GENERATION_DISABLED line if present
      envContent = envContent.replace(/^POLLO_GENERATION_DISABLED=.*$/gm, '');
      
      // Add the disable flag
      envContent += '\n# Emergency protection - disable video generation\n';
      envContent += 'POLLO_GENERATION_DISABLED=true\n';
      
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Pollo AI video generation DISABLED');
      console.log('💡 Video generation will be blocked until you run: node manage-pollo.js enable');
      break;
      
    case 'enable':
      console.log('✅ ENABLING Pollo AI video generation...');
      
      // Remove the disable flag
      envContent = envContent.replace(/^#.*Emergency protection.*$/gm, '');
      envContent = envContent.replace(/^POLLO_GENERATION_DISABLED=.*$/gm, '');
      
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Pollo AI video generation ENABLED');
      console.log('⚠️  Video generation will consume credits again');
      break;
      
    case 'test':
      console.log('🧪 Testing Pollo AI API connection...');
      
      // Get API key from .env
      const apiKeyMatch = envContent.match(/^POLLO_API_KEY=(.+)$/m);
      if (!apiKeyMatch) {
        console.error('❌ POLLO_API_KEY not found in .env file');
        break;
      }
      
      const apiKey = apiKeyMatch[1].trim();
      if (apiKey === 'your_pollo_api_key_here' || apiKey.length < 10) {
        console.error('❌ POLLO_API_KEY appears to be invalid or placeholder');
        break;
      }
      
      try {
        console.log('🔑 API Key:', apiKey.substring(0, 8) + '...');
        
        // Test API connection with multiple possible endpoints
        const testEndpoints = [
          'https://api.pollo.ai/v1/user/profile',
          'https://api.polloai.com/v1/user/profile',
          'https://api.pollo-ai.com/v1/user/profile'
        ];
        
        let response;
        let lastTestError;
        
        for (const endpoint of testEndpoints) {
          try {
            console.log(`🧪 Testing endpoint: ${endpoint}`);
            response = await axios.get(endpoint, {
              headers: {
                'Authorization': `Bearer ${apiKey}`
              },
              timeout: 10000
            });
            console.log('✅ Connected successfully to:', endpoint);
            break;
          } catch (testError) {
            console.log(`❌ Endpoint ${endpoint} failed:`, testError.message);
            lastTestError = testError;
            continue;
          }
        }
        
        if (!response) {
          throw new Error(`All Pollo AI test endpoints failed. Last error: ${lastTestError.message}`);
        }
        
        console.log('✅ Pollo AI API connection successful!');
        console.log('📊 Account info:', response.data);
        
      } catch (error) {
        console.error('❌ Pollo AI API test failed:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
          console.error('🔐 Authentication failed - check your API key');
        } else if (error.response?.status === 403) {
          console.error('🚫 Access denied - check your subscription');
        } else if (error.response?.status === 429) {
          console.error('⏰ Rate limit exceeded - try again later');
        } else if (error.code === 'ENOTFOUND') {
          console.error('🌐 DNS lookup failed - check internet connection or API endpoint');
        }
      }
      break;
      
    case 'status':
    default:
      const isDisabled = envContent.includes('POLLO_GENERATION_DISABLED=true');
      const hasApiKey = envContent.includes('POLLO_API_KEY=') && 
                       !envContent.includes('POLLO_API_KEY=your_pollo_api_key_here');
      
      console.log(`Video Generation: ${isDisabled ? '🛑 DISABLED' : '✅ ENABLED'}`);
      console.log(`API Key: ${hasApiKey ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);
      
      if (isDisabled) {
        console.log('💡 To enable: node manage-pollo.js enable');
      } else {
        console.log('💡 To disable: node manage-pollo.js disable');
        console.log('⚠️  Video generation will consume credits');
      }
      
      if (!hasApiKey) {
        console.log('🔧 Add POLLO_API_KEY=your_actual_key_here to .env file');
      }
      
      // Show recent .env modification time
      const stats = fs.statSync(envPath);
      console.log(`📅 .env last modified: ${stats.mtime.toLocaleString()}`);
      break;
  }
  
  console.log('\n🔧 Available commands:');
  console.log('  node manage-pollo.js disable  - Stop video generation');
  console.log('  node manage-pollo.js enable   - Allow video generation');
  console.log('  node manage-pollo.js status   - Check current status');
  console.log('  node manage-pollo.js test     - Test API connection');
};

main().catch(console.error);