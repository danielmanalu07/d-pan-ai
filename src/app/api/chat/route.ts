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

    const routerResponse = await fetch('https://rinel-router.duckdns.org/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: stream ?? false,
      }),
    });

    if (!routerResponse.ok) {
      const errorText = await routerResponse.text();
      return NextResponse.json(
        { error: `Rinel Router API returned error: ${errorText}` },
        { status: routerResponse.status }
      );
    }

    // Handle streaming
    if (stream) {
      const customStream = new ReadableStream({
        async start(controller) {
          if (!routerResponse.body) {
            controller.close();
            return;
          }
          const reader = routerResponse.body.getReader();
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
    const data = await routerResponse.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in chat route handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
