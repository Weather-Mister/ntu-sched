import {mailListText} from './mail-content.mjs';

// Keep subject text readable in a lock-screen notification. Roundcube returns
// HTML fragments, sometimes with a trailing "open in new window" label.
export function notificationSubject(raw){
 const cleaned=mailListText(raw,{subject:true}).replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim();
 return Array.from(cleaned||'(No subject)').slice(0,140).join('');
}

export function notificationBody(subject,additional=0,limited=false){
 const suffix=additional>0?' +'+additional+(limited?'+':''):'';
 return notificationSubject(subject)+suffix;
}

// Read page 1 once and only page farther back when the entire page contains
// arrivals newer than the last successful check. Count actual message UIDs,
// never UID arithmetic (which could count deleted/moved messages as arrivals).
export async function newMailSummary(roundcube,firstPage,lastUid,{maxPages=12}={}){
 const observed=new Set();
 let newest=null,latest=0;
 let hasOlder=false,page=firstPage;
 const ingest=rows=>{
  for(const item of rows){
   const uid=Number(item.uid);
   if(!Number.isSafeInteger(uid)||uid<1||uid>4294967295)continue;
   if(uid>latest)latest=uid;
   if(uid<=lastUid){hasOlder=true;continue;}
   if(observed.has(uid))continue;
   observed.add(uid);
   if(!newest||uid>Number(newest.uid))newest=item;
  }
 };
 ingest(firstPage.rows);
 let pages=1;
 while(newest&&page.hasMore&&!hasOlder&&pages<maxPages){
  pages++;
  page=await roundcube.list('INBOX',pages);
  if(!page.rows.length)break;
  ingest(page.rows);
 }
 const limited=!!newest&&page.hasMore&&!hasOlder&&pages>=maxPages;
 return {latest,subject:newest?notificationSubject(newest.columns?.subject):null,
  additional:Math.max(0,observed.size-1),limited,observed:observed.size};
}
