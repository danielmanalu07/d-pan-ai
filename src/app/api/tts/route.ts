import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Primary model for TTS on OpenRouter
const TTS_MODEL = 'microsoft/mai-voice-2';

// Simple heuristic to check if text is Indonesian
function isIndonesian(text: string): boolean {
  const indonesianWords = [
    'dan', 'yang', 'untuk', 'adalah', 'saya', 'bisa', 'ini', 'itu', 'dengan', 
    'dari', 'pada', 'ke', 'sebagai', 'tidak', 'akan', 'atau', 'kami', 'mereka',
    'dia', 'kita', 'kamu', 'anda', 'sudah', 'telah', 'ada', 'dari', 'dalam'
  ];
  const words = text.toLowerCase().split(/\s+/);
  return words.some(word => indonesianWords.includes(word));
}

async function callTTS(apiKey: string, input: string, voice: string) {
  // Determine standard Azure voice based on detected language
  let selectedVoice = voice;
  if (voice === 'alloy' || voice === 'echo' || voice === 'fable' || voice === 'onyx' || voice === 'nova' || voice === 'shimmer' || !voice) {
    selectedVoice = isIndonesian(input) ? 'id-ID-GadisNeural' : 'en-US-JennyNeural';
  }

  return fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://d-pan-ai.local',
      'X-Title': 'D-Pan-AI',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input,
      voice: selectedVoice,
      response_format: 'mp3',
    }),
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenRouter API key is not configured' }, { status: 500 });
  }

  try {
    const { input, voice } = await req.json();

    if (!input || typeof input !== 'string' || !input.trim()) {
      return NextResponse.json({ error: 'Missing or empty input text' }, { status: 400 });
    }

    const cleanInput = input.slice(0, 4096);
    const res = await callTTS(apiKey, cleanInput, voice);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[tts] OpenRouter TTS API returned error:`, errText);
      return NextResponse.json(
        { error: `TTS API failed: ${errText}` },
        { status: res.status }
      );
    }

    // Return the audio stream directly to the client
    const audioBuffer = await res.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Generation-Id': res.headers.get('X-Generation-Id') || '',
      },
    });
  } catch (error: any) {
    console.error('Error in TTS handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
