import {spawnSync} from 'node:child_process';

const args=['-m','unittest','discover','-s','connectors'];
const candidates=process.platform==='win32'
  ? [['py',['-3',...args]],['python',args],['python3',args]]
  : [['python3',args],['python',args]];
for(const [command,commandArgs] of candidates){
  const result=spawnSync(command,commandArgs,{stdio:'inherit'});
  if(!result.error){process.exit(result.status??1);}
  if(result.error.code!=='ENOENT'){console.error(result.error.message);process.exit(1);}
}
console.error('Python 3 não encontrado. Instale Python 3 e adicione py/python ao PATH.');
process.exit(1);
