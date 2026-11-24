import dotenv from 'dotenv';
dotenv.config();

import { app } from './src/app.js';
import { getActiveProvider } from './src/services/aiProvider.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  const provider = getActiveProvider();
  const model = provider === 'groq'
    ? (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile')
    : provider === 'gemini'
      ? (process.env.GEMINI_MODEL || 'gemini-3.5-flash')
      : 'Offline (Rule-based)';

  console.log(`=======================================================`);
  console.log(`🚀 SAKU KAMPUS UMY - Finance Tracker Chatbot (Team 7)`);
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`🤖 AI Engine: ${provider.toUpperCase()} (${model})`);
  console.log(`📚 Stack: Node.js + Express + Supabase/SQLite + Tailwind + Chart.js`);
  console.log(`=======================================================`);
});
