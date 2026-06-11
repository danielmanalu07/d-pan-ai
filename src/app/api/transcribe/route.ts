import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenRouter API key is not configured' }, { status: 500 });
  }

  try {
    const { data, format } = await req.json();

    if (!data || !format) {
      return NextResponse.json({ error: 'Missing audio data or format' }, { status: 400 });
    }

    // Use openai/whisper-large-v3 via Groq (much cheaper than whisper-1 via OpenAI)
    // Per docs: POST /api/v1/audio/transcriptions with JSON body
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/whisper-large-v3',
        input_audio: {
          data,   // base64-encoded audio (raw bytes, NOT data URI prefix)
          format, // e.g. 'webm', 'wav', 'mp3'
        },
        language: 'id', // Indonesian first, Whisper auto-detects if wrong
      }),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error(`[transcribe] OpenRouter error ${openRouterResponse.status}:`, errorText);
      return NextResponse.json(
        { error: `Transcription API error (${openRouterResponse.status}): ${errorText}` },
        { status: openRouterResponse.status }
      );
    }

    const result = await openRouterResponse.json();
    // result.text contains the transcript
    return NextResponse.json({ text: result.text ?? '' });
  } catch (error: any) {
    console.error('Error in transcribe handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
