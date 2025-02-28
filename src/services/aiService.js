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
 * Preprocesses Slack messages for AI by adding context and cleaning data
 * @param {Array} messages - Array of Slack messages
 * @param {Object} userData - User data for context
 * @returns {Array} - Prepared messages with context
 */
function preprocessSlackMessages(messages, userData) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return [];
  }
  
  return messages.map(msg => {
    // Basic message structure
    const processed = {
      text: msg.text || '',
      sender: msg.user || 'Unknown',
      timestamp: msg.timestamp || new Date().toISOString(),
      channelInfo: msg.channel || { name: 'Unknown', type: 'unknown' },
      mentions: []
    };
    
    // Extract mentions
    const mentionRegex = /<@([A-Z0-9]+)>/g;
    let match;
    while ((match = mentionRegex.exec(processed.text)) !== null) {
      processed.mentions.push(match[1]);
    }
    
    // Check if the current user is mentioned
    processed.mentionsCurrentUser = processed.mentions.includes(userData?.slackUserId);
    
    // Clean text - replace Slack-specific formatting
    processed.text = processed.text
      .replace(mentionRegex, '@user')
      .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2 ($1)') // Replace links
      .replace(/<(https?:[^>]+)>/g, '$1'); // Plain links
    
    return processed;
  });
}

/**
 * Synthesize data using DeepSeek API with OpenAI fallback
 * @param {Object} data - Data to be synthesized
 * @returns {Promise<Object>} - Synthesized data
 */
export async function synthesizeData(data) {
  try {
    // Add metadata about the source of the data
    const contextData = {
      ...data,
      source: 'Slack',
      timestamp: new Date().toISOString(),
      user: data.user || { displayName: 'User' }
    };
    
    // Preprocess Slack messages if they exist
    if (data.messages && Array.isArray(data.messages)) {
      contextData.processedMessages = preprocessSlackMessages(
        data.messages, 
        data.user
      );
    }
    
    // Try DeepSeek first
    const deepseekResponse = await deepseekClient.post('/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant that summarizes and synthesizes Slack messages into actionable insights. Prioritize messages where the user is mentioned or that contain important information.'
        },
        {
          role: 'user',
          content: `Analyze and synthesize the following Slack data into clear, actionable insights: ${JSON.stringify(contextData)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    
    return {
      provider: 'deepseek',
      insights: deepseekResponse.data.choices[0].message.content,
      rawData: contextData
    };
  } catch (deepseekErr) {
    console.error('Error with DeepSeek API:', deepseekErr);
    
    // Fallback to OpenAI
    try {
      const openaiResponse = await openaiClient.post('/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that summarizes and synthesizes Slack messages into actionable insights. Prioritize messages where the user is mentioned or that contain important information.'
          },
          {
            role: 'user',
            content: `Analyze and synthesize the following Slack data into clear, actionable insights: ${JSON.stringify(data)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });
      
      return {
        provider: 'openai',
        insights: openaiResponse.data.choices[0].message.content,
        rawData: data
      };
    } catch (openaiErr) {
      console.error('Error with OpenAI API:', openaiErr);
      throw new Error('Failed to synthesize data with any AI provider');
    }
  }
}

/**
 * Assess message urgency using AI
 * @param {Array} messages - Array of messages to analyze
 * @returns {Promise<Object>} - Urgency assessment
 */
export async function assessMessageUrgency(messages) {
  try {
    // Default response if no messages
    if (!messages || messages.length === 0) {
      return {
        urgent: false,
        urgentCount: 0,
        summary: 'No messages to analyze'
      };
    }
    
    // Preprocess messages for AI
    const processedMessages = preprocessSlackMessages(messages, {});
    
    // Structure data for AI
    const dataForAI = {
      messageCount: processedMessages.length,
      messages: processedMessages.slice(0, 20) // Limit to 20 most recent messages
    };
    
    // Try DeepSeek first
    try {
      const deepseekResponse = await deepseekClient.post('/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that analyzes Slack messages to determine urgency. Return a JSON object with three properties: urgent (boolean), urgentCount (number), and summary (string).'
          },
          {
            role: 'user',
            content: `Analyze the following Slack messages and determine if there are any urgent items requiring attention. Return your assessment as a JSON object: ${JSON.stringify(dataForAI)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });
      
      // Parse the response
      const responseText = deepseekResponse.data.choices[0].message.content;
      
      // Extract JSON from the response
      const jsonMatch = responseText.match(/({[\s\S]*})/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback parsing if response format isn't as expected
      return {
        urgent: responseText.toLowerCase().includes('urgent'),
        urgentCount: (responseText.match(/urgent/gi) || []).length,
        summary: responseText.split('\n')[0] || 'Analysis complete'
      };
    } catch (deepseekErr) {
      console.error('Error with DeepSeek urgency assessment:', deepseekErr);
      
      // Fallback to OpenAI
      const openaiResponse = await openaiClient.post('/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that analyzes Slack messages to determine urgency. Return a JSON object with three properties: urgent (boolean), urgentCount (number), and summary (string).'
          },
          {
            role: 'user',
            content: `Analyze the following Slack messages and determine if there are any urgent items requiring attention. Return your assessment as a JSON object: ${JSON.stringify(dataForAI)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });
      
      // Parse the response
      const responseText = openaiResponse.data.choices[0].message.content;
      
      // Extract JSON from the response
      const jsonMatch = responseText.match(/({[\s\S]*})/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback parsing
      return {
        urgent: responseText.toLowerCase().includes('urgent'),
        urgentCount: (responseText.match(/urgent/gi) || []).length,
        summary: responseText.split('\n')[0] || 'Analysis complete'
      };
    }
  } catch (error) {
    console.error('Error assessing message urgency:', error);
    return {
      urgent: false,
      urgentCount: 0,
      summary: 'Failed to analyze messages'
    };
  }
}
