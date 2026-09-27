import { GmailFullMessage } from './imap';

interface DraftReplyParams {
  message: GmailFullMessage;
  userPrompt?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
}

export async function generateEmailDraftReply({
  message,
  userPrompt,
  provider = 'gemini',
  model,
  apiKey,
}: DraftReplyParams): Promise<string> {
  const cleanKey = (apiKey || process.env.GEMINI_API_KEY || '').trim();

  const systemInstruction =
    'You are an executive email assistant. Your task is to draft a polite, concise, and professional email reply. Do NOT auto-send. Output only the email reply body with a greeting and sign-off placeholder.';

  const promptContent = `Here is the email to reply to:
From: ${message.from}
Date: ${message.date}
Subject: ${message.subject}

Original Email Body:
${message.text.slice(0, 3500)}

${userPrompt ? `User's Special Reply Instructions:\n${userPrompt}\n` : 'Draft a courteous, relevant, and constructive response.'}

Reply Draft:`;

  // 1. OpenAI
  if (provider === 'openai' && cleanKey) {
    const chosenModel = model || 'gpt-4o';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: promptContent },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OpenAI error ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  // 2. Anthropic
  if (provider === 'anthropic' && cleanKey) {
    const chosenModel = model || 'claude-sonnet-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cleanKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: 1500,
        system: systemInstruction,
        messages: [{ role: 'user', content: promptContent }],
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Anthropic error ${res.status}`);
    }
    const data = await res.json();
    return (
      data.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('')
        .trim() || ''
    );
  }

  // 3. xAI
  if (provider === 'xai' && cleanKey) {
    const chosenModel = model || 'grok-4.3';
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: promptContent },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `xAI error ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  // 4. Google Gemini (default & fallback)
  const geminiKey = (provider === 'gemini' ? cleanKey : '') || process.env.GEMINI_API_KEY || cleanKey;
  if (!geminiKey) {
    throw new Error('API key is required to draft a reply.');
  }

  const chosenModel = (model || 'gemini-3.8-flash').replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${geminiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: promptContent }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text || '')
      .join('')
      .trim() || '';

  return text;
}
