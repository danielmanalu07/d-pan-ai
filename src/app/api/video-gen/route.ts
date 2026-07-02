import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET handler to check job status
export async function GET(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Rinel Router API key is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('id');

  if (!jobId) {
    return NextResponse.json({ error: 'Missing job ID' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://rinel-router.duckdns.org/v1/videos/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Rinel Router Video Gen status returned error: ${errorText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in video-gen GET handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST handler to submit video generation job
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Rinel Router API key is not configured' }, { status: 500 });
  }

  try {
    const { prompt, model, aspect_ratio } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt text' }, { status: 400 });
    }

    const payload: any = {
      model: model || 'google/veo-3.1',
      prompt,
    };

    if (aspect_ratio) {
      payload.aspect_ratio = aspect_ratio;
    }

    const response = await fetch('https://rinel-router.duckdns.org/v1/videos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Rinel Router Video Gen API returned error: ${errorText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in video-gen POST handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
