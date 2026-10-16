import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
let checked=0;
for(const directory of ['public','src','client','scripts']){
  for(const entry of readdirSync(directory,{recursive:true})){
    if(!/\.(mjs|js)$/.test(entry))continue;
    const file=directory+'/'+entry,result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    if(result.status!==0){process.stderr.write(result.stderr||'Could not check '+file+'\n');process.exit(1);}
    checked++;
  }
}
console.log('Syntax checked '+checked+' JavaScript modules.');
