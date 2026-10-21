const OWNER='b15502123',PERSONAL_ORIGIN='https://weather-mister.github.io';
export function createPersonalTaskLink({account,getContext,onTasksChanged}){
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 const section=node('section'),heading=node('h3'),description=node('p'),button=node('button'),status=node('p');
 section.className='settings-section';section.id='settings-personal-tasks';section.hidden=true;button.type='button';button.className='button';status.className='micro';status.setAttribute('role','status');
 section.append(heading,description,button,status);document.querySelector('.settings-account').after(section);
 let owner=null,epoch=0,linked=false,busy=false,popup=null,nonce=null;
 const zh=()=>getContext().language==='zh';
 function render(){
  section.hidden=owner!==OWNER;heading.textContent=zh()?'Eren 的待辦事項':'Eren’s manual tasks';
  description.textContent=zh()?'與您的個人網站共用同一份清單。僅限 b15502123。':'Share one list with your personal site. Only for b15502123.';
  button.textContent=busy?(zh()?'正在連結…':'Connecting…'):linked?(zh()?'重新連結個人網站':'Reconnect personal site'):(zh()?'連結 Eren 待辦事項':'Connect Eren tasks');button.disabled=busy;
 }
 async function inspect(){
  const generation=epoch;
  try{const result=await account.request('personal-tasks/link');if(generation!==epoch||result.studentNumber!==OWNER)return;linked=result.linked===true;status.textContent=linked?(zh()?'已連結。兩個網站會自動更新。':'Connected. Both sites update automatically.'):' ';render();}
  catch(error){if(generation===epoch)status.textContent=error.message;}
 }
 function update(){
  const context=getContext(),next=context.liveMode?context.student?.id:null;
  if(next!==owner){owner=next;epoch++;linked=false;busy=false;nonce=null;popup?.close();popup=null;status.textContent='';if(owner===OWNER)void inspect();}
  render();
 }
 button.addEventListener('click',()=>{
  if(owner!==OWNER||busy)return;
  nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
  popup=window.open('https://weather-mister.github.io/ntu-mail-push/sites/eren/#campus-tasks-link='+nonce,'campus-eren-tasks','width=560,height=740');
  if(!popup){nonce=null;status.textContent=zh()?'請允許彈出視窗後再試一次。':'Allow the pop-up, then try again.';return;}
  status.textContent=zh()?'正在確認個人網站的配對…':'Checking your personal site’s pairing…';
 });
 window.addEventListener('message',async event=>{
  const value=event.data;
  if(owner!==OWNER||event.origin!==PERSONAL_ORIGIN||event.source!==popup||!nonce||value?.nonce!==nonce||value?.type!=='eren-campus-task-key')return;
  const currentNonce=nonce,generation=epoch;nonce=null;
  if(typeof value.key!=='string'||value.key.length<32||value.key.length>200){status.textContent=zh()?'請先配對您的 Eren 個人網站，再重試。':'Pair your Eren site first, then try connecting again.';return;}
  busy=true;render();
  try{
   const result=await account.request('personal-tasks/link',{method:'POST',body:JSON.stringify({key:value.key})});
   if(generation!==epoch||owner!==OWNER||result.studentNumber!==OWNER)return;
   linked=true;popup?.postMessage({type:'campus-task-link-result',nonce:currentNonce,ok:true},PERSONAL_ORIGIN);popup=null;
   status.textContent=zh()?'已連結。兩個網站會自動更新。':'Connected. Both sites update automatically.';onTasksChanged();
  }catch(error){if(generation===epoch){popup?.postMessage({type:'campus-task-link-result',nonce:currentNonce,ok:false},PERSONAL_ORIGIN);status.textContent=error.message;}}
  finally{if(generation===epoch){busy=false;render();}}
 });
 const refresh=()=>{if(owner===OWNER&&linked&&!document.hidden&&navigator.onLine!==false)onTasksChanged();};
 setInterval(refresh,10000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
 return {update};
}
