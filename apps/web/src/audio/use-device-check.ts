import { useEffect, useRef, useState } from 'react';

/** Local setup checks; recordings never leave the browser. */
export function useDeviceCheck() {
  const [microphone, setMicrophone] = useState('Check your microphone before starting, or use typed Mandarin in the same conversation panel.');
  const [audio, setAudio] = useState('Audio has not been checked.');
  const [checking, setChecking] = useState(false);

  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const microphonePlayer = useRef<HTMLAudioElement>(null);
  const audioPlayer = useRef<HTMLAudioElement>(null);
  const cleanupCapture = useRef<(() => void) | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanupCapture.current?.();
    };
  }, []);
  useEffect(() => () => { if (recordingUrl) URL.revokeObjectURL(recordingUrl); }, [recordingUrl]);

  async function checkMicrophone() {
    setChecking(true);
    setRecordingUrl(null);
    microphonePlayer.current?.pause();
    audioPlayer.current?.pause();
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sampleTimer: ReturnType<typeof setInterval> | undefined;
    let recorder: MediaRecorder | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(sampleTimer);
      if (recorder?.state === 'recording') recorder.stop();
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => undefined);
    };
    cleanupCapture.current = cleanup;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs HTTPS or localhost and a supported browser.');
      if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record microphone audio. Try another browser, or use typed Mandarin.');
      setMicrophone('Allow microphone access, then speak for five seconds. Your recording stays in this browser.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { cleanup(); return; }
      context = new AudioContext();
      await context.resume();
      if (!mounted.current) { cleanup(); return; }
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let heardSound = false;
      sampleTimer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        if (rms > 0.01) heardSound = true;
      }, 50);
      recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      await new Promise<void>((resolve, reject) => {
        recorder!.onerror = () => reject(new Error('Microphone recording failed. Please try again.'));
        recorder!.onstop = () => resolve();
        recorder!.start();
        setMicrophone('Recording for five seconds… Speak now.');
        timer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 5000);
      });
      if (!mounted.current) return;
      const recording = new Blob(chunks, { type: recorder.mimeType });
      if (!recording.size) throw new Error('No audio was recorded. Check your microphone and try again.');
      setRecordingUrl(URL.createObjectURL(recording));
      setMicrophone(heardSound
        ? 'Sound detected. Listen to your recording to confirm your voice is clear.'
        : 'No sound detected. Listen to the recording, check your input device or mute switch, and try again.');
    } catch (error: unknown) {
      if (mounted.current) setMicrophone(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser settings, or choose typed Mandarin in the same panel.' : error instanceof Error ? error.message : 'Microphone unavailable. Typed Mandarin remains available.');
    } finally {
      cleanup();
      cleanupCapture.current = null;
      if (mounted.current) setChecking(false);
    }
  }

  async function checkAudio() {
    microphonePlayer.current?.pause();
    try {
      const player = audioPlayer.current!;
      player.currentTime = 0;
      await player.play();
      setAudio('Playing “罗格斯大学” (Rutgers University). Confirm you can hear it.');
    } catch { setAudio('Audio could not play. Check your output device and browser settings, then try again.'); }
  }

  return { microphone, audio, checking, recordingUrl, microphonePlayer, audioPlayer, checkMicrophone, checkAudio, setAudio };
}
