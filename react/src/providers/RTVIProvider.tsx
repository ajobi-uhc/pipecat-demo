import { type PropsWithChildren } from 'react';
import { RTVIClient } from 'realtime-ai';
import { DailyTransport } from '@daily-co/realtime-ai-daily';
import { RTVIClientProvider } from 'realtime-ai-react';

const transport = new DailyTransport();

const client = new RTVIClient({
  transport,
  params: {
    baseUrl: 'http://localhost:7860',
    endpoints: {
      connect: '/connect',
    },
    config: [
      {
        service: "tts",
        options: [
          { name: "voice", value: "79a125e8-cd45-4c13-8a67-188112f4dd22" },
        ],
      },
      {
        service: "llm",
        options: [
          {
            name: "model",
            value: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
          },
          {
            name: "messages",
            value: [
              {
                role: "system",
                content:
                  "You are a assistant called ExampleBot. You can ask me anything. Keep responses brief and legible. Your responses will be converted to audio, so please avoid using any special characters except '!' or '?'.",
              },
            ],
          },
        ],
      },
    ],
  },
  enableMic: true,
  enableCam: false,
});

export function RTVIProvider({ children }: PropsWithChildren) {
  return <RTVIClientProvider client={client}>{children}</RTVIClientProvider>;
}
