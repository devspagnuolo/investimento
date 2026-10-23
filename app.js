import {analyze,validateHolding,parseCSV,project,profiles} from './engine.js';
const automationLink=document.createElement('a');automationLink.href='/automation';automationLink.textContent='⇄ Automação Brasil';document.querySelector('nav').append(automationLink);
const key='investai.v1';
const $=id=>document.getElementById(id);
let state={holdings:[],profile:'Moderado',demo:false};
let timer;
function notify(message){$('status').textContent=message;clearTimeout(timer);timer=setTimeout(()=>$('status').textContent='',8000);}
try { const raw=localStorage.getItem(key); if(raw) state=validateState(JSON.parse(raw)); } catch {notify('Não foi possível restaurar os dados locais. Use um backup válido.');}
function validateState(data){if(!Array.isArray(data?.holdings)||data.holdings.length>1000||!Object.hasOwn(profiles,data.profile))throw Error('Backup inválido.');return {holdings:data.holdings.map(validateHolding),profile:data.profile,demo:data.demo===true};}
function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{notify('Armazenamento indisponível. Exporte um backup antes de sair.');}}
function money(n){return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function cell(row,text,tag='td'){const el=document.createElement(tag);el.textContent=text;row.append(el);return el;}
function render(){
  $('profile').value=state.profile;
  let report;
  try{report=analyze(state.holdings,state.profile,Number($('contribution').value));}catch(e){notify(e.message);return;}
  $('total').textContent=money(report.total);$('count').textContent=`${state.holdings.length} posições`;
  $('concentration').textContent=report.total?`${report.concentration.toFixed(1)}%`:'—';$('drift').textContent=report.total?`${report.drift.toFixed(1)} p.p.`:'—';
  $('mode').textContent=state.demo?'Demonstração: os valores abaixo são fictícios. Apague os dados locais para começar sua carteira.':state.holdings.length?'Carteira manual: atualize os valores com seus extratos. Não há cotações automáticas.':'Comece cadastrando seus investimentos ou importando um CSV.';
  $('holdings').replaceChildren();
  state.holdings.forEach((h,i)=>{const tr=document.createElement('tr');cell(tr,h.name);cell(tr,h.category);cell(tr,money(h.value));const td=cell(tr,'');const button=document.createElement('button');button.textContent='Remover';button.setAttribute('aria-label',`Remover ${h.name}`);button.addEventListener('click',()=>{state.holdings.splice(i,1);save();render();});td.append(button);$('holdings').append(tr);});
  if(!state.holdings.length){const tr=document.createElement('tr');cell(tr,'Sua carteira ainda está vazia.').colSpan=4;$('holdings').append(tr);}
  $('adjustments').replaceChildren();$('allocation').replaceChildren();
  report.allocation.forEach(a=>{const tr=document.createElement('tr');cell(tr,a.category);cell(tr,`${a.weight.toFixed(1)}%`);cell(tr,`${a.target}%`);const td=cell(tr,report.portfolio?`${a.delta>=0?'+':''}${money(a.delta)}`:'—');td.className=a.delta>=0?'positive':'negative';$('adjustments').append(tr);const row=document.createElement('div');row.className='allocation-row';const title=document.createElement('span');title.textContent=a.category;const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';fill.style.width=`${a.weight}%`;track.append(fill);const val=document.createElement('span');val.textContent=`${a.weight.toFixed(1)}%`;row.append(title,track,val);$('allocation').append(row);});
  $('risk').textContent=!report.total?'Adicione posições para avaliar a concentração.':report.concentration>20?'Concentração acima de 20% em um mesmo nome de ativo. Confira emissor, garantias e exposição antes de decidir.':'Nenhum nome de ativo supera 20%. Isso, isoladamente, não mede o risco da carteira.';
  $('projection').textContent='Recalcule o cenário após mudar a carteira ou os parâmetros.';
}
$('holdingForm').addEventListener('submit',e=>{e.preventDefault();try{if(state.holdings.length>=1000)throw Error('Limite de 1.000 posições.');const form=new FormData(e.target);state.holdings.push(validateHolding({name:form.get('name'),category:form.get('category'),value:Number(form.get('value'))}));save();render();e.target.reset();}catch(err){notify(err.message);}});
$('profile').addEventListener('change',()=>{state.profile=$('profile').value;save();render();});$('contribution').addEventListener('change',render);
$('demo').addEventListener('click',()=>{if(state.holdings.length&&!confirm('Substituir as posições atuais por dados fictícios? Exporte um backup para preservar seus dados.'))return;state={profile:'Moderado',demo:true,holdings:[{name:'CDB Banco exemplo',category:'Renda fixa',value:18000},{name:'Ação exemplo A',category:'Ações',value:17000},{name:'FII exemplo',category:'FIIs',value:5000},{name:'ETF global exemplo',category:'Exterior',value:7000},{name:'Reserva',category:'Caixa',value:3000}]};save();render();});
async function readFile(input){const file=input.files[0];if(!file)return null;if(file.size>1e6)throw Error('Arquivo excede 1 MB.');return file.text();}
$('csv').addEventListener('change',async e=>{try{const text=await readFile(e.target);if(text===null)return;const holdings=parseCSV(text);if(state.holdings.length+holdings.length>1000)throw Error('Limite de 1.000 posições.');state.holdings.push(...holdings);save();render();notify(`${holdings.length} posições adicionadas.`);}catch(err){notify(err.message);}finally{e.target.value='';}});
$('restore').addEventListener('change',async e=>{try{const text=await readFile(e.target);if(text===null)return;const next=validateState(JSON.parse(text));if(state.holdings.length&&!confirm('Substituir os dados locais pelos dados deste backup?'))return;state=next;save();render();notify('Backup restaurado.');}catch(err){notify(`Falha ao restaurar: ${err.message}`);}finally{e.target.value='';}});
$('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='investai-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('clear').addEventListener('click',()=>{if(!confirm('Apagar a carteira neste navegador? Exporte um backup para poder recuperá-la.'))return;state={holdings:[],profile:'Moderado',demo:false};save();render();});
$('projectionForm').addEventListener('submit',e=>{e.preventDefault();try{const f=new FormData(e.target);const total=analyze(state.holdings,state.profile).total;const result=project(total,Number(f.get('monthly')),Number(f.get('years')),Number(f.get('rate')));$('projection').textContent=money(result.balance);const detail=document.createElement('small');detail.textContent=`Saldo hipotético em ${f.get('years')} anos · Capital aplicado: ${money(result.invested)} · Diferença: ${money(result.balance-result.invested)}`;$('projection').append(detail);}catch(err){notify(err.message);}});
render();
