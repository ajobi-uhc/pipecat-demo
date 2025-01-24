"use client";

import React, { createContext, useContext, useRef, PropsWithChildren } from "react";
import { useLive2D } from "../hooks/useLive2DModel";

type Live2DContextValue = {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  playAudio: (audioData: any) => Promise<void>;
  isTalking: boolean;
};

const Live2DContext = createContext<Live2DContextValue | null>(null);

export const Live2DProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { playAudio, isTalking } = useLive2D(canvasRef);

  return (
    <Live2DContext.Provider value={{ canvasRef, playAudio, isTalking }}>
      <div className="relative w-full h-full">
        <canvas 
          ref={canvasRef} 
          className="w-full h-full"
        />
        {children}
      </div>
    </Live2DContext.Provider>
  );
};

export const useLive2DContext = () => {
  const context = useContext(Live2DContext);
  if (!context) {
    throw new Error("useLive2DContext must be used within a Live2DProvider");
  }
  return context;
};
