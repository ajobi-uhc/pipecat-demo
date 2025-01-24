"use client";

import React, {
  createContext,
  useContext,
  PropsWithChildren,
  useRef,
  useEffect,
  useState
} from "react";
import {
  TransportClient,
  AiTransportState
} from "../services/TransportClient";
import { DailyProvider, DailyAudio } from "@daily-co/daily-react";

type InboundMessage = {
  from: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  time: number;
};

type TransportContextType = {
  connectToAi: () => Promise<void>;
  disconnectAi: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendMessage: (data: any) => void;
  aiState: AiTransportState;
  messages: InboundMessage[];
  startScreenShare: () => Promise<void>;
};

const TransportContext = createContext<TransportContextType | null>(null);

export const TransportProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const transportRef = useRef<TransportClient | null>(null);
  const [aiState, setAiState] = useState<AiTransportState>("idle");
  const [messages, setMessages] = useState<InboundMessage[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  // We'll store a ScriptProcessorNode per participant
  const audioProcessorsRef = useRef<Map<string, ScriptProcessorNode>>(new Map());

  // ---- GRAB playAudio FROM Live2DContext
//   const { playAudio } = useLive2DContext();

  // 4) Connect function
  const connectToAi = async () => {
    if (aiState === "connecting" || aiState === "connected") {
      console.log("[TransportProvider] Already connecting or connected");
      return;
    }

    // Instantiate our transport
    const client = new TransportClient({
      onStateChange: (newState, err) => {
        console.log("[TransportProvider] onStateChange =>", newState, err);
        setAiState(newState);
      },
      onParticipantJoined: (pid) => {
        console.log("[TransportProvider] participant joined:", pid);
      },
      onParticipantLeft: (pid) => {
        console.log("[TransportProvider] participant left:", pid);
      },
      // 4a) Capture inbound "app-message"
      onCustomMessage: (data, fromId) => {
        console.log("[TransportProvider] onCustomMessage =>", data, fromId);
        setMessages((prev) => [
          ...prev,
          {
            from: fromId ?? "unknown",
            data,
            time: Date.now()
          }
        ]);
      },
    //   onAudioTrackStarted: (participant: DailyParticipant, track: MediaStreamTrack) => {
    //     console.log("[TransportProvider] onAudioTrackStarted =>", {
    //       participant,
    //       track: {
    //         id: track.id,
    //         kind: track.kind,
    //         label: track.label,
    //         enabled: track.enabled
    //       }
    //     });
    //     console.log("[TransportProvider] onAudioTrackStarted => track info", track);
        
    //     if (!participant.local) {
    //       console.log("[TransportProvider] Calling playAudio with track");
    //       playAudio(track);       
    //     }
    //   },
    //   onAudioTrackStopped: (participant: DailyParticipant, track: MediaStreamTrack) => {
    //     console.log("[TransportProvider] onAudioTrackStopped =>", participant, track);
       
    //   }
    });

    transportRef.current = client;

    try {
      await client.connect();
    } catch (error) {
      console.error("[TransportProvider] connectToAi error:", error);
    }
  };

  // 5) Disconnect
  const disconnectAi = async () => {
    console.log("[TransportProvider] Disconnecting AI transport");
    if (transportRef.current?.dailyCall) {
        await transportRef.current.dailyCall.leave();
        await transportRef.current.dailyCall.destroy();
    }
    transportRef.current?.disconnect();
    transportRef.current = null;
    setAiState("disconnected");
    setMessages([]); // Clear messages on disconnect

    audioProcessorsRef.current.forEach((proc) => proc.disconnect());
    audioProcessorsRef.current.clear();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // 6) Send custom message
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendMessage = (data: any) => {
    if (!transportRef.current) {
      console.warn("[TransportProvider] transportRef is null, cannot send");
      return;
    }
    console.log("[TransportProvider] sendMessage =>", data);
    transportRef.current.sendAppMessage(data);
  };

  const startScreenShare = async () => {
    if (!transportRef.current) {
      console.warn("[TransportProvider] transportRef is null, cannot start screen share");
      return;
    }
    await transportRef.current.startScreenShare();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        console.log("[TransportProvider] unmount => disconnecting AI");
        if (transportRef.current?.dailyCall) {
            transportRef.current.dailyCall.leave();
            transportRef.current.dailyCall.destroy();
        }
        transportRef.current?.disconnect();
        transportRef.current = null;
        setAiState("disconnected");
        audioProcessorsRef.current.forEach((proc) => proc.disconnect());
        audioProcessorsRef.current.clear();
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
    };
  }, []);

  return (
    <DailyProvider
    callObject={transportRef.current?.dailyCall || null}>
    <DailyAudio />
    <TransportContext.Provider
      value={{
        connectToAi,
        disconnectAi, 
        sendMessage,
        aiState,
        messages,
        startScreenShare
      }}>
      {children}
    </TransportContext.Provider>
    </DailyProvider>
  );
};

export const useTransport = () => {
  const context = useContext(TransportContext);
  if (!context) {
    throw new Error("useTransport must be used within a TransportProvider");
  }
  return context;
};
