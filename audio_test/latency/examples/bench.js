import * as fs from 'node:fs';
import WebSocket from 'ws';
import { execFileSync } from 'node:child_process';
let pcm;
const prompt = 'You are a helpful Mandarin-speaking station employee. Reply entirely in natural Mandarin. Answer the user request fully, following their requested response length. Be calm and reassuring when the user is worried. Do not greet until the user speaks. The fictional station has its ticket office on the right, Jiangbin trains now leave from platform 3 rather than platform 2, tickets cost 15 yuan, and departure is in ten minutes. Do not invent other station facts.';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
import path from 'node:path';
const root=path.join(import.meta.dirname,'runs',String(Date.now()));
fs.mkdirSync(root,{recursive:true});
async function api(path,method='GET',body){const r=await fetch('https://api.elevenlabs.io/v1/'+path,{method,headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const s=await r.text();if(!r.ok)throw Error('Eleven HTTP '+r.status+' '+s);return s?JSON.parse(s):{};}
async function trial(provider,model,agentId,index){
 const started=performance.now();let ready,firstAudio,endInput,streamStart,lastAudio,completedAt,quietTimer;let response='',transcript='',chunks=[],finished=false;
 let resolveReady,rejectReady,resolveDone,rejectDone;
 const readyP=new Promise((r,j)=>{resolveReady=r;rejectReady=j}); const doneP=new Promise((r,j)=>{resolveDone=r;rejectDone=j}); doneP.catch(()=>{});
 const url=provider==='gemini'?'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key='+encodeURIComponent(process.env.GEMINI_API_KEY):'wss://api.elevenlabs.io/v1/convai/conversation?agent_id='+agentId;
 const ws=new WebSocket(url,provider==='eleven'?{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY}}:{});
 const send=x=>ws.send(JSON.stringify(x));
 const fail=e=>{rejectReady(e);rejectDone(e)};
 const timer=setTimeout(()=>fail(Error('timeout')),90000);
 ws.on('error',()=>fail(Error('WebSocket connection error')));
 ws.on('close',(code,reason)=>{if(!finished)fail(Error('closed '+code+' '+reason.toString().replaceAll(process.env.GEMINI_API_KEY,'[redacted]')))});
 ws.on('open',()=>send(provider==='gemini'?{setup:{model:'models/'+model,generationConfig:{responseModalities:['AUDIO']},systemInstruction:{parts:[{text:prompt}]},inputAudioTranscription:{},outputAudioTranscription:{}}}:{type:'conversation_initiation_client_data'}));
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
 if(audio.length&&streamStart){firstAudio??=performance.now();chunks.push(...audio.map(a=>Buffer.from(a,'base64')));lastAudio=performance.now();if(provider==='eleven'){clearTimeout(quietTimer);quietTimer=setTimeout(()=>{if(endInput){completedAt=performance.now();resolveDone();}},2500);}}
 if(firstAudio&&sc?.turnComplete&&endInput){completedAt=performance.now();resolveDone();}
 });
 try{await readyP;streamStart=performance.now();
 for(let offset=0;offset<pcm.length;offset+=3200){const data=pcm.subarray(offset,offset+3200).toString('base64');send(provider==='gemini'?{realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}}:{user_audio_chunk:data});await sleep(100)}
 endInput=performance.now();
 // Send identical trailing silence to allow each service's automatic turn detector to respond.
 for(let i=0;i<20&&!firstAudio;i++){const data=Buffer.alloc(3200).toString('base64');send(provider==='gemini'?{realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}}:{user_audio_chunk:data});await sleep(100)}
 await doneP;if(!firstAudio)throw Error('No response audio received');
 const result={provider,model,index,setupMs:Math.round(ready-started),inputDurationMs:pcm.length/32,streamMs:Math.round(endInput-streamStart),endToFirstAudioMs:Math.round(firstAudio-endInput),startToFirstAudioMs:Math.round(firstAudio-streamStart),endToLastAudioMs:Math.round(lastAudio-endInput),completionMs:Math.round(completedAt-endInput),outputDurationMs:Math.round(Buffer.concat(chunks).length/(provider==='gemini'?48:32)),transcript,response,audioBytes:Buffer.concat(chunks).length};
 const out=root+'/'+provider+'-'+index;fs.writeFileSync(out+'.pcm',Buffer.concat(chunks));execFileSync('ffmpeg',['-v','error','-y','-f','s16le','-ar',provider==='gemini'?'24000':'16000','-ac','1','-i',out+'.pcm',out+'.wav']);return result;
 }finally{finished=true;clearTimeout(timer);clearTimeout(quietTimer);ws.close();}
}
const scenarios=[
 {id:'short',text:'请问，去江滨的列车现在在哪个站台？请用两句话告诉我怎么走。'},
 {id:'long',text:'我第一次来这个车站，有点紧张，怕赶不上去江滨的火车。请用五到六句话，先安慰我，再一步一步告诉我在哪里买票、票价多少、去哪个站台，还有走错站台时该怎么办。'}
];
(async()=>{let agentId;const results=[];try{
 for(const scenario of scenarios){const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({text:scenario.text,model_id:'eleven_v4',language_code:'zh'})});if(!r.ok)throw Error('Input synthesis HTTP '+r.status+' '+await r.text());const file=root+'/input-'+scenario.id+'.mp3';fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));execFileSync('ffmpeg',['-v','error','-y','-i',file,'-f','s16le','-ar','16000','-ac','1',root+'/input-'+scenario.id+'.pcm']);console.log('Generated '+scenario.id+' input');}
 fs.writeFileSync(root+'/inputs.json',JSON.stringify(scenarios,null,2));
 const created=await api('convai/agents/create','POST',{name:'Temporary Speak Your Way longer-response benchmark',conversation_config:{agent:{first_message:'',language:'zh',prompt:{prompt,llm:'gemini-2.5-flash',temperature:0.3}},tts:{model_id:'eleven_v3_conversational',voice_id:'EXAVITQu4vr4xnSDxMaL',agent_output_audio_format:'pcm_16000'},asr:{user_input_audio_format:'pcm_16000'},conversation:{client_events:['audio','user_transcript','agent_response','agent_response_complete']}}});agentId=created.agent_id;fs.writeFileSync(root+'/temporary-agent.json',JSON.stringify({agentId}));console.log('Temporary agent created');
 for(const scenario of scenarios){pcm=fs.readFileSync(root+'/input-'+scenario.id+'.pcm');for(let i=1;i<=2;i++)for(const provider of (i%2?['eleven','gemini']:['gemini','eleven'])){const model=provider==='gemini'?'gemini-3.8-live':'gemini-2.5-flash + eleven_v3_conversational';const index=scenario.id+'-'+i;try{const result=await trial(provider,model,agentId,index);results.push({...result,scenario:scenario.id});console.log(JSON.stringify(result));}catch(e){results.push({provider,model,index,scenario:scenario.id,error:e.message});console.log(JSON.stringify(results.at(-1)));}fs.writeFileSync(root+'/results.json',JSON.stringify(results,null,2));}}
 }finally{if(agentId){await api('convai/agents/'+agentId,'DELETE');console.log('Temporary agent deleted');}}
})().catch(e=>{console.error(e.message);process.exitCode=1});
