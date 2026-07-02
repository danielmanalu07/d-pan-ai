import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenRouter API key is not configured' }, { status: 500 });
  }

  try {
    const { prompt, model, aspect_ratio } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt text' }, { status: 400 });
    }

    // Per OpenRouter docs: image generation uses /api/v1/chat/completions
    // with modalities: ["image"] (or ["image","text"] for models like Gemini)
    // NOT the /api/v1/images/generations endpoint
    const selectedModel = model || 'gemini/gemini-2.5-flash-image';

    const body: Record<string, unknown> = {
      model: selectedModel,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      modalities: ['image'],
      stream: false,
    };

    // Add aspect ratio config if provided
    if (aspect_ratio) {
      body.image_config = { aspect_ratio };
    }

    const routerResponse = await fetch('https://rinel-router.duckdns.org/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!routerResponse.ok) {
      const errorText = await routerResponse.text();
      console.error(`[image-gen] Rinel Router error ${routerResponse.status}:`, errorText);
      return NextResponse.json(
        { error: `Image generation API error (${routerResponse.status}): ${errorText}` },
        { status: routerResponse.status }
      );
    }

    const result = await routerResponse.json();

    // Extract image URL from response
    // OpenRouter returns images in choices[0].message.images[] or as content array with type=image_url
    const message = result?.choices?.[0]?.message;

    // Format 1: message.images array (OpenRouter native)
    if (message?.images && message.images.length > 0) {
      const imageUrl = message.images[0]?.image_url?.url ?? message.images[0]?.url ?? '';
      return NextResponse.json({ imageUrl });
    }

    // Format 2: message.content as array with type=image_url
    if (Array.isArray(message?.content)) {
      const imageItem = message.content.find((c: any) => c.type === 'image_url');
      if (imageItem?.image_url?.url) {
        return NextResponse.json({ imageUrl: imageItem.image_url.url });
      }
    }

    // Format 3: message.content is a plain string (some models return base64 inline)
    if (typeof message?.content === 'string' && message.content.startsWith('data:image')) {
      return NextResponse.json({ imageUrl: message.content });
    }

    console.error('[image-gen] Unexpected response format:', JSON.stringify(result).slice(0, 500));
    return NextResponse.json(
      { error: 'Image generated but could not extract URL from response. Check model compatibility.' },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('Error in image-gen handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
