import { NextResponse } from 'next/server';
import { MagneticPreprocessingPipeline } from '@/pipeline/MagneticPreprocessingPipeline';

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const pipeline = new MagneticPreprocessingPipeline();
      
      try {
        await pipeline.runPipeline([], (event) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        });
      } catch (error: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "PIPELINE_FAILED",
          message: "Internal Pipeline Execution Error: " + error.message,
          severity: "fatal",
          timestamp: new Date().toISOString()
        })}\n\n`));
      } finally {
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
