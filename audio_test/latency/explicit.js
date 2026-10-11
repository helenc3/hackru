import * as fs from 'node:fs';
import WebSocket from 'ws';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = path.join(import.meta.dirname, 'runs', 'explicit-' + Date.now());
fs.mkdirSync(root, { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(import.meta.dirname, '../../apps/web/public/audio/p1.station-directions.tier-0.mp3'), '-f', 's16le', '-ar', '16000', '-ac', '1', path.join(root, 'input.pcm')]);
const pcm = fs.readFileSync(path.join(root, 'input.pcm'));
const prompt = 'You are a Mandarin conversation partner. Listen to the user and reply naturally in one short Mandarin sentence acknowledging the directions. Do not greet before the user speaks. Do not translate or explain.';
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function trial(provider,model,agentId,index){
 const started=performance.now();let ready,firstAudio,endInput,streamStart;let response='',transcript='',chunks=[],finished=false;
 let resolveReady,rejectReady,resolveDone,rejectDone;
 const readyP=new Promise((r,j)=>{resolveReady=r;rejectReady=j}); const doneP=new Promise((r,j)=>{resolveDone=r;rejectDone=j}); doneP.catch(()=>{});
 const url=provider==='gemini'?'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY):'wss://api.elevenlabs.io/v1/convai/conversation?agent_id='+agentId;
 const ws=new WebSocket(url,provider==='eleven'?{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY}}:{});
 const send=x=>ws.send(JSON.stringify(x));
 const fail=e=>{rejectReady(e);rejectDone(e)};
 const timer=setTimeout(()=>fail(Error('timeout')),30000);
 ws.on('error',()=>fail(Error('WebSocket connection error')));
 ws.on('close',(code,reason)=>{if(!finished)fail(Error('closed '+code+' '+reason.toString().replaceAll(process.env.GEMINI_API_KEY,'[redacted]')))});
 ws.on('open',()=>send(provider==='gemini'?{setup:{model:'models/'+model,generationConfig:{responseModalities:['AUDIO']},systemInstruction:{parts:[{text:prompt}]},inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{disabled:true}}}}:{type:'conversation_initiation_client_data'}));
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
 if(m.error){fail(Error(JSON.stringify(m.error)));return}
 if(m.setupComplete||m.type==='conversation_initiation_metadata'){ready=performance.now();resolveReady();}
 if(m.type==='ping')send({type:'pong',event_id:m.ping_event.event_id});
 if(m.type==='user_transcript')transcript=m.user_transcription_event.user_transcript;
 if(m.type==='agent_response')response=m.agent_response_event.agent_response;
 const sc=m.serverContent;
 if(sc?.inputTranscription?.text)transcript+=sc.inputTranscription.text;
 if(sc?.outputTranscription?.text)response+=sc.outputTranscription.text;
 const audio=provider==='gemini'?(sc?.modelTurn?.parts||[]).filter(p=>p.inlineData?.mimeType?.startsWith('audio/')).map(p=>p.inlineData.data):m.type==='audio'?[m.audio_event.audio_base_64]:[];
 if(audio.length&&streamStart){firstAudio??=performance.now();chunks.push(...audio.map(a=>Buffer.from(a,'base64')));}
 if(firstAudio&&(sc?.turnComplete||m.type==='agent_response_complete'))resolveDone();
 });
 try{await readyP;streamStart=performance.now();if(provider==='gemini')send({realtimeInput:{activityStart:{}}});
 for(let offset=0;offset<pcm.length;offset+=3200){const data=pcm.subarray(offset,offset+3200).toString('base64');send(provider==='gemini'?{realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}}:{user_audio_chunk:data});await sleep(100)}
 endInput=performance.now();if(provider==='gemini')send({realtimeInput:{activityEnd:{}}});
 // Send identical trailing silence to allow each service's automatic turn detector to respond.
 for(let i=0;i<20&&!firstAudio&&provider!=='gemini';i++){const data=Buffer.alloc(3200).toString('base64');send(provider==='gemini'?{realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}}:{user_audio_chunk:data});await sleep(100)}
 await Promise.race([doneP,sleep(8000)]);if(!firstAudio)throw Error('No response audio received');
 const result={provider,model,index,setupMs:Math.round(ready-started),inputDurationMs:pcm.length/32,streamMs:Math.round(endInput-streamStart),endToFirstAudioMs:Math.round(firstAudio-endInput),startToFirstAudioMs:Math.round(firstAudio-streamStart),transcript,response,audioBytes:Buffer.concat(chunks).length};
 fs.writeFileSync(root+'/'+provider+'-'+index+'.pcm',Buffer.concat(chunks));return result;
 }finally{finished=true;clearTimeout(timer);ws.close();}
}
(async()=>{const agentId=undefined;const results=[];
 for(let i=1;i<=3;i++)for(const provider of (agentId?(i%2?['gemini','eleven']:['eleven','gemini']):['gemini'])){const model=provider==='gemini'?'gemini-3.8-live':'gemini-2.5-flash + eleven_v3_conversational';try{const result=await trial(provider,model,agentId,i);results.push(result);console.log(JSON.stringify(result));}catch(e){results.push({provider,model,index:i,error:e.message});console.log(JSON.stringify(results.at(-1)));}fs.writeFileSync(root+'/results.json',JSON.stringify(results,null,2));}

})().catch(e=>{console.error(e.message);process.exitCode=1});
