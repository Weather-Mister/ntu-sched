import {readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {availableParallelism} from 'node:os';
const files=[];
for(const directory of ['public','src','client','scripts']){
  for(const entry of readdirSync(directory,{recursive:true})){
    if(!/\.(mjs|js)$/.test(entry))continue;
    files.push(directory+'/'+entry);
  }
}
let next=0;const failures=[];
// Bound the process count instead of starting one checker per file at once.
await Promise.all(Array.from({length:Math.min(4,availableParallelism(),files.length)},async()=>{
  while(next<files.length){
    const file=files[next++];
    await new Promise(resolve=>{
      let diagnostic='';
      const child=spawn(process.execPath,['--check',file],{stdio:['ignore','ignore','pipe']});
      child.stderr.on('data',data=>{diagnostic+=data;});
      child.once('error',error=>{diagnostic+=error.message;});
      child.once('close',code=>{if(code!==0)failures.push({file,diagnostic});resolve();});
    });
  }
}));
if(failures.length){
  for(const {file,diagnostic}of failures)process.stderr.write(file+'\n'+diagnostic+'\n');
  process.exitCode=1;
}else console.log('Syntax checked '+files.length+' JavaScript modules.');
