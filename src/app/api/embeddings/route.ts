import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key is not configured' }, { status: 500 });
  }

  try {
    const { input, model } = await req.json();

    if (!input) {
      return NextResponse.json({ error: 'Missing input content to embed' }, { status: 400 });
    }

    const selectedModel = model || 'gemini/gemini-embedding-001';

    const response = await fetch('https://rinel-router.duckdns.org/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        input: input,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[embeddings] Rinel Router error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `Embeddings API error (${response.status}): ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in embeddings handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
