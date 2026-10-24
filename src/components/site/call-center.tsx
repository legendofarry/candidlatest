import { useEffect, useMemo, useRef, useState } from "react";
import { onChildAdded, onValue, push, ref, type DataSnapshot } from "firebase/database";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, Phone, PhoneOff, Speaker, Video, VideoOff, RefreshCw, UserPlus, Check, X } from "lucide-react";
import { firebaseRealtimeDb } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/useAuth";
import { startCall, respondToCall, approveCallJoin, cancelCallJoinRequest, inviteToCall, finishCall, heartbeatCall } from "@/lib/calls.functions";
import { notify } from "@/lib/notifications-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Member = { status: "active" | "invited" };
type CallMeta = { id: string; creator_id: string; media: "audio" | "video"; status: "ringing" | "active" | "ended"; members: Record<string, Member> };
type JoinRequest = { user_id: string; username: string; requested_at: string };

export function requestConversationCall(conversationId: string, media: "audio" | "video") {
  window.dispatchEvent(new CustomEvent("candid:start-call", { detail: { conversationId, media } }));
}

export function CallCenter() {
  const { user } = useAuth();
  const start = useServerFn(startCall);
  const respond = useServerFn(respondToCall);
  const finish = useServerFn(finishCall);
  const approve = useServerFn(approveCallJoin);
  const cancelRequest = useServerFn(cancelCallJoinRequest);
  const invite = useServerFn(inviteToCall);
  const heartbeat = useServerFn(heartbeatCall);
  const [userCalls, setUserCalls] = useState<Record<string, "active" | "invited">>({});
  const [waitingCallId, setWaitingCallId] = useState<string | null>(null);
  const [meta, setMeta] = useState<CallMeta | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [inviteName, setInviteName] = useState("");
  const [busy, setBusy] = useState(false);
  const [startingMedia, setStartingMedia] = useState<"audio" | "video">("audio");

  useEffect(() => {
    if (!user || !firebaseRealtimeDb) { setUserCalls({}); return; }
    return onValue(ref(firebaseRealtimeDb, `user_calls/${user.uid}`), (snapshot) => {
      const next = (snapshot.val() as Record<string, "active" | "invited"> | null) ?? {};
      setUserCalls(next);
    });
  }, [user?.uid]);

  const trackedCallId = useMemo(() => {
    const entries = Object.entries(userCalls);
    return entries.find(([, state]) => state === "active")?.[0]
      ?? entries.find(([, state]) => state === "invited")?.[0];
  }, [userCalls, waitingCallId]);

  useEffect(() => {
    if (!firebaseRealtimeDb || !trackedCallId) { setMeta(null); setRequests([]); return; }
    const stopMeta = onValue(ref(firebaseRealtimeDb, `call_rooms/${trackedCallId}/meta`), (snapshot) => {
      setMeta(snapshot.val() as CallMeta | null);
      if (snapshot.child("status").val() === "ended") setWaitingCallId(null);
    });
    return () => stopMeta();
  }, [trackedCallId]);

  useEffect(() => {
    if (!firebaseRealtimeDb || !user || !trackedCallId || meta?.creator_id !== user.uid) { setRequests([]); return; }
    return onValue(ref(firebaseRealtimeDb, `call_rooms/${trackedCallId}/join_requests`), (snapshot) => {
      const value = snapshot.val() as Record<string, JoinRequest> | null;
      setRequests(Object.values(value ?? {}));
    });
  }, [trackedCallId, meta?.creator_id, user?.uid]);

  useEffect(() => {
    if (!user || !trackedCallId || meta?.status !== "active" || meta.members?.[user.uid]?.status !== "active") return;
    let disposed = false;
    const sendHeartbeat = () => {
      if (!disposed) void heartbeat({ data: { call_id: trackedCallId } }).catch(() => undefined);
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [heartbeat, meta?.status, meta?.members?.[user?.uid ?? ""]?.status, trackedCallId, user?.uid]);

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId: string; media: "audio" | "video" }>).detail;
      if (!detail?.conversationId || !detail.media) return;
      setStartingMedia(detail.media);
      setBusy(true);
      void start({ data: { conversation_id: detail.conversationId, media: detail.media } })
        .then((result) => {
          if (result.state === "join_requested") {
            setWaitingCallId(result.call_id);
            notify.success("Join request sent to the call creator.");
          }
        })
        .catch((error: unknown) => notify.error(error instanceof Error ? error.message : "Could not start the call."))
        .finally(() => setBusy(false));
    };
    window.addEventListener("candid:start-call", onStart);
    return () => window.removeEventListener("candid:start-call", onStart);
  }, [start]);

  if (!user) return null;
  const myStatus = meta?.members?.[user.uid]?.status;
  const invitation = myStatus === "invited";
  const waiting = Boolean(waitingCallId && !userCalls[waitingCallId]);
  const active = myStatus === "active" && meta?.status !== "ended";

  async function acceptOrDecline(response: "accept" | "decline") {
    setBusy(true);
    try {
      await respond({ data: { call_id: trackedCallId!, response } });
      if (response === "decline") setWaitingCallId(null);
    } catch (error) { notify.error(error instanceof Error ? error.message : "Could not respond to the call."); }
    finally { setBusy(false); }
  }

  async function cancelWaitingRequest() {
    if (!waitingCallId) return;
    setBusy(true);
    try {
      await cancelRequest({ data: { call_id: waitingCallId } });
      setWaitingCallId(null);
    } catch (error) { notify.error(error instanceof Error ? error.message : "Could not cancel the join request."); }
    finally { setBusy(false); }
  }

  async function inviteParticipant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await invite({ data: { call_id: trackedCallId!, username: inviteName } });
      setInviteName("");
      notify.success("Call invitation sent.");
    } catch (error) { notify.error(error instanceof Error ? error.message : "Could not invite that account."); }
    finally { setBusy(false); }
  }

  async function approveParticipant(userId: string) {
    try { await approve({ data: { call_id: trackedCallId!, requester_id: userId } }); notify.success("Invitation sent."); }
    catch (error) { notify.error(error instanceof Error ? error.message : "Could not approve that request."); }
  }

  return (
    <>
      <Dialog open={invitation || waiting} onOpenChange={(open) => { if (!open && waiting) setWaitingCallId(null); }}>
        <DialogContent className="fixed inset-x-0 bottom-0 top-auto left-0 z-[180] w-full max-w-none translate-x-0 translate-y-0 rounded-t-3xl border-border bg-background p-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle>{waiting ? "Join request sent" : meta?.media === "video" ? "Video call invitation" : "Voice call invitation"}</DialogTitle>
            <DialogDescription>{waiting ? "The call creator will decide whether to let you join." : "You have been invited to join a Candid call."}</DialogDescription>
          </DialogHeader>
          {invitation ? <div className="flex gap-3"><Button className="flex-1" disabled={busy} onClick={() => void acceptOrDecline("accept")}><Phone className="size-4" /> Join call</Button><Button className="flex-1" variant="outline" disabled={busy} onClick={() => void acceptOrDecline("decline")}><PhoneOff className="size-4" /> Decline</Button></div> : null}
          {waiting ? <Button variant="outline" className="w-full" disabled={busy} onClick={() => void cancelWaitingRequest()}>Cancel request</Button> : null}
        </DialogContent>
      </Dialog>
      {active && trackedCallId && meta ? <CallRoom
        key={trackedCallId}
        callId={trackedCallId}
        userId={user.uid}
        meta={meta}
        requests={requests}
        initialMedia={startingMedia}
        onApprove={approveParticipant}
        onInvite={inviteParticipant}
        inviteName={inviteName}
        setInviteName={setInviteName}
        onHangup={async () => {
          setBusy(true);
          try { await finish({ data: { call_id: trackedCallId } }); }
          catch (error) { notify.error(error instanceof Error ? error.message : "Could not end the call."); }
          finally { setBusy(false); }
        }}
      /> : null}
    </>
  );
}

function CallRoom({
  callId, userId, meta, requests, initialMedia, onApprove, onInvite, inviteName, setInviteName, onHangup,
}: {
  callId: string; userId: string; meta: CallMeta; requests: JoinRequest[]; initialMedia: "audio" | "video";
  onApprove: (id: string) => void; onInvite: (event: React.FormEvent<HTMLFormElement>) => void;
  inviteName: string; setInviteName: (name: string) => void; onHangup: () => void;
}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(meta.media !== "video");
  const [speaker, setSpeaker] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [mediaError, setMediaError] = useState("");
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnections = useRef(new Map<string, RTCPeerConnection>());
  const remoteVideoRefs = useRef(new Map<string, HTMLVideoElement | null>());
  const remoteAudioRefs = useRef(new Map<string, HTMLAudioElement | null>());
  const effectiveMedia = meta.media ?? initialMedia;
  const activePeerIds = useMemo(() => Object.entries(meta.members ?? {}).filter(([id, member]) => id !== userId && member.status === "active").map(([id]) => id).sort(), [meta.members, userId]);

  useEffect(() => {
    if (!firebaseRealtimeDb) { setMediaError("Realtime Database is not configured for calls."); return; }
    let mounted = true;
    let local: MediaStream | null = null;
    let signalLocalReady = () => {};
    const localReady = new Promise<void>((resolve) => { signalLocalReady = resolve; });
    const connections = peerConnections.current;
    const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
    const applyPendingCandidates = async (peerId: string, pc: RTCPeerConnection) => {
      const queued = pendingCandidates.get(peerId) ?? [];
      pendingCandidates.delete(peerId);
      for (const candidate of queued) {
        try { await pc.addIceCandidate(candidate); } catch { /* stale candidate during reconnect */ }
      }
    };
    const signal = (peerId: string, kind: "offer" | "answer" | "candidate", payload: unknown) => {
      const target = push(ref(firebaseRealtimeDb, `call_rooms/${callId}/signals/${userId}/${peerId}/${kind}`));
      return import("firebase/database").then(({ set }) => set(target, payload));
    };
    const createPeer = (peerId: string) => {
      const existing = connections.get(peerId);
      if (existing) return existing;
      const iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
      const turnUrl = import.meta.env["VITE_TURN_SERVER_URL"] as string | undefined;
      const turnUsername = import.meta.env["VITE_TURN_USERNAME"] as string | undefined;
      const turnCredential = import.meta.env["VITE_TURN_CREDENTIAL"] as string | undefined;
      if (turnUrl && turnUsername && turnCredential) iceServers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
      const pc = new RTCPeerConnection({ iceServers });
      connections.set(peerId, pc);
      for (const track of local?.getTracks() ?? []) pc.addTrack(track, local!);
      pc.onicecandidate = (event) => { if (event.candidate) void signal(peerId, "candidate", event.candidate.toJSON()); };
      pc.ontrack = (event) => {
        const remote = event.streams[0];
        if (!remote || !mounted) return;
        setRemoteStreams((current) => ({ ...current, [peerId]: remote }));
        const video = remoteVideoRefs.current.get(peerId);
        if (video) { video.srcObject = remote; video.muted = !speaker; }
      };
      return pc;
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("This browser cannot access a microphone or camera. Use a secure connection in a supported browser.");
    } else void navigator.mediaDevices.getUserMedia({ audio: true, video: effectiveMedia === "video" ? { facingMode } : false })
      .then((mediaStream) => {
        if (!mounted) { mediaStream.getTracks().forEach((track) => track.stop()); return; }
        local = mediaStream;
        signalLocalReady();
        setStream(mediaStream);
        if (localVideoRef.current) localVideoRef.current.srcObject = mediaStream;
      })
      .catch((error: unknown) => setMediaError(error instanceof Error ? error.message : "Camera or microphone permission was denied."));

    const unsubscribers: Array<() => void> = [];
    for (const peerId of activePeerIds) {
      const offerInbox = ref(firebaseRealtimeDb, `call_rooms/${callId}/signals/${peerId}/${userId}/offer`);
      const answerInbox = ref(firebaseRealtimeDb, `call_rooms/${callId}/signals/${peerId}/${userId}/answer`);
      const candidateInbox = ref(firebaseRealtimeDb, `call_rooms/${callId}/signals/${peerId}/${userId}/candidate`);
      unsubscribers.push(onChildAdded(offerInbox, async (snapshot: DataSnapshot) => {
        try {
          await localReady;
          const pc = createPeer(peerId);
          const offer = snapshot.val() as RTCSessionDescriptionInit;
          if (pc.remoteDescription) return;
          await pc.setRemoteDescription(offer);
          await applyPendingCandidates(peerId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await signal(peerId, "answer", answer.toJSON());
        } catch (error) { setMediaError(error instanceof Error ? error.message : "Could not connect the call."); }
      }));
      unsubscribers.push(onChildAdded(answerInbox, async (snapshot: DataSnapshot) => {
        const pc = connections.get(peerId);
        if (!pc || pc.remoteDescription) return;
        try {
          await pc.setRemoteDescription(snapshot.val() as RTCSessionDescriptionInit);
          await applyPendingCandidates(peerId, pc);
        }
        catch (error) { setMediaError(error instanceof Error ? error.message : "Could not connect the call."); }
      }));
      unsubscribers.push(onChildAdded(candidateInbox, async (snapshot: DataSnapshot) => {
        const pc = connections.get(peerId);
        const candidate = snapshot.val() as RTCIceCandidateInit;
        if (!pc || !pc.remoteDescription) {
          const queue = pendingCandidates.get(peerId) ?? [];
          queue.push(candidate);
          pendingCandidates.set(peerId, queue);
          return;
        }
        try { await pc.addIceCandidate(candidate); } catch { /* stale candidate during a reconnect */ }
      }));
    }

    let offerTimer: number | null = null;
    const maybeOffer = () => {
      if (!local) { offerTimer = window.setTimeout(maybeOffer, 200); return; }
      for (const peerId of activePeerIds) {
        if (userId.localeCompare(peerId) >= 0 || connections.has(peerId)) continue;
        void (async () => {
          try {
            const pc = createPeer(peerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await signal(peerId, "offer", offer.toJSON());
          } catch (error) { setMediaError(error instanceof Error ? error.message : "Could not start the call."); }
        })();
      }
    };
    maybeOffer();

    return () => {
      mounted = false;
      if (offerTimer !== null) window.clearTimeout(offerTimer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      connections.forEach((pc) => pc.close());
      connections.clear();
      local?.getTracks().forEach((track) => track.stop());
      setStream(null);
    };
  }, [callId, userId, activePeerIds.join("|"), effectiveMedia]);

  useEffect(() => { if (localVideoRef.current && stream) localVideoRef.current.srcObject = stream; }, [stream]);

  function toggleMute() {
    stream?.getAudioTracks().forEach((track) => { track.enabled = muted; });
    setMuted(!muted);
  }
  function toggleCamera() {
    const nextOff = !cameraOff;
    stream?.getVideoTracks().forEach((track) => { track.enabled = !nextOff; });
    setCameraOff(nextOff);
  }
  async function switchCamera() {
    setSwitchingCamera(true);
    const nextFacing = facingMode === "user" ? "environment" : "user";
    try {
      const replacementStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing }, audio: false });
      const replacement = replacementStream.getVideoTracks()[0];
      if (!replacement) throw new Error("No camera was found.");
      const previous = stream?.getVideoTracks()[0];
      for (const pc of peerConnections.current.values()) {
        const sender = pc.getSenders().find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(replacement);
      }
      previous?.stop();
      const nextStream = new MediaStream([...(stream?.getAudioTracks() ?? []), replacement]);
      setStream(nextStream);
      if (localVideoRef.current) localVideoRef.current.srcObject = nextStream;
      setFacingMode(nextFacing);
      setCameraOff(false);
    } catch (error) { notify.error(error instanceof Error ? error.message : "Could not switch camera."); }
    finally { setSwitchingCamera(false); }
  }

  function toggleSpeaker() {
    const next = !speaker;
    void navigator.mediaDevices.enumerateDevices().then(async (devices) => {
      const outputs = devices.filter((device) => device.kind === "audiooutput");
      const speakerOutput = outputs.find((device) => /speaker|built.?in output/i.test(device.label));
      const earpieceOutput = outputs.find((device) => /earpiece|headset|headphone|communications/i.test(device.label));
      const target = next ? speakerOutput : earpieceOutput;
      const mediaElements: HTMLMediaElement[] = [
        ...[...remoteVideoRefs.current.values()].filter((element): element is HTMLVideoElement => Boolean(element)),
        ...[...remoteAudioRefs.current.values()].filter((element): element is HTMLAudioElement => Boolean(element)),
      ];
      const setSinkId = (element: HTMLMediaElement & { setSinkId?: (sinkId: string) => Promise<void> }) => element.setSinkId;
      if (!target || mediaElements.length === 0 || mediaElements.some((element) => !setSinkId(element))) {
        notify.error("This browser controls call audio output from your device’s sound settings.");
        return;
      }
      await Promise.all(mediaElements.map((element) => setSinkId(element)!.call(element, target.deviceId)));
      setSpeaker(next);
    }).catch(() => notify.error("Could not switch call audio output."));
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) void onHangup(); }}>
      <DialogContent className="fixed inset-0 z-[190] flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-zinc-950 p-0 text-white sm:left-1/2 sm:top-1/2 sm:h-[min(92dvh,900px)] sm:max-h-[92dvh] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:border-white/10" hideCloseButton>
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b border-white/10 px-4 py-3 text-left sm:px-6">
          <div><DialogTitle className="text-white">{meta.media === "video" ? "Video call" : "Voice call"}</DialogTitle><DialogDescription className="text-white/60">{meta.status === "ringing" ? "Calling…" : `${activePeerIds.length + 1} people in this call`}</DialogDescription></div>
          <Button variant="ghost" size="icon" onClick={() => void onHangup()} aria-label="End call" className="text-white hover:bg-white/10"><X className="size-5" /></Button>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {mediaError ? <p role="alert" className="mb-3 rounded-xl bg-red-950/70 p-3 text-sm text-red-100">{mediaError}</p> : null}
          <div className="grid min-h-full auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activePeerIds.map((peerId) => (
              <div key={peerId} className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-2xl bg-zinc-900">
                {meta.media === "video" ? <video ref={(element) => { remoteVideoRefs.current.set(peerId, element); if (element && remoteStreams[peerId]) element.srcObject = remoteStreams[peerId]; }} autoPlay playsInline className="size-full object-contain" /> : <audio ref={(element) => { remoteAudioRefs.current.set(peerId, element); if (element && remoteStreams[peerId]) element.srcObject = remoteStreams[peerId]; }} autoPlay />}
                {!remoteStreams[peerId] ? <span className="text-sm text-white/60">Connecting…</span> : null}
                <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs">Participant</span>
              </div>
            ))}
            {meta.media === "video" ? <div className="relative min-h-40 overflow-hidden rounded-2xl bg-zinc-900"><video ref={localVideoRef} autoPlay playsInline muted className="size-full object-cover" />{cameraOff ? <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-white/60"><VideoOff className="size-8" /></div> : null}<span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs">You</span></div> : null}
          </div>
          {meta.creator_id === userId ? <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
            <form onSubmit={(event) => void onInvite(event)} className="flex gap-2"><Input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Invite by username" className="border-white/15 bg-white/5 text-white placeholder:text-white/50" /><Button type="submit" disabled={!inviteName.trim()}><UserPlus className="size-4" /> Invite</Button></form>
            {requests.map((request) => <div key={request.user_id} className="flex items-center gap-3 text-sm"><span className="flex-1">@{request.username} wants to join</span><Button size="sm" onClick={() => onApprove(request.user_id)}><Check className="size-4" /> Approve</Button></div>)}
          </div> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:gap-4">
          <Button variant="outline" size="icon" onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"} className="size-12 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/20">{muted ? <MicOff /> : <Mic />}</Button>
          <Button variant="outline" size="icon" onClick={toggleSpeaker} aria-label={speaker ? "Use earpiece" : "Use speaker"} className="size-12 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/20"><Speaker /></Button>
          {meta.media === "video" ? <>
            <Button variant="outline" size="icon" onClick={toggleCamera} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"} className="size-12 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/20">{cameraOff ? <VideoOff /> : <Video />}</Button>
            <Button variant="outline" size="icon" disabled={switchingCamera} onClick={() => void switchCamera()} aria-label="Switch camera" className="size-12 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/20"><RefreshCw className={switchingCamera ? "animate-spin" : ""} /></Button>
          </> : null}
          <Button variant="destructive" size="icon" onClick={() => void onHangup()} aria-label="End call" className="size-14 rounded-full"><PhoneOff /></Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
