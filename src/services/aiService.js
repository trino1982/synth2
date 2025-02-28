import axios from 'axios';

const deepseekApiUrl = process.env.REACT_APP_DEEPSEEK_API_URL;
const deepseekApiKey = process.env.REACT_APP_DEEPSEEK_API_KEY;
const openaiApiKey = process.env.REACT_APP_OPENAI_API_KEY;

// Configure DeepSeek API client
const deepseekClient = axios.create({
  baseURL: deepseekApiUrl,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${deepseekApiKey}`
  }
});

// Configure OpenAI API client
const openaiClient = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiApiKey}`
  }
});

/**
 * Synthesize data using DeepSeek API with OpenAI fallback
 * @param {Object} data - Data to be synthesized
 * @returns {Promise<Object>} - Synthesized data
 */
export async function synthesizeData(data) {
  try {
    // Try DeepSeek first
    const deepseekResponse = await deepseekClient.post('/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant that summarizes and synthesizes app data into actionable insights.'
        },
        {
          role: 'user',
          content: `Analyze and synthesize the following data into clear, actionable insights: ${JSON.stringify(data)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    
    return {
      provider: 'deepseek',
      insights: deepseekResponse.data.choices[0].message.content,
      raw: deepseekResponse.data
    };
  } catch (error) {
    console.warn('DeepSeek API failed, falling back to OpenAI:', error);
    
    try {
      // Fallback to OpenAI
      const openaiResponse = await openaiClient.post('/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that summarizes and synthesizes app data into actionable insights.'
          },
          {
            role: 'user',
            content: `Analyze and synthesize the following data into clear, actionable insights: ${JSON.stringify(data)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });
      
      return {
        provider: 'openai',
        insights: openaiResponse.data.choices[0].message.content,
        raw: openaiResponse.data
      };
    } catch (fallbackError) {
      console.error('Both AI providers failed:', fallbackError);
      throw new Error('Failed to synthesize data with both AI providers');
    }
  }
}

/**
 * Check message urgency using AI
 * @param {Array} messages - Array of messages to analyze
 * @returns {Promise<Object>} - Urgency assessment
 */
export async function assessMessageUrgency(messages) {
  try {
    // First attempt with DeepSeek
    const prompt = `
      Analyze these messages and determine if any require urgent attention:
      ${JSON.stringify(messages)}
      
      Respond with a JSON object containing:
      1. urgent: boolean (true if any messages are urgent)
      2. urgentCount: number (count of urgent messages)
      3. summary: string (brief summary of urgent items, or explanation that nothing is urgent)
    `;
    
    try {
      const deepseekResponse = await deepseekClient.post('/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You analyze messages to determine urgency and return structured JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });
      
      // Parse the response
      const responseText = deepseekResponse.data.choices[0].message.content;
      return {
        provider: 'deepseek',
        ...JSON.parse(responseText)
      };
    } catch (error) {
      console.warn('DeepSeek API failed for urgency assessment, falling back to OpenAI:', error);
      
      // Fallback to OpenAI
      const openaiResponse = await openaiClient.post('/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You analyze messages to determine urgency and return structured JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });
      
      // Parse the response
      const responseText = openaiResponse.data.choices[0].message.content;
      return {
        provider: 'openai',
        ...JSON.parse(responseText)
      };
    }
  } catch (error) {
    console.error('Failed to assess message urgency:', error);
    // Provide a safe default if both services fail
    return {
      provider: 'fallback',
      urgent: false,
      urgentCount: 0,
      summary: 'Unable to assess message urgency due to an error.'
    };
  }
}
