import {ApiError,encryptAuthorization,decryptAuthorization} from './security.mjs';
import {THEMES,preferenceDefaults} from '../public/skeleton/settings-model.mjs';
export const PREFERENCES_SCHEMA='CREATE TABLE IF NOT EXISTS student_preferences (student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE, encrypted_preferences TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)';
const ready=new WeakMap();
async function schema(env){if(!ready.has(env.DB))ready.set(env.DB,env.DB.prepare(PREFERENCES_SCHEMA).run().catch(e=>{ready.delete(env.DB);throw e;}));await ready.get(env.DB);}
export async function readPreferences(env,owner){
 await schema(env);const row=await env.DB.prepare('SELECT * FROM student_preferences WHERE student_id=?').bind(owner.student_id).first();
 return {preferences:row?await decryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'preferences',row.encrypted_preferences):preferenceDefaults(),version:row?.version||0};
}
export async function savePreferences(env,owner,input){
 await schema(env);if(!input||Object.keys(input).some(k=>!['version','theme','hanziEnabled','hanziUsername'].includes(k))||!Number.isSafeInteger(input.version)||input.version<0||!THEMES.includes(input.theme)||typeof input.hanziEnabled!=='boolean'||typeof input.hanziUsername!=='string'||input.hanziUsername!==''&&!/^[a-z0-9_]{2,32}$/.test(input.hanziUsername)||input.hanziEnabled&&!input.hanziUsername)throw new ApiError(400,'invalid_preferences','Check the selected theme and Hanzi Steps username.');
 const preferences={theme:input.theme,hanziEnabled:input.hanziEnabled,hanziUsername:input.hanziUsername},encrypted=await encryptAuthorization(env.NTU_CREDENTIAL_KEY,owner.student_id,'preferences',preferences),time=Date.now();
 const row=input.version===0?await env.DB.prepare('INSERT INTO student_preferences(student_id,encrypted_preferences,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(student_id) DO NOTHING RETURNING version').bind(owner.student_id,encrypted,time).first():await env.DB.prepare('UPDATE student_preferences SET encrypted_preferences=?,version=version+1,updated_at=? WHERE student_id=? AND version=? RETURNING version').bind(encrypted,time,owner.student_id,input.version).first();
 if(!row)throw new ApiError(409,'preferences_changed','Settings changed on another device. Latest settings loaded; please try again.');return {preferences,version:row.version};
}
export async function readHanziWidget(env,owner,username,{upstream=fetch}={}){
 if(typeof username!=='string'||!/^[a-z0-9_]{2,32}$/.test(username))throw new ApiError(400,'invalid_hanzi_username','Use 2–32 letters, numbers or underscores.');
 const bucket=Math.floor(Date.now()/60000),key='hanzi-widget:'+owner.student_id+':'+bucket;
 const quota=await env.DB.prepare('INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,(bucket+1)*60).first();if(quota.attempts>12)throw new ApiError(429,'hanzi_busy','Please wait a moment before refreshing Hanzi Steps.');
 let response;try{response=await upstream('https://hanzi-steps-api.weatherisgood06.workers.dev/widget?username='+encodeURIComponent(username),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw new ApiError(502,'hanzi_unavailable','Hanzi Steps is unavailable. Your schedule is unaffected.');}
 if(!response.ok){await response.body?.cancel();throw new ApiError(response.status===404?404:502,response.status===404?'hanzi_not_found':'hanzi_unavailable',response.status===404?'No Hanzi Steps profile with this username was found.':'Hanzi Steps could not load. Please try again.');}
 // Copy the public widget summary only; never proxy arbitrary URLs or credentials.
 let data;try{data=await response.json();}catch{throw new ApiError(502,'hanzi_unavailable','Hanzi Steps returned an unreadable summary.');}
 const number=(n,max)=>Number.isFinite(n)&&n>=0?Math.min(max,Math.floor(n)):0;
 if(!data||!Number.isFinite(data.streak))throw new ApiError(502,'hanzi_unavailable','Hanzi Steps returned an invalid summary.');
 return {widget:{username,streak:number(data.streak,100000),todayProgress:number(data.todayProgress,1000),todayGoal:number(data.todayGoal,1000)||10,practicedToday:data.practicedToday===true,unit:number(data.unit,1000),book:number(data.book,20),unitColor:/^#[0-9a-f]{6}$/i.test(data.unitColor||'')?data.unitColor:'#627b61',nextCharacter:data.nextCharacter?{character:String(data.nextCharacter.character||'').slice(0,8),pinyin:String(data.nextCharacter.pinyin||'').slice(0,80),meaning:String(data.nextCharacter.meaning||'').slice(0,120)}:null,updatedAt:Date.now()}};
}
