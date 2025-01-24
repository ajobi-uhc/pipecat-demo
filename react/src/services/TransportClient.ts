import DailyIframe, {
    DailyCall,
    DailyEventObjectAppMessage,
    DailyEventObjectFatalError,
    DailyEventObjectParticipant,
    DailyEventObjectParticipantLeft,
    DailyEventObjectTrack,
    DailyParticipant
} from "@daily-co/daily-js";

import { ApiClient } from "./ApiClient";
import { logger } from "./logger";


/** Transport states for quick reference */
export type AiTransportState =
    | "idle"          // not yet initialized
    | "connecting"    // handshake or joining in progress
    | "connected"     // local user + AI are in the call
    | "disconnected"  // no call or left the call
    | "error";        // error state

/** Callbacks for reacting to track events, participants, custom messages, etc. */
export interface AiDailyTransportCallbacks {
    onStateChange?: (state: AiTransportState, error?: string) => void;
    onTrackStarted?: (participant: DailyParticipant, track: MediaStreamTrack) => void;
    onTrackStopped?: (participant: DailyParticipant, track: MediaStreamTrack) => void;
    onParticipantJoined?: (participant: DailyParticipant) => void;
    onParticipantLeft?: (participant: DailyParticipant) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onCustomMessage?: (data: any, fromParticipant?: string) => void;
    onAudioTrackStarted?: (participant: DailyParticipant, track: MediaStreamTrack) => void;
    onVideoTrackStarted?: (participant: DailyParticipant, track: MediaStreamTrack) => void;
    onAudioTrackStopped?: (participant: DailyParticipant, track: MediaStreamTrack) => void;
    onVideoTrackStopped?: (participant: DailyParticipant, track: MediaStreamTrack) => void;
}

/**
 * The main transport class:
 * 1) Calls your server's connectToAi(...) to get dailyUrl & dailyToken
 * 2) Creates a Daily call object & joins the call
 * 3) Only transitions to "connected" once the AI participant has joined
 */
export class TransportClient {
    private static activeInstance: TransportClient | null = null;
    public dailyCall: DailyCall | null = null;
    private state: AiTransportState = "idle";

    // Stored from the server
    private dailyUrl: string | undefined = undefined;
    private dailyToken: string | undefined = undefined;

    // The local user is "joined" to Daily if we get the "joined-meeting" event
    private localJoined: boolean = false;
    // The AI is "joined" once we see its participant
    private aiJoined: boolean = false;

    constructor(
        private callbacks: AiDailyTransportCallbacks = {}
    ) {
        // Clean up any existing instance before creating a new one
        if (TransportClient.activeInstance) {
            TransportClient.activeInstance.disconnect();
        }
        TransportClient.activeInstance = this;
    }

    public static cleanup() {
        if (TransportClient.activeInstance) {
            TransportClient.activeInstance.disconnect();
            TransportClient.activeInstance = null;
        }
    }

    /** 
     * (Optional) If you have a separate init step that just calls your server 
     * for dailyUrl/dailyToken, you can do it here. 
     * Otherwise, you can do that inline in `connect()`.
     */
    public async init(): Promise<void> {
        // Not used in this example
        throw new Error("Not implemented");
    }

    /**
     * 1) Call your server to get daily_url, daily_token, machine_id, etc.
     * 2) Create the Daily call object and join the call
     * 3) Signal the AI pipeline to join as well (so the AI participant appears)
     * 4) We'll only set 'connected' after the AI participant actually joins
     */
    public async connect(): Promise<void> {
        this.setState("connecting");
        try {
            // First, explicitly request microphone permissions
            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            const result = await ApiClient.connectToAi();
            
            this.dailyUrl = result.daily_url;
            this.dailyToken = result.daily_token;

            if (!this.dailyUrl || !this.dailyToken) {
                throw new Error("Failed to get daily_url or daily_token");
            }

            // Ensure any existing Daily instances are cleaned up globally
            if (this.dailyCall) {
                await this.dailyCall.leave();
                await this.dailyCall.destroy();
                this.dailyCall = null;
            }

            // Create Daily call with just audio initially
            this.dailyCall = DailyIframe.createCallObject({
                url: this.dailyUrl,
                token: this.dailyToken,
                audioSource: audioStream.getAudioTracks()[0],
                subscribeToTracksAutomatically: true,
            });

            this.setupDailyEvents(this.dailyCall);
            
            await this.dailyCall.join();
            await this.dailyCall.setLocalAudio(true);
            
            await ApiClient.connectToAiPool(
                this.dailyUrl,
                this.dailyToken
            );

        } catch (err: unknown) {
            logger.error("[TransportClient] connect failed:", err);
            this.setState("error", (err as Error).message);
            throw err;
        }
    }

    public startScreenShare(): void {
        if (!this.dailyCall) return;

        try {
            // const screenStream = await navigator.mediaDevices.getDisplayMedia({
            //     video: {
            //         displaySurface: 'monitor'
            //     },
            //     audio: false
            // });

            // // Handle screen share stop from browser UI
            // screenStream.getVideoTracks()[0].addEventListener('ended', () => {
            //     this.handleScreenShareStopped();
            // });

            this.dailyCall.startScreenShare();
            logger.info("[TransportClient] Screen share started successfully");
        } catch (err) {
            if (err instanceof Error && err.name === 'NotAllowedError') {
                logger.info("[TransportClient] User denied screen share permission");
            } else {
                throw err;
            }
        }
    }

    public async stopScreenShare(): Promise<void> {
        if (!this.dailyCall) return;

        this.dailyCall.stopScreenShare();
    }

    /**
     * 2) If we do .disconnect(), we leave/destroy the Daily call.
     */
    public disconnect(): void {
        try {
            if (this.dailyCall) {
                // First leave the call
                this.dailyCall.leave();
                // Then destroy the call object
                this.dailyCall.destroy();
                this.dailyCall = null;
            }
            // Reset state variables
            this.localJoined = false;
            this.aiJoined = false;
            this.dailyUrl = undefined;
            this.dailyToken = undefined;
            this.setState("disconnected");
        } catch (err) {
            logger.error("[TransportClient] error on disconnect:", err);
        }
    }

    /**
     * 3) Optionally, send app messages if you want custom instructions
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public sendAppMessage(data: any) {
        if (!this.dailyCall) {
            logger.warn("[TransportClient] can't send message - dailyCall null");
            return;
        }
        const data_json = JSON.stringify(data);
        this.dailyCall.sendAppMessage(data_json);
    }

    /** 
     * Utility: we only become "connected" if localJoined = true && aiJoined = true
     */
    private maybeSetConnectedState() {
        if (this.localJoined && this.aiJoined) {
            this.setState("connected");
            logger.info("[TransportClient] AI is connected!");
        }
    }

    /**
     * 4) Register event handlers for track start/stop, participant join/leave, etc.
     *    We'll detect local "joined-meeting" & AI participant join here.
     */
    private setupDailyEvents(call: DailyCall) {
        // (A) "joined-meeting" => local user has fully joined
        //     We do NOT set the transport state to "connected" yet,
        //     because the AI might not be there. 
        call.on("joined-meeting", () => {
            logger.info("[TransportClient] local user joined meeting");
            this.localJoined = true;
            // Check if AI is also joined
            this.maybeSetConnectedState();
        });

        // (B) participant events
        call.on("participant-joined", (ev: DailyEventObjectParticipant) => {
            const p = ev.participant;
            logger.info("[TransportClient] participant joined:", p, p.user_name);
            // log call.getParticipants()
            console.log("[TransportClient] participants:", call.participants());
            // If you want to track a specific userName or userId for AI, do so here:
            if (!p.local) {
                // Example logic: if the server sets p.user_name === "AI Bot" or something:
                if (this.isAiParticipant(p)) {
                    logger.info("[TransportClient] recognized AI participant joined:", p.user_name);
                    this.aiJoined = true;
                    // If local is joined, set connected
                    this.maybeSetConnectedState();
                }
            }
            this.callbacks.onParticipantJoined?.(p);
        });

        call.on("participant-left", (ev: DailyEventObjectParticipantLeft) => {
            const p = ev.participant;
            logger.info("[TransportClient] participant left:", p, p.user_name);
            // If AI left, you might want to set state back to connecting or something
            if (this.isAiParticipant(p)) {
                this.aiJoined = false;
            }
            this.callbacks.onParticipantLeft?.(p);
        });

        // (C) track events
        call.on("track-started", (ev: DailyEventObjectTrack) => {
            const { participant, track } = ev;
            if (participant && track) {
                console.log("[TransportClient] track-started", participant, track.kind, "is local:", participant.local);
                if (track.kind === 'audio') {
                    this.callbacks.onAudioTrackStarted?.(participant, track);
                } else if (track.kind === 'video') {
                    this.callbacks.onVideoTrackStarted?.(participant, track);
                }
                this.callbacks.onTrackStarted?.(participant, track);
            }
        });

        call.on("track-stopped", (ev: DailyEventObjectTrack) => {
            const { participant, track } = ev;
            if (participant && track) {
                console.log("[TransportClient] track-stopped", participant, track.kind, "is local:", participant.local);
                if (track.kind === 'audio') {
                    this.callbacks.onAudioTrackStopped?.(participant, track);
                } else if (track.kind === 'video') {
                    this.callbacks.onVideoTrackStopped?.(participant, track);
                }
                this.callbacks.onTrackStopped?.(participant, track);
            }
        });

        // (D) custom messages
        call.on("app-message", (ev: DailyEventObjectAppMessage) => {
            const { data, fromId } = ev;
            this.callbacks.onCustomMessage?.(data, fromId);
        });

        // (E) errors
        call.on("error", (ev: DailyEventObjectFatalError) => {
            logger.error("[TransportClient] daily error:", ev.errorMsg);
            this.setState("error", ev.errorMsg);
        });

        call.on('local-screen-share-started', (event) => {
            logger.info("[TransportClient] Screen share started:", event);
            // You can add a callback here if needed
        });
    }

    /**
     * A simple placeholder for identifying the AI participant. 
     * Adjust logic if your server sets user_id or user_name or userData differently.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isAiParticipant(participant: any): boolean {
        // Example: if the server sets `user_name === 'AI Bot'`
        // or if there's a property participant.owner or participant.userData.ai === true
        // Adjust as needed:
        return participant.user_name
    }

    /** Helper to unify setting state + calling the onStateChange callback. */
    private setState(newState: AiTransportState, error?: string) {
        this.state = newState;
        this.callbacks.onStateChange?.(newState, error);
    }

    /** If you want external code to see the current state. */
    public getState(): AiTransportState {
        return this.state;
    }
}
