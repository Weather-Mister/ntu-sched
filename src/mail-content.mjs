import { parseHTML } from 'linkedom';
import { ApiError } from './security.mjs';
import { roundcubeEnvironment } from './mail-roundcube.mjs';
import {cleanRichHtml,MAX_ATTACHMENTS,MAX_ATTACHMENT_BYTES} from '../public/mail-rich.mjs';
const text=value=>parseHTML('<html><body>'+String(value||'')+'</body></html>').document.body.textContent.trim();
export { text as mailText };
// Roundcube sends HTML fragments for list columns. Some skins append a
// screen-reader-only external-window link to the subject column.
export function mailListText(value,{subject=false}={}){
 const raw=String(value??'');
 const {document}=parseHTML('<html><body>'+raw+'</body></html>');
 const body=document.body;
 for(const element of [...body.querySelectorAll('*')]){
  if(!element.isConnected)continue;
  const classes=String(element.getAttribute('class')||'');
  if(element.getAttribute('aria-hidden')==='true'||/\b(?:sr-only|visually-hidden|screen-reader-text|sr_only|screenreader)\b/i.test(classes)){
   element.remove();continue;
  }
  if(subject&&/^(?:open in (?:a )?new window|open in new tab|在新視窗開啟)$/i.test(element.textContent.trim())){
   // Remove the smallest standalone annotation, never its containing subject.
   if(![...element.children].some(child=>child.textContent.trim()===element.textContent.trim()))element.remove();
  }
 }
 let valueText=body.textContent.replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
 if(subject){
  // NTU sometimes appends this screen-reader label as PLAIN TEXT, not HTML.
  // The label can also touch the subject directly with no separating space.
  // Preserve a legitimate subject that consists entirely of this phrase.
  const withoutLabel=valueText.replace(/\s*(?:open\s+in\s+(?:a\s+)?new\s+window|open\s+in\s+new\s+tab|在新視窗開啟)\s*$/i,'').trim();
  if(withoutLabel)valueText=withoutLabel;
 }
 return valueText;
}

export function mailReference(folder,uid){
 if(typeof folder!=='string'||!folder||folder.length>200||/[\r\n\0]/.test(folder)||!/^\d{1,10}$/.test(String(uid))||Number(uid)<1||Number(uid)>4294967295)throw new ApiError(400,'invalid_mail','Invalid mail reference.');
 return {mailbox:folder,uid:String(uid)};
}
const allowed=new Set('a abbr b blockquote br caption center code col colgroup dd del div dl dt em font h1 h2 h3 h4 h5 h6 hr i img li ol p pre s small span strong sub sup table tbody td th thead tr u ul'.split(' '));
const drop=new Set('script style form input button select textarea iframe object embed svg math link meta base video audio source'.split(' '));
const styleNames=/^(?:color|background-color|font(?:-family|-size|-style|-weight)?|text(?:-align|-decoration|-indent|-transform)?|line-height|white-space|word-break|overflow-wrap|vertical-align|border(?:-(?:top|right|bottom|left|color|width|style|collapse|spacing))?|(?:min-|max-)?width|height|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?)$/i;
export function sanitizeMail(html,images=false){
 const {document}=parseHTML('<html><body>'+html+'</body></html>');
 for(const el of [...document.body.querySelectorAll('*')]){
  const tag=el.localName.toLowerCase();if(drop.has(tag)){el.remove();continue;}
  if(!allowed.has(tag)){el.replaceWith(...el.childNodes);continue;}
  for(const attr of [...el.attributes]){
   const name=attr.name.toLowerCase(),v=attr.value;
   if(name==='style'){
    const css=v.split(';').map(x=>x.split(/:(.*)/s)).filter(([k,val])=>styleNames.test(k.trim())&&val&&!/[\\@<>]|url\s*\(|expression|var\s*\(/i.test(val)).map(([k,val])=>k.trim()+':'+val.trim()).join(';');
    if(css)el.setAttribute('style',css);else el.removeAttribute(name);
   }else if(tag==='a'&&name==='href'&&/^(?:https?:\/\/|mailto:)/i.test(v.trim())){el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}
   else if(tag==='img'&&name==='src'&&images&&/^https:\/\//i.test(v.trim())){el.setAttribute('referrerpolicy','no-referrer');el.setAttribute('loading','lazy');}
   else if(!['title','alt','colspan','rowspan','width','height','align','dir'].includes(name))el.removeAttribute(attr.name);
  }
 }
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>body{font:15px/1.6 system-ui,sans-serif;padding:16px;color:#252b30;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#246b86}</style></head><body>${document.body.innerHTML}</body></html>`;
}
export function messageFromPage(html,ref){
 const env=roundcubeEnvironment(html);if(env.task!=='mail'||!env.request_token)throw new ApiError(401,'ntu_session_expired','Your NTU Mail session expired. Please retry.');
 const {document}=parseHTML(html),body=document.querySelector('#messagebody');
 if(!body)throw new ApiError(502,'mail_body_unavailable','NTU did not return the message body. Open it in official NTU Mail.');
 const attachments=[],seen=new Set();
 for(const link of document.querySelectorAll('#attachment-list a, #attachments a, .attachments a')){
  let url;try{url=new URL(link.getAttribute('href'),'https://wmail1.cc.ntu.edu.tw/rc/');}catch{continue;}
  const part=url.searchParams.get('_part');if(!part||!/^\d+(?:\.\d+)*$/.test(part)||seen.has(part))continue;seen.add(part);
  attachments.push({part,name:link.textContent.trim()||'Attachment'});
 }
 const subject=mailListText(document.querySelector('.subject')?.innerHTML||env.subject||'',{subject:true})||'(No subject)';
 const header=document.querySelector('#message-headers')||document.querySelector('.message-headers');
 const headers=header?.textContent?.trim()||'';
 return {...ref,subject,headers,body:body.innerHTML,attachments};
}
export async function rootHeaders(s,ref){
 const response=await s.fetch('?'+new URLSearchParams({_task:'mail',_action:'viewsource',_mbox:ref.mailbox,_uid:ref.uid,_token:s.env.request_token}),{},-1);
 const reader=response.body.getReader(),decoder=new TextDecoder();let value='';
 try{while(value.length<65536){const {done,value:chunk}=await reader.read();if(done)break;value+=decoder.decode(chunk,{stream:true});if(/\r?\n\r?\n/.test(value))break;}}finally{await reader.cancel();}
 const header=value.split(/\r?\n\r?\n/,1)[0].replace(/\r?\n[ \t]+/g,' '),get=name=>(header.match(new RegExp('^'+name+':[ \\t]*([^\\r\\n]*)','mi'))?.[1]||'').trim();
 return {messageId:get('Message-ID'),references:get('References'),replyTo:get('Reply-To')||get('From'),subject:get('Subject')};
}
export function validateSend(body){
 if(Object.keys(body).some(k=>!['id','to','subject','text','reply','html','attachments'].includes(k))||!/^[-\w]{36}$/.test(body.id||''))throw new ApiError(400,'invalid_mail','Invalid send request.');
 if(typeof body.to!=='string'||body.to.length>2000||/[\r\n\0]/.test(body.to))throw new ApiError(400,'invalid_mail','Check the recipient address.');
 const recipients=body.to.split(/[;,]/).map(v=>v.trim()).filter(Boolean);
 if(!recipients.length||recipients.length>20||recipients.some(v=>!/^([^\s<>@,]+)@([^\s<>@,]+\.[^\s<>@,]+)$/.test(v)))throw new ApiError(400,'invalid_mail','Use email addresses separated by commas.');
 const attachments=body.attachments||[];
 if(!Array.isArray(attachments)||attachments.length>MAX_ATTACHMENTS||attachments.some(a=>!a||typeof a.name!=='string'||!a.name||a.name.length>180||/[\r\n\0]/.test(a.name)||typeof a.type!=='string'||!/^[-\w.+]+\/[-\w.+]+$/.test(a.type)||a.type.length>120||!Number.isSafeInteger(a.size)||a.size<0)||attachments.reduce((n,a)=>n+a.size,0)>MAX_ATTACHMENT_BYTES)throw new ApiError(400,'invalid_attachment','Use up to 8 attachments, totaling 20 MB.');
 if(typeof body.subject!=='string'||body.subject.length>500||/[\r\n\0]/.test(body.subject)||typeof body.text!=='string'||body.text.length>(body.html!==undefined?100000:50000)||(!body.text.trim()&&!attachments.length)||body.html!=null&&(typeof body.html!=='string'||body.html.length>220000))throw new ApiError(400,'invalid_mail','Enter a recipient and message or attachment.');
 if(body.reply)mailReference(body.reply.mailbox,body.reply.uid);
 const html=body.html?cleanRichHtml(body.html,parseHTML('<html><body></body></html>').document):'';
 return {...body,to:recipients.join(', '),...(body.html!==undefined?{html}:{}),...(body.attachments!==undefined?{attachments}:{})};
}
const b64=value=>{const bytes=new TextEncoder().encode(value);let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);};
export function buildMime(body,from,messageId,reply,asBlob=false){
 const safeID=v=>/^<[^<>\s\r\n]+>$/.test(v||'')?v:'';
 const lines=[`From: ${from}`,`To: ${body.to}`,`Subject: =?UTF-8?B?${b64(body.subject)}?=`,`Message-ID: <${messageId}>`,`Date: ${new Date().toUTCString()}`,'MIME-Version: 1.0'];
 if(reply&&safeID(reply.messageId)){lines.push('In-Reply-To: '+safeID(reply.messageId));const refs=(reply.references||'').split(/\s+/).filter(safeID).slice(-15);lines.push('References: '+[...refs,safeID(reply.messageId)].join(' '));}
 const fold=value=>{let output='';for(let i=0;i<value.length;i+=76)output+=value.slice(i,i+76)+'\r\n';return output;};
 const plain='Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+fold(b64(body.text));
 const alt='campus_alt_'+crypto.randomUUID().replaceAll('-',''),mix='campus_mix_'+crypto.randomUUID().replaceAll('-','');
 const content=body.html?'Content-Type: multipart/alternative; boundary="'+alt+'"\r\n\r\n--'+alt+'\r\n'+plain+'\r\n--'+alt+'\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+fold(b64(body.html))+'\r\n--'+alt+'--\r\n':plain;
 if(!body.attachments?.length){const value=lines.join('\r\n')+'\r\n'+content;return asBlob?new Blob([value],{type:'message/rfc822'}):value;}
 const parts=[lines.join('\r\n')+'\r\nContent-Type: multipart/mixed; boundary="'+mix+'"\r\n\r\n--'+mix+'\r\n'+content];
 for(const file of body.attachments){
  if(typeof file.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)||atob(file.data).length!==file.size)throw new ApiError(400,'invalid_attachment','Attachment data is incomplete.');
  const fallback=file.name.replace(/[^\x20-\x7e]|["\\]/g,'_').slice(0,100),encoded=encodeURIComponent(file.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
  parts.push('\r\n--'+mix+'\r\nContent-Type: '+file.type+'; name="'+fallback+'"\r\nContent-Disposition: attachment; filename="'+fallback+'"; filename*=UTF-8\'\''+encoded+'\r\nContent-Transfer-Encoding: base64\r\n\r\n');
  // Bound transient strings while constructing a 20 MB MIME attachment.
  for(let offset=0;offset<file.data.length;offset+=76*1024)parts.push(fold(file.data.slice(offset,offset+76*1024)));
 }
 parts.push('\r\n--'+mix+'--\r\n');return asBlob?new Blob(parts,{type:'message/rfc822'}):parts.join('');
}
