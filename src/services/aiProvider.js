import dotenv from 'dotenv';
dotenv.config();

/**
 * Universal AI Provider for SakuKampus UMY
 * Supports Groq, Google Gemini, and OpenAI-compatible APIs dynamically from .env
 */

export function getActiveProvider() {
  if (process.env.AI_PROVIDER) {
    return process.env.AI_PROVIDER.toLowerCase();
  }
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '' && !process.env.GROQ_API_KEY.includes('your_')) {
    return 'groq';
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && !process.env.GEMINI_API_KEY.includes('your_')) {
    return 'gemini';
  }
  return 'none';
}

/**
 * Call Groq Chat Completions API
 */
async function callGroq({ prompt, systemPrompt, jsonMode = false, temperature = 0.2, maxTokens = 750 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY tidak ditemukan di .env');

  const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  // Groq free tier limit is 1000 OTPM, keep max_tokens <= 750
  const safeMaxTokens = Math.min(maxTokens || 750, 750);

  const body = {
    model,
    messages,
    temperature,
    max_tokens: safeMaxTokens
  };

  if (jsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Respons dari Groq kosong');
  return text.trim();
}

/**
 * Call Google Gemini API
 */
async function callGemini({ prompt, systemPrompt, jsonMode = false, temperature = 0.2, maxTokens = 1500 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY tidak ditemukan di .env');

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const body = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  };

  if (jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Respons dari Gemini kosong');
  return text.trim();
}

/**
 * Generate Text with automatic provider fallback
 */
export async function aiGenerateText({ prompt, systemPrompt = '', temperature = 0.7, maxTokens = 750 }) {
  const provider = getActiveProvider();
  if (provider === 'none') {
    return null;
  }

  // Try primary provider
  try {
    if (provider === 'groq') {
      return await callGroq({ prompt, systemPrompt, temperature, maxTokens, jsonMode: false });
    } else {
      return await callGemini({ prompt, systemPrompt, temperature, maxTokens, jsonMode: false });
    }
  } catch (err) {
    console.warn(`⚠️ [AI-PROVIDER] Gagal dengan ${provider}: ${err.message}`);

    // Automatic failover if alternate provider exists
    if (provider === 'groq' && process.env.GEMINI_API_KEY) {
      try {
        console.log('🔄 [AI-PROVIDER] Mencoba fallback otomatis ke Gemini...');
        return await callGemini({ prompt, systemPrompt, temperature, maxTokens, jsonMode: false });
      } catch (geminiErr) {
        console.warn(`⚠️ [AI-PROVIDER] Fallback Gemini juga gagal: ${geminiErr.message}`);
      }
    } else if (provider === 'gemini' && process.env.GROQ_API_KEY) {
      try {
        console.log('🔄 [AI-PROVIDER] Mencoba fallback otomatis ke Groq...');
        return await callGroq({ prompt, systemPrompt, temperature, maxTokens, jsonMode: false });
      } catch (groqErr) {
        console.warn(`⚠️ [AI-PROVIDER] Fallback Groq juga gagal: ${groqErr.message}`);
      }
    }
    return null;
  }
}

/**
 * Generate JSON object with automatic provider fallback
 */
export async function aiGenerateJson({ prompt, systemPrompt = '', temperature = 0.1 }) {
  const provider = getActiveProvider();
  if (provider === 'none') {
    return null;
  }

  let rawText = null;

  try {
    if (provider === 'groq') {
      rawText = await callGroq({ prompt, systemPrompt, jsonMode: true, temperature, maxTokens: 800 });
    } else {
      rawText = await callGemini({ prompt, systemPrompt, jsonMode: true, temperature, maxTokens: 800 });
    }
  } catch (err) {
    console.warn(`⚠️ [AI-PROVIDER-JSON] Gagal dengan ${provider}: ${err.message}`);

    // Failover
    if (provider === 'groq' && process.env.GEMINI_API_KEY) {
      try {
        console.log('🔄 [AI-PROVIDER-JSON] Mencoba fallback otomatis ke Gemini...');
        rawText = await callGemini({ prompt, systemPrompt, jsonMode: true, temperature, maxTokens: 800 });
      } catch (fallbackErr) {
        console.warn(`⚠️ [AI-PROVIDER-JSON] Fallback Gemini gagal: ${fallbackErr.message}`);
      }
    } else if (provider === 'gemini' && process.env.GROQ_API_KEY) {
      try {
        console.log('🔄 [AI-PROVIDER-JSON] Mencoba fallback otomatis ke Groq...');
        rawText = await callGroq({ prompt, systemPrompt, jsonMode: true, temperature, maxTokens: 800 });
      } catch (fallbackErr) {
        console.warn(`⚠️ [AI-PROVIDER-JSON] Fallback Groq gagal: ${fallbackErr.message}`);
      }
    }
  }

  if (!rawText) return null;

  try {
    // Clean potential markdown wrap
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (parseErr) {
    console.warn('⚠️ [AI-PROVIDER-JSON] Gagal parse JSON hasil AI:', parseErr.message, 'Raw text:', rawText);
    return null;
  }
}
