import { useEffect, useRef, useCallback, useState } from 'react';

interface Live2DModelControl {
  playAudio: (audioBuffer: ArrayBuffer) => Promise<void>;
  isTalking: boolean;
}

// const arrayBufferToAudioBuffer = async (audioData: Float32Array): Promise<AudioBuffer> => {
//   const audioContext = new AudioContext();
//   const buffer = audioContext.createBuffer(1, audioData.length, audioContext.sampleRate);
//   buffer.copyToChannel(audioData, 0);
//   return buffer;
// };
const arrayBufferToAudioBuffer = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
  const audioContext = new AudioContext();
  return await audioContext.decodeAudioData(arrayBuffer);
};


const recordMediaStream = async (track: MediaStreamTrack): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const stream = new MediaStream([track]);
    const mediaRecorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (event) => {
      chunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      console.log("🔴 PACKAGE: blob", blob);
      const arrayBuffer = await blob.arrayBuffer();
      console.log("🔴 PACKAGE: arrayBuffer", arrayBuffer);
      resolve(arrayBuffer);
    };

    mediaRecorder.onerror = (error) => reject(error);

    mediaRecorder.start();
    // Stop recording after a specific duration or trigger externally
    setTimeout(() => mediaRecorder.stop(), 5000); // Record for 5 seconds
  });
};

const playRecordedAudioWithMotionSync = async (track: MediaStreamTrack, motionSync: any) => {
  try {
    const audioBuffer = await recordMediaStream(track);
    if (audioBuffer.byteLength === 0) {
      console.error("🔴 PACKAGE: audioBuffer is empty");
      return;
    }
    const audioContext = new AudioContext();

    const decodedAudio = await audioContext.decodeAudioData(audioBuffer);

    // Play the recorded audio with MotionSync
    await motionSync.play(decodedAudio);
    console.log('🔴 Playback complete with lip sync!');
  } catch (error) {
    console.error('Error during playback:', error);
  }
};



export function useLive2D(
  canvasRef: React.RefObject<HTMLCanvasElement>
): Live2DModelControl {
  const modelRef = useRef<any>(null);
  const [isTalking, setIsTalking] = useState(false);
  const appRef = useRef<any>();
  const motionSyncRef = useRef<any>();
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext>();
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Initialize Live2D model
  useEffect(() => {
    if (!canvasRef.current) return;

    const main = async () => {
      try {
        // Initialize AudioContext
        audioContextRef.current = new AudioContext();

        const { MotionSync } = await import('live2d-motionsync');

        const PIXI = window.PIXI;
        const app = new PIXI.Application({
          view: canvasRef.current,
          backgroundAlpha: 0,
          antialias: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
          resizeTo: window
        });

        // Load the model
        PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH;
        PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.HIGH;
        PIXI.settings.SPRITE_MAX_TEXTURES = Math.min(PIXI.settings.SPRITE_MAX_TEXTURES, 16);
        PIXI.settings.FILTER_RESOLUTION = 1;
        const model = await PIXI.live2d.Live2DModel.from(
          '/live2d-models/kei_vowels_pro/kei_vowels_pro.model3.json',
          {
            autoInteract: false,
          }
        );

        // Store the model reference
        modelRef.current = model;
        app.stage.addChild(model);

        // Position and scale
        model.anchor.set(0.5, 0.5);
        model.x = app.screen.width / 2;
        model.y = app.screen.height / 2;
        model.scale.set(0.5);       

        console.log('Model initialized:', {
          coreModel: model.internalModel.coreModel,        
        });

        motionSyncRef.current = new MotionSync(model.internalModel);
        await motionSyncRef.current.loadMotionSyncFromUrl(
          '/live2d-models/kei_vowels_pro/kei_vowels_pro.motionsync3.json'
        );

        console.log('🔴 PACKAGE: Motion sync loaded');


        // Cleanup on unmount
        return () => {
          app.destroy(true);
          audioProcessorRef.current?.disconnect();
          sourceNodeRef.current?.disconnect();
          audioContextRef.current?.close();
        };
      } catch (error) {
        console.error('Failed to load Live2D model:', error);
      }
    };

    main();
  }, [canvasRef]);

  const setupStreamProcessor = (
    motionSync: any, 
    track: MediaStreamTrack,
    onCleanup?: () => void
  ) => {
    const audioContext = motionSync.audioContext;
    const stream = new MediaStream([track]);
    const source = audioContext.createMediaStreamSource(stream);
    console.log("🔴 PACKAGE: setupStreamProcessor => source", source);
    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    console.log("🔴 PACKAGE: setupStreamProcessor => processor", processor);
  
    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Add samples to the existing soundBuffer
      for (const sample of inputData) {
        motionSync.soundBuffer.pushBack(sample);
      }
      // Update motion sync with the new samples
      motionSync._motionSync.setSoundBuffer(0, motionSync.soundBuffer, 0);
      motionSync._motionSync.updateParameters(motionSync._model, e.inputBuffer.duration);
      // Remove processed samples
      const processedCount = motionSync._motionSync.getLastTotalProcessedCount(0);
      if (processedCount > 0 && processedCount < motionSync.soundBuffer.getSize()) {
        motionSync.soundBuffer._ptr.splice(0, processedCount);
        motionSync.soundBuffer._size -= processedCount;
      }
      console.log("🔴 PACKAGE: setupStreamProcessor => motionSync.soundBuffer._size", motionSync.soundBuffer._size);
    };
  
    // Connect the audio pipeline
    source.connect(processor);
    processor.connect(audioContext.destination);
    console.log("🔴 PACKAGE: setupStreamProcessor => processor.connect(audioContext.destination)", processor.connect(audioContext.destination));
    // Return cleanup function
    return () => {
      processor.disconnect();
      source.disconnect();
      onCleanup?.();
    };
  };

  const handleStreamAudio = async (audioTrack: MediaStreamTrack) => {
    if (!motionSyncRef.current) return;

    try {
      // Create MediaStream and audio context
      const stream = new MediaStream([audioTrack]);
      const audioContext = motionSyncRef.current.audioContext;
      console.log("🔴 PACKAGE: handleStreamAudio => audioContext", audioContext);
      
      // Create MediaStreamAudioSourceNode
      const audioSource = audioContext.createMediaStreamSource(stream);
      console.log("🔴 PACKAGE: handleStreamAudio => audioSource", audioSource);
      
      // Create a processor to handle the audio data
      const processor = audioContext.createScriptProcessor(2048, 1, 1);

      let accumulatedTime = 0;
      const sampleRate = audioContext.sampleRate;
      console.log("🔴 PACKAGE: handleStreamAudio => sampleRate", sampleRate);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const deltaTime = inputData.length / sampleRate;
        accumulatedTime += deltaTime;
        console.log("🔴 PACKAGE: handleStreamAudio => accumulatedTime", accumulatedTime);
        // Update the audio samples and motion sync
        motionSyncRef.current.audioBuffer = e.inputBuffer;
        motionSyncRef.current.audioSource = audioSource;
        motionSyncRef.current.audioContextPreviousTime = audioContext.currentTime;
        motionSyncRef.current.audioElapsedTime = accumulatedTime;
        console.log("🔴 PACKAGE: handleStreamAudio => motionSyncRef.current.audioBuffer", motionSyncRef.current.audioBuffer);
        motionSyncRef.current.updateMotionSync();
        console.log("🔴 PACKAGE: handleStreamAudio => motionSyncRef.current.updateMotionSync", motionSyncRef.current.updateMotionSync);
      };

      // Connect the audio nodes
      audioSource.connect(processor);
      processor.connect(audioContext.destination);
      console.log("🔴 PACKAGE: handleStreamAudio => audioSource.connect(processor)", audioSource.connect(processor));
      console.log("🔴 PACKAGE: handleStreamAudio => processor.connect(audioContext.destination)", processor.connect(audioContext.destination));
      // Store cleanup function
      return () => {
        processor.disconnect();
        audioSource.disconnect();
      };
    } catch (error) {
      console.error('Error in handleStreamAudio:', error);
    }
  };

  const playAudio = async (audioData: ArrayBuffer | MediaStreamTrack) => {
    if (!motionSyncRef.current) return;
  
    try {
      
      if (audioData instanceof MediaStreamTrack) {
        console.log("🔴 PACKAGE: playAudio => audioData instanceof MediaStreamTrack");
        console.log("🔴 PACKAGE: playAudio => track info", audioData);
        // Set up streaming processor
        const cleanup = setupStreamProcessor(
          motionSyncRef.current, 
          audioData,
          () => setIsTalking(false)
        );
        console.log("🔴 PACKAGE: playAudio => cleanup", cleanup);
        // Clean up when track ends
        audioData.onended = cleanup;
      } else {
        // Regular buffered audio playback
        const audio = await arrayBufferToAudioBuffer(audioData);
        console.log("🔴 PACKAGE: playAudio => audio", audio);
        await motionSyncRef.current.play(audio);
      }
    } catch (error) {
      console.error('Error in playAudio:', error);
      setIsTalking(false);
    }
  };
  

  return {
    playAudio,
    isTalking,
  };
}

interface TTSConfig {
  endpoint: string;
  voice: string;
}

export const useTTS = (config: TTSConfig) => {
  const tts = async (text: string): Promise<ArrayBuffer> => {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      body: JSON.stringify({
        voice: config.voice,
        text,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return await response.arrayBuffer();
  };

  return { tts };
};
