import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenRouter API key is not configured' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { model, messages, stream, modalities, audio } = body;

    if (!model || !messages) {
      return NextResponse.json({ error: 'Missing model or messages' }, { status: 400 });
    }

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.nextUrl.origin || 'http://localhost:3000',
        'X-Title': 'D-Pan-AI',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: stream ?? false,
        ...(modalities ? { modalities } : {}),
        ...(audio ? { audio } : {}),
      }),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      return NextResponse.json(
        { error: `OpenRouter API returned error: ${errorText}` },
        { status: openRouterResponse.status }
      );
    }

    // Handle streaming
    if (stream) {
      const customStream = new ReadableStream({
        async start(controller) {
          if (!openRouterResponse.body) {
            controller.close();
            return;
          }
          const reader = openRouterResponse.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (err) {
            controller.error(err);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    // Handle non-streaming
    const data = await openRouterResponse.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in chat route handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
