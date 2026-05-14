/**
 * WebRTC live-audio helpers.
 *
 * Signaling rides our existing `/ws/match/{id}` channel — we send messages
 * tagged `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`, and the
 * backend relays them to the other player(s). All audio media is streamed
 * peer-to-peer via the established RTCPeerConnection, not over the WS.
 *
 * Two roles: `Broadcaster` (the reciter publishing their mic) and
 * `Receiver` (the picker listening). On localhost no STUN is needed; for
 * real-internet matches we use Google's public STUN.
 */

import type { WsClient } from "./ws";


const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type SignalingMessage =
  | { type: "webrtc_offer"; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc_answer"; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc_ice_candidate"; candidate: RTCIceCandidateInit };

function isSignaling(m: unknown): m is SignalingMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    typeof (m as { type?: unknown }).type === "string" &&
    ((m as { type: string }).type === "webrtc_offer" ||
      (m as { type: string }).type === "webrtc_answer" ||
      (m as { type: string }).type === "webrtc_ice_candidate")
  );
}

/** Reciter side: publish the local mic track to the other peer. */
export class LiveAudioBroadcaster {
  private pc: RTCPeerConnection | null = null;
  private off: (() => void) | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async start(stream: MediaStream, ws: WsClient<any>): Promise<void> {
    this.stop();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;

    // Use a CLONE of each audio track. Adding the original to an
    // RTCPeerConnection can attach it to the browser's WebRTC audio
    // processing pipeline (AEC/NS tuning, codec encoder) — sometimes
    // observable as degraded MediaRecorder output on the same track.
    // Clones come from the same source device but are independent
    // consumers, so MediaRecorder keeps a clean signal.
    for (const track of stream.getAudioTracks()) {
      const clone = track.clone();
      pc.addTrack(clone, stream);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ws.sendJson({
          type: "webrtc_ice_candidate",
          candidate: e.candidate.toJSON(),
        });
      }
    };

    this.off = ws.onMessage(async (raw) => {
      if (!isSignaling(raw)) return;
      try {
        if (raw.type === "webrtc_answer" && pc.signalingState !== "stable") {
          await pc.setRemoteDescription(raw.sdp);
        } else if (raw.type === "webrtc_ice_candidate" && pc.remoteDescription) {
          await pc.addIceCandidate(raw.candidate);
        }
      } catch (e) {
        console.warn("broadcaster signaling error:", e);
      }
    });

    const offer = await pc.createOffer({ offerToReceiveAudio: false });
    await pc.setLocalDescription(offer);
    ws.sendJson({ type: "webrtc_offer", sdp: offer });
  }

  stop(): void {
    this.off?.();
    this.off = null;
    if (this.pc) {
      this.pc.getSenders().forEach((s) => {
        try {
          s.track?.stop();
        } catch {
          /* noop */
        }
      });
      this.pc.close();
      this.pc = null;
    }
  }
}

/** Picker side: listen for an offer and play the incoming remote audio. */
export class LiveAudioReceiver {
  private pc: RTCPeerConnection | null = null;
  private off: (() => void) | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  start(ws: WsClient<any>, onStream: (s: MediaStream) => void): void {
    this.stop();

    this.off = ws.onMessage(async (raw) => {
      if (!isSignaling(raw)) return;
      try {
        if (raw.type === "webrtc_offer") {
          // A new recitation started — tear down any old PC and accept.
          this.tearDownPc();
          const pc = new RTCPeerConnection(RTC_CONFIG);
          this.pc = pc;
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              ws.sendJson({
                type: "webrtc_ice_candidate",
                candidate: e.candidate.toJSON(),
              });
            }
          };
          pc.ontrack = (e) => {
            if (e.streams[0]) onStream(e.streams[0]);
          };
          await pc.setRemoteDescription(raw.sdp);
          // Flush any ICE candidates that arrived before the offer.
          for (const c of this.pendingIce.splice(0)) {
            try {
              await pc.addIceCandidate(c);
            } catch {
              /* noop */
            }
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.sendJson({ type: "webrtc_answer", sdp: answer });
        } else if (raw.type === "webrtc_ice_candidate") {
          if (this.pc && this.pc.remoteDescription) {
            await this.pc.addIceCandidate(raw.candidate);
          } else {
            this.pendingIce.push(raw.candidate);
          }
        }
      } catch (e) {
        console.warn("receiver signaling error:", e);
      }
    });
  }

  private tearDownPc() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.pendingIce = [];
  }

  stop(): void {
    this.off?.();
    this.off = null;
    this.tearDownPc();
  }
}
