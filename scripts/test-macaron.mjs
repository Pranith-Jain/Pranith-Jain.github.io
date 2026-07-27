import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://llm.onerouter.pro/v1',
  apiKey: process.env.INFRON_API_KEY,
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'mindai/macaron-v1-venti:free',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  });

  console.log(completion.choices[0].message);
}

main().catch(console.error);
