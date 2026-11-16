import {CampusAccount} from './campus-account.mjs';
const client=new CampusAccount(),$=id=>document.getElementById(id),request=new URL(location.href).searchParams.get('request');
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function busy(value){document.querySelectorAll('button').forEach(b=>b.disabled=value);}
async function render(){
 $('signin').hidden=!!client.current;$('consent').hidden=true;$('manage').hidden=true;
 if(!client.current){status('Sign in to connect your course reports.');return;}
 if(request){
  const info=await client.request('report/authorization?request='+encodeURIComponent(request));
  $('account').textContent='Signed in as '+info.studentNumber;
  $('destination').textContent='Connecting to '+info.callbackHost+'. Only approve this if you started the connection there.';
  $('consent').hidden=false;status('Review the access below, then connect.');
 }else{
  const [connections,latest]=await Promise.all([client.request('report/connections'),client.request('report/latest')]);
  $('connection-count').textContent=connections.connections.length?connections.connections.length+' report connection(s) authorized.':'No report connections are authorized yet.';
  $('mcp-address').textContent=location.origin+'/mcp';$('disconnect').disabled=!connections.connections.length;
  $('report').textContent=latest.report?.markdown||'No report has been saved yet.';
  $('manage').hidden=false;status('Your Campus Week account is connected.');
 }
}
$('login').addEventListener('submit',async event=>{
 event.preventDefault();busy(true);status('Verifying your account…');
 const form=event.currentTarget,number=form.elements.studentNumber.value,password=form.elements.password.value;
 form.elements.password.value='';
 try{await client.login(number,password);await render();}catch(e){status(e.message,true);}finally{busy(false);}
});
async function decide(approve){busy(true);try{const response=await client.request('report/authorize',{method:'POST',body:JSON.stringify({request,approve})});location.assign(response.redirect);}catch(e){status(e.message,true);busy(false);}}
$('approve').addEventListener('click',()=>decide(true));$('deny').addEventListener('click',()=>decide(false));
$('disconnect').addEventListener('click',async()=>{busy(true);try{await client.request('report/connections',{method:'DELETE'});await render();status('Report access is disconnected. Your other Campus Week connections are unchanged.');}catch(e){status(e.message,true);}finally{busy(false);}});
try{await client.restore();await render();}catch(e){status(e.message,true);}
