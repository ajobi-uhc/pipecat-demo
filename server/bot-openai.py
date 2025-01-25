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

# class UpdatePersonalityProcessor(FrameProcessor):
#     def __init__(self, context: OpenAILLMContext, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         self.context = context

#     def get_messages(self) -> list:
#         """
#         Retrieves the current messages from the context in a persistent-storage format.
#         """
#         return self.context.get_messages_for_persistent_storage()
    
#     def get_system_message(self) -> str:
#         """
#         Extracts the system message (the first in the conversation array) 
#         and returns its plain text content.
#         """
#         messages = self.context.get_messages_for_persistent_storage()
#         logger.info(f"Messages: {messages}")
#         return messages[0]["content"]
    
#     async def process_frame(self, frame):
#         super().process_frame(frame)
#         if isinstance(frame, DailyTransportMessageUrgentFrame):
#             messages = self.get_messages()

#     async def add_item_to_in_context_messages(self, content, item_type, replace=False):
#         """
#         Add memory to in-context memories and propagate changes through pipeline
#         Args:
#             content: The memory content to add
#             memory_type: Type of memory ("memories" or "profile")
#             replace: If True, replaces existing memories instead of appending
#         """
#         if item_type not in ["memories", "profile"]:
#             logger.error(f"Invalid memory type: {item_type}")
#             return

#         try:
#             section_markers = SYSTEM_MESSAGE_SECTION_MARKERS()
#             start_marker, end_marker = section_markers[item_type]
            
#             # Create a copy of the current messages to modify
#             new_messages = self.get_messages()
#             system_message = self.get_system_message()
            
#             # Split the system message into parts
#             before_section, section_and_after = system_message.split(start_marker, 1)
#             section, after_section = section_and_after.split(end_marker, 1)

#             if replace:
#                 updated_section = content
#             else:
#                 updated_section = f"{section.strip()}\n{content}".strip()

#             # Reconstruct the system message
#             new_system_message = (
#                 f"{before_section}{start_marker}\n"
#                 f"{updated_section}\n\n"
#                 f"{end_marker}{after_section}"
#             )

#             # Update the system message in the new messages array
#             new_messages[0]["content"] = new_system_message
            
#             # Create update frame to propagate changes
#             update_frame = LLMMessagesUpdateFrame(new_messages)
#             self.latest_messages_set = new_messages
#             logger.info(f"Sending update system message, timestamp: {datetime.now()}")
#             # Schedule the frame to be pushed
#             await self.push_frame(update_frame)
        
#         except Exception as e:
#             logger.error(f"Error adding item to in-context messages: {e}")
            

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
                camera_out_enabled=False,
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

        
        pipeline = Pipeline(
            [
                transport.input(),
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