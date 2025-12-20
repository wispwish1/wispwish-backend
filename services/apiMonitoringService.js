import axios from 'axios';

/**
 * API Monitoring Service
 * Fetches real-time credit/usage data from AI providers
 * Updated: 2025 - Using latest API documentation
 */

class APIMonitoringService {
    constructor() {
        // No eager key assignment to avoid initialization order issues
    }

    /**
     * Get OpenAI credits/usage
     * Note: OpenAI billing API requires session token, not API key
     * We validate the API key works and show it as active
     */
    async getOpenAICredits() {
        const openaiKey = process.env.OPENAI_API_KEY;
        try {
            if (!openaiKey) {
                return {
                    status: 'not_configured',
                    error: 'OpenAI key not found in .env',
                    creditsRemaining: 0,
                    creditsUsed: 0,
                    totalCredits: 0,
                    unit: 'USD',
                    lowBalance: false,
                    rechargeUrl: 'https://platform.openai.com/settings/organization/billing/overview'
                };
            }

            // Debug: Log key length (don't log full key for security)
            console.log(`🔍 Checking OpenAI API key (length: ${openaiKey.length})...`);

            // Test if API key is valid by calling models endpoint
            const response = await axios.get('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${openaiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (response.status === 200) {
                // API key is valid
                // Note: Billing API is not accessible with regular API keys
                return {
                    status: 'active',
                    creditsRemaining: 'N/A',
                    creditsUsed: 'N/A',
                    totalCredits: 'N/A',
                    usagePercentage: 0,
                    unit: 'USD',
                    lowBalance: false,
                    rechargeUrl: 'https://platform.openai.com/settings/organization/billing/overview',
                    note: 'Check dashboard for exact balance'
                };
            }
        } catch (error) {
            console.error('❌ OpenAI API check error:');
            console.error('   Status:', error.response?.status);
            console.error('   Message:', error.message);
            console.error('   Response Data:', JSON.stringify(error.response?.data || {}, null, 2));

            // Check specific error types
            if (error.response?.status === 401) {
                return {
                    status: 'error',
                    error: 'Invalid API key',
                    creditsRemaining: 0,
                    creditsUsed: 0,
                    totalCredits: 0,
                    usagePercentage: 100,
                    unit: 'USD',
                    lowBalance: true,
                    rechargeUrl: 'https://platform.openai.com/settings/organization/billing/overview'
                };
            }

            if (error.response?.status === 429) {
                return {
                    status: 'low',
                    error: 'Rate limited - may be out of credits',
                    creditsRemaining: 0,
                    creditsUsed: 0,
                    totalCredits: 0,
                    usagePercentage: 100,
                    unit: 'USD',
                    lowBalance: true,
                    rechargeUrl: 'https://platform.openai.com/settings/organization/billing/overview'
                };
            }

            return {
                status: 'error',
                error: error.message || 'Connection failed',
                creditsRemaining: 0,
                creditsUsed: 0,
                totalCredits: 0,
                usagePercentage: 100,
                unit: 'USD',
                lowBalance: true,
                rechargeUrl: 'https://platform.openai.com/settings/organization/billing/overview'
            };
        }
    }

    /**
     * Get ElevenLabs subscription and character usage
     * Uses: GET /v1/user/subscription
     */
    async getElevenLabsCredits() {
        const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
        try {
            if (!elevenlabsKey) {
                return {
                    status: 'not_configured',
                    error: 'ElevenLabs key not found in .env',
                    creditsRemaining: 0,
                    creditsUsed: 0,
                    totalCredits: 0,
                    unit: 'characters',
                    lowBalance: false,
                    rechargeUrl: 'https://elevenlabs.io/subscription'
                };
            }

            // ElevenLabs subscription API
            const response = await axios.get('https://api.elevenlabs.io/v1/user/subscription', {
                headers: {
                    'xi-api-key': elevenlabsKey,
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            const data = response.data;
            const characterLimit = data.character_limit || 10000;
            const characterCount = data.character_count || 0;
            const remaining = Math.max(0, characterLimit - characterCount);
            const usagePercent = characterLimit > 0 ? ((characterCount / characterLimit) * 100) : 0;

            return {
                status: remaining > 500 ? 'active' : 'low',
                creditsRemaining: remaining,
                creditsUsed: characterCount,
                totalCredits: characterLimit,
                usagePercentage: usagePercent.toFixed(1),
                unit: 'characters',
                tier: data.tier || 'free',
                nextResetDate: data.next_character_count_reset_unix
                    ? new Date(data.next_character_count_reset_unix * 1000).toISOString()
                    : null,
                lowBalance: remaining < 1000,
                rechargeUrl: 'https://elevenlabs.io/subscription'
            };
        } catch (error) {
            console.error('ElevenLabs API error:', error.response?.status, error.response?.data || error.message);

            let errorMessage = 'Connection failed';
            if (error.response?.status === 401) {
                errorMessage = 'Invalid API key';
            } else if (error.response?.data?.detail?.message) {
                errorMessage = error.response.data.detail.message;
            } else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            }

            return {
                status: 'error',
                error: errorMessage,
                creditsRemaining: 0,
                creditsUsed: 0,
                totalCredits: 0,
                usagePercentage: 100,
                unit: 'characters',
                lowBalance: true,
                rechargeUrl: 'https://elevenlabs.io/subscription'
            };
        }
    }

    /**
     * Get RunwayML credits
     * Uses: GET /v1/organization
     */
    async getRunwayMLCredits() {
        const runwaymlKey = process.env.RUNWAY_API_KEY;
        try {
            if (!runwaymlKey) {
                return {
                    status: 'not_configured',
                    error: 'Runway key not found in .env',
                    creditsRemaining: 0,
                    creditsUsed: 0,
                    totalCredits: 0,
                    unit: 'credits',
                    lowBalance: false,
                    rechargeUrl: 'https://dev.runwayml.com/'
                };
            }

            // RunwayML production API - get credits info
            const response = await axios.get('https://api.dev.runwayml.com/v1/organization', {
                headers: {
                    'Authorization': `Bearer ${runwaymlKey}`,
                    'X-Runway-Version': '2024-11-06',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            const data = response.data;
            // The API returns organization info which includes creditBalance
            const creditsRemaining = data.creditBalance !== undefined ? data.creditBalance : (data.credits || 0);
            const totalCredits = data.tier?.maxMonthlyCreditSpend || creditsRemaining;

            return {
                status: creditsRemaining > 100 ? 'active' : 'low',
                creditsRemaining: creditsRemaining,
                creditsUsed: totalCredits > creditsRemaining ? (totalCredits - creditsRemaining) : 0,
                totalCredits: totalCredits,
                usagePercentage: totalCredits > 0 ? ((totalCredits - creditsRemaining) / totalCredits * 100).toFixed(2) : 0,
                unit: 'credits',
                lowBalance: creditsRemaining < 200,
                rechargeUrl: 'https://dev.runwayml.com/'
            };
        } catch (error) {
            console.error('❌ RunwayML API error:');
            console.error('   Status:', error.response?.status);
            console.error('   Message:', error.message);
            console.error('   Response Data:', JSON.stringify(error.response?.data || {}, null, 2));

            let errorMessage = 'Connection failed';
            if (error.response?.status === 401 || error.response?.status === 403) {
                errorMessage = 'Invalid API key or unauthorized';
            } else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            }

            return {
                status: 'error',
                error: errorMessage,
                creditsRemaining: 0,
                creditsUsed: 0,
                totalCredits: 0,
                usagePercentage: 100,
                unit: 'credits',
                lowBalance: true,
                rechargeUrl: 'https://dev.runwayml.com/'
            };
        }
    }

    /**
     * Get Suno AI credits (self-hosted API)
     * Requires SUNO_API_URL environment variable
     */
    async getSunoCredits() {
        // AI MusicAPI (aimusicapi.ai) official endpoint
        const sunoKey = process.env.SUNO_AI_API_KEY;

        try {
            if (!sunoKey) {
                return {
                    status: 'not_configured',
                    error: 'SUNO_AI_API_KEY not found in .env',
                    creditsRemaining: 0,
                    creditsUsed: 0,
                    totalCredits: 0,
                    usagePercentage: 0,
                    unit: 'credits',
                    lowBalance: false,
                    rechargeUrl: 'https://aimusicapi.ai/dashboard/billing',
                    note: 'Set SUNO_AI_API_KEY in .env'
                };
            }

            // AI MusicAPI official documentation endpoint
            const response = await axios.get('https://api.aimusicapi.ai/api/v1/get-credits', {
                headers: {
                    'Authorization': `Bearer ${sunoKey}`,
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            // Expected response: { "credits": 50, "extra_credits": 0 }
            const data = response.data || {};
            const credits = (data.credits || 0) + (data.extra_credits || 0);

            return {
                status: credits > 100 ? 'active' : 'low',
                creditsRemaining: credits,
                creditsUsed: 'N/A',
                totalCredits: 'N/A',
                usagePercentage: 0,
                unit: 'credits',
                lowBalance: credits < 500,
                rechargeUrl: 'https://aimusicapi.ai/dashboard/billing',
                note: 'AI MusicAPI (Suno)'
            };
        } catch (error) {
            console.error('❌ AI MusicAPI check error:');
            console.error('   Status:', error.response?.status);
            console.error('   Message:', error.message);
            console.error('   Response Data:', JSON.stringify(error.response?.data || {}, null, 2));

            return {
                status: 'error',
                error: error.response?.data?.message || error.message || 'Connection failed',
                creditsRemaining: 0,
                creditsUsed: 0,
                totalCredits: 0,
                usagePercentage: 0,
                unit: 'credits',
                lowBalance: true,
                rechargeUrl: 'https://aimusicapi.ai/dashboard/billing',
                note: 'Check if SUNO_AI_API_KEY is valid'
            };
        }
    }

    /**
     * Get all API credits at once
     */
    async getAllCredits() {
        console.log('📊 Fetching credits from all providers...');

        const [openai, elevenlabs, runwayml, suno] = await Promise.all([
            this.getOpenAICredits(),
            this.getElevenLabsCredits(),
            this.getRunwayMLCredits(),
            this.getSunoCredits()
        ]);

        console.log('✅ OpenAI:', openai.status);
        console.log('✅ ElevenLabs:', elevenlabs.status);
        console.log('✅ RunwayML:', runwayml.status);
        console.log('✅ Suno:', suno.status);

        return {
            openai,
            elevenlabs,
            runwayml,
            suno,
            lastUpdated: new Date().toISOString()
        };
    }
}

// Export singleton instance
const apiMonitoringService = new APIMonitoringService();
export default apiMonitoringService;
