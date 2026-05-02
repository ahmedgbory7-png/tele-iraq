import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/firebase';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  collection, 
  addDoc, 
  serverTimestamp, 
  setDoc, 
  getDoc, 
  getDocs,
  query,
  where,
  limit
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Phone, 
  Video, 
  X, 
  Camera, 
  Mic, 
  MicOff, 
  VideoOff, 
  PhoneOff,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Activity,
  Wifi,
  WifiOff,
  Signal,
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useStore } from '@/store/useStore';
import { OUTGOING_CALL_URL } from '@/constants';

interface CallSystemProps {
  chatId: string;
  currentUser: any;
  otherProfile: any;
  type: 'voice' | 'video';
  isCaller: boolean;
  callId: string;
  onEnd: () => void;
}

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export default function CallSystem({ chatId, currentUser, otherProfile, type, isCaller, callId, onEnd }: CallSystemProps) {
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'calling' | 'active' | 'ended'>('calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'voice');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDocPath, setCallDocPath] = useState<string | null>(callId || null);
  const [quality, setQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('excellent');
  const [latency, setLatency] = useState<number | null>(null);
  const [packetLoss, setPacketLoss] = useState<number>(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const candidateQueue = useRef<RTCIceCandidate[]>([]);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let playPromise: Promise<void> | null = null;
    let audio: HTMLAudioElement | null = null;

    if (status === 'calling' && isCaller) {
      if (!ringtoneRef.current) {
        audio = new Audio(OUTGOING_CALL_URL);
        audio.loop = true;
        ringtoneRef.current = audio;
        playPromise = audio.play();
        playPromise.catch(e => {
          if (e.name !== 'AbortError') {
             console.error("Dialing tone error:", e);
          }
        });
      }
    } else {
      if (ringtoneRef.current) {
        const ref = ringtoneRef.current;
        if (playPromise) {
          playPromise.then(() => ref.pause()).catch(() => {});
        } else {
          ref.pause();
        }
        ringtoneRef.current = null;
      }
    }
    return () => {
      if (ringtoneRef.current) {
        const ref = ringtoneRef.current;
        if (playPromise) {
          playPromise.then(() => ref.pause()).catch(() => {});
        } else {
          ref.pause();
        }
        ringtoneRef.current = null;
      }
    };
  }, [status, isCaller]);

  useEffect(() => {
    const initializeCall = async () => {
      try {
        const peerConnection = new RTCPeerConnection(servers);
        
        // Always request video if possible to allow smooth transition, 
        // but we'll disable the track immediately if it's a voice call
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        });

        // If it's a voice call, disable video tracks initially
        if (type === 'voice') {
          stream.getVideoTracks().forEach(track => {
            track.enabled = false;
          });
          setIsVideoOff(true);
        } else {
          setIsVideoOff(false);
        }

        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        peerConnection.ontrack = (event) => {
          const [remoteStream] = event.streams;
          setRemoteStream(remoteStream);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          setStatus('active');
        };

        setPc(peerConnection);

        if (isCaller) {
          const callDoc = doc(collection(db, 'calls'));
          setCallDocPath(callDoc.id);
          
          const callerCandidatesCollection = collection(callDoc, 'callerCandidates');
          const receiverCandidatesCollection = collection(callDoc, 'receiverCandidates');

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Adding local ICE candidate to Firestore");
            addDoc(callerCandidatesCollection, event.candidate.toJSON());
          }
        };

        const offerDescription = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offerDescription);
        console.log("Offer created and set as local description");

        const offer = {
          sdp: offerDescription.sdp,
          type: offerDescription.type,
        };

        await setDoc(callDoc, { 
          offer, 
          callerId: currentUser.uid, 
          receiverId: otherProfile.uid,
          chatId,
          type,
          status: 'calling',
          createdAt: serverTimestamp() 
        });

        onSnapshot(callDoc, (snapshot) => {
          const data = snapshot.data();
          if (!peerConnection.currentRemoteDescription && data?.answer) {
            console.log("Answer received, setting remote description");
            const answerDescription = new RTCSessionDescription(data.answer);
            peerConnection.setRemoteDescription(answerDescription).then(() => {
              console.log("Remote description set, processing queued candidates:", candidateQueue.current.length);
              candidateQueue.current.forEach(c => peerConnection.addIceCandidate(c).catch(e => console.error("Error adding queued candidate", e)));
              candidateQueue.current = [];
            }).catch(e => console.error("Error setting remote description", e));
          }
          if (data?.status === 'ended' || data?.status === 'rejected') {
            onEnd();
          }
        });

        onSnapshot(receiverCandidatesCollection, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data();
              console.log("New receiver ICE candidate added");
              const candidate = new RTCIceCandidate(data);
              if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                peerConnection.addIceCandidate(candidate).catch(e => console.error("Error adding candidate", e));
              } else {
                candidateQueue.current.push(candidate);
              }
            }
          });
        });
      } else if (callId) {
        const callDoc = doc(db, 'calls', callId);
        const callerCandidatesCollection = collection(callDoc, 'callerCandidates');
        const receiverCandidatesCollection = collection(callDoc, 'receiverCandidates');

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Adding local receiver ICE candidate to Firestore");
            addDoc(receiverCandidatesCollection, event.candidate.toJSON());
          }
        };

        const callSnapshot = await getDoc(callDoc);
        const data = callSnapshot.data();
        if (!data || !data.offer) {
          console.error("No offer found in call doc");
          return;
        }

        console.log("Offer found, setting remote description");
        const offerDescription = data.offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

        const answerDescription = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answerDescription);
        console.log("Answer created and set as local description");

        const answer = {
          type: answerDescription.type,
          sdp: answerDescription.sdp,
        };

        await updateDoc(callDoc, { answer, status: 'active' });

        onSnapshot(callerCandidatesCollection, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data();
              console.log("New caller ICE candidate added");
              const candidate = new RTCIceCandidate(data);
              if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                peerConnection.addIceCandidate(candidate).catch(e => console.error("Error adding candidate", e));
              } else {
                candidateQueue.current.push(candidate);
              }
            }
          });
        });

          onSnapshot(callDoc, (snapshot) => {
            const status = snapshot.data()?.status;
            if (status === 'ended' || status === 'rejected') {
              onEnd();
            }
          });
        }
      } catch (err) {
        console.error("Call initialization error:", err);
        onEnd();
      }
    };

    initializeCall();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (pc) {
        pc.close();
      }
    };
  }, [callId, isCaller]);

  useEffect(() => {
    if (status !== 'active' || !pc) return;

    const interval = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let currentRTT = null;
        let packetsLostCount = 0;
        let totalPacketsReceived = 0;

        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            currentRTT = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : null;
          }
          if (report.type === 'inbound-rtp') {
            packetsLostCount += report.packetsLost || 0;
            totalPacketsReceived += (report.packetsReceived || 0) + (report.packetsLost || 0);
          }
        });

        if (currentRTT !== null) {
          setLatency(Math.round(currentRTT));
        }

        const lossRatio = totalPacketsReceived > 0 ? (packetsLostCount / totalPacketsReceived) * 100 : 0;
        setPacketLoss(lossRatio);

        // Determine quality based on RTT and packet loss
        if (currentRTT === null || currentRTT > 400 || lossRatio > 10) {
          setQuality('poor');
        } else if (currentRTT > 200 || lossRatio > 5) {
          setQuality('fair');
        } else if (currentRTT > 100 || lossRatio > 2) {
          setQuality('good');
        } else {
          setQuality('excellent');
        }
      } catch (err) {
        console.error("Error getting stats:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, pc]);

  const endCall = async () => {
    if (callDocPath) {
      try {
        await updateDoc(doc(db, 'calls', callDocPath), { status: 'ended' });
      } catch (e) {}
    }
    onEnd();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        width: isMinimized ? '160px' : '100%',
        height: isMinimized ? '240px' : '100%',
        bottom: isMinimized ? '20px' : '20px',
        right: isMinimized ? '20px' : '0px',
        left: isMinimized ? 'auto' : '0px',
        top: isMinimized ? 'auto' : '0px',
        borderRadius: isMinimized ? '24px' : '0px',
        zIndex: 100
      }}
      className={`fixed flex flex-col bg-slate-950 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${isMinimized ? 'border border-primary/30' : ''}`}
    >
      <div className="absolute inset-0 bg-black flex items-center justify-center">
        {!isVideoOff ? (
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-6 z-10">
            <motion.div 
              animate={{ 
                scale: status === 'calling' ? [1, 1.1, 1] : 1,
                boxShadow: status === 'calling' ? ["0 0 0 0 rgba(59, 130, 246, 0.4)", "0 0 0 20px rgba(59, 130, 246, 0)"] : "0 0 0 0 rgba(0,0,0,0)"
              }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="relative p-1 rounded-full border-2 border-primary/30"
            >
              <Avatar className="h-44 w-44 border-4 border-white/10">
                <AvatarImage src={otherProfile?.photoURL} />
                <AvatarFallback className="bg-slate-800 text-4xl">
                  {otherProfile?.displayName?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            {!isMinimized && (
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-black text-white tracking-tight">{otherProfile?.displayName}</h2>
                <div className="flex items-center justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-primary animate-bounce'}`} />
                  <p className="text-primary font-bold text-xs uppercase tracking-widest">
                    {status === 'calling' ? (isCaller ? 'جاري الاتصال...' : 'اتصال وارد...') : 'مكالمة جارية'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {localStream && !isMinimized && !isVideoOff && (
        <motion.div 
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          className="absolute top-20 left-4 w-32 aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-20"
        >
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline 
            className="w-full h-full object-cover -scale-x-100"
          />
        </motion.div>
      )}

      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent z-50">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsMinimized(!isMinimized)} 
          className="bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-xl w-10 h-10 border border-white/10"
        >
          {isMinimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
        </Button>
        {!isMinimized && (
          <div className="flex items-center gap-3">
            {status === 'active' && (
              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 backdrop-blur-md rounded-full border border-white/10 group cursor-default">
                <div className="flex gap-0.5 items-end h-3">
                  {[1, 2, 3, 4].map((bar) => (
                    <div 
                      key={bar} 
                      className={`w-0.5 rounded-full transition-all duration-500 ${
                        (quality === 'excellent' && bar <= 4) ||
                        (quality === 'good' && bar <= 3) ||
                        (quality === 'fair' && bar <= 2) ||
                        (quality === 'poor' && bar <= 1)
                          ? 'bg-green-500' : 'bg-white/20'
                      }`}
                      style={{ height: `${bar * 25}%` }}
                    />
                  ))}
                </div>
                {latency !== null && (
                  <span className="text-[10px] font-mono text-white/40 group-hover:text-white/80 transition-colors">
                    {latency}ms
                  </span>
                )}
              </div>
            )}
            <div className="px-4 py-1 bg-white/5 backdrop-blur-md rounded-full border border-white/10 text-[10px] font-bold text-white/60 uppercase tracking-tighter">
              تشفير تام-بين-الطرفين
            </div>
          </div>
        )}
      </div>

      {!isMinimized && (
        <div className="absolute bottom-0 left-0 right-0 p-10 flex flex-col items-center gap-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-50">
          <div className="flex items-center gap-6">
            <Button 
               variant="ghost" 
               size="icon" 
               onClick={toggleSpeaker}
               className={`w-14 h-14 rounded-full transition-all ${isSpeakerOn ? 'bg-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'bg-slate-800 text-white/40'} border border-white/10`}
               title="سبيكر"
            >
              {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
            </Button>

            <Button 
               variant="ghost" 
               size="icon" 
               onClick={toggleMute}
               className={`w-14 h-14 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/20 text-white'} border border-white/10`}
               title="كتم"
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>

            <Button 
               variant="ghost" 
               size="icon" 
               onClick={endCall}
               className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 shadow-[0_0_35px_rgba(220,38,38,0.6)] transform hover:scale-105 active:scale-95 transition-all flex items-center justify-center p-0"
               title="إنهاء"
            >
              <PhoneOff className="w-10 h-10 text-white" />
            </Button>

            <Button 
               variant="ghost" 
               size="icon" 
               onClick={toggleVideo}
               className={`w-14 h-14 rounded-full transition-all ${isVideoOff ? 'bg-red-500/80 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-white/20 text-white'} border border-white/10`}
               title="كاميرا"
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>
          </div>
        </div>
      )}

      {isMinimized && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none p-4">
           <Avatar className="h-20 w-20 border-2 border-primary/30 mb-2">
              <AvatarImage src={otherProfile?.photoURL} />
              <AvatarFallback>{otherProfile?.displayName?.slice(0,2)}</AvatarFallback>
           </Avatar>
           <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] animate-pulse">مكالمة نشطة</p>
        </div>
      )}
    </motion.div>
  );
}
