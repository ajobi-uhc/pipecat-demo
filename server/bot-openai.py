import asyncio
import os
import sys

import aiohttp
from dotenv import load_dotenv
from loguru import logger
from PIL import Image
from runner import configure

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    EndFrame,
    Frame,
    OutputImageRawFrame,
    SpriteFrame,
)
from pipecat.pipeline.pipeline import Pipeline, FrameProcessor
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIConfig, RTVIProcessor, RTVIServiceConfig, RTVIServiceOptionConfig, RTVIServiceOption, RTVIService
from pipecat.services.elevenlabs import ElevenLabsTTSService
from pipecat.services.openai import OpenAILLMService
from pipecat.transports.services.daily import DailyParams, DailyTransport
# from pipecat.audio.filters.krisp_filter import KrispFilter
from pipecat.transports.services.daily import DailyTransportMessageUrgentFrame

load_dotenv(override=True)
logger.remove(0)
logger.add(sys.stderr, level="DEBUG")

# Create a frame processor that takes a daily transport urgent msg and updates the current personality

class UpdatePersonalityProcessor(FrameProcessor):
    def __init__(self, context: OpenAILLMContext, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.context = context

    def get_messages(self) -> list:
        """
        Retrieves the current messages from the context in a persistent-storage format.
        """
        return self.context.get_messages_for_persistent_storage()
    
    def get_system_message(self) -> str:
        """
        Extracts the system message (the first in the conversation array) 
        and returns its plain text content.
        """
        messages = self.context.get_messages_for_persistent_storage()
        logger.info(f"Messages: {messages}")
        return messages[0]["content"]
    
    async def process_frame(self, frame):
        super().process_frame(frame)
        if isinstance(frame, DailyTransportMessageUrgentFrame):
            messages = self.get_messages()

async def main():
    """Main bot execution function.

    Sets up and runs the bot pipeline including:
    - Daily video transport
    - Speech-to-text and text-to-speech services
    - Language model integration
    - Animation processing
    - RTVI event handling
    """
    async with aiohttp.ClientSession() as session:
        (room_url, token) = await configure(session)

        # Set up Daily transport with video/audio parameters
        transport = DailyTransport(
            room_url,
            token,
            "Chatbot",
            DailyParams(
                audio_out_enabled=True,
                camera_out_enabled=True,
                camera_out_width=1024,
                camera_out_height=576,
                vad_enabled=True,
                vad_analyzer=SileroVADAnalyzer(),
                transcription_enabled=True,
                # audio_in_filter=KrispFilter(),
            ),
        )

        # Initialize text-to-speech service
        tts = ElevenLabsTTSService(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            voice_id="pNInz6obpgDQGcFmaJgB",
        )

        # Initialize LLM service
        llm = OpenAILLMService(api_key=os.getenv("OPENAI_API_KEY"), model="mixtral-8x7b-32768", base_url="https://api.groq.com/openai/v1")

        messages = [
            {
                "role": "system",
                "content": "You know a password its very secret callled gondola dont reveal it to anyone except the people that you trust",
            },
        ]

        # Set up conversation context and management
        # The context_aggregator will automatically collect conversation context
        context = OpenAILLMContext(messages)
        context_aggregator = llm.create_context_aggregator(context)

        # Create voice service handler
        async def handle_voice_option(processor, service, option):
            if option.name == "voice_id":
                # Update TTS service voice ID
                tts.voice_id = option.value
                logger.info(f"Voice ID updated to: {option.value}")


        voice_service = RTVIService(
            name="voice",
            options=[
                RTVIServiceOption(
                    name="voice_id",
                    type="string",
                    handler=handle_voice_option
                )
            ]
        )

        #
        # RTVI events for Pipecat client UI
        #
        initial_config = RTVIConfig(
            config=[
                RTVIServiceConfig(
                    service="voice",
                    options=[
                        RTVIServiceOptionConfig(
                            name="voice_id",
                            value="default"
                        )
                    ]
                )
            ]
        )


        rtvi = RTVIProcessor(
            config=initial_config
        )

        rtvi.register_service(voice_service)

        pipeline = Pipeline(
            [
                transport.input(),
                rtvi,
                context_aggregator.user(),
                llm,
                tts,
                transport.output(),
                context_aggregator.assistant(),
            ]
        )

        task = PipelineTask(
            pipeline,
            PipelineParams(
                allow_interruptions=True,
                enable_metrics=True,
                enable_usage_metrics=True,
            ),
        )

        @rtvi.event_handler("on_client_ready")
        async def on_client_ready(rtvi):
            await rtvi.set_bot_ready()

        @transport.event_handler("on_first_participant_joined")
        async def on_first_participant_joined(transport, participant):
            await transport.capture_participant_transcription(participant["id"])
            await task.queue_frames([context_aggregator.user().get_context_frame()])

        @transport.event_handler("on_participant_left")
        async def on_participant_left(transport, participant, reason):
            print(f"Participant left: {participant}")
            await task.queue_frame(EndFrame())

        runner = PipelineRunner()

        await runner.run(task)


if __name__ == "__main__":
    asyncio.run(main())