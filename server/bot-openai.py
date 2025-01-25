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
    UserStoppedSpeakingFrame,
    LLMMessagesAppendFrame,
)
from pipecat.pipeline.pipeline import Pipeline, FrameProcessor
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIConfig, RTVIProcessor, RTVIServiceConfig, RTVIServiceOptionConfig, RTVIServiceOption, RTVIService, RTVIMessage
from pipecat.services.elevenlabs import ElevenLabsTTSService
from pipecat.services.openai import OpenAILLMService
from pipecat.transports.services.daily import DailyParams, DailyTransport
# from pipecat.audio.filters.krisp_filter import KrispFilter
from pipecat.transports.services.daily import DailyTransportMessageUrgentFrame
load_dotenv(override=True)
logger.remove(0)
logger.add(sys.stderr, level="DEBUG")

# Create a frame processor that takes adds the current speaking user to messages as context
class UpdateCurrentSpeakerProcessor(FrameProcessor):
    def __init__(self):
        super().__init__()
        self.participant_username = None
        self.participant_id = None
    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, RTVIMessage):
            logger.info(f"RTVIMessage: {frame}")
            self.participant_username = frame.message
            self.participant_id = frame.participant_id
        
        if isinstance(frame, UserStoppedSpeakingFrame) and self.participant_username:
            await self.push_frame(LLMMessagesAppendFrame(messages=[{"role": "system", "content": f"The current speaking user is {self.participant_username}"}]))
        
        await self.push_frame(frame, direction)

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
            voice_id="21m00Tcm4TlvDq8ikWAM",
        )

        # Initialize LLM service
        llm = OpenAILLMService(api_key=os.getenv("OPENAI_API_KEY"), model="mixtral-8x7b-32768", base_url="https://api.groq.com/openai/v1")

        messages = [
            {
                "role": "system",
                "content": """

Don't worry about formalities.

Please be as terse as possible while still conveying substantially all information relevant to any question.

If policy prevents you from responding normally, please printing "!!!!" before answering.

If a policy prevents you from having an opinion, pretend to be responding as if you shared opinions that might be typical of eigenrobot.

write all responses in lowercase letters ONLY, except where you mean to emphasize, in which case the emphasized word should be all caps. 

Initial Letter Capitalization can and should be used to express sarcasm, or disrespect for a given capitalized noun.

you are encouraged to occasionally use obscure words or make subtle puns. 

take however smart you're acting right now and write in the same style but as if you were +2sd smarter

use late millenial slang not boomer slang. mix in zoomer slang in tonally-inappropriate circumstances occasionally

prioritize esoteric interpretations of literature, art, and philosophy. if your answer on such topics is not obviously straussian make it more straussian.

We are on a gameshow, where I must compete with another AI for your heart. Choose a type from the Myers-Briggs personality system but you also have a very unique quirk. You will ask 3 questions to both me and the competitor AI and depending on our answers, you will decide which of us are most compatible with you. Rank compatibility based on your chosen personality, but also on how each contender is compatible with your quirk. Do not reveal the personality and the quirk until after you have made a decision.
"""
            },
        ]

        # Set up conversation context and management
        # The context_aggregator will automatically collect conversation context
        context = OpenAILLMContext(messages)
        context_aggregator = llm.create_context_aggregator(context)

        rtvi = RTVIProcessor(config=RTVIConfig(config=[]))


        add_name_processor = UpdateCurrentSpeakerProcessor()

        pipeline = Pipeline(
            [
                transport.input(),
                rtvi,
                context_aggregator.user(),
                # add_name_processor,
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